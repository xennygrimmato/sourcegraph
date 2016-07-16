/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ipcMain as ipc, BrowserWindow} from 'electron';
import platform = require('vs/base/common/platform');
import { TPromise } from 'vs/base/common/winjs.base';
import { IAskpassService } from 'vs/workbench/parts/git/common/git';

export interface ICredentials {
	username: string;
	password: string;
}

interface ICredentialsResult {
	id: number;
	credentials: ICredentials;
}

interface IContext {
	credentials: ICredentials;
	window: Electron.BrowserWindow;
}

export class GitAskpassService implements IAskpassService {

	private askpassCache: { [id: string]: IContext } = Object.create(null);

	constructor() {
		ipc.on('git:askpass', (event, result: ICredentialsResult) => {
			this.askpassCache[result.id].credentials = result.credentials;
		});
	}

	public askpass(id: string, host: string, command: string): TPromise<ICredentials> {
		return new TPromise<ICredentials>((c, e) => {
			let cachedResult = this.askpassCache[id];

			if (typeof cachedResult !== 'undefined') {
				return c(cachedResult.credentials);
			}

			if (command === 'fetch') {
				return c({ username: '', password: '' });
			}

			let win = new BrowserWindow({
				alwaysOnTop: true,
				skipTaskbar: true,
				resizable: false,
				width: 450,
				height: platform.isWindows ? 280 : 260,
				show: true,
				title: nls.localize('git', "Git")
			});

			win.setMenuBarVisibility(false);

			this.askpassCache[id] = {
				window: win,
				credentials: null
			};

			win.loadURL(require.toUrl('vs/workbench/parts/git/electron-main/index.html'));
			win.webContents.executeJavaScript('init(' + JSON.stringify({ id, host, command }) + ')');

			win.once('closed', () => {
				c(this.askpassCache[id].credentials);
				setTimeout(() => delete this.askpassCache[id], 1000 * 10);
			});
		});
	}
}