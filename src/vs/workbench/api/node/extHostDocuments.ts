/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import Event, {Emitter} from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import {IDisposable} from 'vs/base/common/lifecycle';
import {Range, Position, Disposable} from 'vs/workbench/api/node/extHostTypes';
import * as TypeConverters from './extHostTypeConverters';
import {TPromise} from 'vs/base/common/winjs.base';
import * as vscode from 'vscode';
import {asWinJsPromise} from 'vs/base/common/async';
import {getWordAtText, ensureValidWordDefinition} from 'vs/editor/common/model/wordHelper';
import {MainContext, MainThreadDocumentsShape, ExtHostDocumentsShape, IModelAddedData} from './extHost.protocol';

const _modeId2WordDefinition: {
	[modeId: string]: RegExp;
} = Object.create(null);

function setWordDefinitionFor(modeId: string, wordDefinition: RegExp): void {
	_modeId2WordDefinition[modeId] = wordDefinition;
}

function getWordDefinitionFor(modeId: string): RegExp {
	return _modeId2WordDefinition[modeId];
}

export class ExtHostDocuments extends ExtHostDocumentsShape {

	private static _handlePool: number = 0;

	private _onDidAddDocumentEventEmitter: Emitter<vscode.TextDocument>;
	public onDidAddDocument: Event<vscode.TextDocument>;

	private _onDidRemoveDocumentEventEmitter: Emitter<vscode.TextDocument>;
	public onDidRemoveDocument: Event<vscode.TextDocument>;

	private _onDidChangeDocumentEventEmitter: Emitter<vscode.TextDocumentChangeEvent>;
	public onDidChangeDocument: Event<vscode.TextDocumentChangeEvent>;

	private _onDidSaveDocumentEventEmitter: Emitter<vscode.TextDocument>;
	public onDidSaveDocument: Event<vscode.TextDocument>;

	private _documentData: { [modelUri: string]: ExtHostDocumentData; };
	private _documentLoader: { [modelUri: string]: TPromise<ExtHostDocumentData> };
	private _documentContentProviders: { [handle: number]: vscode.TextDocumentContentProvider; };

	private _proxy: MainThreadDocumentsShape;

	constructor(threadService: IThreadService) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadDocuments);

		this._onDidAddDocumentEventEmitter = new Emitter<vscode.TextDocument>();
		this.onDidAddDocument = this._onDidAddDocumentEventEmitter.event;

		this._onDidRemoveDocumentEventEmitter = new Emitter<vscode.TextDocument>();
		this.onDidRemoveDocument = this._onDidRemoveDocumentEventEmitter.event;

		this._onDidChangeDocumentEventEmitter = new Emitter<vscode.TextDocumentChangeEvent>();
		this.onDidChangeDocument = this._onDidChangeDocumentEventEmitter.event;

		this._onDidSaveDocumentEventEmitter = new Emitter<vscode.TextDocument>();
		this.onDidSaveDocument = this._onDidSaveDocumentEventEmitter.event;

		this._documentData = Object.create(null);
		this._documentLoader = Object.create(null);
		this._documentContentProviders = Object.create(null);
	}

	public getAllDocumentData(): ExtHostDocumentData[] {
		const result: ExtHostDocumentData[] = [];
		for (let key in this._documentData) {
			result.push(this._documentData[key]);
		}
		return result;
	}

	public getDocumentData(resource: vscode.Uri): ExtHostDocumentData {
		if (!resource) {
			return;
		}
		const data = this._documentData[resource.toString()];
		if (data) {
			return data;
		}
	}

	public ensureDocumentData(uri: URI): TPromise<ExtHostDocumentData> {

		let cached = this._documentData[uri.toString()];
		if (cached) {
			return TPromise.as(cached);
		}

		let promise = this._documentLoader[uri.toString()];
		if (!promise) {
			promise = this._proxy.$tryOpenDocument(uri).then(() => {
				delete this._documentLoader[uri.toString()];
				return this._documentData[uri.toString()];
			}, err => {
				delete this._documentLoader[uri.toString()];
				return TPromise.wrapError(err);
			});
			this._documentLoader[uri.toString()] = promise;
		}

		return promise;
	}

	public registerTextDocumentContentProvider(scheme: string, provider: vscode.TextDocumentContentProvider): vscode.Disposable {
		if (scheme === 'file' || scheme === 'untitled') {
			throw new Error(`scheme '${scheme}' already registered`);
		}

		const handle = ExtHostDocuments._handlePool++;

		this._documentContentProviders[handle] = provider;
		this._proxy.$registerTextContentProvider(handle, scheme);

		let subscription: IDisposable;
		if (typeof provider.onDidChange === 'function') {
			subscription = provider.onDidChange(uri => {
				if (this._documentData[uri.toString()]) {
					this.$provideTextDocumentContent(handle, <URI>uri).then(value => {
						return this._proxy.$onVirtualDocumentChange(<URI>uri, value);
					}, onUnexpectedError);
				}
			});
		}
		return new Disposable(() => {
			if (delete this._documentContentProviders[handle]) {
				this._proxy.$unregisterTextContentProvider(handle);
			}
			if (subscription) {
				subscription.dispose();
				subscription = undefined;
			}
		});
	}

	$provideTextDocumentContent(handle: number, uri: URI): TPromise<string> {
		const provider = this._documentContentProviders[handle];
		if (!provider) {
			return TPromise.wrapError<string>(`unsupported uri-scheme: ${uri.scheme}`);
		}
		return asWinJsPromise(token => provider.provideTextDocumentContent(uri, token));
	}

	public $acceptModelAdd(initData: IModelAddedData): void {
		let data = new ExtHostDocumentData(this._proxy, initData.url, initData.value.lines, initData.value.EOL, initData.modeId, initData.versionId, initData.isDirty);
		let key = data.document.uri.toString();
		if (this._documentData[key]) {
			throw new Error('Document `' + key + '` already exists.');
		}
		this._documentData[key] = data;
		this._onDidAddDocumentEventEmitter.fire(data.document);
	}

	public $acceptModelModeChanged(strURL: string, oldModeId: string, newModeId: string): void {
		let data = this._documentData[strURL];

		// Treat a mode change as a remove + add

		this._onDidRemoveDocumentEventEmitter.fire(data.document);
		data._acceptLanguageId(newModeId);
		this._onDidAddDocumentEventEmitter.fire(data.document);
	}

	public $acceptModelSaved(strURL: string): void {
		let data = this._documentData[strURL];
		data._acceptIsDirty(false);
		this._onDidSaveDocumentEventEmitter.fire(data.document);
	}

	public $acceptModelDirty(strURL: string): void {
		let document = this._documentData[strURL];
		document._acceptIsDirty(true);
	}

	public $acceptModelReverted(strURL: string): void {
		let document = this._documentData[strURL];
		document._acceptIsDirty(false);
	}

	public $acceptModelRemoved(strURL: string): void {
		if (!this._documentData[strURL]) {
			throw new Error('Document `' + strURL + '` does not exist.');
		}
		let data = this._documentData[strURL];
		delete this._documentData[strURL];
		this._onDidRemoveDocumentEventEmitter.fire(data.document);
		data.dispose();
	}

	public $acceptModelChanged(strURL: string, events: editorCommon.IModelContentChangedEvent2[]): void {
		let data = this._documentData[strURL];
		data.onEvents(events);
		this._onDidChangeDocumentEventEmitter.fire({
			document: data.document,
			contentChanges: events.map((e) => {
				return {
					range: TypeConverters.toRange(e.range),
					rangeLength: e.rangeLength,
					text: e.text
				};
			})
		});
	}

	setWordDefinitionFor(modeId: string, wordDefinition: RegExp): void {
		setWordDefinitionFor(modeId, wordDefinition);
	}
}

export class ExtHostDocumentData extends MirrorModel2 {

	private _proxy: MainThreadDocumentsShape;
	private _languageId: string;
	private _isDirty: boolean;
	private _textLines: vscode.TextLine[];
	private _document: vscode.TextDocument;

	constructor(proxy: MainThreadDocumentsShape, uri: URI, lines: string[], eol: string,
		languageId: string, versionId: number, isDirty: boolean) {

		super(uri, lines, eol, versionId);
		this._proxy = proxy;
		this._languageId = languageId;
		this._isDirty = isDirty;
		this._textLines = [];
	}

	dispose(): void {
		this._textLines.length = 0;
		this._isDirty = false;
		super.dispose();
	}

	get document(): vscode.TextDocument {
		if (!this._document) {
			const data = this;
			this._document = {
				get uri() { return data._uri; },
				get fileName() { return data._uri.fsPath; },
				get isUntitled() { return data._uri.scheme !== 'file'; },
				get languageId() { return data._languageId; },
				get version() { return data._versionId; },
				get isDirty() { return data._isDirty; },
				save() { return data._proxy.$trySaveDocument(data._uri); },
				getText(range?) { return range ? data._getTextInRange(range) : data.getText(); },
				get lineCount() { return data._lines.length; },
				lineAt(lineOrPos) { return data.lineAt(lineOrPos); },
				offsetAt(pos) { return data.offsetAt(pos); },
				positionAt(offset) { return data.positionAt(offset); },
				validateRange(ran) { return data.validateRange(ran); },
				validatePosition(pos) { return data.validatePosition(pos); },
				getWordRangeAtPosition(pos) { return data.getWordRangeAtPosition(pos); }
			};
		}
		return this._document;
	}

	_acceptLanguageId(newLanguageId: string): void {
		this._languageId = newLanguageId;
	}

	_acceptIsDirty(isDirty: boolean): void {
		this._isDirty = isDirty;
	}

	private _getTextInRange(_range: vscode.Range): string {
		let range = this.validateRange(_range);

		if (range.isEmpty) {
			return '';
		}

		if (range.isSingleLine) {
			return this._lines[range.start.line].substring(range.start.character, range.end.character);
		}

		let lineEnding = this._eol,
			startLineIndex = range.start.line,
			endLineIndex = range.end.line,
			resultLines: string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.start.character));
		for (let i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.end.character));

		return resultLines.join(lineEnding);
	}

	lineAt(lineOrPosition: number | vscode.Position): vscode.TextLine {

		let line: number;
		if (lineOrPosition instanceof Position) {
			line = lineOrPosition.line;
		} else if (typeof lineOrPosition === 'number') {
			line = lineOrPosition;
		}

		if (line < 0 || line >= this._lines.length) {
			throw new Error('Illegal value for `line`');
		}

		let result = this._textLines[line];
		if (!result || result.lineNumber !== line || result.text !== this._lines[line]) {

			const text = this._lines[line];
			const firstNonWhitespaceCharacterIndex = /^(\s*)/.exec(text)[1].length;
			const range = new Range(line, 0, line, text.length);
			const rangeIncludingLineBreak = line < this._lines.length - 1
				? new Range(line, 0, line + 1, 0)
				: range;

			result = Object.freeze({
				lineNumber: line,
				range,
				rangeIncludingLineBreak,
				text,
				firstNonWhitespaceCharacterIndex, //TODO@api, rename to 'leadingWhitespaceLength'
				isEmptyOrWhitespace: firstNonWhitespaceCharacterIndex === text.length
			});

			this._textLines[line] = result;
		}

		return result;
	}

	offsetAt(position: vscode.Position): number {
		position = this.validatePosition(position);
		this._ensureLineStarts();
		return this._lineStarts.getAccumulatedValue(position.line - 1) + position.character;
	}

	positionAt(offset: number): vscode.Position {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		this._ensureLineStarts();
		let out = this._lineStarts.getIndexOf(offset);

		let lineLength = this._lines[out.index].length;

		// Ensure we return a valid position
		return new Position(out.index, Math.min(out.remainder, lineLength));
	}

	// ---- range math

	validateRange(range: vscode.Range): vscode.Range {
		if (!(range instanceof Range)) {
			throw new Error('Invalid argument');
		}

		let start = this.validatePosition(range.start);
		let end = this.validatePosition(range.end);

		if (start === range.start && end === range.end) {
			return range;
		}
		return new Range(start.line, start.character, end.line, end.character);
	}

	validatePosition(position: vscode.Position): vscode.Position {
		if (!(position instanceof Position)) {
			throw new Error('Invalid argument');
		}

		let {line, character} = position;
		let hasChanged = false;

		if (line < 0) {
			line = 0;
			character = 0;
			hasChanged = true;
		}
		else if (line >= this._lines.length) {
			line = this._lines.length - 1;
			character = this._lines[line].length;
			hasChanged = true;
		}
		else {
			let maxCharacter = this._lines[line].length;
			if (character < 0) {
				character = 0;
				hasChanged = true;
			}
			else if (character > maxCharacter) {
				character = maxCharacter;
				hasChanged = true;
			}
		}

		if (!hasChanged) {
			return position;
		}
		return new Position(line, character);
	}

	getWordRangeAtPosition(_position: vscode.Position): vscode.Range {
		let position = this.validatePosition(_position);

		let wordAtText = getWordAtText(
			position.character + 1,
			ensureValidWordDefinition(getWordDefinitionFor(this._languageId)),
			this._lines[position.line],
			0
		);

		if (wordAtText) {
			return new Range(position.line, wordAtText.startColumn - 1, position.line, wordAtText.endColumn - 1);
		}
	}
}
