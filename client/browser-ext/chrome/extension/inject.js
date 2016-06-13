import React from "react";
import {render} from "react-dom";
import {bindActionCreators} from "redux";
import {connect, Provider} from "react-redux";

import addAnnotations from "./annotations";
import addAnnotationsForPullRequest from "./annotations2";

import {useAccessToken} from "../../app/actions/xhr";
import * as Actions from "../../app/actions";
import App from "../../app/containers/App"; // TODO(rothfels): name this something more sensible; move to Components
import styles from "../../app/components/App.css";
import BuildIndicator from "../../app/components/BuildIndicator";
import {SearchIcon, SourcegraphIcon} from "../../app/components/Icons";
import {keyFor, getExpiredSrclibDataVersion, getExpiredDef, getExpiredDefs, getExpiredAnnotations} from "../../app/reducers/helpers";
import createStore from "../../app/store/configureStore";
import {defaultBranchCache} from "../../chrome/extension/annotations";
import EventLogger from "../../app/analytics/EventLogger";

import {parseGitHubURL, isGitHubURL} from "../../app/utils";

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
		createdRepos: state.createdRepos,
		lastRefresh: state.lastRefresh,
	}),
	(dispatch) => ({
		actions: bindActionCreators(Actions, dispatch)
	})
)
class InjectApp extends React.Component {
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
		createdRepos: React.PropTypes.object.isRequired,
		lastRefresh: React.PropTypes.number,
	};

	constructor(props) {
		super(props);
		this.state = {
			appFrameIsVisible: false,
		};
		this.refreshState = this.refreshState.bind(this);
		this.pjaxUpdate = this.pjaxUpdate.bind(this);
		this.focusUpdate = this.focusUpdate.bind(this);
		this._clickRef = this._clickRef.bind(this);
		this._updateIntervalID = null;
	}

	componentDidMount() {
		if (this.props.accessToken) useAccessToken(this.props.accessToken);

		// Capture the access token if on sourcegraph.com.
		if (window.location.href.match(/https:\/\/(www.)?sourcegraph.com/)) {
			const regexp = /accessToken\\":\\"([-A-Za-z0-9_.]+)\\"/;
			const matchResult = document.head.innerHTML.match(regexp);
			if (matchResult) this.props.actions.setAccessToken(matchResult[1]);
		}

		if (isGitHubURL()) {
			// The window focus listener will refresh state to reflect the
			// current repository being viewed.
			window.addEventListener("focus", this.focusUpdate);
		}

		if (this._updateIntervalID === null) {
			this._updateIntervalID = setInterval(this._refreshVCS.bind(this), 1000 * 30); // refresh every 30s
		}

		this.refreshState();
		document.addEventListener("pjax:success", this.pjaxUpdate);
		document.addEventListener("click", this._clickRef);

		getExpiredSrclibDataVersion(this.props.srclibDataVersion).forEach(({repo, rev, path}) => this.props.actions.expireSrclibDataVersion(repo, rev, path));
		getExpiredDef(this.props.def).forEach(({repo, rev, defPath}) => this.props.actions.expireDef(repo, rev, defPath));
		getExpiredDefs(this.props.defs).forEach(({repo, rev, path, query}) => this.props.actions.expireDefs(repo, rev, path, query));
		getExpiredAnnotations(this.props.annotations).forEach(({repo, rev, path}) => this.props.actions.expireAnnotations(repo, rev, path));
	}

	componentWillReceiveProps(nextProps) {
		// Annotation data is fetched asynchronously; annotate the page if the new props
		// contains annotation data for the current blob.
		const srclibDataVersion = nextProps.srclibDataVersion.content[keyFor(nextProps.repo, nextProps.rev, nextProps.path)];
		if (srclibDataVersion && srclibDataVersion.CommitID) {
			const annotations = nextProps.annotations.content[keyFor(nextProps.repo, srclibDataVersion.CommitID, nextProps.path)];
			if (annotations) this.annotate(annotations);
		}

		// Show/hide def info.
		if (nextProps.defPath && (nextProps.repo !== this.props.repo || nextProps.rev !== this.props.rev || nextProps.defPath !== this.props.defPath || nextProps.def !== this.props.def)) {
			this._renderDefInfo(nextProps);
		}

		if (nextProps.lastRefresh !== this.props.lastRefresh) {
			if (nextProps.repo && nextProps.rev && this.supportsAnnotatingFile(nextProps.path)) {
				this.props.actions.getAnnotations(nextProps.repo, nextProps.rev, nextProps.path);
			}
		}
	}

	componentWillUnmount() {
		document.removeEventListener("pjax:success", this.pjaxUpdate);
		window.removeEventListener("focus", this.focusUpdate);
		document.removeEventListener("click", this._clickRef);
		if (this._updateIntervalID !== null) {
			clearInterval(this._updateIntervalID);
			this._updateIntervalID = null;
		}
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
		const urlsplit = loc.pathname.slice(1).split("/");
		let user = urlsplit[0];
		let repo = urlsplit[1]
		// We scrape the current branch and set rev to it so we stay on the same branch when doing jump-to-def.
		// Need to use the branch selector button because _clickRef passes a pathname as the location which,
		// only includes ${user}/${repo}, and no rev.
		let currBranch = this.getBranchSelectorButton();
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

	getBranchSelectorButton() {
		if (document.getElementsByClassName("select-menu-button js-menu-target css-truncate")[0]) {
			if (document.getElementsByClassName("select-menu-button js-menu-target css-truncate")[0].title !== "") {
				return document.getElementsByClassName("select-menu-button js-menu-target css-truncate")[0].title
			} else {
				return document.getElementsByClassName("js-select-button css-truncate-target")[0].innerText;
			}
		} else {
			return "master";
		}
	}

	supportsAnnotatingFile(path) {
		if (!path) return false;

		const pathParts = path.split("/");
		let lang = pathParts[pathParts.length - 1].split(".")[1] || null;
		lang = lang ? lang.toLowerCase() : null;
		const supportedLang = lang === "go" || lang === "java";
		return window.location.href.split("/")[5] === "blob" && document.querySelector(".file") && supportedLang;
	}

	// refreshState is called whenever this component is mounted or
	// pjax completes successfully; it updates the store with the
	// current repo/rev/path. It will render navbar search button
	// (if none exists) and annotations for the current code file (if any).
	refreshState() {
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

		if (repo && rev && this.supportsAnnotatingFile(path)) {
			this.props.actions.ensureRepoExists(repo);
			this.props.actions.getAnnotations(repo, rev, path);
		}

		this._renderDefInfo(this.props);

		const srclibDataVersion = this.props.srclibDataVersion.content[keyFor(repo, rev, path)];
		if (srclibDataVersion && srclibDataVersion.CommitID) {
			const annotations = this.props.annotations.content[keyFor(repo, srclibDataVersion.CommitID, path)];
			if (annotations) this.annotate(annotations);
		}
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

	// pjaxUpdate is a wrapper around refreshState which is called whenever
	// pjax completes successfully, etc. It will also remove the app frame.
	pjaxUpdate() {
		this.refreshState();
	}

	// focusUpdate is a wrapper around refreshState which is called whenever
	// the window tab becomes focused on GitHub.com; it will first read
	// local storage for any data (e.g. Sourcegraph access token) set via other
	// tabs.
	focusUpdate() {
		chrome.runtime.sendMessage(null, {type: "get"}, {}, (state) => {
			const accessToken = state.accessToken;
			if (accessToken) this.props.actions.setAccessToken(accessToken); // without this, access token may be overwritten to null
			this.refreshState();
		});
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


let isSearchAppShown = false; // global state indicating whether the search app is visible

function getSearchFrame() {
	return document.getElementById("sourcegraph-search-frame");
}

function createSearchFrame() {
	let searchFrame = getSearchFrame();
	if (!searchFrame) {
		searchFrame = document.createElement("div");
		searchFrame.id = "sourcegraph-search-frame";
		injectComponent(<App />, searchFrame);

		document.addEventListener("keydown", (e) => {
			if (e.which === 84 &&
				e.shiftKey && (e.target.tagName.toLowerCase()) !== "input" &&
				e.target.tagName.toLowerCase() !== "textarea" &&
				!isSearchAppShown) {
				toggleSearchFrame();
			} else if (e.keyCode === 27 && isSearchAppShown) {
				toggleSearchFrame();
			}
		});
	}
	return searchFrame;
}

function toggleSearchFrame() {
	EventLogger.logEvent("ToggleSearchInput", {visibility: isSearchAppShown ? "hidden" : "visible"});
	function focusInput() {
		const el = document.querySelector(".sg-input");
		if (el) setTimeout(() => el.focus()); // Auto focus input, with slight delay so 'T' doesn't appear
	}

	let frame = getSearchFrame();
	if (!frame) {
		// Lazy application bootstrap; add app frame to DOM the first time toggle is called.
		frame = createSearchFrame();
		document.querySelector(".repository-content").style.display = "none";
		document.querySelector(".container.new-discussion-timeline").appendChild(frame);
		frame.style.display = "block";
		isSearchAppShown = true;
		focusInput();
	} else if (isSearchAppShown) {
		// Toggle visibility off.
		removeSearchFrame();
	} else {
		// Toggle visiblity on.
		document.querySelector(".repository-content").style.display = "none";
		if (frame) frame.style.display = "block";
		isSearchAppShown = true;
		focusInput();
	}
};

function removeSearchFrame() {
	const el = document.querySelector(".repository-content");
	if (el) el.style.display = "block";
	const frame = getSearchFrame();
	if (frame) frame.style.display = "none";
	isSearchAppShown = false;
}

function injectSearchApp() {
	if (!isGitHubURL()) return;

	let pagehead = document.querySelector("ul.pagehead-actions");
	if (pagehead && !pagehead.querySelector("#sourcegraph-search-button")) {
		let button = document.createElement("li");
		button.id = "sourcegraph-search-button";
		render(
			// this button inherits styles from GitHub
			<button className="btn btn-sm minibutton tooltipped tooltipped-s"
				aria-label="Keyboard shortcut: shift-T"
				onClick={toggleSearchFrame}>
				<SearchIcon /><span style={{paddingLeft: "5px"}}>Search code</span>
			</button>, button
		);
		pagehead.insertBefore(button, pagehead.firstChild);
	}
}

function injectBuildIndicators() {
	if (!isGitHubURL) return;

	const {user, repo, rev, path, isPullRequest} = parseGitHubURL();
	const fileInfos = document.querySelectorAll(".file-info");
	for (let i = 0; i < fileInfos.length; ++i) {
		const info = fileInfos[i];
		const infoFilePath = isPullRequest ? info.querySelector(".user-select-contain").title : path;
		const buildIndicatorId = `sourcegraph-build-indicator-${infoFilePath}`;
		let buildIndicatorContainer = document.getElementById(buildIndicatorId);
		if (!buildIndicatorContainer) { // prevent injecting build indicator twice
			let buildSeparator = document.createElement("span");
			buildSeparator.className = "file-info-divider";
			info.appendChild(buildSeparator);

			buildIndicatorContainer = document.createElement("span");
			buildIndicatorContainer.id = "sourcegraph-build-indicator";
			info.appendChild(buildIndicatorContainer);
			injectComponent(<BuildIndicator path={infoFilePath} />, buildIndicatorContainer);
		}
	}
}

function injectBlobAnnotator() {
	if (!isGitHubURL()) return;
	// TODO
}

function injectComponent(component, mountElement) {
	chrome.runtime.sendMessage(null, {type: "get"}, {}, (state) => {
		render(<Provider store={createStore(state)}>{component}</Provider>, mountElement);
	});
}

function bootstrapApp() {
	chrome.runtime.sendMessage(null, {type: "get"}, {}, (state) => {
		const app = document.createElement("div");
		app.id = "sourcegraph-app-bootstrap";
		app.style.display = "none";
		render(<Provider store={createStore(state)}><InjectApp /></Provider>, app);

		document.body.appendChild(app);

		injectSearchApp();
		injectBuildIndicators();
	});
}

window.addEventListener("load", bootstrapApp);
document.addEventListener("pjax:success", () => {
	removeSearchFrame();

	injectSearchApp();
	injectBuildIndicators();
});
