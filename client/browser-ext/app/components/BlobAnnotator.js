import React from "react";
import {render} from "react-dom";
import {bindActionCreators} from "redux";
import {connect, Provider} from "react-redux";

import addAnnotations from "./annotations";
import addAnnotationsForPullRequest from "./annotations2";

import {useAccessToken} from "../../app/actions/xhr";
import * as Actions from "../../app/actions";
import Root from "../../app/containers/Root";
import styles from "../../app/components/App.css";
import {SearchIcon, SourcegraphIcon} from "../../app/components/Icons";
import {keyFor, getExpiredSrclibDataVersion, getExpiredDef, getExpiredDefs, getExpiredAnnotations} from "../../app/reducers/helpers";
import createStore from "../../app/store/configureStore";
import {defaultBranchCache} from "../../chrome/extension/annotations";
import EventLogger from "../../app/analytics/EventLogger";

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
		lastRefresh: state.lastRefresh,
	}),
	(dispatch) => ({
		actions: bindActionCreators(Actions, dispatch)
	})
)
export default class BlobAnnotator extends React.Component {
	static propTypes = {
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string.isRequired,
		path: React.PropTypes.string,
		defPath: React.PropTypes.string,
		srclibDataVersion: React.PropTypes.object.isRequired,
		def: React.PropTypes.object.isRequired,
		annotations: React.PropTypes.object.isRequired,
		defs: React.PropTypes.object.isRequired,
		actions: React.PropTypes.object.isRequired,
		lastRefresh: React.PropTypes.number,
	};

	constructor(props) {

	}

	componentDidMount() {
	}

	componentWillReceiveProps(nextProps) {
		let prData = this.getPullRequestData();
		if (prData) {
			// TODO(rothfels): kick off refresh vcs to build the repo@branch
			if (prData.files) {
				prData.files.forEach((file, i) => {
					this.props.actions.getAnnotations(repo, prData.base, file);
					this.props.actions.getAnnotations(repo, prData.head, file);
				});

				let byteOffsetsByLineBase = {};
				[0, 13, 14, 27, 28, 42, 61, 83, 85].forEach((val, i) => {
					byteOffsetsByLineBase[i+1] = val;
				});

				let path = "main.go";
				const srclibDataVersion2 = this.props.srclibDataVersion.content[keyFor(repo, prData.base, path)];
				if (srclibDataVersion2 && srclibDataVersion2.CommitID) {
					const annotations = this.props.annotations.content[keyFor(repo, srclibDataVersion2.CommitID, path)];
					if (annotations) addAnnotationsForPullRequest(path, byteOffsetsByLineBase, byteOffsetsByLineBase, annotations, null, prData.blobs[1]);
				}
			}
		}
	}

	componentWillUnmount() {
	}

	// refreshState is called whenever this component is mounted or
	// pjax completes successfully; it updates the store with the
	// current repo/rev/path. It will render navbar search button
	// (if none exists) and annotations for the current code file (if any).
	refreshState() {
		if (repo && defPath) {
			this.props.actions.getDef(repo, rev, defPath);
		}

		if (repo && rev && this.supportsAnnotatingFile(path)) {
			this.props.actions.ensureRepoExists(repo);
			this.props.actions.getAnnotations(repo, rev, path);
		}
		if (path) {
			this._updateBuildIndicator(this.props);
		}

		this._renderDefInfo(this.props);

		let prData = this.getPullRequestData();
		if (prData) {
			console.log("going through fun land");

			// TODO(rothfels): kick off refresh vcs to build the repo@branch
			if (prData.files) {
				console.log("have files", prData.files);
				prData.files.forEach((file, i) => {
					this.props.actions.getAnnotations(repo, prData.base, file);
					this.props.actions.getAnnotations(repo, prData.head, file);
				});

				let byteOffsetsByLineBase = {};
				[0, 13, 14, 27, 28, 42, 61, 83, 85].forEach((val, i) => {
					byteOffsetsByLineBase[i+1] = val;
				});

				let path = "main.go";
				const srclibDataVersion2 = this.props.srclibDataVersion.content[keyFor(repo, prData.base, path)];
				console.log("have srclibdataversin", srclibDataVersion2);
				if (srclibDataVersion2 && srclibDataVersion2.CommitID) {
					const annotations = this.props.annotations.content[keyFor(repo, srclibDataVersion2.CommitID, path)];
					console.log("have annotatins");
					if (annotations) addAnnotationsForPullRequest(path, byteOffsetsByLineBase, byteOffsetsByLineBase, annotations, null, prData.blobs[1]);
				}
			}
		}

		const srclibDataVersion = this.props.srclibDataVersion.content[keyFor(repo, rev, path)];
		if (srclibDataVersion && srclibDataVersion.CommitID) {
			const annotations = this.props.annotations.content[keyFor(repo, srclibDataVersion.CommitID, path)];
			if (annotations) this.annotate(annotations);
		}
	}

	getPullRequestData() {
		if (window.location.href.split("/")[5] !== "pull") return null;

		const branches = document.querySelectorAll(".commit-ref,.current-branch");
		if (branches.length !== 2) return null;

		const base = branches[0].innerText;
		const head = branches[1].innerText;

		if (window.location.href.split("/")[7] !== "files") return {base, head};

		let fileEls = document.querySelectorAll(".file-header");
		let files = []
		for (let i = 0; i < fileEls.length; ++i) {
			files.push(fileEls[i].dataset.path);
		}
		let blobs = document.querySelectorAll(".blob-wrapper");
		return {base, head, files: files, blobs};
	}

	_refreshVCS() {
		if (this.props.repo) {
			this.props.actions.refreshVCS(this.props.repo);
		}
	}

	_updateBuildIndicator(props) {
		let indicatorText = "";
		if (props.srclibDataVersion.content[keyFor(props.repo, props.rev, props.path)]) {
			indicatorText = "Indexed";
		} else if (!this.supportsAnnotatingFile(props.path)) {
			indicatorText = "Unsupported file"
		} else {
			indicatorText = "Indexing...";
		}

		const fileInfo = document.querySelector(".file-info");
		const buildIndicator = document.getElementById("sourcegraph-build-indicator");
		if (fileInfo && !buildIndicator && window.location.href.split("/")[5] !== "pull") { // don't add build indicator on PRs
			let buildSeparator = document.createElement("span");
			buildSeparator.className = "file-info-divider";
			fileInfo.appendChild(buildSeparator);

			const buildIndicator = document.createElement("span");
			buildIndicator.id = "sourcegraph-build-indicator";
			render(<span>
				<SourcegraphIcon style={{marginTop: "-2px", paddingLeft: "5px", fontSize: "16px"}} />
				<span id="sourcegraph-build-indicator-text" style={{paddingLeft: "5px"}}>{indicatorText}</span>
			</span>, buildIndicator);
			fileInfo.appendChild(buildIndicator);
		} else if (buildIndicator) {
			document.getElementById("sourcegraph-build-indicator-text").innerText = indicatorText;
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
		this.removeAppFrame();
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

	// addSearchButton injects a button into the GitHub pagehead actions bar
	// (next to "watch" and "star" and "fork" actions). It is idempotent
	// but the injected component is separated from the react component
	// hierarchy.
	addSearchButton() {
		let pagehead = document.querySelector("ul.pagehead-actions");
		if (pagehead && !pagehead.querySelector("#sg-search-button-container")) {
			let button = document.createElement("li");
			button.id = "sg-search-button-container";

			render(
				// this button inherits styles from GitHub
				<button className="btn btn-sm minibutton tooltipped tooltipped-s" aria-label="Keyboard shortcut: shift-T" onClick={this.toggleAppFrame}>
					<SearchIcon /><span style={{paddingLeft: "5px"}}>Search code</span>
				</button>, button
			);
			pagehead.insertBefore(button, pagehead.firstChild);
		}
	}

	// appFrame creates a div frame embedding the chrome extension (react) app.
	// It can be injected into the DOM when desired. It is idempotent, i.e.
	// returns the (already mounted) DOM element if one has already been created.
	// It returns the div asynchronously, since the application bootstrap requires
	// (asynchronously) connecting to chrome local storage.
	appFrame(cb) {
		if (!this.frameDiv) {
			chrome.runtime.sendMessage(null, {type: "get"}, {}, (state) => {
				const createStore = require("../../app/store/configureStore");

				const frameDiv = document.createElement("div");
				frameDiv.id = "sourcegraph-frame";
				render(<Root store={createStore(state)} />, frameDiv);

				this.frameDiv = frameDiv;
				cb(frameDiv);
			});
		} else {
			cb(this.frameDiv);
		}
	}

	keyboardEvents(e) {
		if (e.which === 84 && e.shiftKey && (e.target.tagName.toLowerCase()) !== "input" && (e.target.tagName.toLowerCase()) !== "textarea" && !this.state.appFrameIsVisible) {
			this.toggleAppFrame();
		} else if (e.keyCode === 27 && this.state.appFrameIsVisible) {
			this.toggleAppFrame();
		}
	}

	removeAppFrame = () => {
		const el = document.querySelector(".repository-content");
		if (el) el.style.display = "block";
		const frame = document.getElementById("sourcegraph-frame");
		if (frame) frame.style.display = "none";
		this.setState({appFrameIsVisible: false});
	}

	// toggleAppFrame is the handler for the pagehead "search code" button;
	// it will directly manipulate the DOM to hide all GitHub repository
	// content and mount an iframe embedding the chrome extension (react) app.
	toggleAppFrame = () => {
		EventLogger.logEvent("ToggleSearchInput", {visibility: this.state.appFrameIsVisible ? "hidden" : "visible"});
		const focusInput = () => {
			const el = document.querySelector(".sg-input");
			if (el) setTimeout(() => el.focus()); // Auto focus input, with slight delay so T doesn't appear
		}

		if (!document.getElementById('sourcegraph-frame')) {
			// Lazy initial application bootstrap; add app frame to DOM.
			this.appFrame((frameDiv) => {
				document.querySelector(".repository-content").style.display = "none";
				document.querySelector(".container.new-discussion-timeline").appendChild(frameDiv);
				frameDiv.style.display = "block";
				this.setState({appFrameIsVisible: true}, focusInput);
			});
		} else if (this.state.appFrameIsVisible) {
			// Toggle visibility off.
			this.removeAppFrame();
		} else {
			// Toggle visiblity on.
			document.querySelector(".repository-content").style.display = "none";
			const frame = document.getElementById("sourcegraph-frame");
			if (frame) frame.style.display = "block";
			this.setState({appFrameIsVisible: true}, focusInput);
		}
	};

	annotate(json) {
		let fileElem = document.querySelector(".file .blob-wrapper");
		if (fileElem) {
			if (document.querySelector(".vis-private") && !this.props.accessToken) {
				EventLogger.logEvent("ViewPrivateCodeError");
				console.error("To use the Sourcegraph Chrome extension on private code, sign in at https://sourcegraph.com and add your repositories.");
			} else {
				addAnnotations(json);
			}
		}
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
		return null;
	}
}
