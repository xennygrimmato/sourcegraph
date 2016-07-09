// @flow weak

import React from "react";
import Container from "sourcegraph/Container";
import {Heading, FlexContainer, ChecklistItem} from "sourcegraph/components";
import styles from "../../page/Page.css";
import CSSModules from "react-css-modules";
import GitHubAuthButton from "sourcegraph/components/GitHubAuthButton";
import GoogleAuthButton from "sourcegraph/components/GoogleAuthButton";
import {Button} from "sourcegraph/components";

class UserSettingsAccountsMain extends Container {
	static propTypes = {
		// TODO.
		location: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		// TODO.
		siteConfig: React.PropTypes.object.isRequired,
		user: React.PropTypes.object,
		signedIn: React.PropTypes.bool.isRequired,
		githubToken: React.PropTypes.object,
		googleToken: React.PropTypes.object,
		eventLogger: React.PropTypes.object.isRequired,
		router: React.PropTypes.object,
	};

	reconcileState(state, props, context) {
		// TODO.
		Object.assign(state, props);
		state.githubToken = context.githubToken;
		state.googleToken = context.googleToken;
		state.user = context.user;
	}

	onStateTransition(prevState, nextState) {
		// TODO.
	}

	stores() { /* TODO */ }

	render() {
		// TODO.
		console.log(this.context);
		return (
			<div>
				<p styleName="p">You can connect or disconnect external accounts here.</p>

				<ChecklistItem complete={this.context.githubToken}>
					<FlexContainer justify="between">
						<div>
							<Heading level="4">Connect with GitHub</Heading>
						</div>
						<div>
							<GitHubAuthButton color="purple"><strong>Add</strong></GitHubAuthButton>
							<Button outline={true}>Remove</Button>
						</div>
					</FlexContainer>
				</ChecklistItem>
				<ChecklistItem complete={this.context.googleToken}>
					<FlexContainer justify="between">
						<div>
							<Heading level="4">Connect with Google</Heading>
						</div>
						<div>
							<GoogleAuthButton color="purple"><strong>Add</strong></GoogleAuthButton>
							<Button outline={true}>Remove</Button>
						</div>
					</FlexContainer>
				</ChecklistItem>
			</div>
		);
	}
}

export default CSSModules(UserSettingsAccountsMain, styles);
