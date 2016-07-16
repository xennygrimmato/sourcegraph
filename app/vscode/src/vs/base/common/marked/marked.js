/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as marked_ from 'vs/base/common/marked/raw.marked';

// HACK(sourcegraph): This is a workaround to make marked importable
// as `import {marked} from ...` by existing code (so we don't need
// to change those import statements in all imports).
export const marked = marked_;


/*
require.config({
	shim: {
		'vs/base/common/marked/raw.marked': {
			exports: function () {
				return this.marked;
			}
		}
	}
});

define(['./raw.marked'], function (marked) {
	return {
		marked: marked
	};
});
*/
