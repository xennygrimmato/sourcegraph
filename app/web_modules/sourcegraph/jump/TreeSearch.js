// @flow weak

import React from "react";

import * as TreeActions from "sourcegraph/tree/TreeActions";
import TreeStore from "sourcegraph/tree/TreeStore";
import * as SearchActions from "sourcegraph/search/SearchActions";
import {qualifiedNameAndType} from "sourcegraph/def/Formatter";
import JumpTable from "sourcegraph/jump/JumpTable";
import type {Section, Row} from "sourcegraph/jump/JumpTable";
import fuzzysearch from "fuzzysearch";
import {urlToBlob} from "sourcegraph/blob/routes";
import {urlToTree} from "sourcegraph/tree/routes";
import {urlToDef, urlToDefInfo} from "sourcegraph/def/routes";
import trimLeft from "lodash/string/trimLeft";

import Dispatcher from "sourcegraph/Dispatcher";
import SearchStore from "sourcegraph/search/SearchStore";

const RESULTS_LIMIT = 20;
const FILE_LIMIT = 15;
const EMPTY_PATH = [];

// renderTreeSearch returns a rendered JumpTable React component that is meant
// to be used as a search view within the context of a repository or directory
// page. The component's view is derived from the arguments passed to
// renderTreeSearch. The body of this function defines the "controller" logic of
// the view.
export function renderTreeSearch(repo: string, rev: string, commitID: string, path: string, initialQuery: string, prefixMatch: bool, includeRepos: bool, router: any, onChangeQuery: (query: string) => void): any {
		const fetch = function(query: string) {
			Dispatcher.Backends.dispatch(new SearchActions.WantResults({
				query: query,
				limit: RESULTS_LIMIT,
				prefixMatch: prefixMatch,
				includeRepos: includeRepos,
				fast: true,
			}));
			Dispatcher.Backends.dispatch(new TreeActions.WantSrclibDataVersion(repo, commitID));
			Dispatcher.Backends.dispatch(new TreeActions.WantFileList(repo, commitID));
		}

		const select = function(s: Section, r: Row) {
			if (r.def) {
				router.push(r.def.DefURL);
			} else if (r.file) {
				router.push(r.file.URL);
			} else if (r.repo) {
				const url = `/${r.repo.URI}`;
				router.push(r.repo.URI);
			}
		}

		const getResults = function(query: string): Array<Section> {
			let sections = [];

			// Global definition results
			let results = SearchStore.get(query, null, null, null, RESULTS_LIMIT,
																		prefixMatch, includeRepos);
			if (results && results.Defs) {
				let defSection = {
					header: "Definitions",
					rows: [],
				};
				for (let i = 0; i < results.Defs.length; i++) {
					const def = results.Defs[i];
					const url = urlToDefInfo(def) ? urlToDefInfo(def) : urlToDef(def);
					defSection.rows.push({
						def: {
							Repo: def.Repo,
							QualifiedNameAndType: qualifiedNameAndType(def, {nameQual: "DepQualified"}),
							DefURL: url,
							Docstring: "this is a docstring",
						},
					});
				}
				sections.push(defSection);
			}

			// File results
			if (!query) {
				let fileErr;
				let dirLevel = TreeStore.fileTree.get(repo, commitID);
				if (dirLevel) {
					// $FlowHack: this.state.path is non-null
					for (const part of pathSplit(path)) {
						let dirKey = `!${part}`; // dirKey is prefixed to avoid clash with predefined fields like "constructor"
						if (dirLevel.Dirs[dirKey]) {
							dirLevel = dirLevel.Dirs[dirKey];
						} else {
							if (!dirLevel.Dirs[dirKey] && !dirLevel.Files[part]) {
								fileErr = {response: {status: 404}};
							}
							break;
						}
					}

					// $FlowHack: this.state.path is non-null
					const pathPrefix = path.replace(/^\/$/, "");
					const dirs = !fileErr ? Object.keys(dirLevel.Dirs).map(dirKey => ({
						file: {
							name: dirKey.substr(1), // dirKey is prefixed to avoid clash with predefined fields like "constructor"
							isDirectory: true,
							path: pathJoin2(pathPrefix, dirKey.substr(1)),
							URL: urlToTree(repo, rev, pathJoin2(pathPrefix, dirKey.substr(1))),
						},
					})) : [];
					// Add parent dir link if showing a subdir.
					if (pathPrefix) {
						const parentDir = pathDir(pathPrefix);
						dirs.unshift({
							file: {
								name: "..",
								isDirectory: true,
								isParentDirectory: true,
								path: parentDir,
								URL: urlToTree(repo, rev, parentDir),
							},
						});
					}

					const files = !fileErr ? dirLevel.Files.map(file => ({
						file: {
							name: file,
							isParentDirectory: false,
							isDirectory: false,
							URL: urlToBlob(repo, rev, pathJoin2(pathPrefix, file)),
						},
					})) : [];

					// TODO(beyang): error handling
					// this.state.fileResults = !err ? dirs.concat(files) : {Error: err};

					if (files.length > 0) {
						sections.push({
							header: "Files",
							rows: dirs.concat(files),
						});
					}
				}
			} else {
				let fileList = TreeStore.fileLists.get(repo, commitID);
				if (fileList && fileList.Files) {
					let fileSection = {
						header: "Files",
						rows: [],
					};

					fileSection.rows = fileList.Files
						.filter((f: string) => fuzzysearch(query, f))
						.map((f: string) => (
							{
								file: {
									isParentDirectory: false,
									isDirectory: false,
									name: f,
									URL: urlToBlob(repo, rev, f),
								},
							}
						));
					if (fileSection.rows.length > 0) {
						sections.push(fileSection);
					}
				}
			}
			return sections;
		};

	return (
		<JumpTable
			context={`${repo}@${commitID}/${path}`}
			sections={[]}
			initialQuery={initialQuery}
			placeholder={"Jump to definition, file, or repository"}
			fetch={fetch}
			onChangeQuery={onChangeQuery}
			getResults={getResults}
			onSelect={select}
			stores={[SearchStore, TreeStore]} />
	);
}

/*
 * Helpers
 */

function pathJoin2(a: string, b: string): string {
	if (!a || a === "/") return b;
	return `${a}/${b}`;
}

function pathJoin(pathComponents: string[]): string {
	if (pathComponents.length === 0) return "/";
	return pathComponents.join("/");
}

function pathDir(path: string): string {
	// Remove last item from path.
	const parts = pathSplit(path);
	return pathJoin(parts.splice(0, parts.length - 1));
}

function pathSplit(path: string): string[] {
	if (path === "") throw new Error("invalid empty path");
	if (path === "/") return EMPTY_PATH;
	path = trimLeft(path, "/");
	return path.split("/");
}
