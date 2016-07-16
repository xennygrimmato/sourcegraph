/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {ReplaceCommand} from 'vs/editor/common/commands/replaceCommand';
import {CursorCollection, ICursorCollectionState} from 'vs/editor/common/controller/cursorCollection';
import {WordNavigationType, IOneCursorOperationContext, IPostOperationRunnable, IViewModelHelper, OneCursor, OneCursorOp} from 'vs/editor/common/controller/oneCursor';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Selection, SelectionDirection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IColumnSelectResult} from 'vs/editor/common/controller/cursorMoveHelper';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';

export interface ITypingListener {
	(): void;
}

enum RevealTarget {
	Primary = 0,
	TopMost = 1,
	BottomMost = 2
}

interface IMultipleCursorOperationContext {
	cursorPositionChangeReason: editorCommon.CursorChangeReason;
	shouldReveal: boolean;
	shouldRevealVerticalInCenter: boolean;
	shouldRevealHorizontal: boolean;
	shouldRevealTarget: RevealTarget;
	shouldPushStackElementBefore: boolean;
	shouldPushStackElementAfter: boolean;
	eventSource: string;
	eventData: any;
	hasExecutedCommands: boolean;
	isCursorUndo: boolean;
	executeCommands: editorCommon.ICommand[];
	isAutoWhitespaceCommand: boolean[];
	postOperationRunnables: IPostOperationRunnable[];
	requestScrollDeltaLines: number;
	setColumnSelectToLineNumber: number;
	setColumnSelectToVisualColumn: number;
}

interface IExecContext {
	selectionStartMarkers: string[];
	positionMarkers: string[];
}

interface ICommandData {
	operations: editorCommon.IIdentifiedSingleEditOperation[];
	hadTrackedRange: boolean;
}

interface ICommandsData {
	operations: editorCommon.IIdentifiedSingleEditOperation[];
	hadTrackedRanges: boolean[];
	anyoneHadTrackedRange: boolean;
}

export class Cursor extends EventEmitter {

	private editorId:number;
	private configuration:editorCommon.IConfiguration;
	private model:editorCommon.IModel;

	private modelUnbinds:IDisposable[];

	// Typing listeners
	private typingListeners:{
		[character:string]:ITypingListener[];
	};

	private cursors: CursorCollection;
	private cursorUndoStack: ICursorCollectionState[];
	private viewModelHelper:IViewModelHelper;

	private _isHandling:boolean;
	private charactersTyped:string;

	private enableEmptySelectionClipboard:boolean;

	private _handlers:{
		[key:string]:(ctx:IMultipleCursorOperationContext)=>boolean;
	};

	constructor(editorId:number, configuration:editorCommon.IConfiguration, model:editorCommon.IModel, viewModelHelper:IViewModelHelper, enableEmptySelectionClipboard:boolean) {
		super([
			editorCommon.EventType.CursorPositionChanged,
			editorCommon.EventType.CursorSelectionChanged,
			editorCommon.EventType.CursorRevealRange,
			editorCommon.EventType.CursorScrollRequest
		]);
		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;
		this.viewModelHelper = viewModelHelper;
		this.enableEmptySelectionClipboard = enableEmptySelectionClipboard;
		if (!this.viewModelHelper) {
			this.viewModelHelper = {
				viewModel: this.model,
				convertModelPositionToViewPosition: (lineNumber:number, column:number) => {
					return new Position(lineNumber, column);
				},
				convertModelRangeToViewRange: (modelRange: Range) => {
					return modelRange;
				},
				convertViewToModelPosition: (lineNumber:number, column:number) => {
					return new Position(lineNumber, column);
				},
				convertViewSelectionToModelSelection: (viewSelection:Selection) => {
					return viewSelection;
				},
				validateViewPosition: (viewLineNumber:number, viewColumn:number, modelPosition:Position) => {
					return modelPosition;
				},
				validateViewRange: (viewStartLineNumber:number, viewStartColumn:number, viewEndLineNumber:number, viewEndColumn:number, modelRange:Range) => {
					return modelRange;
				}

			};
		}

		this.cursors = new CursorCollection(this.editorId, this.model, this.configuration, this.viewModelHelper);
		this.cursorUndoStack = [];

		this.typingListeners = {};

		this._isHandling = false;

		this.modelUnbinds = [];
		this.modelUnbinds.push(this.model.onDidChangeRawContent((e) => {
			this._onModelContentChanged(e);
		}));
		this.modelUnbinds.push(this.model.onDidChangeMode((e) => {
			this._onModelModeChanged();
		}));
		this.modelUnbinds.push(LanguageConfigurationRegistry.onDidChange(() => {
			// TODO@Alex: react only if certain supports changed? (and if my model's mode changed)
			this._onModelModeChanged();
		}));

		this._handlers = {};
		this._registerHandlers();
	}

	public dispose(): void {
		this.modelUnbinds = dispose(this.modelUnbinds);
		this.model = null;
		this.cursors.dispose();
		this.cursors = null;
		this.configuration = null;
		this.viewModelHelper = null;
		super.dispose();
	}

	public saveState(): editorCommon.ICursorState[] {

		var selections = this.cursors.getSelections(),
			result:editorCommon.ICursorState[] = [],
			selection: Selection;

		for (var i = 0; i < selections.length; i++) {
			selection = selections[i];

			result.push({
				inSelectionMode: !selection.isEmpty(),
				selectionStart: {
					lineNumber: selection.selectionStartLineNumber,
					column: selection.selectionStartColumn,
				},
				position: {
					lineNumber: selection.positionLineNumber,
					column: selection.positionColumn,
				}
			});
		}

		return result;
	}

	public restoreState(states:editorCommon.ICursorState[]): void {

		var desiredSelections:editorCommon.ISelection[] = [],
			state:editorCommon.ICursorState;

		for (var i = 0; i < states.length; i++) {
			state = states[i];

			var positionLineNumber = 1, positionColumn = 1;

			// Avoid missing properties on the literal
			if (state.position && state.position.lineNumber) {
				positionLineNumber = state.position.lineNumber;
			}
			if (state.position && state.position.column) {
				positionColumn = state.position.column;
			}

			var selectionStartLineNumber = positionLineNumber, selectionStartColumn = positionColumn;

			// Avoid missing properties on the literal
			if (state.selectionStart && state.selectionStart.lineNumber) {
				selectionStartLineNumber = state.selectionStart.lineNumber;
			}
			if (state.selectionStart && state.selectionStart.column) {
				selectionStartColumn = state.selectionStart.column;
			}

			desiredSelections.push({
				selectionStartLineNumber: selectionStartLineNumber,
				selectionStartColumn: selectionStartColumn,
				positionLineNumber: positionLineNumber,
				positionColumn: positionColumn
			});
		}

		this._onHandler('restoreState', (ctx:IMultipleCursorOperationContext) => {
			this.cursors.setSelections(desiredSelections);
			return false;
		}, 'restoreState', null);
	}

	public setEditableRange(range:editorCommon.IRange): void {
		this.model.setEditableRange(range);
	}

	public getEditableRange(): Range {
		return this.model.getEditableRange();
	}

	public addTypingListener(character:string, callback: ITypingListener): void {
		if (!this.typingListeners.hasOwnProperty(character)) {
			this.typingListeners[character] = [];
		}
		this.typingListeners[character].push(callback);
	}

	public removeTypingListener(character:string, callback: ITypingListener): void {
		if (this.typingListeners.hasOwnProperty(character)) {
			var listeners = this.typingListeners[character];
			for (var i = 0; i < listeners.length; i++) {
				if (listeners[i] === callback) {
					listeners.splice(i, 1);
					return;
				}
			}
		}
	}

	private _onModelModeChanged(): void {
		// the mode of this model has changed
		this.cursors.updateMode();
	}

	private _onModelContentChanged(e:editorCommon.IModelContentChangedEvent): void {
		if (e.changeType === editorCommon.EventType.ModelRawContentChangedFlush) {
			// a model.setValue() was called
			this.cursors.dispose();

			this.cursors = new CursorCollection(this.editorId, this.model, this.configuration, this.viewModelHelper);

			this.emitCursorPositionChanged('model', editorCommon.CursorChangeReason.ContentFlush);
			this.emitCursorSelectionChanged('model', editorCommon.CursorChangeReason.ContentFlush);
		} else {
			if (!this._isHandling) {
				this._onHandler('recoverSelectionFromMarkers', (ctx:IMultipleCursorOperationContext) => {
					var result = this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => oneCursor.recoverSelectionFromMarkers(oneCtx));
					ctx.shouldPushStackElementBefore = false;
					ctx.shouldPushStackElementAfter = false;
					return result;
				}, 'modelChange', null);
			}
		}
	}

	// ------ some getters/setters

	public getSelection(): Selection {
		return this.cursors.getSelection(0);
	}

	public getSelections(): Selection[] {
		return this.cursors.getSelections();
	}

	public getPosition(): Position {
		return this.cursors.getPosition(0);
	}

	public setSelections(source: string, selections: editorCommon.ISelection[]): void {
		this._onHandler('setSelections', (ctx:IMultipleCursorOperationContext) => {
			ctx.shouldReveal = false;
			this.cursors.setSelections(selections);
			return false;
		}, source, null);
	}

	// ------ auxiliary handling logic

	private _createAndInterpretHandlerCtx(eventSource: string, eventData: any, callback:(currentHandlerCtx:IMultipleCursorOperationContext)=>void): boolean {

		var currentHandlerCtx:IMultipleCursorOperationContext = {
			cursorPositionChangeReason: editorCommon.CursorChangeReason.NotSet,
			shouldReveal: true,
			shouldRevealVerticalInCenter: false,
			shouldRevealHorizontal: true,
			shouldRevealTarget: RevealTarget.Primary,
			eventSource: eventSource,
			eventData: eventData,
			executeCommands: [],
			isAutoWhitespaceCommand: [],
			hasExecutedCommands: false,
			isCursorUndo: false,
			postOperationRunnables: [],
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false,
			requestScrollDeltaLines: 0,
			setColumnSelectToLineNumber: 0,
			setColumnSelectToVisualColumn: 0
		};

		callback(currentHandlerCtx);

		this._interpretHandlerContext(currentHandlerCtx);
		this.cursors.normalize();

		return currentHandlerCtx.hasExecutedCommands;
	}

	private _onHandler(command:string, handler:(ctx:IMultipleCursorOperationContext)=>boolean, source:string, data:any): boolean {

		this._isHandling = true;
		this.charactersTyped = '';

		var handled = false;

		try {
			var oldSelections = this.cursors.getSelections();
			var oldViewSelections = this.cursors.getViewSelections();
			var prevCursorsState = this.cursors.saveState();

			var eventSource = source;
			var cursorPositionChangeReason: editorCommon.CursorChangeReason;
			var shouldReveal: boolean;
			var shouldRevealVerticalInCenter: boolean;
			var shouldRevealHorizontal: boolean;
			var shouldRevealTarget: RevealTarget;
			var isCursorUndo: boolean;
			var requestScrollDeltaLines: number;

			var hasExecutedCommands = this._createAndInterpretHandlerCtx(eventSource, data, (currentHandlerCtx:IMultipleCursorOperationContext) => {
				handled = handler(currentHandlerCtx);

				cursorPositionChangeReason = currentHandlerCtx.cursorPositionChangeReason;
				shouldReveal = currentHandlerCtx.shouldReveal;
				shouldRevealTarget = currentHandlerCtx.shouldRevealTarget;
				shouldRevealVerticalInCenter = currentHandlerCtx.shouldRevealVerticalInCenter;
				shouldRevealHorizontal = currentHandlerCtx.shouldRevealHorizontal;
				isCursorUndo = currentHandlerCtx.isCursorUndo;
				requestScrollDeltaLines = currentHandlerCtx.requestScrollDeltaLines;
			});

			if (hasExecutedCommands) {
				this.cursorUndoStack = [];
			}

			// Ping typing listeners after the model emits events & after I emit events
			for (var i = 0; i < this.charactersTyped.length; i++) {
				var chr = this.charactersTyped.charAt(i);
				if (this.typingListeners.hasOwnProperty(chr)) {
					var listeners = this.typingListeners[chr].slice(0);
					for (var j = 0, lenJ = listeners.length; j < lenJ; j++) {
						// Hoping that listeners understand that the view might be in an awkward state
						try {
							listeners[j]();
						} catch (e) {
							onUnexpectedError(e);
						}
					}
				}
			}

			var newSelections = this.cursors.getSelections();
			var newViewSelections = this.cursors.getViewSelections();

			var somethingChanged = false;
			if (oldSelections.length !== newSelections.length) {
				somethingChanged = true;
			} else {
				for (var i = 0, len = oldSelections.length; !somethingChanged && i < len; i++) {
					if (!oldSelections[i].equalsSelection(newSelections[i])) {
						somethingChanged = true;
					}
				}
				for (var i = 0, len = oldViewSelections.length; !somethingChanged && i < len; i++) {
					if (!oldViewSelections[i].equalsSelection(newViewSelections[i])) {
						somethingChanged = true;
					}
				}
			}


			if (somethingChanged) {
				if (!hasExecutedCommands && !isCursorUndo) {
					this.cursorUndoStack.push(prevCursorsState);
				}
				if (this.cursorUndoStack.length > 50) {
					this.cursorUndoStack = this.cursorUndoStack.splice(0, this.cursorUndoStack.length - 50);
				}
				this.emitCursorPositionChanged(eventSource, cursorPositionChangeReason);

				if (shouldReveal) {
					this.emitCursorRevealRange(shouldRevealTarget, shouldRevealVerticalInCenter ? editorCommon.VerticalRevealType.Center : editorCommon.VerticalRevealType.Simple, shouldRevealHorizontal);
				}
				this.emitCursorSelectionChanged(eventSource, cursorPositionChangeReason);
			}

			if (requestScrollDeltaLines) {
				this.emitCursorScrollRequest(requestScrollDeltaLines);
			}
		} catch (err) {
			onUnexpectedError(err);
		}

		this._isHandling = false;

		return handled;
	}

	private _interpretHandlerContext(ctx: IMultipleCursorOperationContext): void {
		if (ctx.shouldPushStackElementBefore) {
			this.model.pushStackElement();
			ctx.shouldPushStackElementBefore = false;
		}

		this._columnSelectToLineNumber = ctx.setColumnSelectToLineNumber;
		this._columnSelectToVisualColumn = ctx.setColumnSelectToVisualColumn;

		ctx.hasExecutedCommands = this._internalExecuteCommands(ctx.executeCommands, ctx.isAutoWhitespaceCommand, ctx.postOperationRunnables) || ctx.hasExecutedCommands;
		ctx.executeCommands = [];

		if (ctx.shouldPushStackElementAfter) {
			this.model.pushStackElement();
			ctx.shouldPushStackElementAfter = false;
		}

		var hasPostOperationRunnables = false;
		for (var i = 0, len = ctx.postOperationRunnables.length; i < len; i++) {
			if (ctx.postOperationRunnables[i]) {
				hasPostOperationRunnables = true;
				break;
			}
		}

		if (hasPostOperationRunnables) {
			var postOperationRunnables = ctx.postOperationRunnables.slice(0);
			ctx.postOperationRunnables = [];

			this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
				if (postOperationRunnables[cursorIndex]) {
					postOperationRunnables[cursorIndex](oneCtx);
				}
				return false;
			});

			this._interpretHandlerContext(ctx);
		}
	}

	private _interpretCommandResult(cursorState:Selection[]): boolean {
		if (!cursorState) {
			return false;
		}

		this.cursors.setSelections(cursorState);
		return true;
	}

	private _getEditOperationsFromCommand(ctx: IExecContext, majorIdentifier: number, command: editorCommon.ICommand, isAutoWhitespaceCommand:boolean): ICommandData {
		// This method acts as a transaction, if the command fails
		// everything it has done is ignored
		var operations: editorCommon.IIdentifiedSingleEditOperation[] = [],
			operationMinor = 0;

		var addEditOperation = (selection:Range, text:string) => {
			if (selection.isEmpty() && text === '') {
				// This command wants to add a no-op => no thank you
				return;
			}
			operations.push({
				identifier: {
					major: majorIdentifier,
					minor: operationMinor++
				},
				range: selection,
				text: text,
				forceMoveMarkers: false,
				isAutoWhitespaceEdit: isAutoWhitespaceCommand
			});
		};

		var hadTrackedRange = false;
		var trackSelection = (selection: Selection, trackPreviousOnEmpty?:boolean ) => {
			var selectionMarkerStickToPreviousCharacter:boolean,
				positionMarkerStickToPreviousCharacter:boolean;

			if (selection.isEmpty()) {
				// Try to lock it with surrounding text
				if (typeof trackPreviousOnEmpty === 'boolean') {
					selectionMarkerStickToPreviousCharacter = trackPreviousOnEmpty;
					positionMarkerStickToPreviousCharacter = trackPreviousOnEmpty;
				} else {
					var maxLineColumn = this.model.getLineMaxColumn(selection.startLineNumber);
					if (selection.startColumn === maxLineColumn) {
						selectionMarkerStickToPreviousCharacter = true;
						positionMarkerStickToPreviousCharacter = true;
					} else {
						selectionMarkerStickToPreviousCharacter = false;
						positionMarkerStickToPreviousCharacter = false;
					}
				}
			} else {
				if (selection.getDirection() === SelectionDirection.LTR) {
					selectionMarkerStickToPreviousCharacter = false;
					positionMarkerStickToPreviousCharacter = true;
				} else {
					selectionMarkerStickToPreviousCharacter = true;
					positionMarkerStickToPreviousCharacter = false;
				}
			}

			var l = ctx.selectionStartMarkers.length;
			ctx.selectionStartMarkers[l] = this.model._addMarker(selection.selectionStartLineNumber, selection.selectionStartColumn, selectionMarkerStickToPreviousCharacter);
			ctx.positionMarkers[l] = this.model._addMarker(selection.positionLineNumber, selection.positionColumn, positionMarkerStickToPreviousCharacter);
			return l.toString();
		};

		var editOperationBuilder:editorCommon.IEditOperationBuilder = {
			addEditOperation: addEditOperation,
			trackSelection: trackSelection
		};

		try {
			command.getEditOperations(this.model, editOperationBuilder);
		} catch (e) {
			e.friendlyMessage = nls.localize('corrupt.commands', "Unexpected exception while executing command.");
			onUnexpectedError(e);
			return {
				operations: [],
				hadTrackedRange: false
			};
		}

		return {
			operations: operations,
			hadTrackedRange: hadTrackedRange
		};
	}

	private _getEditOperations(ctx: IExecContext, commands: editorCommon.ICommand[], isAutoWhitespaceCommand:boolean[]): ICommandsData {
		var oneResult: ICommandData;
		var operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		var hadTrackedRanges: boolean[] = [];
		var anyoneHadTrackedRange: boolean;

		for (var i = 0; i < commands.length; i++) {
			if (commands[i]) {
				oneResult = this._getEditOperationsFromCommand(ctx, i, commands[i], isAutoWhitespaceCommand[i]);
				operations = operations.concat(oneResult.operations);
				hadTrackedRanges[i] = oneResult.hadTrackedRange;
				anyoneHadTrackedRange = anyoneHadTrackedRange || hadTrackedRanges[i];
			} else {
				hadTrackedRanges[i] = false;
			}
		}
		return {
			operations: operations,
			hadTrackedRanges: hadTrackedRanges,
			anyoneHadTrackedRange: anyoneHadTrackedRange
		};
	}

	private _getLoserCursorMap(operations: editorCommon.IIdentifiedSingleEditOperation[]): { [index: string]: boolean; } {
		// This is destructive on the array
		operations = operations.slice(0);

		// Sort operations with last one first
		operations.sort((a:editorCommon.IIdentifiedSingleEditOperation, b:editorCommon.IIdentifiedSingleEditOperation): number => {
			// Note the minus!
			return -(Range.compareRangesUsingEnds(a.range, b.range));
		});

		// Operations can not overlap!
		var loserCursorsMap:{ [index:string]: boolean; } = {};

		var previousOp: editorCommon.IIdentifiedSingleEditOperation;
		var currentOp: editorCommon.IIdentifiedSingleEditOperation;
		var loserMajor: number;

		for (var i = 1; i < operations.length; i++) {
			previousOp = operations[i - 1];
			currentOp = operations[i];

			if (previousOp.range.getStartPosition().isBefore(currentOp.range.getEndPosition())) {

				if (previousOp.identifier.major > currentOp.identifier.major) {
					// previousOp loses the battle
					loserMajor = previousOp.identifier.major;
				} else {
					loserMajor = currentOp.identifier.major;
				}

				loserCursorsMap[loserMajor.toString()] = true;

				for (var j = 0; j < operations.length; j++) {
					if (operations[j].identifier.major === loserMajor) {
						operations.splice(j, 1);
						if (j < i) {
							i--;
						}
						j--;
					}
				}

				if (i > 0) {
					i--;
				}
			}
		}

		return loserCursorsMap;
	}

	private _collapseDeleteCommands(rawCmds: editorCommon.ICommand[], isAutoWhitespaceCommand:boolean[], postOperationRunnables: IPostOperationRunnable[]): boolean {
		if (rawCmds.length === 1) {
			return ;
		}

		// Merge adjacent delete commands
		var allAreDeleteCommands = rawCmds.every((command) => {
			if (!(command instanceof ReplaceCommand)) {
				return false;
			}
			var replCmd = (<ReplaceCommand>command);
			if (replCmd.getText().length > 0) {
				return false;
			}
			return true;
		});

		if (!allAreDeleteCommands) {
			return;
		}

		var commands = <ReplaceCommand[]>rawCmds;
		var cursors = commands.map((cmd, i) => {
			return {
				range: commands[i].getRange(),
				postOperationRunnable: postOperationRunnables[i],
				order: i
			};
		});

		cursors.sort((a, b) => {
			return Range.compareRangesUsingStarts(a.range, b.range);
		});

		var previousCursor = cursors[0];
		for (var i = 1; i < cursors.length; i++) {
			if (previousCursor.range.endLineNumber === cursors[i].range.startLineNumber && previousCursor.range.endColumn === cursors[i].range.startColumn) {
				// Merge ranges
				var mergedRange = new Range(
					previousCursor.range.startLineNumber,
					previousCursor.range.startColumn,
					cursors[i].range.endLineNumber,
					cursors[i].range.endColumn
				);

				previousCursor.range = mergedRange;

				commands[cursors[i].order].setRange(mergedRange);
				commands[previousCursor.order].setRange(mergedRange);
			} else {
				// Push previous cursor
				previousCursor = cursors[i];
			}
		}
	}

	private _internalExecuteCommands(commands: editorCommon.ICommand[], isAutoWhitespaceCommand: boolean[], postOperationRunnables: IPostOperationRunnable[]): boolean {
		var ctx:IExecContext = {
			selectionStartMarkers: [],
			positionMarkers: []
		};

		this._collapseDeleteCommands(commands, isAutoWhitespaceCommand, postOperationRunnables);

		var r = this._innerExecuteCommands(ctx, commands, isAutoWhitespaceCommand, postOperationRunnables);
		for (var i = 0; i < ctx.selectionStartMarkers.length; i++) {
			this.model._removeMarker(ctx.selectionStartMarkers[i]);
			this.model._removeMarker(ctx.positionMarkers[i]);
		}
		return r;
	}

	private _arrayIsEmpty(commands: editorCommon.ICommand[]): boolean {
		var i:number,
			len:number;

		for (i = 0, len = commands.length; i < len; i++) {
			if (commands[i]) {
				return false;
			}
		}

		return true;
	}

	private _innerExecuteCommands(ctx: IExecContext, commands: editorCommon.ICommand[], isAutoWhitespaceCommand: boolean[], postOperationRunnables: IPostOperationRunnable[]): boolean {

		if (this.configuration.editor.readOnly) {
			return false;
		}

		if (this._arrayIsEmpty(commands)) {
			return false;
		}

		var selectionsBefore = this.cursors.getSelections();

		var commandsData = this._getEditOperations(ctx, commands, isAutoWhitespaceCommand);
		if (commandsData.operations.length === 0 && !commandsData.anyoneHadTrackedRange) {
			return false;
		}

		var rawOperations = commandsData.operations;

		var editableRange = this.model.getEditableRange();
		var editableRangeStart = editableRange.getStartPosition();
		var editableRangeEnd = editableRange.getEndPosition();
		for (var i = 0; i < rawOperations.length; i++) {
			var operationRange = rawOperations[i].range;
			if (!editableRangeStart.isBeforeOrEqual(operationRange.getStartPosition()) || !operationRange.getEndPosition().isBeforeOrEqual(editableRangeEnd)) {
				// These commands are outside of the editable range
				return false;
			}
		}

		var loserCursorsMap = this._getLoserCursorMap(rawOperations);
		if (loserCursorsMap.hasOwnProperty('0')) {
			// These commands are very messed up
			console.warn('Ignoring commands');
			return false;
		}

		// Remove operations belonging to losing cursors
		var filteredOperations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		for (var i = 0; i < rawOperations.length; i++) {
			if (!loserCursorsMap.hasOwnProperty(rawOperations[i].identifier.major.toString())) {
				filteredOperations.push(rawOperations[i]);
			}
		}

		var selectionsAfter = this.model.pushEditOperations(selectionsBefore, filteredOperations, (inverseEditOperations:editorCommon.IIdentifiedSingleEditOperation[]): Selection[] => {
			var groupedInverseEditOperations:editorCommon.IIdentifiedSingleEditOperation[][] = [];
			for (var i = 0; i < selectionsBefore.length; i++) {
				groupedInverseEditOperations[i] = [];
			}
			for (var i = 0; i < inverseEditOperations.length; i++) {
				var op = inverseEditOperations[i];
				if (!op.identifier) {
					// perhaps auto whitespace trim edits
					continue;
				}
				groupedInverseEditOperations[op.identifier.major].push(op);
			}
			var minorBasedSorter = (a:editorCommon.IIdentifiedSingleEditOperation, b:editorCommon.IIdentifiedSingleEditOperation) => {
				return a.identifier.minor - b.identifier.minor;
			};
			var cursorSelections: Selection[] = [];
			for (var i = 0; i < selectionsBefore.length; i++) {
				if (groupedInverseEditOperations[i].length > 0 || commandsData.hadTrackedRanges[i]) {
					groupedInverseEditOperations[i].sort(minorBasedSorter);
					cursorSelections[i] = commands[i].computeCursorState(this.model, {
						getInverseEditOperations: () => {
							return groupedInverseEditOperations[i];
						},

						getTrackedSelection: (id: string) => {
							var idx = parseInt(id, 10);
							var selectionStartMarker = this.model._getMarker(ctx.selectionStartMarkers[idx]);
							var positionMarker = this.model._getMarker(ctx.positionMarkers[idx]);
							return new Selection(selectionStartMarker.lineNumber, selectionStartMarker.column, positionMarker.lineNumber, positionMarker.column);
						}
					});
				} else {
					cursorSelections[i] = selectionsBefore[i];
				}
			}
			return cursorSelections;
		});

		// Extract losing cursors
		var losingCursorIndex: string;
		var losingCursors: number[] = [];
		for (losingCursorIndex in loserCursorsMap) {
			if (loserCursorsMap.hasOwnProperty(losingCursorIndex)) {
				losingCursors.push(parseInt(losingCursorIndex, 10));
			}
		}

		// Sort losing cursors descending
		losingCursors.sort((a:number, b:number): number => {
			return b - a;
		});

		// Remove losing cursors
		for (var i = 0; i < losingCursors.length; i++) {
			selectionsAfter.splice(losingCursors[i], 1);
			postOperationRunnables.splice(losingCursors[i], 1);
		}

		return this._interpretCommandResult(selectionsAfter);
	}


	// -----------------------------------------------------------------------------------------------------------
	// ----- emitting events

	private emitCursorPositionChanged(source:string, reason:editorCommon.CursorChangeReason): void {
		var positions = this.cursors.getPositions();
		var primaryPosition = positions[0];
		var secondaryPositions = positions.slice(1);

		var viewPositions = this.cursors.getViewPositions();
		var primaryViewPosition = viewPositions[0];
		var secondaryViewPositions = viewPositions.slice(1);

		var isInEditableRange:boolean = true;
		if (this.model.hasEditableRange()) {
			var editableRange = this.model.getEditableRange();
			if (!editableRange.containsPosition(primaryPosition)) {
				isInEditableRange = false;
			}
		}
		var e:editorCommon.ICursorPositionChangedEvent = {
			position: primaryPosition,
			viewPosition: primaryViewPosition,
			secondaryPositions: secondaryPositions,
			secondaryViewPositions: secondaryViewPositions,
			reason: reason,
			source: source,
			isInEditableRange: isInEditableRange
		};
		this.emit(editorCommon.EventType.CursorPositionChanged, e);
	}

	private emitCursorSelectionChanged(source:string, reason:editorCommon.CursorChangeReason): void {
		let selections = this.cursors.getSelections();
		let primarySelection = selections[0];
		let secondarySelections = selections.slice(1);

		let viewSelections = this.cursors.getViewSelections();
		let primaryViewSelection = viewSelections[0];
		let secondaryViewSelections = viewSelections.slice(1);

		let e:editorCommon.ICursorSelectionChangedEvent = {
			selection: primarySelection,
			viewSelection: primaryViewSelection,
			secondarySelections: secondarySelections,
			secondaryViewSelections: secondaryViewSelections,
			source: source,
			reason: reason
		};
		this.emit(editorCommon.EventType.CursorSelectionChanged, e);
	}

	private emitCursorScrollRequest(lineScrollOffset: number): void {
		var e:editorCommon.ICursorScrollRequestEvent = {
			deltaLines: lineScrollOffset
		};
		this.emit(editorCommon.EventType.CursorScrollRequest, e);
	}

	private emitCursorRevealRange(revealTarget: RevealTarget, verticalType: editorCommon.VerticalRevealType, revealHorizontal: boolean): void {
		var positions = this.cursors.getPositions();
		var viewPositions = this.cursors.getViewPositions();

		var position = positions[0];
		var viewPosition = viewPositions[0];

		if (revealTarget === RevealTarget.TopMost) {
			for (var i = 1; i < positions.length; i++) {
				if (positions[i].isBefore(position)) {
					position = positions[i];
					viewPosition = viewPositions[i];
				}
			}
		} else if (revealTarget === RevealTarget.BottomMost) {
			for (var i = 1; i < positions.length; i++) {
				if (position.isBeforeOrEqual(positions[i])) {
					position = positions[i];
					viewPosition = viewPositions[i];
				}
			}
		} else {
			if (positions.length > 1) {
				// no revealing!
				return;
			}
		}

		var range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		var viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
		var e:editorCommon.ICursorRevealRangeEvent = {
			range: range,
			viewRange: viewRange,
			verticalType: verticalType,
			revealHorizontal: revealHorizontal
		};
		this.emit(editorCommon.EventType.CursorRevealRange, e);
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- handlers beyond this point

	public trigger(source:string, handlerId:string, payload:any): void {
		if (!this._handlers.hasOwnProperty(handlerId)) {
			return;
		}
		let handler = this._handlers[handlerId];
		this._onHandler(handlerId, handler, source, payload);
	}

	private _registerHandlers(): void {
		let H = editorCommon.Handler;

		this._handlers[H.JumpToBracket] =				(ctx) => this._jumpToBracket(ctx);

		this._handlers[H.MoveTo] = 						(ctx) => this._moveTo(false, ctx);
		this._handlers[H.MoveToSelect] = 				(ctx) => this._moveTo(true, ctx);
		this._handlers[H.ColumnSelect] = 				(ctx) => this._columnSelectMouse(ctx);
		this._handlers[H.AddCursorUp] = 				(ctx) => this._addCursorUp(ctx);
		this._handlers[H.AddCursorDown] = 				(ctx) => this._addCursorDown(ctx);
		this._handlers[H.CreateCursor] =				(ctx) => this._createCursor(ctx);
		this._handlers[H.LastCursorMoveToSelect] =		(ctx) => this._lastCursorMoveTo(ctx);


		this._handlers[H.CursorLeft] = 					(ctx) => this._moveLeft(false, ctx);
		this._handlers[H.CursorLeftSelect] =			(ctx) => this._moveLeft(true, ctx);

		this._handlers[H.CursorWordLeft] =				(ctx) => this._moveWordLeft(false, WordNavigationType.WordStart, ctx);
		this._handlers[H.CursorWordStartLeft] =			(ctx) => this._moveWordLeft(false, WordNavigationType.WordStart, ctx);
		this._handlers[H.CursorWordEndLeft] =			(ctx) => this._moveWordLeft(false, WordNavigationType.WordEnd, ctx);

		this._handlers[H.CursorWordLeftSelect] =		(ctx) => this._moveWordLeft(true, WordNavigationType.WordStart, ctx);
		this._handlers[H.CursorWordStartLeftSelect] =	(ctx) => this._moveWordLeft(true, WordNavigationType.WordStart, ctx);
		this._handlers[H.CursorWordEndLeftSelect] =		(ctx) => this._moveWordLeft(true, WordNavigationType.WordEnd, ctx);

		this._handlers[H.CursorRight] =					(ctx) => this._moveRight(false, ctx);
		this._handlers[H.CursorRightSelect] =			(ctx) => this._moveRight(true, ctx);

		this._handlers[H.CursorWordRight] =				(ctx) => this._moveWordRight(false, WordNavigationType.WordEnd, ctx);
		this._handlers[H.CursorWordStartRight] =		(ctx) => this._moveWordRight(false, WordNavigationType.WordStart, ctx);
		this._handlers[H.CursorWordEndRight] =			(ctx) => this._moveWordRight(false, WordNavigationType.WordEnd, ctx);

		this._handlers[H.CursorWordRightSelect] =		(ctx) => this._moveWordRight(true, WordNavigationType.WordEnd, ctx);
		this._handlers[H.CursorWordStartRightSelect] =	(ctx) => this._moveWordRight(true, WordNavigationType.WordStart, ctx);
		this._handlers[H.CursorWordEndRightSelect] =	(ctx) => this._moveWordRight(true, WordNavigationType.WordEnd, ctx);

		this._handlers[H.CursorUp] =					(ctx) => this._moveUp(false, false, ctx);
		this._handlers[H.CursorUpSelect] =				(ctx) => this._moveUp(true, false, ctx);
		this._handlers[H.CursorDown] =					(ctx) => this._moveDown(false, false, ctx);
		this._handlers[H.CursorDownSelect] =			(ctx) => this._moveDown(true, false, ctx);

		this._handlers[H.CursorPageUp] =				(ctx) => this._moveUp(false, true, ctx);
		this._handlers[H.CursorPageUpSelect] =			(ctx) => this._moveUp(true, true, ctx);
		this._handlers[H.CursorPageDown] =				(ctx) => this._moveDown(false, true, ctx);
		this._handlers[H.CursorPageDownSelect] =		(ctx) => this._moveDown(true, true, ctx);

		this._handlers[H.CursorHome] =					(ctx) => this._moveToBeginningOfLine(false, ctx);
		this._handlers[H.CursorHomeSelect] =			(ctx) => this._moveToBeginningOfLine(true, ctx);

		this._handlers[H.CursorEnd] =					(ctx) => this._moveToEndOfLine(false, ctx);
		this._handlers[H.CursorEndSelect] =				(ctx) => this._moveToEndOfLine(true, ctx);

		this._handlers[H.CursorTop] =					(ctx) => this._moveToBeginningOfBuffer(false, ctx);
		this._handlers[H.CursorTopSelect] =				(ctx) => this._moveToBeginningOfBuffer(true, ctx);
		this._handlers[H.CursorBottom] =				(ctx) => this._moveToEndOfBuffer(false, ctx);
		this._handlers[H.CursorBottomSelect] =			(ctx) => this._moveToEndOfBuffer(true, ctx);

		this._handlers[H.CursorColumnSelectLeft] =		(ctx) => this._columnSelectLeft(ctx);
		this._handlers[H.CursorColumnSelectRight] =		(ctx) => this._columnSelectRight(ctx);
		this._handlers[H.CursorColumnSelectUp] =		(ctx) => this._columnSelectUp(false, ctx);
		this._handlers[H.CursorColumnSelectPageUp] =	(ctx) => this._columnSelectUp(true, ctx);
		this._handlers[H.CursorColumnSelectDown] =		(ctx) => this._columnSelectDown(false, ctx);
		this._handlers[H.CursorColumnSelectPageDown] =	(ctx) => this._columnSelectDown(true, ctx);

		this._handlers[H.SelectAll] =					(ctx) => this._selectAll(ctx);

		this._handlers[H.LineSelect] = 					(ctx) => this._line(false, ctx);
		this._handlers[H.LineSelectDrag] =				(ctx) => this._line(true, ctx);
		this._handlers[H.LastCursorLineSelect] = 		(ctx) => this._lastCursorLine(false, ctx);
		this._handlers[H.LastCursorLineSelectDrag] = 	(ctx) => this._lastCursorLine(true, ctx);

		this._handlers[H.LineInsertBefore] =			(ctx) => this._lineInsertBefore(ctx);
		this._handlers[H.LineInsertAfter] =				(ctx) => this._lineInsertAfter(ctx);
		this._handlers[H.LineBreakInsert] =				(ctx) => this._lineBreakInsert(ctx);

		this._handlers[H.WordSelect] = 					(ctx) => this._word(false, ctx);
		this._handlers[H.WordSelectDrag] =				(ctx) => this._word(true, ctx);
		this._handlers[H.LastCursorWordSelect] =		(ctx) => this._lastCursorWord(ctx);
		this._handlers[H.CancelSelection] =				(ctx) => this._cancelSelection(ctx);
		this._handlers[H.RemoveSecondaryCursors] =		(ctx) => this._removeSecondaryCursors(ctx);

		this._handlers[H.Type] =						(ctx) => this._type(ctx);
		this._handlers[H.ReplacePreviousChar] =			(ctx) => this._replacePreviousChar(ctx);
		this._handlers[H.Tab] =							(ctx) => this._tab(ctx);
		this._handlers[H.Indent] =						(ctx) => this._indent(ctx);
		this._handlers[H.Outdent] =						(ctx) => this._outdent(ctx);
		this._handlers[H.Paste] =						(ctx) => this._paste(ctx);

		this._handlers[H.ScrollLineUp] =				(ctx) => this._scrollUp(false, ctx);
		this._handlers[H.ScrollLineDown] =				(ctx) => this._scrollDown(false, ctx);
		this._handlers[H.ScrollPageUp] =				(ctx) => this._scrollUp(true, ctx);
		this._handlers[H.ScrollPageDown] =				(ctx) => this._scrollDown(true, ctx);

		this._handlers[H.DeleteLeft] =					(ctx) => this._deleteLeft(ctx);

		this._handlers[H.DeleteWordLeft] =				(ctx) => this._deleteWordLeft(true, WordNavigationType.WordStart, ctx);
		this._handlers[H.DeleteWordStartLeft] =			(ctx) => this._deleteWordLeft(false, WordNavigationType.WordStart, ctx);
		this._handlers[H.DeleteWordEndLeft] =			(ctx) => this._deleteWordLeft(false, WordNavigationType.WordEnd, ctx);

		this._handlers[H.DeleteRight] =					(ctx) => this._deleteRight(ctx);

		this._handlers[H.DeleteWordRight] =				(ctx) => this._deleteWordRight(true, WordNavigationType.WordEnd, ctx);
		this._handlers[H.DeleteWordStartRight] =		(ctx) => this._deleteWordRight(false, WordNavigationType.WordStart, ctx);
		this._handlers[H.DeleteWordEndRight] =			(ctx) => this._deleteWordRight(false, WordNavigationType.WordEnd, ctx);

		this._handlers[H.DeleteAllLeft] =				(ctx) => this._deleteAllLeft(ctx);
		this._handlers[H.DeleteAllRight] =				(ctx) => this._deleteAllRight(ctx);
		this._handlers[H.Cut] =							(ctx) => this._cut(ctx);

		this._handlers[H.ExpandLineSelection] =			(ctx) => this._expandLineSelection(ctx);

		this._handlers[H.Undo] =						(ctx) => this._undo(ctx);
		this._handlers[H.CursorUndo] =					(ctx) => this._cursorUndo(ctx);
		this._handlers[H.Redo] =						(ctx) => this._redo(ctx);

		this._handlers[H.ExecuteCommand] =				(ctx) => this._externalExecuteCommand(ctx);
		this._handlers[H.ExecuteCommands] =				(ctx) => this._externalExecuteCommands(ctx);
	}

	private _invokeForAllSorted(ctx: IMultipleCursorOperationContext, callable: (cursorIndex: number, cursor: OneCursor, ctx: IOneCursorOperationContext) => boolean, pushStackElementBefore: boolean = true, pushStackElementAfter: boolean = true): boolean {
		return this._doInvokeForAll(ctx, true, callable, pushStackElementBefore, pushStackElementAfter);
	}

	private _invokeForAll(ctx: IMultipleCursorOperationContext, callable: (cursorIndex: number, cursor: OneCursor, ctx: IOneCursorOperationContext) => boolean, pushStackElementBefore: boolean = true, pushStackElementAfter: boolean = true): boolean {
		return this._doInvokeForAll(ctx, false, callable, pushStackElementBefore, pushStackElementAfter);
	}

	private _doInvokeForAll(ctx: IMultipleCursorOperationContext, sorted: boolean, callable: (cursorIndex: number, cursor: OneCursor, ctx: IOneCursorOperationContext) => boolean, pushStackElementBefore: boolean = true, pushStackElementAfter: boolean = true): boolean {
		let result = false;
		let cursors = this.cursors.getAll();

		if (sorted) {
			cursors = cursors.sort((a, b) => {
				return Range.compareRangesUsingStarts(a.getSelection(), b.getSelection());
			});
		}

		let context:IOneCursorOperationContext;

		ctx.shouldPushStackElementBefore = pushStackElementBefore;
		ctx.shouldPushStackElementAfter = pushStackElementAfter;

		for (let i = 0; i < cursors.length; i++) {
			context = {
				cursorPositionChangeReason: editorCommon.CursorChangeReason.NotSet,
				shouldReveal: true,
				shouldRevealVerticalInCenter: false,
				shouldRevealHorizontal: true,
				executeCommand: null,
				isAutoWhitespaceCommand: false,
				postOperationRunnable: null,
				shouldPushStackElementBefore: false,
				shouldPushStackElementAfter: false,
				requestScrollDeltaLines: 0
			};

			result = callable(i, cursors[i], context) || result;

			if (i === 0) {
				ctx.cursorPositionChangeReason = context.cursorPositionChangeReason;
				ctx.shouldRevealHorizontal = context.shouldRevealHorizontal;
				ctx.shouldReveal = context.shouldReveal;
				ctx.shouldRevealVerticalInCenter = context.shouldRevealVerticalInCenter;
				ctx.requestScrollDeltaLines = context.requestScrollDeltaLines;
			}

			ctx.shouldPushStackElementBefore = ctx.shouldPushStackElementBefore || context.shouldPushStackElementBefore;
			ctx.shouldPushStackElementAfter = ctx.shouldPushStackElementAfter || context.shouldPushStackElementAfter;

			ctx.executeCommands[i] = context.executeCommand;
			ctx.isAutoWhitespaceCommand[i] = context.isAutoWhitespaceCommand;
			ctx.postOperationRunnables[i] = context.postOperationRunnable;
		}

		return result;
	}

	private _jumpToBracket(ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.jumpToBracket(oneCursor, oneCtx));
	}

	private _moveTo(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveTo(oneCursor, inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition, ctx.eventSource, oneCtx));
	}

	private _columnSelectToLineNumber: number = 0;
	private _getColumnSelectToLineNumber(): number {
		if (!this._columnSelectToLineNumber) {
			let primaryCursor = this.cursors.getAll()[0];
			let primaryPos = primaryCursor.getViewPosition();
			return primaryPos.lineNumber;
		}
		return this._columnSelectToLineNumber;
	}

	private _columnSelectToVisualColumn: number = 0;
	private _getColumnSelectToVisualColumn(): number {
		if (!this._columnSelectToVisualColumn) {
			let primaryCursor = this.cursors.getAll()[0];
			let primaryPos = primaryCursor.getViewPosition();
			return primaryCursor.getViewVisibleColumnFromColumn(primaryPos.lineNumber, primaryPos.column);
		}
		return this._columnSelectToVisualColumn;
	}

	private _columnSelectMouse(ctx: IMultipleCursorOperationContext): boolean {
		let cursors = this.cursors.getAll();
		let result = OneCursorOp.columnSelectMouse(cursors[0], ctx.eventData.position, ctx.eventData.viewPosition,  ctx.eventData.mouseColumn - 1);

		ctx.shouldRevealTarget = (result.reversed ? RevealTarget.TopMost : RevealTarget.BottomMost);
		ctx.shouldReveal = true;
		ctx.setColumnSelectToLineNumber = result.toLineNumber;
		ctx.setColumnSelectToVisualColumn = result.toVisualColumn;

		this.cursors.setSelections(result.selections, result.viewSelections);
		return true;
	}

	private _columnSelectOp(ctx: IMultipleCursorOperationContext, op:(cursor:OneCursor, toViewLineNumber:number, toViewVisualColumn: number) => IColumnSelectResult): boolean {
		let primary = this.cursors.getAll()[0];
		let result = op(primary, this._getColumnSelectToLineNumber(), this._getColumnSelectToVisualColumn());

		ctx.shouldRevealTarget = (result.reversed ? RevealTarget.TopMost : RevealTarget.BottomMost);
		ctx.shouldReveal = true;
		ctx.setColumnSelectToLineNumber = result.toLineNumber;
		ctx.setColumnSelectToVisualColumn = result.toVisualColumn;

		this.cursors.setSelections(result.selections, result.viewSelections);
		return true;
	}

	private _columnSelectLeft(ctx: IMultipleCursorOperationContext): boolean {
		return this._columnSelectOp(ctx, (cursor, toViewLineNumber, toViewVisualColumn) => OneCursorOp.columnSelectLeft(cursor, toViewLineNumber, toViewVisualColumn));
	}

	private _columnSelectRight(ctx: IMultipleCursorOperationContext): boolean {
		return this._columnSelectOp(ctx, (cursor, toViewLineNumber, toViewVisualColumn) => OneCursorOp.columnSelectRight(cursor, toViewLineNumber, toViewVisualColumn));
	}

	private _columnSelectUp(isPaged:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._columnSelectOp(ctx, (cursor, toViewLineNumber, toViewVisualColumn) => OneCursorOp.columnSelectUp(isPaged, cursor, toViewLineNumber, toViewVisualColumn));
	}

	private _columnSelectDown(isPaged:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._columnSelectOp(ctx, (cursor, toViewLineNumber, toViewVisualColumn) => OneCursorOp.columnSelectDown(isPaged, cursor, toViewLineNumber, toViewVisualColumn));
	}

	private _createCursor(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return false;
		}

		this.cursors.addSecondaryCursor({
			selectionStartLineNumber: 1,
			selectionStartColumn: 1,
			positionLineNumber: 1,
			positionColumn: 1
		});

		// Manually move to get events
		var lastAddedCursor = this.cursors.getLastAddedCursor();
		this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (oneCursor === lastAddedCursor) {
				if (ctx.eventData.wholeLine) {
					return OneCursorOp.line(oneCursor, false, ctx.eventData.position, ctx.eventData.viewPosition, oneCtx);
				} else {
					return OneCursorOp.moveTo(oneCursor, false, ctx.eventData.position, ctx.eventData.viewPosition, ctx.eventSource, oneCtx);
				}
			}
			return false;
		});

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		return true;
	}

	private _lastCursorMoveTo(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return false;
		}

		var lastAddedCursor = this.cursors.getLastAddedCursor();
		this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (oneCursor === lastAddedCursor) {
				return OneCursorOp.moveTo(oneCursor,true, ctx.eventData.position, ctx.eventData.viewPosition, ctx.eventSource, oneCtx);
			}
			return false;
		});

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		return true;
	}

	private _addCursorUp(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly) {
			return false;
		}

		var originalCnt = this.cursors.getSelections().length;
		this.cursors.duplicateCursors();
		ctx.shouldRevealTarget = RevealTarget.TopMost;

		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (cursorIndex >= originalCnt) {
				return OneCursorOp.translateUp(oneCursor, oneCtx);
			}
			return false;
		});
	}

	private _addCursorDown(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly) {
			return false;
		}

		var originalCnt = this.cursors.getSelections().length;
		this.cursors.duplicateCursors();
		ctx.shouldRevealTarget = RevealTarget.BottomMost;

		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (cursorIndex >= originalCnt) {
				return OneCursorOp.translateDown(oneCursor, oneCtx);
			}
			return false;
		});
	}

	private _moveLeft(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveLeft(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveWordLeft(inSelectionMode:boolean, wordNavigationType:WordNavigationType, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveWordLeft(oneCursor, inSelectionMode, wordNavigationType, oneCtx));
	}

	private _moveRight(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveRight(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveWordRight(inSelectionMode:boolean, wordNavigationType:WordNavigationType, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveWordRight(oneCursor, inSelectionMode, wordNavigationType, oneCtx));
	}

	private _moveDown(inSelectionMode:boolean, isPaged:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveDown(oneCursor, inSelectionMode, isPaged, ctx.eventData && ctx.eventData.pageSize || 0, oneCtx));
	}

	private _moveUp(inSelectionMode:boolean, isPaged:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveUp(oneCursor, inSelectionMode, isPaged, ctx.eventData && ctx.eventData.pageSize || 0, oneCtx));
	}

	private _moveToBeginningOfLine(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveToBeginningOfLine(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveToEndOfLine(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveToEndOfLine(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveToBeginningOfBuffer(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveToBeginningOfBuffer(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveToEndOfBuffer(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveToEndOfBuffer(oneCursor, inSelectionMode, oneCtx));
	}

	private _selectAll(ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.selectAll(oneCursor, oneCtx));
	}

	private _line(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.line(oneCursor, inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition, oneCtx));
	}

	private _lastCursorLine(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return false;
		}

		var lastAddedCursor = this.cursors.getLastAddedCursor();
		this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (oneCursor === lastAddedCursor) {
				return OneCursorOp.line(oneCursor, inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition, oneCtx);
			}
			return false;
		});

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		return true;
	}

	private _expandLineSelection(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.expandLineSelection(oneCursor, oneCtx));
	}

	private _lineInsertBefore(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.lineInsertBefore(oneCursor, oneCtx));
	}

	private _lineInsertAfter(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.lineInsertAfter(oneCursor, oneCtx));
	}

	private _lineBreakInsert(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.lineBreakInsert(oneCursor, oneCtx));
	}

	private _word(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.word(oneCursor, inSelectionMode, ctx.eventData.position, oneCtx));
	}

	private _lastCursorWord(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return false;
		}

		var lastAddedCursor = this.cursors.getLastAddedCursor();
		this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (oneCursor === lastAddedCursor) {
				return OneCursorOp.word(oneCursor, true, ctx.eventData.position, oneCtx);
			}
			return false;
		});

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		return true;
	}

	private _removeSecondaryCursors(ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return true;
	}

	private _cancelSelection(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.cancelSelection(oneCursor, oneCtx));
	}

	private _type(ctx: IMultipleCursorOperationContext): boolean {
		var text = ctx.eventData.text;

		if (ctx.eventSource === 'keyboard') {
			// If this event is coming straight from the keyboard, look for electric characters and enter

			var i:number, len:number, chr:string;
			for (i = 0, len = text.length; i < len; i++) {
				chr = text.charAt(i);

				this.charactersTyped += chr;

				// Here we must interpret each typed character individually, that's why we create a new context
				ctx.hasExecutedCommands = this._createAndInterpretHandlerCtx(ctx.eventSource, ctx.eventData, (charHandlerCtx:IMultipleCursorOperationContext) => {

					this._invokeForAll(charHandlerCtx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.type(oneCursor, chr, oneCtx), false, false);

					// The last typed character gets to win
					ctx.cursorPositionChangeReason = charHandlerCtx.cursorPositionChangeReason;
					ctx.shouldReveal = charHandlerCtx.shouldReveal;
					ctx.shouldRevealVerticalInCenter = charHandlerCtx.shouldRevealVerticalInCenter;
					ctx.shouldRevealHorizontal = charHandlerCtx.shouldRevealHorizontal;
				}) || ctx.hasExecutedCommands;

			}
		} else {
			this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.actualType(oneCursor, text, false, oneCtx));
		}

		return true;
	}

	private _replacePreviousChar(ctx: IMultipleCursorOperationContext): boolean {
		let text = ctx.eventData.text;
		let replaceCharCnt = ctx.eventData.replaceCharCnt;
		return this._invokeForAll(ctx,(cursorIndex, oneCursor, oneCtx) => OneCursorOp.replacePreviousChar(oneCursor, text, replaceCharCnt, oneCtx));

	}

	private _tab(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.tab(oneCursor, oneCtx), false, false);
	}

	private _indent(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.indent(oneCursor, oneCtx));
	}

	private _outdent(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.outdent(oneCursor, oneCtx));
	}

	private _paste(ctx: IMultipleCursorOperationContext): boolean {
		var distributedPaste = this._distributePasteToCursors(ctx);

		if (distributedPaste) {
			return this._invokeForAllSorted(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.paste(oneCursor, distributedPaste[cursorIndex], false, oneCtx));
		} else {
			return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.paste(oneCursor, ctx.eventData.text, ctx.eventData.pasteOnNewLine, oneCtx));
		}
	}

	private _scrollUp(isPaged: boolean, ctx: IMultipleCursorOperationContext): boolean {
		ctx.requestScrollDeltaLines = isPaged ? -this.cursors.getAll()[0].getPageSize() : -1;
		return true;
	}

	private _scrollDown(isPaged: boolean, ctx: IMultipleCursorOperationContext): boolean {
		ctx.requestScrollDeltaLines = isPaged ? this.cursors.getAll()[0].getPageSize() : 1;
		return true;
	}

	private _distributePasteToCursors(ctx: IMultipleCursorOperationContext): string[] {
		if (ctx.eventData.pasteOnNewLine) {
			return null;
		}

		var selections = this.cursors.getSelections();
		if (selections.length === 1) {
			return null;
		}

		for (var i = 0; i < selections.length; i++) {
			if (selections[i].startLineNumber !== selections[i].endLineNumber) {
				return null;
			}
		}

		var pastePieces = ctx.eventData.text.split(/\r\n|\r|\n/);
		if (pastePieces.length !== selections.length) {
			return null;
		}

		return pastePieces;
	}

	private _deleteLeft(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteLeft(oneCursor, oneCtx), false, false);
	}

	private _deleteWordLeft(whitespaceHeuristics:boolean, wordNavigationType:WordNavigationType, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteWordLeft(oneCursor, whitespaceHeuristics, wordNavigationType, oneCtx), false, false);
	}

	private _deleteRight(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteRight(oneCursor, oneCtx), false, false);
	}

	private _deleteWordRight(whitespaceHeuristics:boolean, wordNavigationType:WordNavigationType, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteWordRight(oneCursor, whitespaceHeuristics, wordNavigationType, oneCtx), false, false);
	}

	private _deleteAllLeft(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteAllLeft(oneCursor, oneCtx), false, false);
	}

	private _deleteAllRight(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteAllRight(oneCursor, oneCtx), false, false);
	}

	private _cut(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.cut(oneCursor, this.enableEmptySelectionClipboard, oneCtx));
	}

	private _undo(ctx: IMultipleCursorOperationContext): boolean {
		ctx.cursorPositionChangeReason = editorCommon.CursorChangeReason.Undo;
		ctx.hasExecutedCommands = true;
		this._interpretCommandResult(this.model.undo());
		return true;
	}

	private _cursorUndo(ctx: IMultipleCursorOperationContext): boolean {
		if (this.cursorUndoStack.length === 0) {
			return false;
		}
		ctx.cursorPositionChangeReason = editorCommon.CursorChangeReason.Undo;
		ctx.isCursorUndo = true;
		this.cursors.restoreState(this.cursorUndoStack.pop());
		return true;
	}

	private _redo(ctx: IMultipleCursorOperationContext): boolean {
		ctx.cursorPositionChangeReason = editorCommon.CursorChangeReason.Redo;
		ctx.hasExecutedCommands = true;
		this._interpretCommandResult(this.model.redo());
		return true;
	}

	private _externalExecuteCommand(ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			oneCtx.shouldPushStackElementBefore = true;
			oneCtx.shouldPushStackElementAfter = true;
			oneCtx.executeCommand = ctx.eventData;
			return false;
		});
	}

	private _externalExecuteCommands(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			oneCtx.shouldPushStackElementBefore = true;
			oneCtx.shouldPushStackElementAfter = true;
			oneCtx.executeCommand = ctx.eventData[cursorIndex];
			return false;
		});
	}
}
