import * as types from "../constants/ActionTypes";
import {keyFor} from "../reducers/helpers";
import fetch, {useAccessToken} from "./xhr";
import {defCache} from "../utils/annotations";

export function setAccessToken(token) {
	useAccessToken(token); // for future fetches
	return {type: types.SET_ACCESS_TOKEN, token};
}

export function setRepoRev(repo, rev) {
	return {type: types.SET_REPO_REV, repo, rev};
}

export function setPath(path) {
	return {type: types.SET_PATH, path};
}

export function setDefPath(defPath) {
	return {type: types.SET_DEF_PATH, defPath};
}

export function setQuery(query) {
	return {type: types.SET_QUERY, query};
}

export function expireAnnotations(repo, rev, path) {
	return {type: types.EXPIRE_ANNOTATIONS, repo, rev, path};
}

export function expireSrclibDataVersion(repo, rev, path) {
	return {type: types.EXPIRE_SRCLIB_DATA_VERSION, repo, rev, path};
}

export function expireDef(repo, rev, defPath) {
	return {type: types.EXPIRE_DEF, repo, rev, defPath};
}

export function expireDefs(repo, rev, path, query) {
	return {type: types.EXPIRE_DEFS, repo, rev, path, query};
}

// Utility method to fetch srclib data version, usually prior to hitting another API
// (e.g. fetching annotations requires fetching srclib data version first).
// It will dispatch actions unless a srclibDataVersion is already cached in browser
// state for the specified repo/rev/path, and return a Promise.
function _fetchSrclibDataVersion(dispatch, state, repo, rev, path) {
	const srclibDataVersion = state.srclibDataVersion.content[keyFor(repo, rev, path)];
	if (srclibDataVersion) {
		if (srclibDataVersion.CommitID) return Promise.resolve(srclibDataVersion);
		return Promise.reject(new Error("missing srclib data version CommitID"));
	}

	dispatch({type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path})
	return fetch(`https://sourcegraph.com/.api/repos/${repo}@${rev}/-/srclib-data-version?Path=${path || ""}`)
		.then((json) => { dispatch({type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json}); return json; })
		.catch((err) => { dispatch({type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, err}); throw err; });
}

export function getSrclibDataVersion(repo, rev, path) {
	return function (dispatch, getState) {
		return _fetchSrclibDataVersion(dispatch, getState(), repo, rev, path)
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
		const cacheKey = `https://sourcegraph.com/.api/repos/${repo}/-/def/${defPath}?ComputeLineRange=true&Doc=true`;
		if (defCache[cacheKey]) {
			// Dispatch FETCHED_DEF so it gets added to the normal def.content
			// for next time.
			dispatch({type: types.FETCHED_DEF, repo, rev, defPath, json: defCache[cacheKey]})
			return Promise.resolve();
		}

		dispatch({type: types.WANT_DEF, repo, rev, defPath})
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

export function getAnnotations(repo, rev, path) {
	return function (dispatch, getState) {
		const state = getState();
		return _fetchSrclibDataVersion(dispatch, state, repo, rev, path).then((json) => {
			rev = json.CommitID;
			console.log("got srclib data version", rev, json.CommitID);
			if (state.annotations.content[keyFor(repo, rev, path)]) return Promise.resolve(); // nothing to do; already have annotations

			dispatch({type: types.WANT_ANNOTATIONS, repo, rev, path});
			return fetch(`https://sourcegraph.com/.api/annotations?Entry.RepoRev.Repo=${repo}&Entry.RepoRev.CommitID=${rev}&Entry.Path=${path}&Range.StartByte=0&Range.EndByte=0`)
				.then((json) => dispatch({type: types.FETCHED_ANNOTATIONS, repo, rev, path, json}))
				.catch((err) => dispatch({type: types.FETCHED_ANNOTATIONS, repo, rev, path, err}));
		}).catch((err) => {}); // no error handling
	}
}

export function refreshVCS(repo) {
	return function (dispatch) {
		return fetch(`https://sourcegraph.com/.api/repos/${repo}/-/refresh`, {method: "POST"})
			.then((json) => dispatch({type: types.REFRESH_VCS}))
			.catch((err) => dispatch({type: types.REFRESH_VCS}));
	}
}

export function ensureRepoExists(repo) {
	return function (dispatch, getState) {
		const state = getState();
		if (state.createdRepos[repo]) return Promise.resolve();

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
			.then((json) => dispatch({type: types.CREATED_REPO, repo}))
			.catch((err) => dispatch({type: types.CREATED_REPO, repo})); // no error handling
	}
}
