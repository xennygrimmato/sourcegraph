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



function GettingStartedPage(props, {signedIn}): React$Element {
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
								{!signedIn && <div styleName="cta">
									<p styleName="p">Sign in to enable Sourcegraph for private code.</p>
									<GitHubAuthButton returnTo={"/getting-started"+location.hash} color="blue" className={base.mr3}>
										<strong>Sign in with GitHub</strong>
									</GitHubAuthButton>
								</div>}

								{signedIn && <div styleName="cta">
									<p styleName="p">Check to enable Sourcegraph for private repositories:</p>
								</div>}
							</h3>
					</div>
					</Modal>
				}
				{location.hash === "#public" &&
					<Modal onDismiss={() => location.hash=""}>
						<div styleName="code-auth-modal">
							<h3>
								{!signedIn && <div styleName="cta">
									<p styleName="p">Sign in to configure your public repositories.</p>
									<GitHubAuthButton returnTo={"/getting-started"+location.hash} color="blue" className={base.mr3}>
										<strong>Sign in with GitHub</strong>
									</GitHubAuthButton>
								</div>}

								{signedIn && <div styleName="cta">
									<p styleName="p">Check to enable Sourcegraph for public repositories:</p>
								</div>}
							</h3>
						</div>
					</Modal>
				}

				<Heading level="3" underline="blue" className={styles.h5}>How it works</Heading>
				<p styleName="p">Your <a href="#public"> public </a> and <a href="#private"> private </a> code </p>
				<ul>
					<li styleName="p"></li>
				</ul>

				
			</div>
		</div>
	);
}

GettingStartedPage.contextTypes = {
	signedIn: React.PropTypes.bool,
};

GettingStartedPage.propTypes = {
	location: React.PropTypes.object.isRequired,
};

export default CSSModules(GettingStartedPage, styles);
