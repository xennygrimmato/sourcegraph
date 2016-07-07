// @flow

import React from "react";
import {Hero, Heading} from "sourcegraph/components";
import styles from "./Page.css";
import {Button} from "sourcegraph/components";
import base from "sourcegraph/components/styles/_base.css";
import CSSModules from "react-css-modules";
import GitHubAuthButton from "sourcegraph/components/GitHubAuthButton";
import Helmet from "react-helmet";
import Container from "sourcegraph/Container";
import {Label, Modal} from "sourcegraph/components";
import {privateGitHubOAuthScopes} from "sourcegraph/util/urlTo";
import GettingStartedRepos from "sourcegraph/home/GettingStartedRepos";

class GettingStartedPage extends React.Component {
	static propTypes = {
		repos: React.PropTypes.arrayOf(React.PropTypes.object),
		location: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		signedIn: React.PropTypes.bool.isRequired,
		githubToken: React.PropTypes.object,
		eventLogger: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
	}

	render() {
		return (
			<div>
				<Helmet title="getting-started" />
				<Hero pattern="objects" className={base.pv5}>
					<div styleName="container">
						<Heading level="2" color="blue">Welcome to Sourcegraph</Heading>
					</div>
				</Hero>

				<div styleName="content">
					{location.hash === "#private" &&
						<Modal onDismiss={() => location.hash=""}>
							<div styleName="code-auth-modal">
								<h3>
									{!this.context.signedIn && <div styleName="cta">
										<p styleName="p">Sign in to enable Sourcegraph for private code.</p>
										<GitHubAuthButton returnTo={"/getting-started"+location.hash} color="blue" className={base.mr3}>
											<strong>Sign in with GitHub</strong>
										</GitHubAuthButton>
									</div>}

									{this.context.signedIn && <div>
										<p styleName="p">Check to enable Sourcegraph for private repositories:</p>
										<GettingStartedRepos location={location} repos={this.props.repos} isPrivate={true} />
									</div>}
								</h3>
						</div>
						</Modal>
					}
					{location.hash === "#public" &&
						<Modal onDismiss={() => location.hash=""}>
							<div styleName="code-auth-modal">
								<h3>
									{!this.context.signedIn && <div styleName="cta">
										<p styleName="p">Sign in to configure your public repositories.</p>
										<GitHubAuthButton returnTo={"/getting-started"+location.hash} color="blue" className={base.mr3}>
											<strong>Sign in with GitHub</strong>
										</GitHubAuthButton>
									</div>}

									{this.context.signedIn && <div>
										<p styleName="p">Check to enable Sourcegraph for public repositories:</p>
										<GettingStartedRepos location={location} repos={this.props.repos} isPrivate={false} />
									</div>}
								</h3>
							</div>
						</Modal>
					}

					<Heading level="3" underline="blue" className={styles.h5}>How it works</Heading>
					<p styleName="p"> This is how it works. </p>
					<Heading level="3" underline="blue" className={styles.h5}>Using Sourcegraph with your code</Heading>
					<p styleName="p">You can enable Sourcegraph for your <a href="#public"> public </a> and <a href="#private"> private </a> code. </p>
					<Heading level="3" underline="blue" className={styles.h5}>Troubleshooting</Heading>
					<p styleName="p"> Here are some common issues. Otherwise, please log a bug with us. </p>
					
				</div>
			</div>
		);
	}
}

export default CSSModules(GettingStartedPage, styles);
