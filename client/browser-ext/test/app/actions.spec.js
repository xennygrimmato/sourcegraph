import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";
import fetchMock from "fetch-mock";

import {expect} from "chai";
import * as types from "../../app/constants/ActionTypes";
import * as actions from "../../app/actions";
import {keyFor} from "../../app/reducers/helpers";

const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

describe("actions", () => {
	afterEach(fetchMock.restore);

	const repo = "github.com/gorilla/mux";
	const rev = "master";
	const path = "path";
	const defPath = "defPath";
	const query = "query";

	const srclibDataVersionAPI = `https://sourcegraph.com/.api/repos/${repo}@${rev}/-/srclib-data-version?Path=${path}`;
	const srclibDataVersion = {CommitID: "foo"};

	function errorResponse(status, url) {
		return {response: {status, url}};
	}

	it("setAccessToken", () => {
		expect(actions.setAccessToken("foo")).to.eql({type: types.SET_ACCESS_TOKEN, token: "foo"});
	});

	it("setRepoRev", () => {
		expect(actions.setRepoRev(repo, rev)).to.eql({type: types.SET_REPO_REV, repo, rev});
	});

	it("setPath", () => {
		expect(actions.setPath(path)).to.eql({type: types.SET_PATH, path});
	});

	it("setQuery", () => {
		expect(actions.setQuery(query)).to.eql({type: types.SET_QUERY, query});
	});

	it("setDefPath", () => {
		expect(actions.setDefPath(defPath)).to.eql({type: types.SET_DEF_PATH, defPath});
	});

	it("expireAnnotations", () => {
		expect(actions.expireAnnotations(repo, rev, path)).to.eql({type: types.EXPIRE_ANNOTATIONS, repo, rev, path});
	});

	it("expireSrclibDataVersion", () => {
		expect(actions.expireSrclibDataVersion(repo, rev, path)).to.eql({type: types.EXPIRE_SRCLIB_DATA_VERSION, repo, rev, path});
	});

	it("expireDef", () => {
		expect(actions.expireDef(repo, rev, defPath)).to.eql({type: types.EXPIRE_DEF, repo, rev, defPath});
	});

	it("expireDefs", () => {
		expect(actions.expireDefs(repo, rev, path, query)).to.eql({type: types.EXPIRE_DEFS, repo, rev, path, query});
	});

	describe("refreshVCS", () => {
		const refreshVCSAPI = `https://sourcegraph.com/.api/repos/${repo}/-/refresh`;
		function assertExpectedActions(initStore, expectedActions) {
			let store = mockStore(initStore);
		    return store.dispatch(actions.refreshVCS(repo))
		    	.then(() => expect(store.getActions()).to.eql(expectedActions));
		}

		it("completes successfully", () => {
			fetchMock.mock(refreshVCSAPI, "POST", 200);
		    return assertExpectedActions({}, [{type: types.REFRESH_VCS}]);
		});

		it("404s", () => {
			fetchMock.mock(refreshVCSAPI, "POST", 404);
		    return assertExpectedActions({}, [{type: types.REFRESH_VCS}]);
		});
	});

	describe("ensureRepoExists", () => {
		const repoCreateAPI = `https://sourcegraph.com/.api/repos`;
		function assertExpectedActions(initStore, expectedActions) {
			let store = mockStore(initStore);
		    return store.dispatch(actions.ensureRepoExists(repo))
		    	.then(() => expect(store.getActions()).to.eql(expectedActions));
		}

		it("completes successfully", () => {
			fetchMock.mock(repoCreateAPI, "POST", 200);
		    return assertExpectedActions({createdRepos: {}}, [{type: types.CREATED_REPO, repo}]);
		});

		it("409s", () => {
			fetchMock.mock(repoCreateAPI, "POST", 409);
		    return assertExpectedActions({createdRepos: {}}, [{type: types.CREATED_REPO, repo}]);
		});

		it("noops when repo is already created (and cached)", () => {
			return assertExpectedActions({createdRepos: {[repo]: true}}, []);
		});
	});

	describe("getSrclibDataVersion", () => {
		function assertExpectedActions(initStore, expectedActions) {
			let store = mockStore(initStore);
		    return store.dispatch(actions.getSrclibDataVersion(repo, rev, path))
		    	.then(() => expect(store.getActions()).to.eql(expectedActions));
		}

		it("resolves", () => {
			fetchMock.mock(srclibDataVersionAPI, "GET", srclibDataVersion);

		    return assertExpectedActions({
		    	srclibDataVersion: {content: {}, fetches: {}, timestamps: {}}
		    }, [
		    	{type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path},
		    	{type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json: srclibDataVersion},
		    ]);
		});

		it("404s", () => {
			fetchMock.mock(srclibDataVersionAPI, "GET", 404);

		    return assertExpectedActions({
		    	srclibDataVersion: {content: {}, fetches: {}, timestamps: {}}
		    }, [
		    	{type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path},
		    	{type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, err: errorResponse(404, srclibDataVersionAPI)},
		    ]);
		});

		it("noops when srclib data version is cached", () => {
			return assertExpectedActions({
				srclibDataVersion: {content: {[keyFor(repo, rev, path)]: srclibDataVersion}, fetches: {}, timestamps: {}}
			}, []);
		});
	});

	describe("getDefs", () => {
		const defsAPI = `https://sourcegraph.com/.api/defs?RepoRevs=${encodeURIComponent(repo)}@${encodeURIComponent("foo")}&Nonlocal=true&Query=${encodeURIComponent(query)}&FilePathPrefix=${path ? encodeURIComponent(path) : ""}`;
		function assertExpectedActions(initStore, expectedActions) {
			let store = mockStore(initStore);
		    return store.dispatch(actions.getDefs(repo, rev, path, query))
		    	.then(() => expect(store.getActions()).to.eql(expectedActions));
		}

		it("200s", () => {
			fetchMock.mock(srclibDataVersionAPI, "GET", srclibDataVersion).mock(defsAPI, "GET", {Defs: []});

		    return assertExpectedActions({
		    	defs: {content: {}, fetches: {}, timestamps: {}},
		    	srclibDataVersion: {content: {}, fetches: {}, timestamps: {}},
		    }, [
		    	{type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path},
		    	{type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json: srclibDataVersion},
		    	{type: types.WANT_DEFS, repo, rev: "foo", path, query},
		    	{type: types.FETCHED_DEFS, repo, rev: "foo", path, query, json: {Defs: []}},
		    ]);
		});

		it("404s", () => {
			fetchMock.mock(srclibDataVersionAPI, "GET", srclibDataVersion).mock(defsAPI, "GET", 404);

		    return assertExpectedActions({
		    	defs: {content: {}, fetches: {}, timestamps: {}},
		    	srclibDataVersion: {content: {}, fetches: {}, timestamps: {}},
		    }, [
		    	{type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path},
		    	{type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json: srclibDataVersion},
		    	{type: types.WANT_DEFS, repo, rev: "foo", path, query},
		    	{type: types.FETCHED_DEFS, repo, rev: "foo", path, query, err: errorResponse(404, defsAPI)},
		    ]);
		});

		it("noops when defs are cached", () => {
			fetchMock.mock(srclibDataVersionAPI, "GET", srclibDataVersion);

			return assertExpectedActions({
				defs: {content: {[keyFor(repo, "foo", path, query)]: {Defs: []}}, fetches: {}, timestamps: {}},
		    	srclibDataVersion: {content: {}, fetches: {}, timestamps: {}},
			}, [
		    	{type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path},
		    	{type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json: srclibDataVersion},
			]);
		});
	});

	describe("getDef", () => {
		const defAPI = `https://sourcegraph.com/.api/repos/${repo}@${rev}/-/def/${defPath}?ComputeLineRange=true`;
		function assertExpectedActions(initStore, expectedActions) {
			let store = mockStore(initStore);
		    return store.dispatch(actions.getDef(repo, rev, defPath))
		    	.then(() => expect(store.getActions()).to.eql(expectedActions));
		}

		it("200s", () => {
			fetchMock.mock(defAPI, "GET", {});

		    return assertExpectedActions({
		    	def: {content: {}, fetches: {}, timestamps: {}},
		    }, [
		    	{type: types.WANT_DEF, repo, rev, defPath},
		    	{type: types.FETCHED_DEF, repo, rev, defPath, json: {}},
		    ]);
		});

		it("404s", () => {
			fetchMock.mock(defAPI, "GET", 404);

		    return assertExpectedActions({
		    	def: {content: {}, fetches: {}, timestamps: {}},
		    }, [
		    	{type: types.WANT_DEF, repo, rev, defPath},
		    	{type: types.FETCHED_DEF, repo, rev, defPath, err: errorResponse(404, defAPI)},
		    ]);
		});

		it("noops when def is cached", () => {
			return assertExpectedActions({
				def: {content: {[keyFor(repo, rev, defPath)]: {}}, fetches: {}, timestamps: {}},
			}, []);
		});
	});

	describe("getAnnotations", () => {
		const annotationsAPI = `https://sourcegraph.com/.api/annotations?Entry.RepoRev.Repo=${encodeURIComponent(repo)}&Entry.RepoRev.CommitID=${encodeURIComponent("foo")}&Entry.Path=${encodeURIComponent(path)}&Range.StartByte=0&Range.EndByte=0`;
		function assertExpectedActions(initStore, expectedActions) {
			let store = mockStore(initStore);
		    return store.dispatch(actions.getAnnotations(repo, rev, path))
		    	.then(() => expect(store.getActions()).to.eql(expectedActions));
		}

		it("200s", () => {
			fetchMock.mock(srclibDataVersionAPI, "GET", srclibDataVersion).mock(annotationsAPI, "GET", {Annotations: []});

		    return assertExpectedActions({
		    	annotations: {content: {}, fetches: {}, timestamps: {}},
		    	srclibDataVersion: {content: {}, fetches: {}, timestamps: {}},
		    }, [
		    	{type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path},
		    	{type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json: srclibDataVersion},
		    	{type: types.WANT_ANNOTATIONS, repo, rev: "foo", path},
		    	{type: types.FETCHED_ANNOTATIONS, repo, rev: "foo", path, json: {Annotations: []}},
		    ]);
		});

		it("404s", () => {
			fetchMock.mock(srclibDataVersionAPI, "GET", srclibDataVersion).mock(annotationsAPI, "GET", 404);

		    return assertExpectedActions({
		    	annotations: {content: {}, fetches: {}, timestamps: {}},
		    	srclibDataVersion: {content: {}, fetches: {}, timestamps: {}},
		    }, [
		    	{type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path},
		    	{type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json: srclibDataVersion},
		    	{type: types.WANT_ANNOTATIONS, repo, rev: "foo", path},
		    	{type: types.FETCHED_ANNOTATIONS, repo, rev: "foo", path, err: errorResponse(404, annotationsAPI)},
		    ]);
		});

		it("noops when annotations are cached", () => {
			fetchMock.mock(srclibDataVersionAPI, "GET", srclibDataVersion);

			return assertExpectedActions({
				defs: {content: {[keyFor(repo, "foo", path, query)]: {Annotations: []}}, fetches: {}, timestamps: {}},
		    	srclibDataVersion: {content: {}, fetches: {}, timestamps: {}},
			}, [
		    	{type: types.WANT_SRCLIB_DATA_VERSION, repo, rev, path},
		    	{type: types.FETCHED_SRCLIB_DATA_VERSION, repo, rev, path, json: srclibDataVersion},
			]);
		});
	});
});
