/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as flags from 'vs/base/common/flags';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {logOnceWebWorkerWarning, IWorker, IWorkerCallback, IWorkerFactory} from 'vs/base/common/worker/workerClient';
import * as dom from 'vs/base/browser/dom';

function defaultGetWorkerUrl(workerId:string, label:string): string {
	return global.HACK_vsGetWorkerUrl(workerId, label);
	// TODO(sqs): Including this dynamic require makes webpack complain that it can't
	// determine the required module statically. However, we probably can completely bypass
	// this function (and prevent it from ever getting called) by defining
	// MonacoEnviroment.getWorkerUrl in our own code (which is a TODO). To do that in the current
	// vs system, we'd need to be able to assign to global.MonacoEnvironment BEFORE flags.ts is run,
	// which isn't currently possible. So, we need to add a way to specify the URL function after load,
	// and then we need to suppress webpack's erroneous complaint (and stop it from trying to parse
	// this require call). Then we can uncomment this and remove the throw above.
	//
	// return require.toUrl('./' + workerId);
}
var getWorkerUrl = flags.getCrossOriginWorkerScriptUrl || defaultGetWorkerUrl;


/**
 * A worker that uses HTML5 web workers so that is has
 * its own global scope and its own thread.
 */
class WebWorker implements IWorker {

	private id:number;
	private worker:Worker;

	constructor(moduleId:string, id:number, label:string, onMessageCallback:IWorkerCallback, onErrorCallback:(err:any)=>void) {
		this.id = id;
		// TODO(sqs): Originally, getWorkerUrl returned a string. But we want to use
		// the webpack worker-loader, which lets us avoid using vs's loader.js and instead
		// use our existing bundle. But worker-loader returns a Worker, not a url, so we
		// need to accept a worker directly and bypass the new Worker call in that case.
		let w:any = getWorkerUrl('workerMain.js', label);
		if (typeof w === "string") this.worker = new Worker(w);
		else this.worker = new w;
		this.postMessage(moduleId);
		this.worker.onmessage = function (ev:any) {
			onMessageCallback(ev.data);
		};
		if (typeof this.worker.addEventListener === 'function') {
			this.worker.addEventListener('error', onErrorCallback);
		}
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(msg:string): void {
		this.worker.postMessage(msg);
	}

	public dispose(): void {
		this.worker.terminate();
		this.worker = null;
	}
}

/**
 * A worker that runs in an iframe and therefore does have its
 * own global scope, but no own thread.
 */
class FrameWorker implements IWorker {

	private id: number;
	private iframe: HTMLIFrameElement;

	private onMessage: EventListener;
	private loaded: boolean;
	private beforeLoadMessages: any[];

	private _listeners: IDisposable[];

	constructor(moduleId:string, id: number, onMessageCallback:IWorkerCallback) {
		this.id = id;
		this._listeners = [];

		// Collect all messages sent to the worker until the iframe is loaded
		this.loaded = false;
		this.beforeLoadMessages = [];

		this.postMessage(moduleId);

		this.iframe = <HTMLIFrameElement> document.createElement('iframe');
		this.iframe.id = this.iframeId();
		console.trace("TODO removed dynamic require");
		// this.iframe.src = require.toUrl('./workerMainCompatibility.html');
		(<any> this.iframe).frameborder = this.iframe.height = this.iframe.width = '0';
		this.iframe.style.display = 'none';
		this._listeners.push(dom.addDisposableListener(this.iframe, 'load', () => this.onLoaded()));

		this.onMessage = function(ev:any) {
			onMessageCallback(ev.data);
		};
		this._listeners.push(dom.addDisposableListener(window, 'message', this.onMessage));
		document.body.appendChild(this.iframe);
	}

	public dispose(): void {
		this._listeners = dispose(this._listeners);
		window.removeEventListener('message', this.onMessage);
		window.frames[this.iframeId()].close();
	}

	private iframeId(): string {
		return 'worker_iframe_' + this.id;
	}

	private onLoaded(): void {
		this.loaded = true;
		while (this.beforeLoadMessages.length > 0) {
			this.postMessage(this.beforeLoadMessages.shift());
		}
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(msg:string): void {
		if (this.loaded === true) {
			var iframe = window.frames[this.iframeId()];
			if (iframe.postMessage) {
				iframe.postMessage(msg, '*');
			} else {
				iframe.contentWindow.postMessage(msg, '*');
			}
		} else {
			this.beforeLoadMessages.push(msg);
		}
	}
}

export class DefaultWorkerFactory implements IWorkerFactory {

	private static LAST_WORKER_ID = 0;

	private _fallbackToIframe:boolean;
	private _webWorkerFailedBeforeError:any;

	constructor(fallbackToIframe:boolean) {
		this._fallbackToIframe = fallbackToIframe;
		this._webWorkerFailedBeforeError = false;
	}

	public create(moduleId:string, onMessageCallback:IWorkerCallback, onErrorCallback:(err:any)=>void):IWorker {
		let workerId = (++DefaultWorkerFactory.LAST_WORKER_ID);
		if (this._fallbackToIframe) {
			if (this._webWorkerFailedBeforeError) {
				// Avoid always trying to create web workers if they would just fail...
				return new FrameWorker(moduleId, workerId, onMessageCallback);
			}

			try {
				return new WebWorker(moduleId, workerId, 'service' + workerId, onMessageCallback, (err) => {
					logOnceWebWorkerWarning(err);
					this._webWorkerFailedBeforeError = err;
					onErrorCallback(err);
				});
			} catch(err) {
				logOnceWebWorkerWarning(err);
				return new FrameWorker(moduleId, workerId, onMessageCallback);
			}
		}

		if (this._webWorkerFailedBeforeError) {
			throw this._webWorkerFailedBeforeError;
		}
		return new WebWorker(moduleId, workerId, 'service' + workerId, onMessageCallback, (err) => {
			logOnceWebWorkerWarning(err);
			this._webWorkerFailedBeforeError = err;
			onErrorCallback(err);
		});
	}
}
