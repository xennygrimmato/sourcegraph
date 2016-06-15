// @flow

import {rel} from "sourcegraph/app/routePatterns";
import urlTo from "sourcegraph/util/urlTo";
import {makeRepoRev, repoPath, repoParam} from "sourcegraph/repo";
import type {Route, RouteParams} from "react-router";
import {formatPattern} from "react-router/lib/PatternUtils";

let _components;

const common = {
	getComponents: (location, callback) => {
		require.ensure([], (require) => {
			if (!_components) {
				const withResolvedRepoRev = require("sourcegraph/repo/withResolvedRepoRev").default;
				const withRepoBuild = require("sourcegraph/build/withRepoBuild").default;
				_components = {
					navContext: withResolvedRepoRev(require("sourcegraph/repo/NavContext").default, false),
					main: withResolvedRepoRev(withRepoBuild(require("sourcegraph/repo/RepoMain").default), true),
				};
			}
			callback(null, _components);
		});
	},
};

// routes are the 2 routes needed for repos: the first is the one for repo
// subroutes, which must take precedence because the repo route matches
// greedily.
export const routes: Array<Route> = [
	{
		...common,
		path: `${rel.repo}/-/`,
		getChildRoutes: (location, callback) => {
			require.ensure([], (require) => {
				callback(null, [
					...require("sourcegraph/repo/commit/routes").routes,
					...require("sourcegraph/blob/routes").routes,
					...require("sourcegraph/build/routes").routes,
					...require("sourcegraph/def/routes").routes,
					...require("sourcegraph/tree/routes").routes,
				]);
			});
		},
	},
	{
		...common,
		path: rel.repo,
		disableTreeSearchOverlay: true,
		indexRoute: {
			disableTreeSearchOverlay: true,
			keepScrollPositionOnRouteChangeKey: "tree",
			getComponents: (location, callback) => {
				require.ensure([], (require) => {
					require("sourcegraph/tree/routes").routes[0].getComponents(location, callback);
				});
			},
		},
	},
];

export function urlToRepo(repo: string): string {
	return urlTo("repo", {splat: repo});
}

export function urlToRepoRev(repo: string, rev: string): string {
	return urlTo("repo", {splat: makeRepoRev(repo, rev)});
}

// urlWithRev constructs a URL that is equivalent to the current URL (whose
// current routes and routeParams are passed in), but pointing to a new rev. Only the
// rev is overwritten in the returned URL.
export function urlWithRev(currentRoutes: Array<Route>, currentRouteParams: RouteParams, newRev: string): string {
	// Ensure this is a repo subroute. If not, it's meaningless to change the rev.
	// The 0th route is the rootRoute; the next should be one of the repo base routes.
	if (!currentRoutes[1] || !routes.includes(currentRoutes[1])) {
		throw new Error("can't overwrite rev for non-repo routes");
	}

	const path = currentRoutes.map(r => r.path).join("");
	const repoRev = makeRepoRev(repoPath(repoParam(currentRouteParams.splat)), newRev);
	const newParams = {
		...currentRouteParams,
		splat: currentRouteParams.splat instanceof Array ? [repoRev, ...currentRouteParams.splat.slice(1)] : repoRev,
	};
	return formatPattern(`/${path}`, newParams);
}
