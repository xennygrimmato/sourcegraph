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

	render() {
		return null;
	}
}
