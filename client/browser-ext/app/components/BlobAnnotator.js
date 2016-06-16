import React from "react";
import {bindActionCreators} from "redux";
import {connect} from "react-redux";

import addAnnotations from "../utils/annotations3";
import addAnnotationsForPullRequest from "../utils/annotations2";

import {supportsAnnotatingFile, parseGitHubURL} from "../utils";
import * as Actions from "../actions";
import {keyFor} from "../reducers/helpers";
import EventLogger from "../analytics/EventLogger";

@connect(
	(state) => ({
		accessToken: state.accessToken,
		repo: state.repo,
		rev: state.rev,
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
		accessToken: React.PropTypes.string,
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string.isRequired,
		path: React.PropTypes.string.isRequired,
		defPath: React.PropTypes.string,
		srclibDataVersion: React.PropTypes.object.isRequired,
		def: React.PropTypes.object.isRequired,
		annotations: React.PropTypes.object.isRequired,
		defs: React.PropTypes.object.isRequired,
		actions: React.PropTypes.object.isRequired,
		lastRefresh: React.PropTypes.number,
		blobElement: React.PropTypes.object,
	};

	constructor(props) {
		super(props);
		this._updateIntervalID = null;

		props.actions.getAnnotations(props.repo, props.rev, props.path);
		this._addAnnotations(props);
	}

	componentDidMount() {
		if (this._updateIntervalID === null) {
			this._updateIntervalID = setInterval(this._refresh.bind(this), 1000 * 10); // refresh every 10s
		}
	}

	componentWillUnmount() {
		if (this._updateIntervalID !== null) {
			clearInterval(this._updateIntervalID);
			this._updateIntervalID = null;
		}
	}

	_refresh() {
		this.props.actions.getAnnotations(this.props.repo, this.props.rev, this.props.path);
	}


	componentWillReceiveProps(nextProps) {
		this._addAnnotations(nextProps);
		// let prData = this.getPullRequestData();
		// if (prData) {
		// 	// TODO(rothfels): kick off refresh vcs to build the repo@branch
		// 	if (prData.files) {
		// 		prData.files.forEach((file, i) => {
		// 			this.props.actions.getAnnotations(repo, prData.base, file);
		// 			this.props.actions.getAnnotations(repo, prData.head, file);
		// 		});

		// 		let byteOffsetsByLineBase = {};
		// 		[0, 13, 14, 27, 28, 42, 61, 83, 85].forEach((val, i) => {
		// 			byteOffsetsByLineBase[i+1] = val;
		// 		});

		// 		let path = "main.go";
		// 		const srclibDataVersion2 = this.props.srclibDataVersion.content[keyFor(repo, prData.base, path)];
		// 		if (srclibDataVersion2 && srclibDataVersion2.CommitID) {
		// 			const annotations = this.props.annotations.content[keyFor(repo, srclibDataVersion2.CommitID, path)];
		// 			if (annotations) addAnnotationsForPullRequest(path, byteOffsetsByLineBase, byteOffsetsByLineBase, annotations, null, prData.blobs[1]);
		// 		}
		// 	}
		// }
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

	_addAnnotations(props) {
		const dataVer = props.srclibDataVersion.content[keyFor(props.repo, props.rev, props.path)];
		if (dataVer && dataVer.CommitID) {
			const json = props.annotations.content[keyFor(props.repo, dataVer.CommitID, props.path)];
			if (json) {
				// TODO: use the blobElement passed as prop.
				let fileElem = document.querySelector(".file .blob-wrapper");
				if (fileElem) {
					if (document.querySelector(".vis-private") && !this.props.accessToken) {
						EventLogger.logEvent("ViewPrivateCodeError");
						console.error("To use the Sourcegraph Chrome extension on private code, sign in at https://sourcegraph.com and add your repositories.");
					} else {
						addAnnotations(el, json.Annotations);
					}
				}
			}
		}
	}

	render() {
		return null;
	}
}
