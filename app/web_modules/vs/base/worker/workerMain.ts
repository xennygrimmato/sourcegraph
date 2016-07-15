/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {
	'use strict';

	let MonacoEnvironment = (<any>self).MonacoEnvironment;
	let monacoBaseUrl = MonacoEnvironment && MonacoEnvironment.baseUrl ? MonacoEnvironment.baseUrl : '../../../';

	let loadCode = function(moduleId) {
		// TODO(sqs): webpack doesn't support dynamic requires.
		if (moduleId !== "vs/base/common/worker/simpleWorker") {
			throw new Error("can't dynamically load module " + moduleId);
		}
		System.import("vs/base/common/worker/simpleWorker").then((ws) => {
			let messageHandler = ws.create((msg:any) => {
				(<any>self).postMessage(msg);
			}, null);

			self.onmessage = (e) => messageHandler.onmessage(e.data);
			while(beforeReadyMessages.length > 0) {
				self.onmessage(beforeReadyMessages.shift());
			}
		});
	};

	let isFirstMessage = true;
	let beforeReadyMessages:MessageEvent[] = [];
	self.onmessage = (message) => {
		if (!isFirstMessage) {
			beforeReadyMessages.push(message);
			return;
		}

		isFirstMessage = false;
		loadCode(message.data);
	};
})();
