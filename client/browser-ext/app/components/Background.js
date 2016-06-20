import React from "react";
import {bindActionCreators} from "redux";
import {connect} from "react-redux";

import {useAccessToken} from "../actions/xhr";
import * as Actions from "../actions";
import styles from "./App.css";
import {keyFor, getExpiredSrclibDataVersion, getExpiredDef, getExpiredDefs, getExpiredAnnotations} from "../reducers/helpers";
import {defaultBranchCache} from "../utils/annotations";
import EventLogger from "../analytics/EventLogger";

import * as utils from "../utils";

@connect(
	(state) => ({
		accessToken: state.accessToken,
		srclibDataVersion: state.srclibDataVersion,
		def: state.def,
		annotations: state.annotations,
		defs: state.defs,
	}),
	(dispatch) => ({
		actions: bindActionCreators(Actions, dispatch)
	})
)
export default class Background extends React.Component {
	static propTypes = {
		accessToken: React.PropTypes.string,
		srclibDataVersion: React.PropTypes.object.isRequired,
		def: React.PropTypes.object.isRequired,
		annotations: React.PropTypes.object.isRequired,
		defs: React.PropTypes.object.isRequired,
		actions: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this._refresh = this._refresh.bind(this);
		this._clickRef = this._clickRef.bind(this);
		this._directURLToDef = this._directURLToDef.bind(this);
		this._updateIntervalID = null;

		this.state = utils.parseURL();
	}

	componentDidMount() {
		if (this.props.accessToken) useAccessToken(this.props.accessToken);

		// Capture user's access token if on sourcegraph.com.
		if (utils.isSourcegraphURL()) {
			const regexp = /accessToken\\":\\"([-A-Za-z0-9_.]+)\\"/;
			const matchResult = document.head.innerHTML.match(regexp);
			if (matchResult) this.props.actions.setAccessToken(matchResult[1]);
		}

		if (this._updateIntervalID === null) {
			this._updateIntervalID = setInterval(this._refreshVCS.bind(this), 1000 * 30); // refresh every 30s
		}

		document.addEventListener("click", this._clickRef);
		document.addEventListener("pjax:success", this._refresh);
		if (utils.isGitHubURL()) {
			window.addEventListener("focus", this._refresh);
		}

		this._expireStaleState();
		this._refresh();
	}

	componentWillUpdate(nextProps, nextState) {
		// Show/hide def info.
		if (nextState.defPath &&
			(nextState.repoURI !== this.state.repoURI ||
				nextState.rev !== this.state.rev ||
				nextState.defPath !== this.state.defPath ||
				nextState.def !== this.state.def)) {
			this._renderDefInfo(nextProps, nextState);
		}
	}

	componentWillUnmount() {
		document.removeEventListener("pjax:success", this._refresh);
		window.removeEventListener("focus", this._refresh);
		document.removeEventListener("click", this._clickRef);
		if (this._updateIntervalID !== null) {
			clearInterval(this._updateIntervalID);
			this._updateIntervalID = null;
		}
	}

	_expireStaleState() {
		getExpiredSrclibDataVersion(this.props.srclibDataVersion)
			.forEach(({repo, rev, path}) => this.props.actions.expireSrclibDataVersion(repo, rev, path));
		getExpiredDef(this.props.def)
			.forEach(({repo, rev, defPath}) => this.props.actions.expireDef(repo, rev, defPath));
		getExpiredDefs(this.props.defs)
			.forEach(({repo, rev, path, query}) => this.props.actions.expireDefs(repo, rev, path, query));
		getExpiredAnnotations(this.props.annotations)
			.forEach(({repo, rev, path}) => this.props.actions.expireAnnotations(repo, rev, path));
	}

	_clickRef(ev) {
		if (ev.target.dataset && typeof ev.target.dataset.sourcegraphRef !== "undefined") {
			let urlProps = utils.parseSourcegraphDef({pathname: ev.target.pathname, hash: ev.target.hash});
			this.props.actions.getDef(urlProps.repoURI, urlProps.rev, urlProps.defPath);

			const directURLToDef = this._directURLToDef(urlProps);
			if (directURLToDef) {
				EventLogger.logEvent("ClickedDef", {defPath: urlProps.defPath, repo: urlProps.repoURI, user: urlProps.user, direct: "true"});
				ev.target.href = `${directURLToDef.pathname}${directURLToDef.hash}`;
				this._renderDefInfo(this.props, urlProps);
			} else {
				EventLogger.logEvent("ClickedDef", {defPath: urlProps.defPath, repo: urlProps.repoURI, user: urlProps.user, direct: "false"});
				pjaxGoTo(ev.target.href, urlProps.repoURI === this.state.repoURI);
			}
		}
	}

	_refresh() {
		// First, get the current browser state (which could have been updated by another tab).
		chrome.runtime.sendMessage(null, {type: "get"}, {}, (state) => {
			const accessToken = state.accessToken;
			if (accessToken) this.props.actions.setAccessToken(accessToken);

			if (utils.isSourcegraphURL()) return;

			let urlProps = utils.parseURL();
			// This scrapes the latest commit ID and updates rev to the latest commit so we are never injecting
			// outdated annotations.  If there is a new commit, srclib-data-version will return a 404, but the
			// refresh endpoint will update the version and the annotations will be up to date once the new build succeeds
			let latestRev = document.getElementsByClassName("js-permalink-shortcut")[0] ? document.getElementsByClassName("js-permalink-shortcut")[0].href.split("/")[6] : urlProps.rev;
			// TODO: Branches that are not built on Sourcegraph will not get annotations, need to trigger
			urlProps.rev = latestRev;
			if (urlProps.repoURI) {
				this.props.actions.refreshVCS(urlProps.repoURI);
			}
			if (urlProps.path) {
				// Strip hash (e.g. line location) from path.
				const hashLoc = urlProps.path.indexOf("#");
				if (hashLoc !== -1) urlProps.path = urlProps.path.substring(0, hashLoc);
			}

			if (urlProps.repoURI && urlProps.defPath && !urlProps.isDelta) {
				this.props.actions.getDef(urlProps.repoURI, urlProps.rev, urlProps.defPath);
			}

			if (urlProps.repoURI && utils.supportsAnnotatingFile(urlProps.path)) {
				this.props.actions.ensureRepoExists(urlProps.repoURI);
			}

			this.setState(urlProps);
		});
	}

	_refreshVCS() {
		if (this.state.repoURI) {
			this.props.actions.refreshVCS(this.state.repoURI);
		}
	}

	_directURLToDef({repoURI, rev, defPath}) {
		const defObj = this.props.def.content[keyFor(repoURI, rev, defPath)];
		if (defObj) {
			if (repoURI !== this.state.repoURI) rev = defaultBranchCache[repoURI] || "master";
			const pathname = `/${repoURI.replace("github.com/", "")}/blob/${rev}/${defObj.File}`;
			const hash = `#sourcegraph&def=${defPath}&L${defObj.StartLine || 0}-${defObj.EndLine || 0}`;
			return {pathname, hash};
		}
		return null;
	}

	_renderDefInfo(props, state) {
		const def = props.def.content[keyFor(state.repoURI, state.rev, state.defPath)];

		const id = "sourcegraph-def-info";
		let e = document.getElementById(id);

		// Hide when no def is present.
		if (!def) {
			if (e) {
				e.remove();
			}
			return;
		}

		if (!e) {
			e = document.createElement("td");
			e.id = id;
			e.className = styles["def-info"];
			e.style.position = "absolute";
			e.style.right = "0";
			e.style.zIndex = "1000";
			e.style["-webkit-user-select"] = "none";
			e.style["user-select"] = "none";
		}
		let a = e.firstChild;
		if (!a) {
			a = document.createElement("a");
			e.appendChild(a);
		}

		a.href = `https://sourcegraph.com/${state.repoURI}@${state.rev}/-/info/${state.defPath}?utm_source=browser-ext&browser_type=chrome`;
		a.dataset.content = "Find Usages";
		a.target = "tab";
		a.title = `Sourcegraph: View cross-references to ${def.Name}`;

		// Anchor to def's start line.
		let anchor = document.getElementById(`L${def.StartLine}`);
		if (!anchor) {
			console.error("no line number element to anchor def info to");
			return;
		}
		anchor = anchor.parentNode;
		anchor.style.position = "relative";
		anchor.appendChild(e);
	}

	render() {
		return null; // the injected app is for bootstrapping; nothing needs to be rendered
	}
}

// pjaxGoTo uses GitHub's existing PJAX to navigate to a URL. It
// is faster than a hard page reload.
function pjaxGoTo(url, sameRepo) {
	if (!sameRepo) {
		window.location.href = url;
		return;
	}

	const e = document.createElement("a");
	e.href = url;
	if (sameRepo) e.dataset.pjax = "#js-repo-pjax-container";
	if (sameRepo) e.classList.add("js-navigation-open");
	document.body.appendChild(e);
	e.click();
	setTimeout(() => document.body.removeChild(e), 1000);
}
