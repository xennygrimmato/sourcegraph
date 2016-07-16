/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {workspace, TextDocument, window, Position, Uri, EventEmitter, WorkspaceEdit} from 'vscode';
import {createRandomFile, deleteFile, cleanUp, pathEquals} from './utils';
import {join, basename} from 'path';
import * as fs from 'fs';

suite('workspace-namespace', () => {

	teardown(cleanUp);

	test('configuration, defaults', () => {
		const config = workspace.getConfiguration('farboo');

		assert.ok(config.has('config0'));
		assert.equal(config.get('config0'), true);
		assert.equal(config.get('config4'), '');

		assert.ok(config.has('nested.config1'));
		assert.equal(config.get('nested.config1'), 42);
		assert.ok(config.has('nested.config2'));
		assert.equal(config.get('nested.config2'), 'Das Pferd frisst kein Reis.');
	});

	test('configuration, getConfig/value', () => {
		const value = workspace.getConfiguration('farboo.config0');
		assert.equal(Object.keys(value).length, 2);
	});

	test('textDocuments', () => {
		assert.ok(Array.isArray(workspace.textDocuments));
		assert.throws(() => workspace.textDocuments = null);
	});

	test('rootPath', () => {
		assert.ok(pathEquals(workspace.rootPath, join(__dirname, '../testWorkspace')));
		assert.throws(() => workspace.rootPath = 'farboo');
	});

	test('openTextDocument', () => {
		let len = workspace.textDocuments.length;
		return workspace.openTextDocument(join(workspace.rootPath, './far.js')).then(doc => {
			assert.ok(doc);
			assert.equal(workspace.textDocuments.length, len + 1);
		});
	});

	test('openTextDocument, illegal path', done => {
		workspace.openTextDocument('funkydonky.txt').then(doc => {
			done(new Error('missing error'));
		}, err => {
			done();
		});
	});

	test('openTextDocument, untitled is dirty', function (done) {
		if (process.platform === 'win32') {
			return done(); // TODO@Joh this test fails on windows
		}

		workspace.openTextDocument(Uri.parse('untitled:' + join(workspace.rootPath, './newfile.txt'))).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);
			done();
		});
	});

	test('openTextDocument, untitled closes on save', function (done) {
		const path = join(workspace.rootPath, './newfile.txt');

		return workspace.openTextDocument(Uri.parse('untitled:' + path)).then(doc => {
			assert.equal(doc.uri.scheme, 'untitled');
			assert.ok(doc.isDirty);

			let closed: TextDocument;
			let d0 = workspace.onDidCloseTextDocument(e => closed = e);

			return window.showTextDocument(doc).then(() => {
				return doc.save().then(() => {
					assert.ok(closed === doc);
					assert.ok(!doc.isDirty);
					assert.ok(fs.existsSync(path));

					d0.dispose();

					return deleteFile(Uri.file(join(workspace.rootPath, './newfile.txt'))).then(() => done(null));
				});
			});

		});
	});

	test('openTextDocument, uri scheme/auth/path', function () {

		let registration = workspace.registerTextDocumentContentProvider('sc', {
			provideTextDocumentContent() {
				return 'SC';
			}
		});

		return Promise.all([
			workspace.openTextDocument(Uri.parse('sc://auth')).then(doc => {
				assert.equal(doc.uri.authority, 'auth');
				assert.equal(doc.uri.path, '');
			}),
			workspace.openTextDocument(Uri.parse('sc:///path')).then(doc => {
				assert.equal(doc.uri.authority, '');
				assert.equal(doc.uri.path, '/path');
			}),
			workspace.openTextDocument(Uri.parse('sc://auth/path')).then(doc => {
				assert.equal(doc.uri.authority, 'auth');
				assert.equal(doc.uri.path, '/path');
			})
		]).then(() => {
			registration.dispose();
		});
	});

	test('events: onDidOpenTextDocument, onDidChangeTextDocument, onDidSaveTextDocument', () => {
		return createRandomFile().then(file => {
			let disposables = [];

			let onDidOpenTextDocument = false;
			disposables.push(workspace.onDidOpenTextDocument(e => {
				assert.ok(pathEquals(e.uri.fsPath, file.fsPath));
				onDidOpenTextDocument = true;
			}));

			let onDidChangeTextDocument = false;
			disposables.push(workspace.onDidChangeTextDocument(e => {
				assert.ok(pathEquals(e.document.uri.fsPath, file.fsPath));
				onDidChangeTextDocument = true;
			}));

			let onDidSaveTextDocument = false;
			disposables.push(workspace.onDidSaveTextDocument(e => {
				assert.ok(pathEquals(e.uri.fsPath, file.fsPath));
				onDidSaveTextDocument = true;
			}));

			return workspace.openTextDocument(file).then(doc => {
				return window.showTextDocument(doc).then((editor) => {
					return editor.edit((builder) => {
						builder.insert(new Position(0, 0), 'Hello World');
					}).then(applied => {
						return doc.save().then(saved => {
							assert.ok(onDidOpenTextDocument);
							assert.ok(onDidChangeTextDocument);
							assert.ok(onDidSaveTextDocument);

							while (disposables.length) {
								disposables.pop().dispose();
							}

							return deleteFile(file);
						});
					});
				});
			});
		});
	});

	test('registerTextDocumentContentProvider, simple', function () {

		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return uri.toString();
			}
		});

		const uri = Uri.parse('foo://testing/virtual.js');
		return workspace.openTextDocument(uri).then(doc => {
			assert.equal(doc.getText(), uri.toString());
			assert.equal(doc.isDirty, false);
			assert.equal(doc.uri.toString(), uri.toString());
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, constrains', function () {

		// built-in
		assert.throws(function () {
			workspace.registerTextDocumentContentProvider('untitled', { provideTextDocumentContent() { return null; } });
		});
		// built-in
		assert.throws(function () {
			workspace.registerTextDocumentContentProvider('file', { provideTextDocumentContent() { return null; } });
		});

		// missing scheme
		return workspace.openTextDocument(Uri.parse('notThere://foo/far/boo/bar')).then(() => {
			assert.ok(false, 'expected failure');
		}, err => {
			// expected
		});
	});

	test('registerTextDocumentContentProvider, multiple', function () {

		// duplicate registration
		let registration1 = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				if (uri.authority === 'foo') {
					return '1';
				}
			}
		});
		let registration2 = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				if (uri.authority === 'bar') {
					return '2';
				}
			}
		});

		return Promise.all([
			workspace.openTextDocument(Uri.parse('foo://foo/bla')).then(doc => { assert.equal(doc.getText(), '1'); }),
			workspace.openTextDocument(Uri.parse('foo://bar/bla')).then(doc => { assert.equal(doc.getText(), '2'); })
		]).then(() => {
			registration1.dispose();
			registration2.dispose();
		});
	});

	test('registerTextDocumentContentProvider, evil provider', function () {

		// duplicate registration
		let registration1 = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return '1';
			}
		});
		let registration2 = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri): string {
				throw new Error('fail');
			}
		});

		return workspace.openTextDocument(Uri.parse('foo://foo/bla')).then(doc => {
			assert.equal(doc.getText(), '1');
			registration1.dispose();
			registration2.dispose();
		});
	});

	test('registerTextDocumentContentProvider, invalid text', function () {

		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return <any>123;
			}
		});
		return workspace.openTextDocument(Uri.parse('foo://auth/path')).then(() => {
			assert.ok(false, 'expected failure');
		}, err => {
			// expected
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, show virtual document', function () {

		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return 'I am virtual';
			}
		});

		return workspace.openTextDocument(Uri.parse('foo://something/path')).then(doc => {
			return window.showTextDocument(doc).then(editor => {

				assert.ok(editor.document === doc);
				assert.equal(editor.document.getText(), 'I am virtual');
				registration.dispose();
			});
		});
	});

	test('registerTextDocumentContentProvider, open/open document', function () {

		let callCount = 0;
		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				callCount += 1;
				return 'I am virtual';
			}
		});

		const uri = Uri.parse('foo://testing/path');

		return Promise.all([workspace.openTextDocument(uri), workspace.openTextDocument(uri)]).then(docs => {
			let [first, second] = docs;
			assert.ok(first === second);
			assert.ok(workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString()));
			assert.equal(callCount, 1);
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, empty doc', function () {

		let registration = workspace.registerTextDocumentContentProvider('foo', {
			provideTextDocumentContent(uri) {
				return '';
			}
		});

		const uri = Uri.parse('foo:doc/empty');

		return workspace.openTextDocument(uri).then(doc => {
			assert.equal(doc.getText(), '');
			assert.equal(doc.uri.toString(), uri.toString());
			registration.dispose();
		});
	});

	test('registerTextDocumentContentProvider, change event', function () {

		let callCount = 0;
		let emitter = new EventEmitter<Uri>();

		let registration = workspace.registerTextDocumentContentProvider('foo', {
			onDidChange: emitter.event,
			provideTextDocumentContent(uri) {
				return 'call' + (callCount++);
			}
		});

		const uri = Uri.parse('foo://testing/path3');

		return workspace.openTextDocument(uri).then(doc => {

			assert.equal(callCount, 1);
			assert.equal(doc.getText(), 'call0');

			return new Promise((resolve, reject) => {

				let subscription = workspace.onDidChangeTextDocument(event => {
					subscription.dispose();
					assert.ok(event.document === doc);
					assert.equal(event.document.getText(), 'call1');
					resolve();
				});

				emitter.fire(doc.uri);

				registration.dispose();
			});
		});
	});

	test('findFiles', () => {
		return workspace.findFiles('*.js', null).then((res) => {
			assert.equal(res.length, 1);
			assert.equal(basename(workspace.asRelativePath(res[0])), 'far.js');
		});
	});

	// TODO@Joh this test fails randomly
	// test('findFiles, cancellation', () => {

	// 	const source = new CancellationTokenSource();
	// 	const token = source.token; // just to get an instance first
	// 	source.cancel();

	// 	return workspace.findFiles('*.js', null, 100, token).then((res) => {
	// 		assert.equal(res, void 0);
	// 	});
	// });

	test('applyEdit', () => {

		return workspace.openTextDocument(Uri.parse('untitled:' + join(workspace.rootPath, './new2.txt'))).then(doc => {
			let edit = new WorkspaceEdit();
			edit.insert(doc.uri, new Position(0, 0), new Array(1000).join('Hello World'));
			return workspace.applyEdit(edit);
		});
	});
});
