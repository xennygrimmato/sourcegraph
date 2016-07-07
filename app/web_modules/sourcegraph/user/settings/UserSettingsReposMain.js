// @flow weak

import React from "react";
import Container from "sourcegraph/Container";
import Dispatcher from "sourcegraph/Dispatcher";
import "sourcegraph/repo/RepoBackend"; // for side effects
import RepoStore from "sourcegraph/repo/RepoStore";
import Repos from "sourcegraph/user/settings/Repos";
import * as RepoActions_typed from "sourcegraph/repo/RepoActions_typed";

const reposQuerystring = "IncludeRemote=true";

export default class UserSettingsReposMain extends Container {
	static propTypes = {
		location: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		siteConfig: React.PropTypes.object.isRequired,
		user: React.PropTypes.object,
		signedIn: React.PropTypes.bool.isRequired,
		githubToken: React.PropTypes.object,
		eventLogger: React.PropTypes.object.isRequired,
		router: React.PropTypes.object,
	};

	reconcileState(state, props, context) {
		Object.assign(state, props);
		state.repos = RepoStore.repos.list(reposQuerystring);
		state.githubToken = context.githubToken;
		state.user = context.user;
	}

	onStateTransition(prevState, nextState) {
		if (nextState.repos !== prevState.repos) {
			Dispatcher.Backends.dispatch(new RepoActions_typed.WantRepos(reposQuerystring));
		}
	}

	stores() { return [RepoStore]; }

	render() {
		return <Repos repos={this.state.repos ? this.state.repos.Repos : null} location={this.props.location} />;
	}
}
