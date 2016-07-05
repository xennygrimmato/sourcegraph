import React from "react";

import {bindActionCreators} from "redux";
import {connect} from "react-redux";

import {qualifiedNameAndType} from "./Formatter";
import SearchInput from "./SearchInput";
import DefSearchResult from "./DefSearchResult";
import {keyFor} from "../reducers/helpers";
import * as Actions from "../actions";
import * as utils from "../utils";

import _ from "lodash";

import CSSModules from "react-css-modules";
import styles from "./App.css";

@connect(
	(state) => ({
		//resolvedRev: state.resolvedRev,
		accessToken: state.accessToken,
		//srclibDataVersion: state.srclibDataVersion,
		authentication: state.authentication,
		//defs: state.defs,
	}),
	(dispatch) => ({
		actions: bindActionCreators(Actions, dispatch)
	})
)
@CSSModules(styles)
export default class SettingsFrame extends React.Component {
	static propTypes = {
		//resolvedRev: React.PropTypes.object.isRequired,
		//accessToken: React.PropTypes.object.isRequired,
		//srclibDataVersion: React.PropTypes.object.isRequired,
		//defs: React.PropTypes.object.isRequired,
		actions: React.PropTypes.object.isRequired,
		//authentication: React.PropTypes.object.isRequired
	};

	constructor(props) {
		super(props);
		this._refresh = this._refresh.bind(this);
		this.state = utils.parseURL();
		//this.state.query = "go";
		//this._handleSubmit = _.debounce(this._handleSubmit, 50);
		//this._handleSubmit = this._handleSubmit.bind(this);
	}

	componentDidMount() {
		document.addEventListener("pjax:success", this._refresh);
		this.props.actions.getAuthentication(this.state);

		//this._handleSubmit();
	}

	//_handleSubmit() {
	//	this.props.actions.getDefs(this.state.repoURI, this.state.rev, this.state.path, "go");
	//};

	componentWillUnmount() {
		document.removeEventListener("pjax:success", this._refresh);
	}

	_refresh() {
		const newState = utils.parseURL();
		// if (newState.repoURI !== this.state.repoURI) {
		// 	newState.query = "go";
		// } else {
		// 	newState.query = this.state.query;
		// }
		this.setState(newState);
	}

	render() {
		let authScope = "";
		if (this.props.authentication && this.props.authentication.GitHubToken && this.props.authentication.GitHubToken.scope) authScope = this.props.authentication.GitHubToken.scope;
		let hasPrivateCodeAuthorization = authScope => {authScope.includes("read") && authScope.includes("repo") && authScope.includes("user")};
		return (
			<div className="column three-fourths">
				<div className="boxed-group">
					<h3>Sourcegraph Settings </h3>
					<div className="boxed-group-inner clearfix">
						<form className="columns js-uploadable-container js-upload-avatar-image is-default">
							<div className="column three-fourths">
								<dl className="form-group">
									{this.props.accessToken == null &&
										<div>
											<a className="btn button-change-avatar" href="https://sourcegraph.com/-/github-oauth/initiate?scopes=read%3Aorg%2Crepo%2Cuser%3Aemail&return-to=%2F" target="_blank"> Sign in </a>
											<span className="num"> Sign in to Sourcegraph.  </span>
										</div>
									}
								</dl>
								<dl className="form-group">
									{this.props.accessToken != null &&  this.props.accessToken !== "" && hasPrivateCodeAuthorization &&
										<div>
											<label className="rename_field">You are signed in to Sourcegraph.</label>
										</div>
									}
								</dl>
								<dl className="form-group">
									{!hasPrivateCodeAuthorization &&
										<div>
											<a className="btn button-change-avatar" href="https://sourcegraph.com/settings/repos" target="_blank"> OAuth </a>
											<span className="num" > Sourcegraph is not enabled for private repositories. Authorize and enable repositories here. </span>
										</div>
									}
								</dl>
							</div>
						</form>
					</div>
				</div>
			</div>
		);
	}
}



