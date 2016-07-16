/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork } from 'child_process';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Promise} from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import { clone, assign } from 'vs/base/common/objects';
import { Server as IPCServer, Client as IPCClient, IClient, IChannel } from 'vs/base/parts/ipc/common/ipc';

export class Server extends IPCServer {
	constructor() {
		super({
			send: r => { try { process.send(r); } catch (e) { /* not much to do */ } },
			onMessage: cb => process.on('message', cb)
		});

		process.once('disconnect', () => this.dispose());
	}
}

export interface IIPCOptions {

	/**
	 * A descriptive name for the server this connection is to. Used in logging.
	 */
	serverName: string;

	/**
	 * Time in millies before killing the ipc process. The next request after killing will start it again.
	 */
	timeout?:number;

	/**
	 * Arguments to the module to execute.
	 */
	args?:string[];

	/**
	 * Environment key-value pairs to be passed to the process that gets spawned for the ipc.
	 */
	env?:any;

	/**
	 * Allows to assign a debug port for debugging the application executed.
	 */
	debug?:number;

	/**
	 * Allows to assign a debug port for debugging the application and breaking it on the first line.
	 */
	debugBrk?:number;
}

export class Client implements IClient, IDisposable {

	private disposeDelayer: Delayer<void>;
	private activeRequests: Promise[];
	private child: ChildProcess;
	private _client: IPCClient;
	private channels: { [name: string]: IChannel };

	constructor(private modulePath: string, private options: IIPCOptions) {
		const timeout = options && options.timeout ? options.timeout : 60000;
		this.disposeDelayer = new Delayer<void>(timeout);
		this.activeRequests = [];
		this.child = null;
		this._client = null;
		this.channels = Object.create(null);
	}

	getChannel<T extends IChannel>(channelName: string): T {
		const call = (command, arg) => this.request(channelName, command, arg);
		return { call } as T;
	}

	protected request(channelName: string, name: string, arg: any): Promise {
		this.disposeDelayer.cancel();

		const channel = this.channels[channelName] || (this.channels[channelName] = this.client.getChannel(channelName));
		const request: Promise = channel.call(name, arg);

		// Progress doesn't propagate across 'then', we need to create a promise wrapper
		const result = new Promise((c, e, p) => {
			request.then(c, e, p).done(() => {
				if (!this.activeRequests) {
					return;
				}

				this.activeRequests.splice(this.activeRequests.indexOf(result), 1);

				if (this.activeRequests.length === 0) {
					this.disposeDelayer.trigger(() => this.disposeClient());
				}
			});
		}, () => request.cancel());

		this.activeRequests.push(result);
		return result;
	}

	private get client(): IPCClient {
		if (!this._client) {
			const args = this.options && this.options.args ? this.options.args : [];
			const forkOpts = Object.create(null);

			forkOpts.env = assign(clone(process.env), { 'VSCODE_PARENT_PID': String(process.pid) });

			if (this.options && this.options.env) {
				forkOpts.env = assign(forkOpts.env, this.options.env);
			}

			if (this.options && typeof this.options.debug === 'number') {
				forkOpts.execArgv = ['--nolazy', '--debug=' + this.options.debug];
			}

			if (this.options && typeof this.options.debugBrk === 'number') {
				forkOpts.execArgv = ['--nolazy', '--debug-brk=' + this.options.debugBrk];
			}

			this.child = fork(this.modulePath, args, forkOpts);
			this._client = new IPCClient({
				send: r => this.child && this.child.connected && this.child.send(r),
				onMessage: cb => {
					this.child.on('message', (msg) => {

						// Handle console logs specially
						if (msg && msg.type === '__$console') {
							let args = ['%c[IPC Library: ' + this.options.serverName + ']', 'color: darkgreen'];
							try {
								const parsed = JSON.parse(msg.arguments);
								args = args.concat(Object.getOwnPropertyNames(parsed).map(o => parsed[o]));
							} catch (error) {
								args.push(msg.arguments);
							}

							console[msg.severity].apply(console, args);
						}

						// Anything else goes to the outside
						else {
							cb(msg);
						}
					});
				}
			});

			const onExit = () => this.disposeClient();
			process.once('exit', onExit);

			this.child.on('error', err => console.warn('IPC "' + this.options.serverName + '" errored with ' + err));

			this.child.on('exit', (code: any, signal: any) => {
				process.removeListener('exit', onExit);

				if (this.activeRequests) {
					this.activeRequests.forEach(req => req.cancel());
					this.activeRequests = [];
				}

				if (code && signal !== 'SIGTERM') {
					console.warn('IPC "' + this.options.serverName + '" crashed with exit code ' + code);
					this.disposeDelayer.cancel();
					this.disposeClient();
				}
			});
		}

		return this._client;
	}

	private disposeClient() {
		if (this._client) {
			this.child.kill();
			this.child = null;
			this._client = null;
			this.channels = Object.create(null);
		}
	}

	dispose() {
		this.disposeDelayer.cancel();
		this.disposeDelayer = null;
		this.disposeClient();
		this.activeRequests = null;
	}
}