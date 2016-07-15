/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import './media/editor.css';
import './media/tokens.css';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IEventEmitter} from 'vs/base/common/eventEmitter';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ICommandService} from 'vs/platform/commands/common/commands';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {CommonCodeEditor} from 'vs/editor/common/commonCodeEditor';
import {CommonEditorConfiguration} from 'vs/editor/common/config/commonEditorConfig';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {Configuration} from 'vs/editor/browser/config/configuration';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {Colorizer} from 'vs/editor/browser/standalone/colorizer';
import {View} from 'vs/editor/browser/view/viewImpl';
import {Disposable, IDisposable} from 'vs/base/common/lifecycle';
import Event, {Emitter} from 'vs/base/common/event';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';

export class CodeEditorWidget extends CommonCodeEditor implements editorBrowser.ICodeEditor {

	public onMouseUp(listener: (e:editorBrowser.IEditorMouseEvent)=>void): IDisposable {
		return this.addListener2(editorCommon.EventType.MouseUp, listener);
	}
	public onMouseDown(listener: (e:editorBrowser.IEditorMouseEvent)=>void): IDisposable {
		return this.addListener2(editorCommon.EventType.MouseDown, listener);
	}
	public onContextMenu(listener: (e:editorBrowser.IEditorMouseEvent)=>void): IDisposable {
		return this.addListener2(editorCommon.EventType.ContextMenu, listener);
	}
	public onMouseMove(listener: (e:editorBrowser.IEditorMouseEvent)=>void): IDisposable {
		return this.addListener2(editorCommon.EventType.MouseMove, listener);
	}
	public onMouseLeave(listener: (e:editorBrowser.IEditorMouseEvent)=>void): IDisposable {
		return this.addListener2(editorCommon.EventType.MouseLeave, listener);
	}
	public onKeyUp(listener: (e:IKeyboardEvent)=>void): IDisposable {
		return this.addListener2(editorCommon.EventType.KeyUp, listener);
	}
	public onKeyDown(listener: (e:IKeyboardEvent)=>void): IDisposable {
		return this.addListener2(editorCommon.EventType.KeyDown, listener);
	}
	public onDidLayoutChange(listener: (e:editorCommon.EditorLayoutInfo)=>void): IDisposable {
		return this.addListener2(editorCommon.EventType.EditorLayout, listener);
	}
	public onDidScrollChange(listener: (e:editorCommon.IScrollEvent)=>void): IDisposable {
		return this.addListener2('scroll', listener);
	}

	protected domElement:HTMLElement;
	private _focusTracker: CodeEditorWidgetFocusTracker;

	_configuration:Configuration;

	private contentWidgets:{ [key:string]:editorBrowser.IContentWidgetData; };
	private overlayWidgets:{ [key:string]:editorBrowser.IOverlayWidgetData; };

	_view:editorBrowser.IView;

	constructor(
		domElement:HTMLElement,
		options:editorCommon.IEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(domElement, options, instantiationService, codeEditorService, commandService, keybindingService, telemetryService);

		this._focusTracker = new CodeEditorWidgetFocusTracker(domElement);
		this._focusTracker.onChage(() => {
			let hasFocus = this._focusTracker.hasFocus();

			if (hasFocus) {
				this._editorFocusContextKey.set(true);
				this.emit(editorCommon.EventType.EditorFocus, {});
			} else {
				this._editorFocusContextKey.reset();
				this.emit(editorCommon.EventType.EditorBlur, {});
			}
		});

		this.contentWidgets = {};
		this.overlayWidgets = {};

		var contributionDescriptors = [].concat(EditorBrowserRegistry.getEditorContributions()).concat(CommonEditorRegistry.getEditorContributions());
		for (var i = 0, len = contributionDescriptors.length; i < len; i++) {
			try {
				var contribution = contributionDescriptors[i].createInstance(this._instantiationService, this);
				this.contributions[contribution.getId()] = contribution;
			} catch (err) {
				console.error('Could not instantiate contribution ' + contribution.getId());
				onUnexpectedError(err);
			}
		}
	}

	protected _createConfiguration(options:editorCommon.ICodeEditorWidgetCreationOptions): CommonEditorConfiguration {
		return new Configuration(options, this.domElement);
	}

	public dispose(): void {
		this.contentWidgets = {};
		this.overlayWidgets = {};

		this._focusTracker.dispose();
		super.dispose();
	}

	public updateOptions(newOptions:editorCommon.IEditorOptions): void {
		let oldTheme = this._configuration.editor.viewInfo.theme;
		super.updateOptions(newOptions);
		let newTheme = this._configuration.editor.viewInfo.theme;

		if (oldTheme !== newTheme) {
			this.render();
		}
	}

	public colorizeModelLine(lineNumber:number, model:editorCommon.IModel = this.model): string {
		if (!model) {
			return '';
		}
		var content = model.getLineContent(lineNumber);
		var tokens = model.getLineTokens(lineNumber, false);
		var inflatedTokens = tokens.inflate();
		var tabSize = model.getOptions().tabSize;
		return Colorizer.colorizeLine(content, inflatedTokens, tabSize);
	}
	public getView(): editorBrowser.IView {
		return this._view;
	}

	public getDomNode(): HTMLElement {
		if (!this.hasView) {
			return null;
		}
		return this._view.domNode;
	}

	public getCenteredRangeInViewport(): Range {
		if (!this.hasView) {
			return null;
		}
		return this._view.getCenteredRangeInViewport();
	}

	public getScrollWidth(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollWidth();
	}
	public getScrollLeft(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollLeft();
	}

	public getScrollHeight(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollHeight();
	}
	public getScrollTop(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollTop();
	}

	public setScrollLeft(newScrollLeft:number): void {
		if (!this.hasView) {
			return;
		}
		if (typeof newScrollLeft !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._view.getCodeEditorHelper().setScrollPosition({
			scrollLeft: newScrollLeft
		});
	}
	public setScrollTop(newScrollTop:number): void {
		if (!this.hasView) {
			return;
		}
		if (typeof newScrollTop !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._view.getCodeEditorHelper().setScrollPosition({
			scrollTop: newScrollTop
		});
	}
	public setScrollPosition(position: editorCommon.INewScrollPosition): void {
		if (!this.hasView) {
			return;
		}
		this._view.getCodeEditorHelper().setScrollPosition(position);
	}

	public delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void {
		if (!this.hasView) {
			return;
		}
		this._view.getCodeEditorHelper().delegateVerticalScrollbarMouseDown(browserEvent);
	}

	public saveViewState(): editorCommon.ICodeEditorViewState {
		if (!this.cursor || !this.hasView) {
			return null;
		}
		let contributionsState: {[key:string]:any} = {};
		for (let id in this.contributions) {
			let contribution = this.contributions[id];
			if (typeof contribution.saveViewState === 'function') {
				contributionsState[id] = contribution.saveViewState();
			}
		}

		var cursorState = this.cursor.saveState();
		var viewState = this._view.saveState();
		return {
			cursorState: cursorState,
			viewState: viewState,
			contributionsState: contributionsState
		};
	}

	public restoreViewState(state:editorCommon.IEditorViewState): void {
		if (!this.cursor || !this.hasView) {
			return;
		}
		var s = <any>state;
		if (s && s.cursorState && s.viewState) {
			var codeEditorState = <editorCommon.ICodeEditorViewState>s;
			var cursorState = <any>codeEditorState.cursorState;
			if (Array.isArray(cursorState)) {
				this.cursor.restoreState(<editorCommon.ICursorState[]>cursorState);
			} else {
				// Backwards compatibility
				this.cursor.restoreState([<editorCommon.ICursorState>cursorState]);
			}
			this._view.restoreState(codeEditorState.viewState);

			let contributionsState = s.contributionsState || {};
			for (let id in this.contributions) {
				let contribution = this.contributions[id];
				if (typeof contribution.restoreViewState === 'function') {
					contribution.restoreViewState(contributionsState[id]);
				}
			}
		}
	}

	public layout(dimension?:editorCommon.IDimension): void {
		this._configuration.observeReferenceElement(dimension);
		this.render();
	}

	public focus(): void {
		if (!this.hasView) {
			return;
		}
		this._view.focus();
	}

	public beginForcedWidgetFocus(): void {
		this._focusTracker.beginForcedFocus();
	}

	public endForcedWidgetFocus(): void {
		this._focusTracker.endForcedFocus();
	}

	public isFocused(): boolean {
		return this.hasView && this._view.isFocused();
	}

	public hasWidgetFocus(): boolean {
		return this._focusTracker.hasFocus();
	}

	public addContentWidget(widget: editorBrowser.IContentWidget): void {
		var widgetData: editorBrowser.IContentWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this.contentWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting a content widget with the same id.');
		}

		this.contentWidgets[widget.getId()] = widgetData;

		if (this.hasView) {
			this._view.addContentWidget(widgetData);
		}
	}

	public layoutContentWidget(widget: editorBrowser.IContentWidget): void {
		var widgetId = widget.getId();
		if (this.contentWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.contentWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this.hasView) {
				this._view.layoutContentWidget(widgetData);
			}
		}
	}

	public removeContentWidget(widget: editorBrowser.IContentWidget): void {
		var widgetId = widget.getId();
		if (this.contentWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.contentWidgets[widgetId];
			delete this.contentWidgets[widgetId];
			if (this.hasView) {
				this._view.removeContentWidget(widgetData);
			}
		}
	}

	public addOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		var widgetData: editorBrowser.IOverlayWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this.overlayWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting an overlay widget with the same id.');
		}

		this.overlayWidgets[widget.getId()] = widgetData;

		if (this.hasView) {
			this._view.addOverlayWidget(widgetData);
		}
	}

	public layoutOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		var widgetId = widget.getId();
		if (this.overlayWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.overlayWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this.hasView) {
				this._view.layoutOverlayWidget(widgetData);
			}
		}
	}

	public removeOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		var widgetId = widget.getId();
		if (this.overlayWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.overlayWidgets[widgetId];
			delete this.overlayWidgets[widgetId];
			if (this.hasView) {
				this._view.removeOverlayWidget(widgetData);
			}
		}
	}

	public changeViewZones(callback:(accessor:editorBrowser.IViewZoneChangeAccessor)=>void): void {
		if (!this.hasView) {
//			console.warn('Cannot change view zones on editor that is not attached to a model, since there is no view.');
			return;
		}
		var hasChanges = this._view.change(callback);
		if (hasChanges) {
			this.emit(editorCommon.EventType.ViewZonesChanged);
		}
	}

	public getWhitespaces(): editorCommon.IEditorWhitespace[] {
		if (!this.hasView) {
			return [];
		}
		return this._view.getWhitespaces();
	}

	public getTopForLineNumber(lineNumber: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getVerticalOffsetForPosition(lineNumber, 1);
	}

	public getTopForPosition(lineNumber: number, column: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getVerticalOffsetForPosition(lineNumber, column);
	}

	public getScrolledVisiblePosition(rawPosition:editorCommon.IPosition): { top:number; left:number; height:number; } {
		if (!this.hasView) {
			return null;
		}

		var position = this.model.validatePosition(rawPosition);
		var helper = this._view.getCodeEditorHelper();
		var layoutInfo = this._configuration.editor.layoutInfo;

		var top = helper.getVerticalOffsetForPosition(position.lineNumber, position.column) - helper.getScrollTop();
		var left = helper.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - helper.getScrollLeft();

		return {
			top: top,
			left: left,
			height: this._configuration.editor.lineHeight
		};
	}

	public getOffsetForColumn(lineNumber:number, column:number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getOffsetForColumn(lineNumber, column);
	}

	public render(): void {
		if (!this.hasView) {
			return;
		}
		this._view.render(true, false);
	}

	public setHiddenAreas(ranges:editorCommon.IRange[]): void {
		if (this.viewModel) {
			this.viewModel.setHiddenAreas(ranges);
		}
	}

	public setAriaActiveDescendant(id:string): void {
		if (!this.hasView) {
			return;
		}
		this._view.setAriaActiveDescendant(id);
	}

	public applyFontInfo(target:HTMLElement): void {
		Configuration.applyFontInfoSlow(target, this._configuration.editor.fontInfo);
	}

	_attachModel(model:editorCommon.IModel): void {
		this._view = null;

		super._attachModel(model);

		if (this._view) {
			this.domElement.appendChild(this._view.domNode);

			this._view.renderOnce(() => {

				let keys = Object.keys(this.contentWidgets);
				for (let i = 0, len = keys.length; i < len; i++) {
					let widgetId = keys[i];
					this._view.addContentWidget(this.contentWidgets[widgetId]);
				}

				keys = Object.keys(this.overlayWidgets);
				for (let i = 0, len = keys.length; i < len; i++) {
					let widgetId = keys[i];
					this._view.addOverlayWidget(this.overlayWidgets[widgetId]);
				}

				this._view.render(false, true);
				this.hasView = true;
			});
		}
	}

	protected _enableEmptySelectionClipboard(): boolean {
		return browser.enableEmptySelectionClipboard;
	}

	protected _createView(): void {
		this._view = new View(
			this._keybindingService,
			this._commandService,
			this._configuration,
			this.viewModel,
			(source:string, handlerId:string, payload:any) => {
				if (!this.cursor) {
					return;
				}
				this.cursor.trigger(source, handlerId, payload);
			}
		);
	}

	protected _getViewInternalEventBus(): IEventEmitter {
		return this._view.getInternalEventBus();
	}

	protected _detachModel(): editorCommon.IModel {
		var removeDomNode:HTMLElement = null;

		if (this._view) {
			this._view.dispose();
			removeDomNode = this._view.domNode;
			this._view = null;
		}

		let result = super._detachModel();

		if (removeDomNode) {
			this.domElement.removeChild(removeDomNode);
		}

		return result;
	}
}

class CodeEditorWidgetFocusTracker extends Disposable {

	private _forcedWidgetFocusCount: number;
	private _focusTrackerHasFocus: boolean;
	private _focusTracker: dom.IFocusTracker;
	private _actualHasFocus: boolean;

	private _onChange: Emitter<void> = this._register(new Emitter<void>());
	public onChage: Event<void> = this._onChange.event;

	constructor(domElement:HTMLElement) {
		super();

		this._focusTrackerHasFocus = false;
		this._forcedWidgetFocusCount = 0;
		this._actualHasFocus = false;
		this._focusTracker = this._register(dom.trackFocus(domElement));

		this._focusTracker.addFocusListener(() => {
			this._focusTrackerHasFocus = true;
			this._update();
		});
		this._focusTracker.addBlurListener(() => {
			this._focusTrackerHasFocus = false;
			this._update();
		});
	}

	public hasFocus(): boolean {
		return this._actualHasFocus;
	}

	public beginForcedFocus(): void {
		this._forcedWidgetFocusCount++;
		this._update();
	}

	public endForcedFocus(): void {
		this._forcedWidgetFocusCount--;
		this._update();
	}

	private _update(): void {
		let newActualHasFocus = this._focusTrackerHasFocus;
		if (this._forcedWidgetFocusCount > 0) {
			newActualHasFocus = true;
		}

		if (this._actualHasFocus === newActualHasFocus) {
			// no change
			return;
		}

		this._actualHasFocus = newActualHasFocus;
		this._onChange.fire(void 0);
	}
}

class OverlayWidget2 implements editorBrowser.IOverlayWidget {

	private _id: string;
	private _position: editorBrowser.IOverlayWidgetPosition;
	private _domNode: HTMLElement;

	constructor(id:string, position:editorBrowser.IOverlayWidgetPosition) {
		this._id = id;
		this._position = position;
		this._domNode = document.createElement('div');
		this._domNode.className = this._id.replace(/\./g, '-').replace(/[^a-z0-9\-]/,'');
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): editorBrowser.IOverlayWidgetPosition {
		return this._position;
	}
}

export enum EditCursorState {
	EndOfLastEditOperation = 0
}

class SingleEditOperation {

	range: Range;
	text: string;
	forceMoveMarkers: boolean;

	constructor(source:editorCommon.ISingleEditOperation) {
		this.range = new Range(source.range.startLineNumber, source.range.startColumn, source.range.endLineNumber, source.range.endColumn);
		this.text = source.text;
		this.forceMoveMarkers = source.forceMoveMarkers || false;
	}

}

export class CommandRunner implements editorCommon.ICommand {

	private _ops: SingleEditOperation[];
	private _editCursorState: EditCursorState;

	constructor(ops: editorCommon.ISingleEditOperation[], editCursorState: EditCursorState) {
		this._ops = ops.map(op => new SingleEditOperation(op));
		this._editCursorState = editCursorState;
	}

	public getEditOperations(model: editorCommon.ITokenizedModel, builder: editorCommon.IEditOperationBuilder): void {
		if (this._ops.length === 0) {
			return;
		}

		// Sort them in ascending order by range starts
		this._ops.sort((o1, o2) => {
			return Range.compareRangesUsingStarts(o1.range, o2.range);
		});

		// Merge operations that touch each other
		var resultOps:editorCommon.ISingleEditOperation[] = [];
		var previousOp = this._ops[0];
		for (var i = 1; i < this._ops.length; i++) {
			if (previousOp.range.endLineNumber === this._ops[i].range.startLineNumber && previousOp.range.endColumn === this._ops[i].range.startColumn) {
				// These operations are one after another and can be merged
				previousOp.range = Range.plusRange(previousOp.range, this._ops[i].range);
				previousOp.text = previousOp.text + this._ops[i].text;
			} else {
				resultOps.push(previousOp);
				previousOp = this._ops[i];
			}
		}
		resultOps.push(previousOp);

		for (var i = 0; i < resultOps.length; i++) {
			builder.addEditOperation(Range.lift(resultOps[i].range), resultOps[i].text);
		}
	}

	public computeCursorState(model: editorCommon.ITokenizedModel, helper: editorCommon.ICursorStateComputerData): Selection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[inverseEditOperations.length - 1].range;
		return new Selection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
	}
}
