// @flow weak

import React from "react";
import Container from "sourcegraph/Container";
import Dispatcher from "sourcegraph/Dispatcher";
import "sourcegraph/repo/RepoBackend"; // for side effects
import RepoStore from "sourcegraph/repo/RepoStore";
import GettingStartedLayout from "sourcegraph/home/GettingStartedLayout";
import * as RepoActions_typed from "sourcegraph/repo/RepoActions_typed";

const reposPublicQuerystring = "IncludeRemote=true&Type=public";
const reposPrivateQuerystring = "IncludeRemote=true&Type=private";

export default class GettingStartedMain extends Container {
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
		state.publicRepos = RepoStore.repos.list(reposPublicQuerystring);
		state.privateRepos = RepoStore.repos.list(reposPrivateQuerystring);
		state.githubToken = context.githubToken;
		state.user = context.user;
	}

	onStateTransition(prevState, nextState) {
		if (nextState.publicRepos !== prevState.publicRepos) {
			Dispatcher.Backends.dispatch(new RepoActions_typed.WantRepos(reposPublicQuerystring));
		}
		if (nextState.privateRepos !== prevState.privateRepos) {
			Dispatcher.Backends.dispatch(new RepoActions_typed.WantRepos(reposPrivateQuerystring));
		}
	}

	stores() { return [RepoStore]; }

	render() {
		return <GettingStartedLayout location={this.props.location} />;
	}
}
