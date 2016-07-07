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

export const integrations = {
	getComponent: (location, callback) => {
		require.ensure([], (require) => {
			callback(null, {
				main: require("sourcegraph/home/IntegrationsContainer").default,
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
		...integrations,
		path: rel.integrations,
	},
];
