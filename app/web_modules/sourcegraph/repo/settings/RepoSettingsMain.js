// @flow weak

import React from "react";
import Container from "sourcegraph/Container";
import base from "sourcegraph/components/styles/_base.css";
import Helmet from "react-helmet";
import Dispatcher from "sourcegraph/Dispatcher";
import CSSModules from "react-css-modules";
import styles from "./RepoSettings.css";
import {Heading, Panel} from "sourcegraph/components";
import Header from "sourcegraph/components/Header";
import RepoStore from "sourcegraph/repo/RepoStore";
import * as RepoActions from "sourcegraph/repo/RepoActions";
import TimeAgo from "sourcegraph/util/TimeAgo";
import * as AnalyticsConstants from "sourcegraph/util/constants/AnalyticsConstants";

class RepoSettingsMain extends Container {
	static propTypes = {
		repo: React.PropTypes.string.isRequired,
		repoObj: React.PropTypes.object,
		location: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		eventLogger: React.PropTypes.object.isRequired,
	};

	stores() { return [RepoStore]; }

	reconcileState(state, props) {
		Object.assign(state, props);
		state.config = RepoStore.config.get(state.repo);
	}

	onStateTransition(prevState, nextState) {
		if (nextState.repo && prevState.repo !== nextState.repo) {
			Dispatcher.Backends.dispatch(new RepoActions.WantConfig(nextState.repo));
		}
	}

	render() {
		if (!this.props.repoObj || this.props.repoObj.Error) return null;

		// Only show settings to admins.
		if (!this.props.repoObj.Permissions || !this.props.repoObj.Permissions.Admin) {
			this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_REPOSITORY, AnalyticsConstants.ACTION_ERROR, "ViewRepoSettingsError", {repo: this.props.repo, page_name: this.props.location.pathname, error_type: "401"});

			return (
				<div>
					<Helmet title="Settings" />
					<Header
						title="Repository settings"
						subtitle="Contact an administrator of this repository for help." />
				</div>
			);
		}

		return (
			<div styleName="container">
				<Panel hoverLevel="low" className={base.pa4}>
					<Heading level="3" underline="blue">Settings</Heading>
					{this.props.repoObj && this.props.repoObj.Mirror && <p>Last synced: {this.props.repoObj.VCSSyncedAt ? <TimeAgo time={this.props.repoObj.VCSSyncedAt} /> : "never"}</p>}
				</Panel>
			</div>
		);
	}
}

export default CSSModules(RepoSettingsMain, styles);
