// @flow

import {rel} from "sourcegraph/app/routePatterns";
import type {Route} from "react-router";

export const routes: Array<Route> = [
	{
		path: rel.settings,
		getComponent: (location, callback) =>
			System.import("sourcegraph/user/settings/SettingsMain")
				.then(m => callback(null, {main: m.default})),
		childRoutes: [
			{
				path: rel.settingsAccounts,
				getComponent: (location, callback) =>
					System.import("sourcegraph/user/settings/UserSettingsAccountsMain")
						.then(m => callback(null, {main: m.default})),
			},
			{
				path: rel.settingsRepos,
				getComponent: (location, callback) =>
					System.import("sourcegraph/user/settings/UserSettingsReposMain")
						.then(m => callback(null, {main: m.default})),
			},
		],
	},
];
