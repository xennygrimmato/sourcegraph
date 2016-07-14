import * as types from "../constants/ActionTypes";
import {keyFor} from "../reducers/helpers";
import fetch, {useAccessToken} from "./xhr";
import {defCache} from "../utils/annotations";
import EventLogger from "../analytics/EventLogger";

export function getAuthentication(state) {
    return function (dispatch) {
    	return fetch(`https://sourcegraph.com/.api/auth-info`)
    	.then((json) => dispatch({type: types.FETCH_AUTH_INFO, json}))
    	.then((action) => EventLogger.setUserLogin(action.json.Login))
    	.catch((err) => dispatch({type: types.FETCH_AUTH_INFO, err}));
    }
}

export function setAccessToken(token) {
	useAccessToken(token); // for future fetches
	return {type: types.SET_ACCESS_TOKEN, token};
}

// Utility method to fetch the absolute commit id for a branch, usually prior to hitting
// another API (e.g. fetching srclib data versino requires resolving rev first).
function _resolveRev(dispatch, state, repo, rev) {
	const resolvedRev = state.resolvedRev.content[keyFor(repo, rev)];
	if (resolvedRev) return Promise.resolve(resolvedRev);

	const permalinkShortcut = document.querySelector(".js-permalink-shortcut");
	if (permalinkShortcut) {
		const json = {CommitID: permalinkShortcut.href.split("/")[6]};
		dispatch({type: types.RESOLVED_REV, repo, rev, json});
		return Promise.resolve(json);
	}

	return fetch(`https://sourcegraph.com/.api/repos/${repo}${rev ? `@${rev}` : ""}/-/rev`)
		.then((json) => { dispatch({type: types.RESOLVED_REV, repo, rev, json}); return json; })
		.catch((err) => { dispatch({type: types.RESOLVED_REV, repo, rev, err}); throw err; });
}

// Utility method to fetch srclib data version, usually prior to hitting another API
// (e.g. fetching annotations requires fetching srclib data version first).
// It will dispatch actions unless a srclibDataVersion is already cached in browser
// state for the specified repo/rev/path, and return a Promise.
function _fetchSrclibDataVersion(dispatch, state, repo, rev, path, exactRev) {
	let p;
	if (exactRev) {
		p = Promise.resolve({CommitID: rev});
	} else {
		p = _resolveRev(dispatch, state, repo, rev);
	}

	return p.then((json) => {
		rev = json.CommitID;

		const srclibDataVersion = state.srclibDataVersion.content[keyFor(repo, rev, path)];
		if (srclibDataVersion) {
			if (srclibDataVersion.CommitID) return Promise.resolve(srclibDataVersion);
			return Promise.reject(new Error("missing srclib data version CommitID"));
		}

		return fetch(`https://sourcegraph.com/.api/repos/${repo}@${rev}/-/srclib-data-version?Path=${path || ""}`)
			.then((json) => { dispatch({type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json}); return json; })
			.catch((err) => { dispatch({type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, err}); throw err; });
	}).catch((err) => {}); // no error handling
}

export function getSrclibDataVersion(repo, rev, path, exactRev) {
	return function (dispatch, getState) {
		return _fetchSrclibDataVersion(dispatch, getState(), repo, rev, path, exactRev)
			.catch((err) => {}); // no error handling
	}
}

export function getDef(repo, rev, defPath) {
	return function (dispatch, getState) {
		const state = getState();
		if (state.def.content[keyFor(repo, rev, defPath)]) return Promise.resolve(); // nothing to do; already have def

		// HACK: share def data with annotations.js. This violates the redux
		// boundaries but it means that in many cases you can click on a ref
		// and immediately go there instead of going via the repo homepage.
		//
		// NOTE: Need to keep this in sync with the defCache key structure.
		const cacheKey = `https://sourcegraph.com/.api/repos/${repo}@${rev}/-/def/${defPath}?ComputeLineRange=true&Doc=true`;
		if (defCache[cacheKey]) {
			// Dispatch FETCHED_DEF so it gets added to the normal def.content
			// for next time.
			dispatch({type: types.FETCHED_DEF, repo, rev, defPath, json: defCache[cacheKey]})
			return Promise.resolve();
		}

		return fetch(`https://sourcegraph.com/.api/repos/${repo}@${rev}/-/def/${defPath}?ComputeLineRange=true`)
			.then((json) => dispatch({type: types.FETCHED_DEF, repo, rev, defPath, json}))
			.catch((err) => dispatch({type: types.FETCHED_DEF, repo, rev, defPath, err}));
	}
}

export function getDefs(repo, rev, path, query) {
	return function (dispatch, getState) {
		const state = getState();
		return _fetchSrclibDataVersion(dispatch, state, repo, rev, path).then((json) => {
			rev = json.CommitID;
			if (state.defs.content[keyFor(repo, rev, path, query)]) return Promise.resolve(); // nothing to do; already have defs

			dispatch({type: types.WANT_DEFS, repo, rev, path, query})
			return fetch(`https://sourcegraph.com/.api/defs?RepoRevs=${repo}@${rev}&Nonlocal=true&Query=${query}&FilePathPrefix=${path || ""}`)
				.then((json) => dispatch({type: types.FETCHED_DEFS, repo, rev, path, query, json}))
				.catch((err) => dispatch({type: types.FETCHED_DEFS, repo, rev, path, query, err}));
		}).catch((err) => {}); // no error handling
	}
}

export function getAnnotations(repo, rev, path, exactRev) {
	return function (dispatch, getState) {
		const state = getState();
		return _fetchSrclibDataVersion(dispatch, state, repo, rev, path, exactRev).then((json) => {
			rev = json.CommitID;
			if (state.annotations.content[keyFor(repo, rev, path)]) return Promise.resolve(); // nothing to do; already have annotations

			return fetch(`https://sourcegraph.com/.api/annotations?Entry.RepoRev.Repo=${repo}&Entry.RepoRev.CommitID=${rev}&Entry.Path=${path}&Range.StartByte=0&Range.EndByte=0`)
				.then((json) => dispatch({type: types.FETCHED_ANNOTATIONS, repo, rev, path, json}))
				.catch((err) => dispatch({type: types.FETCHED_ANNOTATIONS, repo, rev, path, err}));
		}).catch((err) => {}); // no error handling
	}
}

export function refreshVCS(repo) {
	return function (dispatch) {
		return fetch(`https://sourcegraph.com/.api/repos/${repo}/-/refresh`, {method: "POST"})
			.then((json) => {})
			.catch((err) => {});
	}
}

function _getNewestBuildForCommit(dispatch, state, repo, commitID) {
	const build = state.build.content[keyFor(repo, commitID)];
	if (build) return Promise.resolve();

	return fetch(`https://sourcegraph.com/.api/builds?Sort=updated_at&Direction=desc&PerPage=1&Repo=${repo}&CommitID=${commitID}`)
		.then((json) => { dispatch({type: types.FETCHED_BUILD, repo, commitID, json}); return json; })
		.catch((err) => { dispatch({type: types.FETCHED_BUILD, repo, commitID, err}); throw err; });
}

export function stashRefreshedBuild(repo, commitID, branch) {
	return function (dispatch, getState) {
		const state = getState();
		return  _getNewestBuildForCommit(dispatch, state, repo, commitID).then((json) => {
			if (json && json.Builds && json.Builds.length === 1) {
				return Promise.resolve();
			}

			dispatch({type: types.CREATED_BUILD, repo, commitID, json: {Builds: [{}]}});
			return fetch(`https://sourcegraph.com/.api/repos/${repo}/-/builds`, {method: "POST", body: JSON.stringify({CommitID: commitID, Branch: branch})})
				.then((json) => {})
				.catch((err) => {});
		}).catch((err) => {}); // no error handling
	}
}

export function build(repo, commitID, branch) {
	return function (dispatch, getState) {
		const state = getState();
		const build = state.build.content[keyFor(repo, commitID)];
		if (build) return Promise.resolve();

		return _getNewestBuildForCommit(dispatch, state, repo, commitID).then((json) => {
			if (json && json.Builds && json.Builds.length === 1) {
				return Promise.resolve();
			}

			dispatch({type: types.CREATED_BUILD, repo, commitID, json: {Builds: [{}]}});
			return fetch(`https://sourcegraph.com/.api/repos/${repo}/-/builds`, {method: "POST", body: JSON.stringify({CommitID: commitID, Branch: branch})})
				.then((json) => {})
				.catch((err) => {});
		}).catch((err) => {}); // no error handling
	}
}

export function ensureRepoExists(repo) {
	return function () {
		const body = {
			Op: {
				New: {
					URI: repo,
					CloneURL: `https://${repo}`,
					DefaultBranch: "master",
					Mirror: true,
				},
			},
		};
		return fetch(`https://sourcegraph.com/.api/repos`, {method: "POST", body: JSON.stringify(body)})
			.then((json) => {})
			.catch((err) => {}); // no error handling
	}
}
