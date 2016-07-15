/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import arrays = require('vs/base/common/arrays');

suite('Arrays', () => {
	test('findFirst', function () {
		var array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];

		var idx = arrays.findFirst(array, e => e >= 0);
		assert.equal(array[idx], 1);

		idx = arrays.findFirst(array, e => e > 1);
		assert.equal(array[idx], 4);

		idx = arrays.findFirst(array, e => e >= 8);
		assert.equal(array[idx], 55);

		idx = arrays.findFirst(array, e => e >= 61);
		assert.equal(array[idx], 61);

		idx = arrays.findFirst(array, e => e >= 69);
		assert.equal(array[idx], 69);

		idx = arrays.findFirst(array, e => e >= 70);
		assert.equal(idx, array.length);

		idx = arrays.findFirst([], e => e >= 0);
		assert.equal(array[idx], 1);
	});

	test('binarySearch', function() {
		function compare(a: number, b: number): number {
			return a - b;
		}
		var array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];

		assert.equal(arrays.binarySearch(array, 1, compare), 0);
		assert.equal(arrays.binarySearch(array, 5, compare), 2);

		// insertion point
		assert.equal(arrays.binarySearch(array, 0, compare), ~0);
		assert.equal(arrays.binarySearch(array, 6, compare), ~3);
		assert.equal(arrays.binarySearch(array, 70, compare), ~10);

	});

	test('distinct', function() {
		function compare(a: string): string {
			return a;
		}

		assert.deepEqual(arrays.distinct(['32', '4', '5'], compare), ['32', '4', '5']);
		assert.deepEqual(arrays.distinct(['32', '4', '5', '4'], compare), ['32', '4', '5']);
		assert.deepEqual(arrays.distinct(['32', 'constructor', '5', '1'], compare), ['32', 'constructor', '5', '1']);
		assert.deepEqual(arrays.distinct(['32', 'constructor', 'proto', 'proto', 'constructor'], compare), ['32', 'constructor', 'proto']);
		assert.deepEqual(arrays.distinct(['32', '4', '5', '32', '4', '5', '32', '4', '5', '5'], compare), ['32', '4', '5']);
	});
});

