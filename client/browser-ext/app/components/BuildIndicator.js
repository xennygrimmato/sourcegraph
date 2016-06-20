import React from "react";
import {bindActionCreators} from "redux";
import {connect} from "react-redux";

import * as Actions from "../actions";
import {SourcegraphIcon} from "../components/Icons";
import {keyFor} from "../reducers/helpers";
import * as utils from "../utils";


@connect(
	(state) => ({
		srclibDataVersion: state.srclibDataVersion,
	}),
	(dispatch) => ({
		actions: bindActionCreators(Actions, dispatch)
	})
)
export default class BuildIndicator extends React.Component {
	static propTypes = {
		path: React.PropTypes.string.isRequired,
		srclibDataVersion: React.PropTypes.object.isRequired,
		actions: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this._updateIntervalID = null;
		this.state = utils.parseURL();
	}

	componentDidMount() {
		if (this._updateIntervalID === null) {
			this._updateIntervalID = setInterval(this._refresh.bind(this), 1000 * 30); // refresh every 30s
		}
	}

	componentWillUnmount() {
		if (this._updateIntervalID !== null) {
			clearInterval(this._updateIntervalID);
			this._updateIntervalID = null;
		}
	}

	_refresh() {
		// TODO(rothfels): use build status (not srclib data version).
		this.props.actions.getSrclibDataVersion(this.state.repoURI, this.state.rev, this.props.path);
	}

	render() {
		let indicatorText = "";
		if (this.props.srclibDataVersion.content[keyFor(this.state.repoURI, this.state.rev, this.props.path)]) {
			indicatorText = "Indexed";
		} else if (!utils.supportsAnnotatingFile(this.props.path)) {
			indicatorText = "Unsupported file"
		} else {
			indicatorText = "Indexing...";
		}

		return (<span>
			<SourcegraphIcon style={{marginTop: "-2px", paddingLeft: "5px", fontSize: "16px"}} />
			<span id="sourcegraph-build-indicator-text" style={{paddingLeft: "5px"}}>{indicatorText}</span>
		</span>);
	}
}
