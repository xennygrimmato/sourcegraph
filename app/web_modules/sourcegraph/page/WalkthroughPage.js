// @flow

import React from "react";
import {Hero, Heading} from "sourcegraph/components";
import styles from "./Page.css";
import base from "sourcegraph/components/styles/_base.css";
import CSSModules from "react-css-modules";
import GitHubAuthButton from "sourcegraph/components/GitHubAuthButton";
import Helmet from "react-helmet";
import BetaInterestForm from "sourcegraph/home/BetaInterestForm";

function WalkthroughPage(props, {signedIn}): React$Element {
	return (
		<div>
			<Helmet title="walkthrough" />
			<Hero pattern="objects" className={base.pv5}>
				<div styleName="container">
					<Heading level="2" color="blue">Welcome to Sourcegraph</Heading>
				</div>
			</Hero>
			<div styleName="content">
				<p styleName="p">We are glad you signed up.</p>

				<Heading level="3" underline="blue" className={styles.h5}>How it works</Heading>
				<p styleName="p">So we need you to auth for priavte code</p>
				<ul>
					<li styleName="p">Yada</li>
				</ul>

				<Heading level="3" underline="blue" className={styles.h4}>Register for beta access</Heading>

				{!signedIn && <div styleName="cta">
					<p styleName="p">You must sign in to continue.</p>
					<GitHubAuthButton returnTo="/walkthrough" color="blue" className={base.mr3}>
						<strong>Sign in with GitHub</strong>
					</GitHubAuthButton>
				</div>}
			</div>
		</div>
	);
}
WalkthroughPage.contextTypes = {
	signedIn: React.PropTypes.bool,
};

export default CSSModules(WalkthroughPage, styles);