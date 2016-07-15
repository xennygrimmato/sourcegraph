/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import Event, {Emitter} from 'vs/base/common/event';
import {Registry} from 'vs/platform/platform';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';

export interface ILegacyLanguageDefinition {
	id: string;
	extensions: string[];
	filenames?: string[];
	firstLine?: string;
	aliases: string[];
	mimetypes: string[];
	moduleId: string;
	ctorName: string;
	deps?: string[];
}

// Define extension point ids
export var Extensions = {
	ModesRegistry: 'editor.modesRegistry'
};

export class EditorModesRegistry {

	private _compatModes: ILegacyLanguageDefinition[];
	private _languages: ILanguageExtensionPoint[];

	private _onDidAddCompatModes: Emitter<ILegacyLanguageDefinition[]> = new Emitter<ILegacyLanguageDefinition[]>();
	public onDidAddCompatModes: Event<ILegacyLanguageDefinition[]> = this._onDidAddCompatModes.event;

	private _onDidAddLanguages: Emitter<ILanguageExtensionPoint[]> = new Emitter<ILanguageExtensionPoint[]>();
	public onDidAddLanguages: Event<ILanguageExtensionPoint[]> = this._onDidAddLanguages.event;

	constructor() {
		this._compatModes = [];
		this._languages = [];
	}

	// --- compat modes


	public registerCompatModes(def:ILegacyLanguageDefinition[]): void {
		this._compatModes = this._compatModes.concat(def);
		this._onDidAddCompatModes.fire(def);
	}
	public registerCompatMode(def:ILegacyLanguageDefinition): void {
		this._compatModes.push(def);
		this._onDidAddCompatModes.fire([def]);
	}
	public getCompatModes(): ILegacyLanguageDefinition[] {
		return this._compatModes.slice(0);
	}

	// --- languages

	public registerLanguage(def:ILanguageExtensionPoint): void {
		this._languages.push(def);
		this._onDidAddLanguages.fire([def]);
	}
	public registerLanguages(def:ILanguageExtensionPoint[]): void {
		this._languages = this._languages.concat(def);
		this._onDidAddLanguages.fire(def);
	}
	public getLanguages(): ILanguageExtensionPoint[] {
		return this._languages.slice(0);
	}
}

export var ModesRegistry = new EditorModesRegistry();
Registry.add(Extensions.ModesRegistry, ModesRegistry);

ModesRegistry.registerLanguage({
	id: 'plaintext',
	extensions: ['.txt', '.gitignore'],
	aliases: [nls.localize('plainText.alias', "Plain Text"), 'text'],
	mimetypes: ['text/plain']
});
