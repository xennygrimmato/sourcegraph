/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {clone} from 'vs/base/common/objects';
import {illegalState} from 'vs/base/common/errors';
import Event, {Emitter} from 'vs/base/common/event';
import {WorkspaceConfiguration} from 'vscode';
import {ExtHostConfigurationShape} from './extHost.protocol';

export class ExtHostConfiguration extends ExtHostConfigurationShape {

	private _config: any;
	private _hasConfig: boolean;
	private _onDidChangeConfiguration: Emitter<void>;

	constructor() {
		super();
		this._onDidChangeConfiguration = new Emitter<void>();
	}

	get onDidChangeConfiguration(): Event<void> {
		return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
	}

	public $acceptConfigurationChanged(config: any) {
		this._config = config;
		this._hasConfig = true;
		this._onDidChangeConfiguration.fire(undefined);
	}

	public getConfiguration(section?: string): WorkspaceConfiguration {
		if (!this._hasConfig) {
			throw illegalState('missing config');
		}

		const config = section
			? ExtHostConfiguration._lookUp(section, this._config)
			: this._config;

		let result: any;
		if (typeof config !== 'object') {
			// this catches missing config and accessing values
			result = {};
		} else {
			result = clone(config);
		}

		result.has = function(key: string): boolean {
			return typeof ExtHostConfiguration._lookUp(key, config) !== 'undefined';
		};
		result.get = function <T>(key: string, defaultValue?: T): T {
			let result = ExtHostConfiguration._lookUp(key, config);
			if (typeof result === 'undefined') {
				result = defaultValue;
			}
			return result;
		};
		return result;
	}

	private static _lookUp(section: string, config: any) {
		if (!section) {
			return;
		}
		let parts = section.split('.');
		let node = config;
		while (node && parts.length) {
			node = node[parts.shift()];
		}

		return node;
	}
}
