import "babel-polyfill";
import React from "react";
import ReactDOM from "react-dom";
import "sourcegraph/util/actionLogger";
import "sourcegraph/app/appdash";
import {Router, browserHistory as history, match, applyRouterMiddleware} from "react-router";
import useScroll from "react-router-scroll";
import {rootRoute} from "sourcegraph/app/App";
import {reset as resetStores} from "sourcegraph/init/stores";
import * as context from "sourcegraph/app/context";
import resetOnAuthChange from "sourcegraph/app/resetOnAuthChange";
import {shouldUpdateScroll, hashLinkScroll} from "sourcegraph/app/routerScrollBehavior";
import {AppContainer} from "react-hot-loader";
import Redbox from "redbox-react";

// REQUIRED. Configures Sentry error monitoring.
import "sourcegraph/init/Sentry";

// REQUIRED. Enables HTML history API (pushState) tracking in Google Analytics.
// See https://github.com/googleanalytics/autotrack#shouldtrackurlchange.
import "autotrack/lib/plugins/url-change-tracker";

if (typeof window !== "undefined" && window.__StoreData) {
	resetStores(window.__StoreData);
}

context.reset(window.__sourcegraphJSContext);
resetOnAuthChange();
__webpack_public_path__ = document.head.dataset.webpackPublicPath; // eslint-disable-line no-undef

const rootEl = document.getElementById("main");

let hotReloadCounter = 0;

// matchWithRedirectHandling calls the router match func. If the router issues
// a redirect, it calls match recursively after replacing the location with the
// new one.
function matchWithRedirectHandling(recursed) {
	match({history, routes: rootRoute}, (err, redirectLocation, renderProps) => {
		if (typeof err === "undefined" && typeof redirectLocation === "undefined" && typeof renderProps === "undefined") {
			console.error("404 not found (no route)");
			return;
		}

		if (redirectLocation) {
			let prevLocation = window.location.href;
			history.replace(redirectLocation);
			if (recursed) {
				console.error(`Possible redirect loop: ${prevLocation} -> ${redirectLocation.pathname}`);
				window.location.reload();
				return;
			}
			matchWithRedirectHandling(true);
			return;
		}

		setTimeout(() => {
			ReactDOM.render(
				<AppContainer errorReporter={Redbox}>
					<Router
						key={hotReloadCounter}
						onUpdate={hashLinkScroll}
						{...renderProps}
						render={applyRouterMiddleware(useScroll(shouldUpdateScroll))} />
				</AppContainer>,
				rootEl,
			);
		});
	});
}

matchWithRedirectHandling(false);

if (typeof module !== "undefined" && module.hot) {
	module.hot.accept("sourcegraph/app/App", () => {
		hotReloadCounter++;
		matchWithRedirectHandling(false);
	});
}
