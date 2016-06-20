import React from "react";
import {bindActionCreators} from "redux";
import {connect} from "react-redux";

import addAnnotations from "../utils/annotations";

import * as Actions from "../actions";
import * as utils from "../utils";
import {keyFor} from "../reducers/helpers";
import EventLogger from "../analytics/EventLogger";

@connect(
	(state) => ({
		srclibDataVersion: state.srclibDataVersion,
		annotations: state.annotations,
	}),
	(dispatch) => ({
		actions: bindActionCreators(Actions, dispatch)
	})
)
export default class BlobAnnotator extends React.Component {
	static propTypes = {
		path: React.PropTypes.string.isRequired,
		srclibDataVersion: React.PropTypes.object.isRequired,
		annotations: React.PropTypes.object.isRequired,
		actions: React.PropTypes.object.isRequired,
		blobElement: React.PropTypes.object,
	};

	constructor(props) {
		super(props);
		this._updateIntervalID = null;

		this.state = utils.parseURL();
		if (this.state.isDelta) {
			const branches = document.querySelectorAll(".commit-ref,.current-branch");
			this.state.base = branches[0].innerText;
			this.state.head = branches[1].innerText;
		}

		this._refresh();
		this._addAnnotations(props, this.state);
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
		if (this.state.isDelta) {
			this.props.actions.getAnnotations(this.state.repoURI, this.state.base, this.props.path);
			this.props.actions.getAnnotations(this.state.repoURI, this.state.head, this.props.path);
		} else {
			this.props.actions.getAnnotations(this.state.repoURI, this.state.rev, this.props.path);
		}
	}


	componentWillReceiveProps(nextProps) {
		this._addAnnotations(nextProps, this.state);
	}

	_addAnnotations(props, state) {
		function apply(rev, isBase) {
			const dataVer = props.srclibDataVersion.content[keyFor(state.repoURI, rev, props.path)];
			if (dataVer && dataVer.CommitID) {
				const json = props.annotations.content[keyFor(state.repoURI, dataVer.CommitID, props.path)];
				if (json) {
					addAnnotations(props.path, {rev, isDelta: state.isDelta, isBase}, props.blobElement, json.Annotations, json.LineStartBytes);
				}
			}
		}

		if (state.isDelta) {
			apply(state.base, true);
			apply(state.head, false);
		} else {
			apply(state.rev, false);
		}
	}

	render() {
		return null;
	}
}
