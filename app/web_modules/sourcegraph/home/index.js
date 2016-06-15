import {rel} from "sourcegraph/app/routePatterns";
import type {Route} from "react-router";

export const tools = {
	getComponent: (location, callback) => {
		require.ensure([], (require) => {
			callback(null, {
				main: require("sourcegraph/home/ToolsContainer").default,
			});
		});
	},
};

export const tool = {
	getComponent: (location, callback) => {
		require.ensure([], (require) => {
			callback(null, {
				main: require("sourcegraph/home/ToolsContainer").default,
			});
		});
	},
};

export const repos = {
	getComponent: (location, callback) => {
		require.ensure([], (require) => {
			callback(null, {
				main: require("sourcegraph/home/UserReposContainer").default,
			});
		});
	},
};

export const tour = {
	getComponent: (location, callback) => {
		require.ensure([], (require) => {
			callback(null, {
				main: require("sourcegraph/home/TourContainer").default,
			});
		});
	},
};

export const routes: Array<Route> = [
	{
		...tools,
		path: rel.tools,
	},
	{
		...tool,
		path: rel.tool,
	},
	{
		...repos,
		path: rel.myRepos,
	},
	{
		...tour,
		path: rel.tour,
	},
];
