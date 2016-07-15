/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {IMarkerData} from 'vs/platform/markers/common/markers';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import * as vscode from 'vscode';
import {MainContext, MainThreadDiagnosticsShape, ExtHostDiagnosticsShape} from './extHost.protocol';

export class DiagnosticCollection implements vscode.DiagnosticCollection {

	private static _maxDiagnosticsPerFile: number = 250;

	private _name: string;
	private _proxy: MainThreadDiagnosticsShape;

	private _isDisposed = false;
	private _data: {[uri:string]: vscode.Diagnostic[]} = Object.create(null);

	constructor(name: string, proxy: MainThreadDiagnosticsShape) {
		this._name = name;
		this._proxy = proxy;
	}

	dispose(): void {
		if (!this._isDisposed) {
			this._proxy.$clear(this.name);
			this._proxy = undefined;
			this._data = undefined;
			this._isDisposed = true;
		}
	}

	get name(): string {
		this._checkDisposed();
		return this._name;
	}

	set(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): void;
	set(entries: [vscode.Uri, vscode.Diagnostic[]][]): void;
	set(first: vscode.Uri | [vscode.Uri, vscode.Diagnostic[]][], diagnostics?: vscode.Diagnostic[]) {

		if (!first) {
			// this set-call is a clear-call
			this.clear();
			return;
		}

		// the actual implementation for #set

		this._checkDisposed();
		let toSync: vscode.Uri[];

		if (first instanceof URI) {

			if (!diagnostics) {
				// remove this entry
				this.delete(first);
				return;
			}

			// update single row
			this._data[first.toString()] = diagnostics;
			toSync = [first];

		} else if (Array.isArray(first)) {
			// update many rows
			toSync = [];
			for (let entry of first) {
				let [uri, diagnostics] = entry;
				toSync.push(uri);
				if (!diagnostics) {
					// [Uri, undefined] means clear this
					delete this._data[uri.toString()];
				} else {
					// set or merge diagnostics
					let existing = this._data[uri.toString()];
					if (existing) {
						existing.push(...diagnostics);
					} else {
						this._data[uri.toString()] = diagnostics;
					}
				}
			}
		}

		// compute change and send to main side
		const entries: [URI, IMarkerData[]][] = [];
		for (let uri of toSync) {
			let marker: IMarkerData[];
			let diagnostics = this._data[uri.toString()];
			if (diagnostics) {

				// no more than 250 diagnostics per file
				if (diagnostics.length > DiagnosticCollection._maxDiagnosticsPerFile) {
					console.warn('diagnostics for %s will be capped to %d (actually is %d)', uri.toString(), DiagnosticCollection._maxDiagnosticsPerFile, diagnostics.length);
					diagnostics = diagnostics.slice(0, DiagnosticCollection._maxDiagnosticsPerFile);
				}
				marker = diagnostics.map(DiagnosticCollection._toMarkerData);
			}

			entries.push([<URI> uri, marker]);
		}

		this._proxy.$changeMany(this.name, entries);
	}

	delete(uri: vscode.Uri): void {
		this._checkDisposed();
		delete this._data[uri.toString()];
		this._proxy.$changeMany(this.name, [[<URI> uri, undefined]]);
	}

	clear(): void {
		this._checkDisposed();
		this._data = Object.create(null);
		this._proxy.$clear(this.name);
	}

	forEach(callback: (uri: URI, diagnostics: vscode.Diagnostic[], collection: DiagnosticCollection) => any, thisArg?: any): void {
		this._checkDisposed();
		for (let key in this._data) {
			let uri = URI.parse(key);
			callback.apply(thisArg, [uri, this.get(uri), this]);
		}
	}

	get(uri: URI): vscode.Diagnostic[] {
		this._checkDisposed();
		let result = this._data[uri.toString()];
		if (Array.isArray(result)) {
			return Object.freeze(result.slice(0));
		}
	}

	has(uri: URI): boolean {
		this._checkDisposed();
		return Array.isArray(this._data[uri.toString()]);
	}

	private _checkDisposed() {
		if (this._isDisposed) {
			throw new Error('illegal state - object is disposed');
		}
	}

	private static _toMarkerData(diagnostic: vscode.Diagnostic): IMarkerData {

		let range = diagnostic.range;

		return <IMarkerData>{
			startLineNumber: range.start.line + 1,
			startColumn: range.start.character + 1,
			endLineNumber: range.end.line + 1,
			endColumn: range.end.character + 1,
			message: diagnostic.message,
			source: diagnostic.source,
			severity: DiagnosticCollection._convertDiagnosticsSeverity(diagnostic.severity),
			code: String(diagnostic.code)
		};
	}

	private static _convertDiagnosticsSeverity(severity: number): Severity {
		switch (severity) {
			case 0: return Severity.Error;
			case 1: return Severity.Warning;
			case 2: return Severity.Info;
			case 3: return Severity.Ignore;
			default: return Severity.Error;
		}
	}
}

export class ExtHostDiagnostics extends ExtHostDiagnosticsShape {

	private static _idPool: number = 0;

	private _proxy: MainThreadDiagnosticsShape;
	private _collections: DiagnosticCollection[];

	constructor(threadService: IThreadService) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadDiagnostics);
		this._collections = [];
	}

	createDiagnosticCollection(name: string): vscode.DiagnosticCollection {
		if (!name) {
			name = '_generated_diagnostic_collection_name_#' + ExtHostDiagnostics._idPool++;
		}

		const {_collections, _proxy} = this;
		const result = new class extends DiagnosticCollection {
			constructor() {
				super(name, _proxy);
				_collections.push(this);
			}
			dispose() {
				super.dispose();
				let idx = _collections.indexOf(this);
				if (idx !== -1) {
					_collections.splice(idx, 1);
				}
			}
		};

		return result;
	}

	forEach(callback: (collection: DiagnosticCollection) => any): void {
		this._collections.forEach(callback);
	}
}

