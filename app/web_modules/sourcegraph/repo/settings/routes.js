// @flow

import {rel} from "sourcegraph/app/routePatterns";
import urlTo from "sourcegraph/util/urlTo";
import type {Route} from "react-router";

let _repoSettingsMain;

export const routes: Route = [
	{
		path: rel.repoSettings,
		getComponents: (location, callback) => {
			require.ensure([], (require) => {
				if (!_repoSettingsMain) {
					const withResolvedRepoRev = require("sourcegraph/repo/withResolvedRepoRev").default;
					_repoSettingsMain = withResolvedRepoRev(require("sourcegraph/repo/settings/RepoSettingsMain").default, true);
				}
				callback(null, {main: _repoSettingsMain});
			});
		},
	},
];

export function urlToRepoSettings(repo: string): string {
	return urlTo("repoSettings", {splat: repo});
}
