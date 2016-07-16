/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { del } from 'vs/base/node/extfs';
import * as pfs from 'vs/base/node/pfs';
import { guessMimeTypes, isBinaryMime } from 'vs/base/common/mime';
import { IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { v4 as UUIDv4 } from 'vs/base/common/uuid';
import { localize } from 'vs/nls';
import { uniqueFilter } from 'vs/base/common/arrays';
import { IRawFileStatus, RefType, IRef, IBranch, IRemote, GitErrorCodes, IPushOptions } from 'vs/workbench/parts/git/common/git';
import { detectMimesFromStream } from 'vs/base/node/mime';
import { IFileOperationResult, FileOperationResult } from 'vs/platform/files/common/files';
import { spawn, ChildProcess } from 'child_process';
import { decode, encodingExists } from 'vs/base/node/encoding';

export interface IExecutionResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

function exec(child: ChildProcess, encoding = 'utf8'): TPromise<IExecutionResult> {
	const disposables: IDisposable[] = [];

	const once = (ee: NodeJS.EventEmitter, name: string, fn: Function) => {
		ee.once(name, fn);
		disposables.push(toDisposable(() => ee.removeListener(name, fn)));
	};

	const on = (ee: NodeJS.EventEmitter, name: string, fn: Function) => {
		ee.on(name, fn);
		disposables.push(toDisposable(() => ee.removeListener(name, fn)));
	};

	return TPromise.join<any>([
		new TPromise<number>((c, e) => {
			once(child, 'error', e);
			once(child, 'exit', c);
		}),
		new TPromise<string>(c => {
			let buffers: Buffer[] = [];
			on(child.stdout, 'data', b => buffers.push(b));
			once(child.stdout, 'close', () => c(decode(Buffer.concat(buffers), encoding)));
		}),
		new TPromise<string>(c => {
			let buffers: Buffer[] = [];
			on(child.stderr, 'data', b => buffers.push(b));
			once(child.stderr, 'close', () => c(decode(Buffer.concat(buffers), encoding)));
		})
	]).then(values => {
		dispose(disposables);

		return {
			exitCode: values[0],
			stdout: values[1],
			stderr: values[2]
		};
	});
}

export interface IGitErrorData {
	error?: Error;
	message?: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	gitErrorCode?: string;
	gitCommand?: string;
}

export class GitError {

	error: Error;
	message: string;
	stdout: string;
	stderr: string;
	exitCode: number;
	gitErrorCode: string;
	gitCommand: string;

	constructor(data: IGitErrorData) {
		if (data.error) {
			this.error = data.error;
			this.message = data.error.message;
		} else {
			this.error = null;
		}

		this.message = this.message || data.message || 'Git error';
		this.stdout = data.stdout || null;
		this.stderr = data.stderr || null;
		this.exitCode = data.exitCode || null;
		this.gitErrorCode = data.gitErrorCode || null;
		this.gitCommand = data.gitCommand || null;
	}

	toString(): string {
		let result = this.message + ' ' + JSON.stringify({
			exitCode: this.exitCode,
			gitErrorCode: this.gitErrorCode,
			gitCommand: this.gitCommand,
			stdout: this.stdout,
			stderr: this.stderr
		}, null, 2);

		if (this.error) {
			result += (<any> this.error).stack;
		}

		return result;
	}
}

export interface IGitOptions {
	gitPath:string;
	version: string;
	tmpPath:string;
	defaultEncoding?: string;
	env?:any;
}

export class Git {

	gitPath: string;
	version: string;
	env: any;
	private tmpPath: string;
	private defaultEncoding: string;
	private outputListeners: { (output: string): void; }[];

	constructor(options: IGitOptions) {
		this.gitPath = options.gitPath;
		this.version = options.version;
		this.tmpPath = options.tmpPath;

		const encoding = options.defaultEncoding || 'utf8';
		this.defaultEncoding = encodingExists(encoding) ? encoding : 'utf8';

		this.env = options.env || {};
		this.outputListeners = [];
	}

	run(cwd: string, args: string[], options: any = {}): TPromise<IExecutionResult> {
		options = assign({ cwd: cwd }, options || {});
		return this.exec(args, options);
	}

	stream(cwd: string, args: string[], options: any = {}): ChildProcess {
		options = assign({ cwd: cwd }, options || {});
		return this.spawn(args, options);
	}

	open(repository: string, env: any = {}): Repository {
		return new Repository(this, repository, this.defaultEncoding, env);
	}

	clone(repository: string, repoURL: string): TPromise<boolean> {
		return this.exec(['clone', repoURL, repository]).then(() => true, (err) => {
			return new TPromise<boolean>((c, e) => {

				// If there's any error, git will still leave the folder in the FS,
				// so we need to remove it.
				del(repository, this.tmpPath, (err) => {
					if (err) { return e(err); }
					c(true);
				});
			});
		});
	}

	config(name: string, value: string): Promise {
		return this.exec(['config', '--global', name, value]);
	}

	private exec(args: string[], options: any = {}): TPromise<IExecutionResult> {
		const child = this.spawn(args, options);

		if (options.input) {
			child.stdin.end(options.input, 'utf8');
		}

		return exec(child).then(result => {
			if (result.exitCode) {
				let gitErrorCode: string = null;

				if (/Authentication failed/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.AuthenticationFailed;
				} else if (/Not a git repository/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.NotAGitRepository;
				} else if (/bad config file/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.BadConfigFile;
				} else if (/cannot make pipe for command substitution|cannot create standard input pipe/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.CantCreatePipe;
				} else if (/Repository not found/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.RepositoryNotFound;
				} else if (/unable to access/.test(result.stderr)) {
					gitErrorCode = GitErrorCodes.CantAccessRemote;
				}

				if (options.log !== false) {
					this.log(result.stderr);
				}

				return TPromise.wrapError<IExecutionResult>(new GitError({
					message: 'Failed to execute git',
					stdout: result.stdout,
					stderr: result.stderr,
					exitCode: result.exitCode,
					gitErrorCode,
					gitCommand: args[0]
				}));
			}

			return result;
		});
	}

	spawn(args: string[], options: any = {}): ChildProcess {
		if (!this.gitPath) {
			throw new Error('git could not be found in the system.');
		}

		if (!options) {
			options = {};
		}

		if (!options.stdio && !options.input) {
			options.stdio = ['ignore', null, null]; // Unless provided, ignore stdin and leave default streams for stdout and stderr
		}

		options.env = assign({}, options.env || {});
		options.env = assign(options.env, this.env);
		options.env = assign(options.env, {
			MONACO_REQUEST_GUID: UUIDv4().asHex(),
			VSCODE_GIT_REQUEST_ID: UUIDv4().asHex(),
			MONACO_GIT_COMMAND: args[0]
		});

		if (options.log !== false) {
			this.log(`git ${ args.join(' ') }\n`);
		}

		return spawn(this.gitPath, args, options);
	}

	onOutput(listener: (output: string) => void): () => void {
		this.outputListeners.push(listener);
		return () => this.outputListeners.splice(this.outputListeners.indexOf(listener), 1);
	}

	private log(output: string): void {
		this.outputListeners.forEach(l => l(output));
	}
}

export class Repository {

	private git: Git;
	private repository: string;
	private defaultEncoding: string;
	private env: any;

	constructor(git: Git, repository: string, defaultEncoding: string, env: any = {}) {
		this.git = git;
		this.repository = repository;
		this.defaultEncoding = defaultEncoding;
		this.env = env;
	}

	get version(): string {
		return this.git.version;
	}

	get path(): string {
		return this.repository;
	}

	run(args: string[], options: any = {}): TPromise<IExecutionResult> {
		options.env = assign({}, options.env || {});
		options.env = assign(options.env, this.env);

		return this.git.run(this.repository, args, options);
	}

	stream(args: string[], options: any = {}): ChildProcess {
		options.env = assign({}, options.env || {});
		options.env = assign(options.env, this.env);

		return this.git.stream(this.repository, args, options);
	}

	spawn(args: string[], options: any = {}): ChildProcess {
		options.env = assign({}, options.env || {});
		options.env = assign(options.env, this.env);

		return this.git.spawn(args, options);
	}

	init(): Promise {
		return this.run(['init']);
	}

	config(scope: string, key:string, value:any, options:any): TPromise<string> {
		const args = ['config'];

		if (scope) {
			args.push('--' + scope);
		}

		args.push(key);

		if (value) {
			args.push(value);
		}

		return this.run(args, options).then((result) => result.stdout);
	}

	show(object: string): ChildProcess {
		return this.stream(['show', object]);
	}

	buffer(object: string): TPromise<string> {
		const child = this.show(object);

		return new Promise((c, e) => {
			detectMimesFromStream(child.stdout, null, (err, result) => {
				if (err) {
					e(err);
				} else if (isBinaryMime(result.mimes)) {
					e(<IFileOperationResult>{
						message: localize('fileBinaryError', "File seems to be binary and cannot be opened as text"),
						fileOperationResult: FileOperationResult.FILE_IS_BINARY
					});
				} else {
					c(this.doBuffer(object));
				}
			});
		});
	}

	private doBuffer(object: string): TPromise<string> {
		const child = this.show(object);

		return exec(child, this.defaultEncoding).then(({ exitCode, stdout }) => {
			if (exitCode) {
				return TPromise.wrapError<string>(new GitError({
					message: 'Could not buffer object.',
					exitCode
				}));
			}

			return TPromise.as<string>(stdout);
		});
	}

	add(paths: string[]): Promise {
		const args = ['add', '-A', '--'];

		if (paths && paths.length) {
			args.push.apply(args, paths);
		} else {
			args.push('.');
		}

		return this.run(args);
	}

	stage(path: string, data: string): Promise {
		const child = this.stream(['hash-object', '--stdin', '-w'], { stdio: [null, null, null] });
		child.stdin.end(data, 'utf8');

		return exec(child).then(({ exitCode, stdout }) => {
			if (exitCode) {
				return TPromise.wrapError<IExecutionResult>(new GitError({
					message: 'Could not hash object.',
					exitCode: exitCode
				}));
			}

			return this.run(['update-index', '--cacheinfo', '100644', stdout, path]);
		});
	}

	checkout(treeish: string, paths: string[]): Promise {
		const args = [ 'checkout', '-q' ];

		if (treeish) {
			args.push(treeish);
		}

		if (paths && paths.length) {
			args.push('--');
			args.push.apply(args, paths);
		}

		return this.run(args).then(null, (err: GitError) => {
			if (/Please, commit your changes or stash them/.test(err.stderr)) {
				err.gitErrorCode = GitErrorCodes.DirtyWorkTree;
			}

			return Promise.wrapError(err);
		});
	}

	commit(message: string, all: boolean, amend: boolean): Promise {
		const args = ['commit', '--quiet', '--allow-empty-message', '--file', '-'];

		if (all) {
			args.push('--all');
		}

		if (amend) {
			args.push('--amend');
		}

		return this.run(args, { input: message || '' }).then(null, (commitErr: GitError) => {
			if (/not possible because you have unmerged files/.test(commitErr.stderr)) {
				commitErr.gitErrorCode = GitErrorCodes.UnmergedChanges;
				return Promise.wrapError(commitErr);
			}

			return this.run(['config', '--get-all', 'user.name']).then(null, (err: GitError) => {
				err.gitErrorCode = GitErrorCodes.NoUserNameConfigured;
				return Promise.wrapError(err);
			}).then(() => {
				return this.run(['config', '--get-all', 'user.email']).then(null, (err: GitError) => {
					err.gitErrorCode = GitErrorCodes.NoUserEmailConfigured;
					return Promise.wrapError(err);
				}).then(() => {
					return Promise.wrapError(commitErr);
				});
			});
		});
	}

	branch(name: string, checkout: boolean): Promise {
		const args = checkout ? ['checkout', '-q', '-b', name] : [ 'branch', '-q', name ];
		return this.run(args);
	}

	clean(paths: string[]): Promise {
		const args = [ 'clean', '-f', '-q', '--' ].concat(paths);
		return this.run(args);
	}

	undo(): Promise {
		return this.run([ 'clean', '-fd' ]).then(() => {
			return this.run([ 'checkout', '--', '.' ]).then(null, (err: GitError) => {
				if (/did not match any file\(s\) known to git\./.test(err.stderr)) {
					return TPromise.as(null);
				}

				return Promise.wrapError(err);
			});
		});
	}

	reset(treeish: string, hard: boolean = false): Promise {
		const args = ['reset'];

		if (hard) {
			args.push('--hard');
		}

		args.push(treeish);

		return this.run(args);
	}

	revertFiles(treeish: string, paths: string[]): Promise {
		return this.run([ 'branch' ]).then((result) => {
			let args: string[];

			// In case there are no branches, we must use rm --cached
			if (!result.stdout) {
				args = [ 'rm', '--cached', '-r', '--' ];
			} else {
				args = [ 'reset', '-q', treeish, '--' ];
			}

			if (paths && paths.length) {
				args.push.apply(args, paths);
			} else {
				args.push('.');
			}

			return this.run(args).then(null, (err: GitError) => {
				// In case there are merge conflicts to be resolved, git reset will output
				// some "needs merge" data. We try to get around that.
				if (/([^:]+: needs merge\n)+/m.test(err.stdout)) {
					return TPromise.as(null);
				}

				return Promise.wrapError(err);
			});
		});
	}

	fetch(): Promise {
		return this.run(['fetch']).then(null, (err: GitError) => {
			if (/No remote repository specified\./.test(err.stderr)) {
				err.gitErrorCode = GitErrorCodes.NoRemoteRepositorySpecified;
			} else if (/Could not read from remote repository/.test(err.stderr)) {
				err.gitErrorCode = GitErrorCodes.RemoteConnectionError;
			}

			return Promise.wrapError(err);
		});
	}

	pull(rebase?: boolean): Promise {
		const args = ['pull'];
		if (rebase) { args.push('-r'); }

		return this.run(args).then(null, (err: GitError) => {
			if (/^CONFLICT \([^)]+\): \b/m.test(err.stdout)) {
				err.gitErrorCode = GitErrorCodes.Conflict;
			} else if (/Please tell me who you are\./.test(err.stderr)) {
				err.gitErrorCode = GitErrorCodes.NoUserNameConfigured;
			} else if (/Could not read from remote repository/.test(err.stderr)) {
				err.gitErrorCode = GitErrorCodes.RemoteConnectionError;
			} else if (/Pull is not possible because you have unmerged files|Cannot pull with rebase: You have unstaged changes|Your local changes to the following files would be overwritten|Please, commit your changes before you can merge/.test(err.stderr)) {
				err.gitErrorCode = GitErrorCodes.DirtyWorkTree;
			}

			return Promise.wrapError(err);
		});
	}

	push(remote?: string, name?: string, options?:IPushOptions): Promise {
		const args = ['push'];
		if (options && options.setUpstream) { args.push('-u'); }
		if (remote) { args.push(remote); }
		if (name) { args.push(name); }

		return this.run(args).then(null, (err: GitError) => {
			if (/^error: failed to push some refs to\b/m.test(err.stderr)) {
				err.gitErrorCode = GitErrorCodes.PushRejected;
			} else if (/Could not read from remote repository/.test(err.stderr)) {
				err.gitErrorCode = GitErrorCodes.RemoteConnectionError;
			}

			return Promise.wrapError(err);
		});
	}

	sync(): Promise {
		return this.pull().then(() => this.push());
	}

	getRoot(): TPromise<string> {
		return this.run(['rev-parse', '--show-toplevel'], { log: false }).then(result => result.stdout.trim());
	}

	getStatus(): TPromise<IRawFileStatus[]> {
		return this.run(['status', '-z', '-u'], { log: false }).then((executionResult) => {
			const status = executionResult.stdout;
			const result:IRawFileStatus[] = [];
			let current:IRawFileStatus;
			let i = 0;

			function readName():string {
				const start = i;
				let c:string;
				while ((c = status.charAt(i)) !== '\u0000') { i++; }
				return status.substring(start, i++);
			}

			while (i < status.length) {
				current = {
					x: status.charAt(i++),
					y: status.charAt(i++),
					path: null,
					mimetype: null
				};

				i++;

				if (current.x === 'R') {
					current.rename = readName();
				}

				current.path = readName();
				current.mimetype = guessMimeTypes(current.path)[0];

				// If path ends with slash, it must be a nested git repo
				if (current.path[current.path.length-1] === '/') {
					continue;
				}

				result.push(current);
			}

			return TPromise.as<IRawFileStatus[]>(result);
		});
	}

	getHEAD(): TPromise<IRef> {
		return this.run(['symbolic-ref', '--short', 'HEAD'], { log: false }).then((result) => {
			if (!result.stdout) {
				return TPromise.wrapError<IRef>(new Error('Not in a branch'));
			}

			return TPromise.as<IRef>({ name: result.stdout.trim(), commit: void 0, type: RefType.Head });
		}, (err) => {
			return this.run(['rev-parse', 'HEAD'], { log: false }).then((result) => {
				if (!result.stdout) {
					return TPromise.wrapError<IRef>(new Error('Error parsing HEAD'));
				}

				return TPromise.as<IRef>({ name: void 0, commit: result.stdout.trim(), type: RefType.Head });
			});
		});
	}

	getRefs(): TPromise<IRef[]> {
		return this.run(['for-each-ref', '--format', '%(refname) %(objectname)'], { log: false }).then(result => {
			return result.stdout.trim().split('\n')
				.filter(line => !!line)
				.map(line => {
					let match: RegExpExecArray;

					if (match = /^refs\/heads\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
						return { name: match[1], commit: match[2], type: RefType.Head };
					} else if (match = /^refs\/remotes\/([^/]+)\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
						return { name: `${ match[1] }/${ match[2] }`, commit: match[3], type: RefType.RemoteHead, remote: match[1] };
					} else if (match = /^refs\/tags\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
						return { name: match[1], commit: match[2], type: RefType.Tag };
					}

					return null;
				})
				.filter(ref => !!ref);
		});
	}

	getRemotes(): TPromise<IRemote[]> {
		const regex = /^([^\s]+)\s+([^\s]+)\s/;

		return this.run(['remote', '--verbose'], { log: false })
			.then(result => result.stdout
				.trim()
				.split('\n')
				.filter(b => !!b)
				.map(line => regex.exec(line))
				.filter(g => !!g)
				.map(groups => ({ name: groups[1], url: groups[2] }))
				.filter(uniqueFilter<{ name: string; }>(g => g.name))
			);
	}

	getBranch(branch: string): TPromise<IBranch> {
		if (branch === 'HEAD') {
			return this.getHEAD();
		}

		return this.run(['rev-parse', branch], { log: false }).then((result) => {
			if (!result.stdout) {
				return TPromise.wrapError<IBranch>(new Error('No such branch'));
			}

			const commit = result.stdout.trim();

			return this.run(['rev-parse', '--symbolic-full-name', '--abbrev-ref', branch + '@{u}'], { log: false }).then((result: IExecutionResult) => {
				const upstream = result.stdout.trim();

				return this.run(['rev-list', '--left-right', branch + '...' + upstream], { log: false }).then((result) => {
					let ahead = 0, behind = 0;
					let i = 0;

					while (i < result.stdout.length) {
						switch (result.stdout.charAt(i)) {
							case '<': ahead++; break;
							case '>': behind++; break;
							default: i++; break;
						}

						while (result.stdout.charAt(i++) !== '\n') { /* no-op */ }
					}

					return {
						name: branch,
						commit: commit,
						upstream: upstream,
						ahead: ahead,
						behind: behind
					};
				});
			}, () => {
				return { name: branch, commit: commit };
			});
		});
	}

	getCommitTemplate(): TPromise<string> {
		return this.run(['config', '--get', 'commit.template']).then(result => {
			if (!result.stdout) {
				return '';
			}

			// https://github.com/git/git/blob/3a0f269e7c82aa3a87323cb7ae04ac5f129f036b/path.c#L612
			const homedir = os.homedir();
			const templatePath = result.stdout.trim()
				.replace(/^~([^\/]*)\//, (_, user) => `${ user ? path.join(path.dirname(homedir), user) : homedir }/`);

			return pfs.readFile(templatePath, 'utf8').then(null, () => '');
		}, () => '');
	}

	onOutput(listener: (output: string) => void): () => void {
		return this.git.onOutput(listener);
	}
}
