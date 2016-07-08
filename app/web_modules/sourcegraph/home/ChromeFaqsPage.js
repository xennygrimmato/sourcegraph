// @flow

import React from "react";
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
				<Helmet title="chroms-faqs" />
				<Hero pattern="objects" className={base.pv5}>
					<div styleName="container">
						<Heading level="2" color="blue">Sourcegraph Chrome Extension FAQs</Heading>
					</div>
				</Hero>

				<div styleName="content">
					<Heading level="3" underline="blue" className={styles.h5}>How it works</Heading>
					<p styleName="p"> Sourcegraph is how developers discover and understand code. It is a fast, global, semantic code search and cross-reference engine.
					You can search for any function, type, or package, and see how other developers use it, globally. It's cross-repository and massively scalable, with
					2,000,000,000+ nodes in the public code index (and growing). Sourcegraph currently supports Go and Java. Sourcegraph's code index powers the Sourcegraph Chrome Extension.</p>

					<Heading level="3" underline="blue" className={styles.h5}>Using the extension anonymously</Heading>
					<p styleName="p"> Sourcegraph indexes all public code written in supported languages that someone who is using the extension has visited. You'll be able to use the Sourcegraph Chrome extension on any
					supported public repository or public repositories that we haven't yet indexed without even signing up. However, the Sourcegraph Chrome extension will not work on your private repositories. </p>

					<a id="signin"/>
					<Heading level="3" underline="blue" className={styles.h5}>Sign in to continue using the extension</Heading>
					<p styleName="p"> To access your private repositories, please sign in or sign up below with GitHub OAuth.</p>
					<div styleName="tc">
					<GitHubAuthButton returnTo="/chrome-faqs#signin"> Enable for private repositories</GitHubAuthButton>
					</div>

					<a id="enable"/>
					<Heading level="3" underline="blue" className={styles.h5}>Enable Sourcegraph to use the extension with private code</Heading>
					<p styleName="p"> You haven't enabled Sourcegraph for this private repository yet. Only you have access to examples
					and definitions that are in your private repositories. Authorize your repositories at <a href={"https://sourcegraph.com/settings/repos"}>
					sourcegraph.com/settings/repos </a>. </p>

					<Heading level="3" underline="blue" className={styles.h5}>Where else is Sourcegraph?</Heading>
					<p styleName="p"> Liked the Sourcegraph Chrome extension? Sourcegraph can also help you out on you desktop, in your editor. Try global semantic search on our homepage
					at <a href="https://sourcegraph.com"> sourcegraph.com</a> and check out more tools at <a href="https://sourcegraph.com/tools"> sourcegraph.com/tools</a>.</p>

					<a id="buildfailure"/>
					<Heading level="3" underline="blue" className={styles.h5}>Troubleshooting</Heading>
					<p styleName="p"> Sourcegraph first compiles code before indexing it. If there are errors when the code is compiled, Sourcegraph does not index the code.
					If you'd like to report a bug, please send an email to <a href="mailto:support@sourcegraph.com"> support@sourcegraph.com</a>.</p>
				</div>
				<Hero pattern="objects" className={base.pv5}/>
			</div>
		);
	}
}

export default CSSModules(ChromeFaqsPage, styles);