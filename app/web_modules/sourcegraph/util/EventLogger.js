// @flow weak

import React from "react";
import Dispatcher from "sourcegraph/Dispatcher";
import context from "sourcegraph/app/context";
import type {SiteConfig} from "sourcegraph/app/siteConfig";
import type {AuthInfo, User} from "sourcegraph/user";
import {getViewName, getRoutePattern, getRouteParams} from "sourcegraph/app/routePatterns";
import type {Route} from "react-router";
import * as RepoActions_typed from "sourcegraph/repo/RepoActions_typed";
import * as UserActions from "sourcegraph/user/UserActions";
import * as DefActions from "sourcegraph/def/DefActions";
import UserStore from "sourcegraph/user/UserStore";
import {getLanguageExtensionForPath, defPathToLanguage} from "sourcegraph/util/inventory";
import * as AnalyticsConstants from "sourcegraph/util/constants/AnalyticsConstants";

export const EventLocation = {
	Login: "Login",
	Signup: "Signup",
	Dashboard: "Dashboard",
	DefPopup: "DefPopup",
};

export class EventLogger {
	_amplitude: any = null;
	_intercom: any = null;
	_fullStory: any = null;
	_telligent: any = null;

	_intercomSettings: any;
	userAgentIsBot: bool;
	_dispatcherToken: any;
	_siteConfig: ?SiteConfig;
	_currentPlatform: string = "Web";

	constructor() {
		this._intercomSettings = null;

		// Listen to the UserStore for changes in the user login/logout state.
		UserStore.addListener(() => this._updateUser());

		// Listen for all Stores dispatches.
		// You must separately log "frontend" actions of interest,
		// with the relevant event properties.
		this._dispatcherToken = Dispatcher.Stores.register(this.__onDispatch.bind(this));

		if (typeof document !== "undefined") {
			document.addEventListener("sourcegraph:platform:initalization", this._initializeForSourcegraphPlatform.bind(this));
		}
	}

	_initializeForSourcegraphPlatform(event) {
		if (event && event.detail && event.detail.currentPlatform) {
			this._currentPlatform = event.detail.currentPlatform;
		}
	}

	setSiteConfig(siteConfig: SiteConfig) {
		this._siteConfig = siteConfig;
	}

	// init initializes Amplitude and Intercom.
	init() {
		if (global.window && !this._amplitude) {
			this._amplitude = require("amplitude-js");

			this._telligent = window.telligent;

			if (!this._siteConfig) {
				throw new Error("EventLogger requires SiteConfig to be previously set using EventLogger.setSiteConfig before EventLogger can be initialized.");
			}

			let apiKey = "608f75cce80d583063837b8f5b18be54";
			let env = "development";
			if (this._siteConfig.buildVars.Version === "dev") {
				apiKey = "2b4b1117d1faf3960c81899a4422a222";
			} else {
				switch (this._siteConfig.appURL) {
				case "https://sourcegraph.com":
					apiKey = "e3c885c30d2c0c8bf33b1497b17806ba";
					env = "production";
					break;
				case "https://staging.sourcegraph.com":
				case "https://staging2.sourcegraph.com":
				case "https://staging3.sourcegraph.com":
				case "https://staging4.sourcegraph.com":
					apiKey = "903f9390c3eefd5651853cf8dbd9d363";
					break;
				default:
					break;
				}
			}

			this._telligent("newTracker", "sg", "sourcegraph-logging.telligentdata.com", {
				appId: "SourcegraphWeb",
				platform: this._currentPlatform,
				encodeBase64: false,
				env: env,
			});

			this._amplitude.init(apiKey, null, {
				includeReferrer: true,
			});
		}

		if (global.Intercom) this._intercom = global.Intercom;
		if (global.FS) this._fullStory = global.FS;

		if (typeof window !== "undefined") {
			this._intercomSettings = window.intercomSettings;
		}

		this.userAgentIsBot = Boolean(context.userAgentIsBot);

		// Opt out of Amplitude events if the user agent is a bot.
		this._amplitude.setOptOut(this.userAgentIsBot);
	}

	// User data from the previous call to _updateUser.
	_user: ?User;
	_authInfo: AuthInfo = {};
	_primaryEmail: ?string;

	// _updateUser is be called whenever the user changes (after login or logout,
	// or on the initial page load);
	//
	// If any events have been buffered, it will flush them immediately.
	// If you do not call _updateUser or it is run on the server,
	// any subequent calls to logEvent or setUserProperty will be buffered.
	_updateUser() {
		const user = UserStore.activeUser();
		const authInfo = UserStore.activeAuthInfo();
		const emails = user && user.UID ? UserStore.emails.get(user.UID) : null;
		const primaryEmail = emails && !emails.Error ? emails.filter(e => e.Primary).map(e => e.Email)[0] : null;

		if (this._authInfo !== authInfo) {
			if (this._authInfo && this._authInfo.UID && (!authInfo || this._authInfo.UID !== authInfo.UID)) {
				// The user logged out or another user logged in on the same browser.

				// Distinguish between 2 users who log in from the same browser; see
				// https://github.com/amplitude/Amplitude-Javascript#logging-out-and-anonymous-users.
				if (this._amplitude) this._amplitude.regenerateDeviceId();

				// Prevent the next user who logs in (e.g., on a public terminal) from
				// seeing the previous user's Intercom messages.
				if (this._intercom) this._intercom("shutdown");

				if (this._fullStory) this._fullStory.clearUserCookie();
			}

			if (authInfo) {
				if (this._amplitude && authInfo.Login) this._amplitude.setUserId(authInfo.Login || null);
				if (window.ga && authInfo.Login) window.ga("set", "userId", authInfo.Login);

				if (this._telligent && authInfo.Login) this._telligent("setUserId", authInfo.Login);

				if (authInfo.UID) this.setIntercomProperty("user_id", authInfo.UID.toString());
				if (authInfo.IntercomHash) this.setIntercomProperty("user_hash", authInfo.IntercomHash);
				if (this._fullStory && authInfo.Login) {
					this._fullStory.identify(authInfo.Login);
				}
			}
			if (this._intercom) this._intercom("boot", this._intercomSettings);
		}
		if (this._user !== user && user) {
			if (user.Name) this.setIntercomProperty("name", user.Name);
			if (this._fullStory) this._fullStory.setUserVars({displayName: user.Name});
			if (user.RegisteredAt) {
				this.setUserProperty("registered_at", new Date(user.RegisteredAt).toDateString());
				this.setIntercomProperty("created_at", new Date(user.RegisteredAt).getTime() / 1000);
			}
		}
		if (this._primaryEmail !== primaryEmail) {
			if (primaryEmail) {
				this.setUserProperty("email", primaryEmail);
				this.setIntercomProperty("email", primaryEmail);
				if (this._fullStory) this._fullStory.setUserVars({email: primaryEmail});
			}
		}

		this._user = user;
		this._authInfo = authInfo;
		this._primaryEmail = primaryEmail;
	}


	getAmplitudeIdentificationProps() {
		if (!this._amplitude || !this._amplitude.options) {
			return null;
		}

		return {detail: {deviceId: this._amplitude.options.deviceId, userId: UserStore.activeAuthInfo() ? UserStore.activeAuthInfo().Login : null}};
	}
	// sets current user's properties
	setUserProperty(property, value) {
		this._telligent("addStaticMetadata", property, value, "userInfo");
		this._amplitude.identify(new this._amplitude.Identify().set(property, value));
	}

	// Use logViewEvent as the default way to log view events for Amplitude and GA
	// location is the URL, page is the path.
	logViewEvent(title, page, eventProperties) {

		if (this.userAgentIsBot || !page) {
			return;
		}

		this._telligent("track", "view", {...eventProperties, platform: this._currentPlatform, page_name: page, page_title: title});

		// Log Amplitude "View" event
		this._amplitude.logEvent(title, {...eventProperties, Platform: this._currentPlatform});

		// Log GA "pageview" event without props.
		window.ga("send", {
			hitType: "pageview",
			page: page,
			title: title,
		});
	}

	// Default tracking call to all of our analytics servies.
	// Required fields: eventCategory, eventAction, eventLabel
	// Optional fields: eventProperties
	// Example Call: logEventForCategory(AnalyticsConstants.CATEGORY_AUTH, AnalyticsConstants.ACTION_SUCCESS, "SignupCompletion", AnalyticsConstants.PAGE_HOME, {signup_channel: GitHub})
	logEventForCategory(eventCategory, eventAction, eventLabel, eventProperties) {
		if (this.userAgentIsBot || !eventLabel) {
			return;
		}

		this._telligent("track", eventAction, {...eventProperties, eventLabel: eventLabel, eventCategory: eventCategory, eventAction: eventAction, is_authed: this._user ? "true" : "false", Platform: this._currentPlatform});
		this._amplitude.logEvent(eventLabel, {...eventProperties, eventCategory: eventCategory, eventAction: eventAction, is_authed: this._user ? "true" : "false", Platform: this._currentPlatform});

		window.ga("send", {
			hitType: "event",
			eventCategory: eventCategory || "",
			eventAction: eventAction || "",
			eventLabel: eventLabel,
		});
	}

	// sets current user's property value
	setIntercomProperty(property, value) {
		if (this._intercom) this._intercomSettings[property] = value;
	}

	// records intercom events for the current user
	logIntercomEvent(eventName, eventProperties) {
		if (this._intercom && !this.userAgentIsBot) this._intercom("trackEvent", eventName, eventProperties);
	}

	__onDispatch(action) {
		switch (action.constructor) {
		case RepoActions_typed.ReposFetched:
			if (action.data.Repos) {
				let orgs = {};
				for (let repo of action.data.Repos) {
					orgs[repo.Owner] = true;
				}
				this.setUserProperty("orgs", Object.keys(orgs));
				this.setUserProperty("num_github_repos", action.data.Repos.length);
				this.setIntercomProperty("companies", Object.keys(orgs).map(org => ({id: `github_${org}`, name: org})));
				if (orgs["sourcegraph"]) {
					this.setUserProperty("is_sg_employee", "true");
				}
			}
			break;

		case UserActions.SignupCompleted:
		case UserActions.LoginCompleted:
		case UserActions.LogoutCompleted:
		case UserActions.ForgotPasswordCompleted:
		case UserActions.ResetPasswordCompleted:
			if (action.email) {
				this.setUserProperty("email", action.email);
			}

			if (action.eventName) {
				if (action.signupChannel) {
					this.setUserProperty("signup_channel", action.signupChannel);
					this.logEventForCategory(AnalyticsConstants.CATEGORY_AUTH, AnalyticsConstants.ACTION_SIGNUP, action.eventName, {error: Boolean(action.resp.Error), signup_channel: action.signupChannel});
				} else {
					this.logEventForCategory(AnalyticsConstants.CATEGORY_AUTH, AnalyticsConstants.ACTION_SUCCESS, action.eventName, {error: Boolean(action.resp.Error)});
				}
			}
			break;
		case UserActions.BetaSubscriptionCompleted:
			if (action.eventName) {
				this.logEventForCategory(AnalyticsConstants.CATEGORY_ENGAGEMENT, AnalyticsConstants.ACTION_SUCCESS, action.eventName);
			}
			break;
		case UserActions.FetchedGitHubToken:
			if (action.token) {
				let allowedPrivateAuth = action.token.scope && action.token.scope.includes("repo") && action.token.scope.includes("read:org");
				this.setUserProperty("is_private_code_user", allowedPrivateAuth ? allowedPrivateAuth.toString() : "false");
			}
			break;
		case DefActions.DefsFetched:
			if (action.eventName) {
				let eventProps = {
					query: action.query,
					overlay: action.overlay,
				};
				this.logEventForCategory(AnalyticsConstants.CATEGORY_DEF, AnalyticsConstants.ACTION_FETCH, action.eventName, eventProps);
			}
			break;

		case DefActions.HighlightDef:
			{
				if (action.url) { // we also emit HighlightDef when the def is un-highlighted
					let eventProps = {
						language: action.language || "unknown",
					};
					this.logEventForCategory(AnalyticsConstants.CATEGORY_DEF, AnalyticsConstants.ACTION_HOVER, action.eventName, eventProps);
				}
				break;
			}

		default:
			// All dispatched actions to stores will automatically be tracked by the eventName
			// of the action (if set). Override this behavior by including another case above.
			if (action.eventName) {
				this.logEventForCategory(AnalyticsConstants.CATEGORY_UNKNOWN, AnalyticsConstants.ACTION_FETCH, action.eventName);
			}
			break;
		}
	}
}

export default new EventLogger();

// withEventLoggerContext makes eventLogger accessible as this.context.eventLogger
// in the component's context.
export function withEventLoggerContext(eventLogger: EventLogger, Component: ReactClass): ReactClass {
	class WithEventLogger extends React.Component {
		static childContextTypes = {
			eventLogger: React.PropTypes.object,
		};

		constructor(props) {
			super(props);
			eventLogger.init();
		}

		getChildContext(): {eventLogger: EventLogger} {
			return {eventLogger};
		}

		render() {
			return <Component {...this.props} />;
		}
	}
	return WithEventLogger;
}

// withViewEventsLogged calls this.context.eventLogger.logEvent when the
// location's pathname changes.
export function withViewEventsLogged(Component: ReactClass): ReactClass {
	class WithViewEventsLogged extends React.Component { // eslint-disable-line react/no-multi-comp
		static propTypes = {
			routes: React.PropTypes.arrayOf(React.PropTypes.object),
			location: React.PropTypes.object.isRequired,
		};

		static contextTypes = {
			router: React.PropTypes.object.isRequired,
			eventLogger: React.PropTypes.object.isRequired,
		};

		componentDidMount() {
			this._logView(this.props.routes, this.props.location);
			this._checkEventQuery();
		}

		componentWillReceiveProps(nextProps) {
			// Greedily log page views. Technically changing the pathname
			// may match the same "view" (e.g. interacting with the directory
			// tree navigations will change your URL,  but not feel like separate
			// page events). We will log any change in pathname as a separate event.
			// NOTE: this will not log separate page views when query string / hash
			// values are updated.
			if (this.props.location.pathname !== nextProps.location.pathname) {
				this._logView(nextProps.routes, nextProps.location);
				// $FlowHack
				document.dispatchEvent(new CustomEvent("sourcegraph:identify", this.context.eventLogger.getAmplitudeIdentificationProps()));
			}

			this._checkEventQuery();
		}

		camelCaseToUnderscore(input) {
			if (input.charAt(0) === "_") {
				input = input.substring(1);
			}

			return input.replace(/([A-Z])/g, function($1) {
				return `_${$1.toLowerCase()}`;
			});
		}

		_checkEventQuery() {
			// Allow tracking events that occurred externally and resulted in a redirect
			// back to Sourcegraph. Pull the event name out of the URL.
			if (this.props.location.query && this.props.location.query._event) {
				// For login signup related metrics a channel will be associated with the signup.
				// This ensures we can track one metrics "SignupCompleted" and then query on the channel
				// for more granular metrics.
				let eventProperties= {};
				for (let key in this.props.location.query) {
					if (key !== "_event") {
						eventProperties[this.camelCaseToUnderscore(key)] = this.props.location.query[key];
					}
				}

				if (this.props.location.query._githubAuthed) {
					this.context.eventLogger.setUserProperty("github_authed", this.props.location.query._githubAuthed);
					this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_AUTH, AnalyticsConstants.ACTION_SIGNUP, this.props.location.query._event, eventProperties);
				} else {
					this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_EXTERNAL, AnalyticsConstants.ACTION_REDIRECT, this.props.location.query._event, eventProperties);
				}

				// Won't take effect until we call replace below, but prevents this
				// from being called 2x before the setTimeout block runs.
				delete this.props.location.query._event;
				delete this.props.location.query._githubAuthed;

				// Remove _event from the URL to canonicalize the URL and make it
				// less ugly.
				const locWithoutEvent = {...this.props.location,
					query: {...this.props.location.query, _event: undefined, _signupChannel: undefined, _onboarding: undefined, _githubAuthed: undefined}, // eslint-disable-line no-undefined
					state: {...this.props.location.state, _onboarding: this.props.location.query._onboarding},
				};

				delete this.props.location.query._signupChannel;
				delete this.props.location.query._onboarding;

				this.context.router.replace(locWithoutEvent);
			}
		}

		_logView(routes: Array<Route>, location: Location) {
			let eventProps: {
				url: string;
				referred_by_browser_ext?: string;
				referred_by_sourcegraph_editor?: string;
				language?: string;
			};

			if (location.query && location.query["utm_source"] === "integration" && location.query["type"]) {
				eventProps = {
					// Alfred, ChromeExtension, FireFoxExtension, SublimeEditor, VIMEditor.
					referred_by_integration: location.query["type"],
					url: location.pathname,
				};
			} else if (location.query && location.query["utm_source"] === "chromeext") {
				// TODO:matt remove this once all plugins are switched to new version
				// This is temporarily here for backwards compat
				eventProps = {
					referred_by_browser_ext: "chrome",
					url: location.pathname,
				};
			} else if (location.query && location.query["utm_source"] === "browser-ext" && location.query["browser_type"]) {
				eventProps = {
					referred_by_browser_ext: location.query["browser_type"],
					url: location.pathname,
				};
			} else if (location.query && location.query["utm_source"] === "sourcegraph-editor" && location.query["editor_type"]) {
				eventProps = {
					url: location.pathname,
					referred_by_sourcegraph_editor: location.query["editor_type"],
				};
			} else {
				eventProps = {
					url: location.pathname,
				};
			}

			const routePattern = getRoutePattern(routes);
			const viewName = getViewName(routes);
			const routeParams = getRouteParams(routePattern, location.pathname);

			if (viewName) {
				if (viewName === "ViewBlob" && routeParams) {
					const filePath = routeParams.splat[routeParams.splat.length - 1];
					const lang = getLanguageExtensionForPath(filePath);
					if (lang) eventProps.language = lang;
				} else if ((viewName === "ViewDef" || viewName === "ViewDefInfo") && routeParams) {
					const defPath = routeParams.splat[routeParams.splat.length - 1];
					const lang = defPathToLanguage(defPath);
					if (lang) eventProps.language = lang;
				}

				this.context.eventLogger.logViewEvent(viewName, location.pathname, {...eventProps, pattern: getRoutePattern(routes)});
			} else {
				this.context.eventLogger.logViewEvent("UnmatchedRoute", location.pathname, {
					...eventProps,
					pattern: getRoutePattern(routes),
				});
			}
		}

		render() { return <Component {...this.props} />; }
	}
	return WithViewEventsLogged;
}
