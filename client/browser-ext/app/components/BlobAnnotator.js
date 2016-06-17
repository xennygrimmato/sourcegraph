import React from "react";
import {bindActionCreators} from "redux";
import {connect} from "react-redux";

import addAnnotations from "../utils/annotations";

import {supportsAnnotatingFile, parseGitHubURL} from "../utils";
import * as Actions from "../actions";
import * as utils from "../utils";
import {keyFor} from "../reducers/helpers";
import EventLogger from "../analytics/EventLogger";

@connect(
	(state) => ({
		accessToken: state.accessToken,
		repo: state.repo,
		rev: state.rev,
		base: state.base,
		head: state.head,
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
		base: React.PropTypes.string.isRequired,
		head: React.PropTypes.string.isRequired,
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
			this._updateIntervalID = setInterval(this._refresh.bind(this), 1000 * 5); // refresh every 10s
		}
	}

	componentWillUnmount() {
		if (this._updateIntervalID !== null) {
			clearInterval(this._updateIntervalID);
			this._updateIntervalID = null;
		}
	}

	_refresh() {
		let {isDelta} = utils.parseGitHubURL();
		if (isDelta) {
			this.props.actions.getAnnotations(this.props.repo, this.props.base, this.props.path);
			this.props.actions.getAnnotations(this.props.repo, this.props.head, this.props.path);
		} else {
			this.props.actions.getAnnotations(this.props.repo, this.props.rev, this.props.path);
		}
	}


	componentWillReceiveProps(nextProps) {
		this._addAnnotations(nextProps);
	}

	_addAnnotations(props) {
		let {isDelta} = utils.parseGitHubURL();

		function apply(rev, isBase) {
			const dataVer = props.srclibDataVersion.content[keyFor(props.repo, rev, props.path)];
			if (dataVer && dataVer.CommitID) {
				const json = props.annotations.content[keyFor(props.repo, dataVer.CommitID, props.path)];
				if (json/* && props.path === "main.go"*/) {
					console.log("annotations json", rev, json)
					addAnnotations(props.path, {rev, isDelta, isBase}, props.blobElement, json.Annotations, json.LineStartBytes);
				}
			}
		}

		if (isDelta) {
			apply(props.base, true);
			apply(props.head, false);
		} else {
			apply(props.rev, false);
		}
	}

	render() {
		return null;
	}
}
