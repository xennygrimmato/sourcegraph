/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ExtHostCommands} from 'vs/workbench/api/node/extHostCommands';
import Severity from 'vs/base/common/severity';
import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import * as types from './extHostTypes';
import {Position as EditorPosition} from 'vs/platform/editor/common/editor';
import {IPosition, ISelection, IRange, IDecorationOptions, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import {ITypeBearing} from 'vs/workbench/parts/search/common/search';
import * as vscode from 'vscode';
import URI from 'vs/base/common/uri';

export interface PositionLike {
	line: number;
	character: number;
}

export interface RangeLike {
	start: PositionLike;
	end: PositionLike;
}

export interface SelectionLike extends RangeLike {
	anchor: PositionLike;
	active: PositionLike;
}

export function toSelection(selection: ISelection): types.Selection {
	let {selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn} = selection;
	let start = new types.Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
	let end = new types.Position(positionLineNumber - 1, positionColumn - 1);
	return new types.Selection(start, end);
}

export function fromSelection(selection: SelectionLike): ISelection {
	let {anchor, active} = selection;
	return {
		selectionStartLineNumber: anchor.line + 1,
		selectionStartColumn: anchor.character + 1,
		positionLineNumber: active.line + 1,
		positionColumn: active.character + 1
	};
}

export function fromRange(range: RangeLike): IRange {
	let {start, end} = range;
	return {
		startLineNumber: start.line + 1,
		startColumn: start.character + 1,
		endLineNumber: end.line + 1,
		endColumn: end.character + 1
	};
}

export function toRange(range: IRange): types.Range {
	let {startLineNumber, startColumn, endLineNumber, endColumn} = range;
	return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
}

export function toPosition(position: IPosition): types.Position {
	return new types.Position(position.lineNumber - 1, position.column - 1);
}

export function fromPosition(position: types.Position):IPosition {
	return { lineNumber: position.line + 1, column: position.character + 1};
}

export function fromDiagnosticSeverity(value: number): Severity {
	switch (value) {
		case types.DiagnosticSeverity.Error:
			return Severity.Error;
		case types.DiagnosticSeverity.Warning:
			return Severity.Warning;
		case types.DiagnosticSeverity.Information:
			return Severity.Info;
		case types.DiagnosticSeverity.Hint:
			return Severity.Ignore;
	}
	return Severity.Error;
}

export function toDiagnosticSeverty(value: Severity): types.DiagnosticSeverity {
	switch (value) {
		case Severity.Info:
			return types.DiagnosticSeverity.Information;
		case Severity.Warning:
			return types.DiagnosticSeverity.Warning;
		case Severity.Error:
			return types.DiagnosticSeverity.Error;
		case Severity.Ignore:
			return types.DiagnosticSeverity.Hint;
	}
	return types.DiagnosticSeverity.Error;
}

export function fromViewColumn(column?: vscode.ViewColumn): EditorPosition {
	let editorColumn = EditorPosition.LEFT;
	if (typeof column !== 'number') {
		// stick with LEFT
	} else if (column === <number>types.ViewColumn.Two) {
		editorColumn = EditorPosition.CENTER;
	} else if (column === <number>types.ViewColumn.Three) {
		editorColumn = EditorPosition.RIGHT;
	}
	return editorColumn;
}

export function toViewColumn(position?: EditorPosition): vscode.ViewColumn {
	if (typeof position !== 'number') {
		return;
	}
	if (position === EditorPosition.LEFT) {
		return <number> types.ViewColumn.One;
	} else if (position === EditorPosition.CENTER) {
		return <number> types.ViewColumn.Two;
	} else if (position === EditorPosition.RIGHT) {
		return <number> types.ViewColumn.Three;
	}
}

function isDecorationOptions(something: any): something is vscode.DecorationOptions {
	return (typeof something.range !== 'undefined');
}

function isDecorationOptionsArr(something: vscode.Range[]|vscode.DecorationOptions[]): something is vscode.DecorationOptions[] {
	if (something.length === 0) {
		return true;
	}
	return isDecorationOptions(something[0]) ? true : false;
}

export function fromRangeOrRangeWithMessage(ranges:vscode.Range[]|vscode.DecorationOptions[]): IDecorationOptions[] {
	if (isDecorationOptionsArr(ranges)) {
		return ranges.map((r): IDecorationOptions => {
			return {
				range: fromRange(r.range),
				hoverMessage: r.hoverMessage,
				renderOptions: r.renderOptions
			};
		});
	} else {
		return ranges.map((r): IDecorationOptions => {
			return {
				range: fromRange(r)
			};
		});
	}
}

export const TextEdit = {
	from(edit: vscode.TextEdit): ISingleEditOperation{
		return <ISingleEditOperation>{
			text: edit.newText,
			range: fromRange(edit.range)
		};
	},
	to(edit: ISingleEditOperation): vscode.TextEdit {
		return new types.TextEdit(toRange(edit.range), edit.text);
	}
};

export namespace SymbolInformation {

	export function fromOutlineEntry(entry: modes.SymbolInformation): types.SymbolInformation {
		return new types.SymbolInformation(
			entry.name,
			entry.kind,
			toRange(entry.location.range),
			entry.location.uri,
			entry.containerName
		);
	}

	export function toOutlineEntry(symbol: vscode.SymbolInformation): modes.SymbolInformation {
		return <modes.SymbolInformation>{
			name: symbol.name,
			kind: symbol.kind,
			containerName: symbol.containerName,
			location: {
				uri: <URI>symbol.location.uri,
				range: fromRange(symbol.location.range)
			}
		};
	}
}

export function fromSymbolInformation(info: vscode.SymbolInformation): ITypeBearing {
	return <ITypeBearing>{
		name: info.name,
		type: types.SymbolKind[info.kind || types.SymbolKind.Property].toLowerCase(),
		range: fromRange(info.location.range),
		resourceUri: info.location.uri,
		containerName: info.containerName,
		parameters: '',
	};
}

export function toSymbolInformation(bearing: ITypeBearing): types.SymbolInformation {
	return new types.SymbolInformation(bearing.name,
		types.SymbolKind[bearing.type.charAt(0).toUpperCase() + bearing.type.substr(1)],
		toRange(bearing.range),
		bearing.resourceUri,
		bearing.containerName);
}


export const location = {
	from(value: types.Location): modes.Location {
		return {
			range: fromRange(value.range),
			uri: value.uri
		};
	},
	to(value: modes.Location): types.Location {
		return new types.Location(value.uri, toRange(value.range));
	}
};

export function fromHover(hover: vscode.Hover): modes.Hover {
	return <modes.Hover>{
		range: fromRange(hover.range),
		contents: hover.contents
	};
}

export function toHover(info: modes.Hover): types.Hover {
	return new types.Hover(info.contents, toRange(info.range));
}

export function toDocumentHighlight(occurrence: modes.DocumentHighlight): types.DocumentHighlight {
	return new types.DocumentHighlight(toRange(occurrence.range), occurrence.kind);
}

export const CompletionItemKind = {

	from(kind: types.CompletionItemKind): modes.SuggestionType {
		switch (kind) {
			case types.CompletionItemKind.Function: return 'function';
			case types.CompletionItemKind.Constructor: return 'constructor';
			case types.CompletionItemKind.Field: return 'field';
			case types.CompletionItemKind.Variable: return 'variable';
			case types.CompletionItemKind.Class: return 'class';
			case types.CompletionItemKind.Interface: return 'interface';
			case types.CompletionItemKind.Module: return 'module';
			case types.CompletionItemKind.Property: return 'property';
			case types.CompletionItemKind.Unit: return 'unit';
			case types.CompletionItemKind.Value: return 'value';
			case types.CompletionItemKind.Enum: return 'enum';
			case types.CompletionItemKind.Keyword: return 'keyword';
			case types.CompletionItemKind.Snippet: return 'snippet';
			case types.CompletionItemKind.Text: return 'text';
			case types.CompletionItemKind.Color: return 'color';
			case types.CompletionItemKind.File: return 'file';
			case types.CompletionItemKind.Reference: return 'reference';
		}
		return 'property';
	},

	to(type: modes.SuggestionType): types.CompletionItemKind {
		if (!type) {
			return types.CompletionItemKind.Property;
		} else {
			return types.CompletionItemKind[type.charAt(0).toUpperCase() + type.substr(1)];
		}
	}
};

export const Suggest = {

	from(item: vscode.CompletionItem): modes.ISuggestion {
		const suggestion: modes.ISuggestion = {
			label: item.label,
			codeSnippet: item.insertText || item.label,
			type: CompletionItemKind.from(item.kind),
			typeLabel: item.detail,
			documentationLabel: item.documentation,
			sortText: item.sortText,
			filterText: item.filterText
		};
		return suggestion;
	},

	to(container: modes.ISuggestResult, position: types.Position, suggestion: modes.ISuggestion): types.CompletionItem {
		const result = new types.CompletionItem(suggestion.label);
		result.insertText = suggestion.codeSnippet;
		result.kind = CompletionItemKind.to(suggestion.type);
		result.detail = suggestion.typeLabel;
		result.documentation = suggestion.documentationLabel;
		result.sortText = suggestion.sortText;
		result.filterText = suggestion.filterText;

		let overwriteBefore = (typeof suggestion.overwriteBefore === 'number') ? suggestion.overwriteBefore : container.currentWord.length;
		let startPosition = new types.Position(position.line, Math.max(0, position.character - overwriteBefore));
		let endPosition = position;
		if (typeof suggestion.overwriteAfter === 'number') {
			endPosition = new types.Position(position.line, position.character + suggestion.overwriteAfter);
		}

		result.textEdit = types.TextEdit.replace(new types.Range(startPosition, endPosition), suggestion.codeSnippet);
		return result;
	}
};

export namespace SignatureHelp {

	export function from(signatureHelp: types.SignatureHelp): modes.SignatureHelp {
		return signatureHelp;
	}

	export function to(hints: modes.SignatureHelp): types.SignatureHelp {
		return hints;
	}
}


export namespace Command {

	const _delegateId = '_internal_delegate_command';
	const _cache: { [id: string]: vscode.Command } = Object.create(null);
	let _idPool = 1;

	export function initialize(commands: ExtHostCommands) {
		return commands.registerCommand(_delegateId, (id: string) => {
			const command = _cache[id];
			if (!command) {
				// handle already disposed delegations graceful
				return;
			}
			return commands.executeCommand(command.command, ...command.arguments);
		});
	}

	export function from(command: vscode.Command, disposables: IDisposable[]): modes.Command {

		if (!command) {
			return;
		}

		const result = <modes.Command>{
			id: command.command,
			title: command.title
		};

		if (!isFalsyOrEmpty(command.arguments)) {

			// redirect to delegate command and store actual command
			const id = `delegate/${_idPool++}/for/${command.command}`;

			result.id = _delegateId;
			result.arguments = [id];
			_cache[id] = command;

			disposables.push({
				dispose() {
					delete _cache[id];
				}
			});
		}

		return result;
	}

	export function to(command: modes.Command): vscode.Command {
		let result: vscode.Command;
		if (command.id === _delegateId) {
			let [key] = command.arguments;
			result = _cache[key];
		}
		if (!result) {
			result = {
				command: command.id,
				title: command.title
			};
		}
		return result;
	}
}
