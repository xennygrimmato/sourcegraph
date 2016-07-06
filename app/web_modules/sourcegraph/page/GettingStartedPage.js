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
					<p> testing code1</p>
				}
				{location.hash === "#public" &&
					<p> testing code2 </p>
				}

				<p styleName="p">We are glad you signed up.</p>

				<Heading level="3" underline="blue" className={styles.h5}>How it works</Heading>
				<p styleName="p">Your <a href="#public"> public </a> and <a href="#private"> private </a> code </p>
				<ul>
					<li styleName="p"></li>
				</ul>

				<Heading level="3" underline="blue" className={styles.h4}>Register for beta access</Heading>

				{!signedIn && <div styleName="cta">
					<p styleName="p">You must sign in to continue.</p>
					<GitHubAuthButton returnTo="/getting-started" color="blue" className={base.mr3}>
						<strong>Sign in with GitHub</strong>
					</GitHubAuthButton>
				</div>}
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
