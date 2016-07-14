import React from "react";
import {bindActionCreators} from "redux";
import {connect} from "react-redux";
import addAnnotations from "../utils/annotations";
import Component from "./Component";
import {SourcegraphIcon} from "./Icons";
import * as Actions from "../actions";
import * as utils from "../utils";
import {keyFor} from "../reducers/helpers";
import EventLogger from "../analytics/EventLogger";

let buildsCache = {};

@connect(
	(state) => ({
		resolvedRev: state.resolvedRev,
		build: state.build,
		srclibDataVersion: state.srclibDataVersion,
		annotations: state.annotations,
		accessToken: state.accessToken,
		authInfo: state.authInfo,
	}),
	(dispatch) => ({
		actions: bindActionCreators(Actions, dispatch)
	})
)
export default class BlobAnnotator extends Component {
	static propTypes = {
		path: React.PropTypes.string.isRequired,
		resolvedRev: React.PropTypes.object.isRequired,
		build: React.PropTypes.object.isRequired,
		srclibDataVersion: React.PropTypes.object.isRequired,
		annotations: React.PropTypes.object.isRequired,
		actions: React.PropTypes.object.isRequired,
		blobElement: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this._clickRefresh = this._clickRefresh.bind(this);
		this.state = utils.parseURL();

		if (this.state.isDelta) {
			this.state.isSplitDiff = this._isSplitDiff();

			let baseCommitID, headCommitID;
			let el = document.getElementsByClassName("js-socket-channel js-updatable-content js-pull-refresh-on-pjax");
			if (el && el.length > 0) {
				for (let i = 0; i < el.length; ++i) {
					const url = el[i].dataset ? el[i].dataset.url : null;
					if (!url) continue;
					const urlSplit = url.split("?");
					if (urlSplit.length !== 2) continue;
					const query = urlSplit[1];
					const querySplit = query.split("&");
					for (let kv of querySplit) {
						const kvSplit = kv.split("=");
						const k = kvSplit[0];
						const v = kvSplit[1];
						if (k === "base_commit_oid") baseCommitID = v;
						if (k === "end_commit_oid") headCommitID = v;
					}
				}
			} else if (this.state.isPullRequest) {
				const baseInput = document.querySelector('input[name="comparison_base_oid"]');
				if (baseInput) {
					baseCommitID = baseInput.value;
				}
				const headInput = document.querySelector('input[name="comparison_end_oid"]');
				if (headInput) {
					headCommitID = headInput.value;
				}
			} else if (this.state.isCommit) {
				let shaContainer = document.querySelectorAll(".sha-block");
				if (shaContainer && shaContainer.length === 2) {
					let baseShaEl = shaContainer[0].querySelector("a");
					if (baseShaEl) baseCommitID = baseShaEl.href.split("/").slice(-1)[0];
					let headShaEl = shaContainer[1].querySelector("span.sha");
					if (headShaEl) headCommitID = headShaEl.innerText;
				}
			}
			if (!baseCommitID) {
				console.error("unable to parse base commit id");
			}
			if (!headCommitID) {
				console.error("unable to parse head commit id");
			}

			this.state.baseCommitID = baseCommitID;
			this.state.headCommitID = headCommitID;

			if (this.state.isPullRequest) {
				const branches = document.querySelectorAll(".commit-ref,.current-branch");
				this.state.base = branches[0].innerText;
				this.state.head = branches[1].innerText;

				if (this.state.base.includes(":")) {
					const baseSplit = this.state.base.split(":");
					this.state.base = baseSplit[1];
					this.state.baseRepoURI = `github.com/${baseSplit[0]}/${this.state.repo}`;
				} else {
					this.state.baseRepoURI = this.state.repoURI;
				}
				if (this.state.head.includes(":")) {
					const headSplit = this.state.head.split(":");
					this.state.head = headSplit[1];
					this.state.headRepoURI = `github.com/${headSplit[0]}/${this.state.repo}`;
				} else {
					this.state.headRepoURI = this.state.repoURI;
				}
			} else if (this.state.isCommit) {
				let branchEl = document.querySelector("li.branch");
				if (branchEl) branchEl = branchEl.querySelector("a")
				if (branchEl) {
					this.state.base = branchEl.innerText;
					this.state.head = branchEl.innerText;
				}
				this.state.baseRepoURI = this.state.repoURI;
				this.state.headRepoURI = this.state.repoURI;
			}
		}
	}

	componentDidMount() {
		// Click may be for context expansion, in which case we should
		// re-annotate the blob (which is smart enough to only annoate
		// lines which haven't already been annotated).
		this.props.actions.getAuthentication(this.state);
		document.addEventListener("click", this._clickRefresh);
	}

	componentWillUnmount() {
		document.removeEventListener("click", this._clickRefresh);
	}

	_clickRefresh() {
		// Diff expansion is not synchronous, so we must wait for
		// elements to get added to the DOM before calling into the
		// annotations code. 500ms is arbitrary but seems to work well.
		setTimeout(() => this._addAnnotations(this.state), 500);
	}

	_queryForBuild() {
		this.props.actions.refreshBuild(this.state.repoURI, this.state.resolvedRev.CommitID, this.state.rev);
		this.render();
	}

	_isSplitDiff() {
		if (this.state.isPullRequest) {
			const diffTypeDropdown = document.getElementsByClassName("diffbar-item dropdown js-menu-container");
			if (!diffTypeDropdown || diffTypeDropdown.length !== 1) return false;

			const diffSelection = diffTypeDropdown[0].getElementsByClassName("dropdown-item selected");
			if (!diffSelection || diffSelection.length !== 1) return false;

			return diffSelection[0].href.includes("diff=split");
		} else {
			const headerBar = document.getElementsByClassName("details-collapse table-of-contents js-details-container");
			if (!headerBar || headerBar.length !== 1) return false;

			const diffToggles = headerBar[0].getElementsByClassName("btn-group right");
			if (!diffToggles || diffToggles.length !== 1) return false;

			const selectedToggle = diffToggles[0].querySelector(".selected");
			return selectedToggle && selectedToggle.href.includes("diff=split");
		}
	}

	reconcileState(state, props) {
		Object.assign(state, props);

		if (!state.isAnnotated) {
			if (state.isDelta) {
				if (state.baseCommitID) {
					state.actions.getAnnotations(state.baseRepoURI, state.baseCommitID, state.path, true);
				}
				if (state.headCommitID) {
					state.actions.getAnnotations(state.headRepoURI, state.headCommitID, state.path, true);
				}
				state.isAnnotated = true;
			} else {
				state.actions.getSrclibDataVersion(state.repoURI, state.rev);
				state.actions.getAnnotations(state.repoURI, state.rev, state.path);
				state.isAnnotated = true;
			}
		}
	}

	onStateTransition(prevState, nextState) {
		if (nextState.isDelta) {
			if (nextState.baseCommitID) {
				this._build(nextState.baseRepoURI, nextState.baseCommitID, nextState.base);
			}
			if (nextState.headCommitID) {
				this._build(nextState.headRepoURI, nextState.headCommitID, nextState.head);
			}
		} else {
			const resolvedRev = nextState.resolvedRev.content[keyFor(nextState.repoURI, nextState.rev)];
			if (resolvedRev && resolvedRev.CommitID) {
				const dataVer = nextState.srclibDataVersion.content[keyFor(nextState.repoURI, resolvedRev.CommitID)];
				if (dataVer && dataVer.CommitID) this._build(nextState.repoURI, dataVer.CommitID, nextState.rev);
			}
		}

		this._addAnnotations(nextState);
	}

	_build(repoURI, commitID, branch) {
		if (!this.state.actions) return;

		if (!buildsCache[keyFor(repoURI, commitID, branch)]) {
			buildsCache[keyFor(repoURI, commitID, branch)] = true;
			this.state.actions.build(repoURI, commitID, branch);
		}
	}

	_addAnnotations(state) {
		function apply(repoURI, rev, branch, isBase) {
			const dataVer = state.srclibDataVersion.content[keyFor(repoURI, rev, state.path)];
			if (!dataVer || !dataVer.CommitID) return;

			const json = state.annotations.content[keyFor(repoURI, dataVer.CommitID, state.path)];
			if (json) {
				addAnnotations(state.path, {repoURI, rev, branch, isDelta: state.isDelta, isBase}, state.blobElement, json.Annotations, json.LineStartBytes, state.isSplitDiff);
			}
		}

		if (state.isDelta) {
			if (state.baseCommitID) apply(state.baseRepoURI, state.baseCommitID, state.base, true);
			if (state.headCommitID) apply(state.headRepoURI, state.headCommitID, state.head, false);
		} else {
			const resolvedRev = state.resolvedRev.content[keyFor(state.repoURI, state.rev)];
			if (resolvedRev && resolvedRev.CommitID) apply(state.repoURI, resolvedRev.CommitID, state.rev, false);
		}
	}

	_getSrclibDataVersion(repoURI, rev) {
		const getDataVer = (repoURI, rev) => {
			const dataVer = this.state.srclibDataVersion.content[keyFor(repoURI, rev, this.state.path)];
			return dataVer && dataVer.CommitID ? dataVer.CommitID : null;
		}
		if (this.state.isDelta) {
			return getDataVer(repoURI, rev);
		} else {
			const resolvedRev = this.state.resolvedRev.content[keyFor(repoURI, rev)];
			return resolvedRev && resolvedRev.CommitID ? getDataVer(repoURI, resolvedRev.CommitID) : null;
		}
	}

	_getBuild(repoURI, rev) {
		const getBuild = (repoURI, rev) => {
			const b = this.state.build.content[keyFor(repoURI, rev)];
			return b && b.Builds ? b.Builds[0] : null;
		}
		if (this.state.isDelta) {
			return getBuild(repoURI, rev);
		} else {
			const resolvedRev = this.state.resolvedRev.content[keyFor(repoURI, rev)];
			return resolvedRev && resolvedRev.CommitID ? getBuild(repoURI, resolvedRev.CommitID) : null;
		}
	}

	_indicatorText(repoURI, rev) {
		let buildCache = this._getBuild(repoURI, rev);
		let build = this.props.build["content"];
		let data = this._getSrclibDataVersion(repoURI, rev);
		if (data) return "Indexed";
		if (build) return "Analyzing...";
		if (!buildCache || buildCache.Failure) return "Code not analyzed";

		let webToken = this.props.accessToken;
		if (!webToken || webToken === "") return "Sign in to Sourcegraph";

		let scopeAuth = "";
		if (this.props.authInfo && this.props.authInfo.GitHubToken && this.props.authInfo.GitHubToken.scope) scopeAuth = this.props.authInfo.GitHubToken.scope;
		let name = (scopeAuth.includes("read:org") && scopeAuth.includes("repo") && scopeAuth.includes("user")) ? scopeAuth : "";
		if (name === "") return "Enable Sourcegraph";

		return "";
	}

	onClick(ev) {
		EventLogger.logEvent("ChromeExtensionFaqsClicked", {type: ev.target.text});
	}

	getBuildIndicator(indicatorText, prefix) {
		let url = "https://staging.sourcegraph.com";
		switch (indicatorText) {
			case "Indexed":
				return (<SourcegraphIcon style={{marginTop: "-2px", paddingLeft: "5px", paddingRight: "5px", fontSize: "25px"}} />);
			case "Unsupported language":
			case "Analyzing...":
				return (<span id="sourcegraph-build-indicator-text" style={{paddingLeft: "5px"}}>{prefix}{indicatorText}</span>);
			case "Sign in to Sourcegraph":
				return (<a onClick={this.onClick.bind(this)} href={url+"/about/browser-faqs#signin"}> <u> {prefix}{indicatorText} </u> </a>);
			case "Enable Sourcegraph":
				return (<a onClick={this.onClick.bind(this)} href={url+"/about/browser-faqs#enable"}><u>{prefix}{indicatorText}</u></a>);
			case "Code not analyzed":
				setTimeout(() => this.reconcileState(this.state, this.props), 1000);
				return (<a onClick={this.onClick.bind(this)} href={url+"/about/browser-faqs#buildfailure"}><u>{prefix}{indicatorText}</u></a>);
			default:
				return (<span/>);
		}
	}

	render() {
		let build = this.props.build["content"];
		let indicatorText = "";
		if (!utils.supportedExtensions.includes(utils.getPathExtension(this.state.path))) {
			indicatorText = "Unsupported language";
		} else if (Object.keys(build).length === 0) {
			setTimeout(() => this._queryForBuild(), 5000);
			indicatorText = "Analyzing..."
		} else {
			indicatorText = this._indicatorText(this.state.repoURI, this.state.rev);
		}
		if (!this.state.isDelta) {
			return (<span> {this.getBuildIndicator(indicatorText,null)} </span>);
		} else {
			let baseText = this._indicatorText(this.state.baseRepoURI, this.state.baseCommitID);
			let headText = this._indicatorText(this.state.headRepoURI, this.state.headCommitID);
			let baseRender = this.getBuildIndicator(baseText);
			let headRender = this.getBuildIndicator(headText);
			return (<span>{this.getRender(baseText,"base: ")} {this.getRender(headText,"head: ")} </span>);
		}
	}
}
