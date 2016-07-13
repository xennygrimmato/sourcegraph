// @flow

import React from "react";
import {Link} from "react-router";

import {Hero, Heading} from "sourcegraph/components";
import styles from "sourcegraph/page/Page.css";
import base from "sourcegraph/components/styles/_base.css";
import CSSModules from "react-css-modules";
import GitHubAuthButton from "sourcegraph/components/GitHubAuthButton";
import Helmet from "react-helmet";

class ChromeFaqsPage extends React.Component {
	static propTypes = {
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
				<Helmet title="Chrome FAQs" />
				<Hero pattern="objects" className={base.pv5}>
					<div styleName="container">
						<Heading level="2" color="blue">Sourcegraph Chrome Extension FAQs</Heading>
					</div>
				</Hero>

				<div styleName="content">
					<Heading level="3" underline="blue" className={styles.h5}>How does it work?</Heading>
					<p styleName="p"> Sourcegraph is how developers discover and understand code. It is a fast, global, semantic code search and cross-reference engine.
					You can search for any function, type, or package, and see how other developers use it, globally. It's cross-repository and massively scalable, with
					2,000,000,000+ nodes in the public code index (and growing). Sourcegraph currently supports Go and Java. Sourcegraph's code index powers the Sourcegraph Chrome Extension.</p>

					<Heading level="3" underline="blue" className={styles.h5}>Can I use the extension anonymously?</Heading>
					<p styleName="p">Sourcegraph indexes popular public repositories written in supported languages. Don't see a public repository you'd like indexed? Sign in @ Sourcegraph.com,
					and the next time you visit that repository on GitHub, we'll start building it for you.</p>

					<a id="signin"/>
					<Heading level="3" underline="blue" className={styles.h5}>How do I sign in to see my indexed code?</Heading>
					<p styleName="p"> You must be signed in on Sourcegraph.com to access your indexed private repositories, or enable Sourcegraph to index your private repositories. Sign in or
					sign up below with GitHub OAuth.</p>
					<div styleName="tc">
					{!this.context.signedIn && <GitHubAuthButton returnTo="/chrome-faqs#signin"> Sign up or sign in</GitHubAuthButton>}
					</div>

					<a id="enable"/>
					<Heading level="3" underline="blue" className={styles.h5}>How do I use the Chrome extension with private repositories?</Heading>
					<p styleName="p"> Sourcegraph must be enabled in order for your private repositories to be indexed. Authorize your repositories at <Link to="settings/repos">
					sourcegraph.com/settings/repos </Link>. </p>

					<Heading level="3" underline="blue" className={styles.h5}>Where else is Sourcegraph?</Heading>
					<p styleName="p"> Like the Sourcegraph Chrome extension? Sourcegraph can also be used on your desktop, in your editor. Try global semantic search on our homepage
					at sourcegraph.com and check out more tools at <Link to="/tools"> sourcegraph.com/tools</Link>.</p>

					<a id="buildfailure"/>
					<Heading level="3" underline="blue" className={styles.h5}>Troubleshooting</Heading>
					<p styleName="p"> Sourcegraph runs static code analysis on your code. If there are errors running the analysis, Sourcegraph does not index the code.
					If you'd like to report a bug, please send an email to <a href="mailto:support@sourcegraph.com"> support@sourcegraph.com</a>.</p>
				</div>
				<Hero pattern="objects" className={base.pv5}/>
			</div>
		);
	}
}

export default CSSModules(ChromeFaqsPage, styles);
