import React from "react";
import {bindActionCreators} from "redux";
import {connect} from "react-redux";

import {useAccessToken} from "../actions/xhr";
import * as Actions from "../actions";
import styles from "./App.css";
import {keyFor, getExpiredSrclibDataVersion, getExpiredDef, getExpiredDefs, getExpiredAnnotations} from "../reducers/helpers";
import {defaultBranchCache} from "../utils/annotations";
import EventLogger from "../analytics/EventLogger";

import {parseGitHubURL, isGitHubURL, isSourcegraphURL, getCurrentBranch, supportsAnnotatingFile} from "../utils";

@connect(
	(state) => ({
		accessToken: state.accessToken,
		repo: state.repo,
		rev: state.rev,
		path: state.path,
		defPath: state.defPath,
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
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string.isRequired,
		path: React.PropTypes.string,
		defPath: React.PropTypes.string,
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
		this._updateIntervalID = null;
	}

	componentDidMount() {
		if (this.props.accessToken) useAccessToken(this.props.accessToken);

		// Capture user's access token if on sourcegraph.com.
		if (isSourcegraphURL()) {
			const regexp = /accessToken\\":\\"([-A-Za-z0-9_.]+)\\"/;
			const matchResult = document.head.innerHTML.match(regexp);
			if (matchResult) this.props.actions.setAccessToken(matchResult[1]);
		}

		if (this._updateIntervalID === null) {
			this._updateIntervalID = setInterval(this._refreshVCS.bind(this), 1000 * 30); // refresh every 30s
		}

		document.addEventListener("click", this._clickRef);
		document.addEventListener("pjax:success", this._refresh);
		if (isGitHubURL()) {
			window.addEventListener("focus", this._refresh);
		}

		this._expireStaleState();
		this._refresh();
	}

	componentWillReceiveProps(nextProps) {
		// Show/hide def info.
		if (nextProps.defPath &&
			(nextProps.repo !== this.props.repo ||
				nextProps.rev !== this.props.rev ||
				nextProps.defPath !== this.props.defPath ||
				nextProps.def !== this.props.def)) {
			this._renderDefInfo(nextProps);
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
		if (typeof ev.target.dataset.sourcegraphRef !== "undefined") {
			let urlProps = this.parseURL({pathname: ev.target.pathname, hash: ev.target.hash});
			urlProps.repo = `github.com/${urlProps.user}/${urlProps.repo}`;

			this.props.actions.getDef(urlProps.repo, urlProps.rev, urlProps.defPath);

			const props = {...urlProps, def: this.props.def}
			const info = this._directURLToDef(props);
			if (info) {
				EventLogger.logEvent("ClickedDef", {defPath: props.defPath, repo: props.repo, user: props.user, direct: "true"});
				// Fast path. Uses PJAX if possible (automatically).
				const {pathname, hash} = info;
				ev.target.href = `${pathname}${hash}`;
				this._renderDefInfo(props);
			} else {
				EventLogger.logEvent("ClickedDef", {defPath: props.defPath, repo: props.repo, user: props.user, direct: "false"});
				pjaxGoTo(ev.target.href, urlProps.repo === this.props.repo);
			}
		}
	}

	parseURL(loc = window.location) {
		// TODO: this method has problems handling branch revisions with "/" character.
		// TODO(rothfels): unify this with utils parseGitHubURL function.
		const urlsplit = loc.pathname.slice(1).split("/");
		let user = urlsplit[0];
		let repo = urlsplit[1]
		// We scrape the current branch and set rev to it so we stay on the same branch when doing jump-to-def.
		// Need to use the branch selector button because _clickRef passes a pathname as the location which,
		// only includes ${user}/${repo}, and no rev.
		let currBranch = getCurrentBranch();
		let rev = currBranch;
		if (urlsplit[3] && (urlsplit[2] === "tree" || urlsplit[2] === "blob")) { // what about "commit"
			rev = urlsplit[3];
		}
		let path = urlsplit.slice(4).join("/");

		const info = {user, repo, rev, path};
		// Check for URL hashes like "#sourcegraph&def=...".
		if (loc.hash.startsWith("#sourcegraph&")) {
			const parts = loc.hash.slice(1).split("&").slice(1); // omit "sourcegraph" sentinel
			parts.forEach((p) => {
				const kv = p.split("=", 2);
				if (kv.length != 2) return;
				let k = kv[0];
				const v = kv[1];
				if (k === "def") k = "defPath"; // disambiguate with def obj
				if (!info[k]) info[k] = v; // don't clobber
			});
		}
		return info;
	}

	_refresh() {
		// First, get the current browser state (which could have been updated by another tab).
		chrome.runtime.sendMessage(null, {type: "get"}, {}, (state) => {
			const accessToken = state.accessToken;
			if (accessToken) this.props.actions.setAccessToken(accessToken);

			let {user, repo, rev, path, defPath} = this.parseURL();
			// This scrapes the latest commit ID and updates rev to the latest commit so we are never injecting
			// outdated annotations.  If there is a new commit, srclib-data-version will return a 404, but the
			// refresh endpoint will update the version and the annotations will be up to date once the new build succeeds
			let latestRev = document.getElementsByClassName("js-permalink-shortcut")[0] ? document.getElementsByClassName("js-permalink-shortcut")[0].href.split("/")[6] : rev;
			// TODO: Branches that are not built on Sourcegraph will not get annotations, need to trigger
			rev = latestRev;
			const repoName = repo;
			if (repo) {
				repo = `github.com/${user}/${repo}`;
				this.props.actions.refreshVCS(repo);
			}
			if (path) {
				// Strip hash (e.g. line location) from path.
				const hashLoc = path.indexOf("#");
				if (hashLoc !== -1) path = path.substring(0, hashLoc);
			}

			this.props.actions.setRepoRev(repo, rev);
			this.props.actions.setDefPath(defPath);
			this.props.actions.setPath(path);

			if (repo && defPath) {
				this.props.actions.getDef(repo, rev, defPath);
			}

			if (repo && supportsAnnotatingFile(path)) {
				this.props.actions.ensureRepoExists(repo);
			}

			this._renderDefInfo(this.props);
		});
	}

	_refreshVCS() {
		if (this.props.repo) {
			this.props.actions.refreshVCS(this.props.repo);
		}
	}

	// _checkNavigateToDef checks for a URL fragment of the form "#sourcegraph&def=..."
	// and redirects to the def's definition in code on GitHub.com.
	_checkNavigateToDef({repo, rev, defPath, def}) {
		const info = this._directURLToDef({repo, rev, defPath, def});
		if (info) {
			const {pathname, hash} = info;
			if (!(window.location.pathname === pathname && window.location.hash === hash)) {
				pjaxGoTo(`${pathname}${hash}`, repo === this.props.repo);
			}
		}
	}

	_directURLToDef({repo, rev, defPath, def}) {
		const defObj = def ? def.content[keyFor(repo, rev, defPath)] : null;
		if (defObj) {
			if (repo !== this.props.repo) rev = defaultBranchCache[repo] || "master";
			const pathname = `/${repo.replace("github.com/", "")}/blob/${rev}/${defObj.File}`;
			const hash = `#sourcegraph&def=${defPath}&L${defObj.StartLine || 0}-${defObj.EndLine || 0}`;
			return {pathname, hash};
		}
		return null;
	}

	_renderDefInfo(props) {
		const def = props.def.content[keyFor(props.repo, props.rev, props.defPath)];

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

		a.href = `https://sourcegraph.com/${props.repo}@${props.rev}/-/info/${props.defPath}?utm_source=browser-ext&browser_type=chrome`;
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
