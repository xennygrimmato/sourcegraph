// @flow

import React from "react";
import {Link} from "react-router";
import {Hero, Heading} from "sourcegraph/components";
import styles from "./Page.css";
import base from "sourcegraph/components/styles/_base.css";
import CSSModules from "react-css-modules";
import GitHubAuthButton from "sourcegraph/components/GitHubAuthButton";
import Helmet from "react-helmet";

function AboutPage(props, {signedIn}): React$Element {
	return (
		<div>
			<Helmet title="About" />
			<Hero pattern="objects" color="blue" className={base.pv5}>
				<div styleName="container">
					<Heading level="3" color="white">Sourcegraph is how developers discover and understand code.</Heading>
					</div>
			</Hero>
			<div styleName="content">
				<p styleName="p">Remember the last time you were <em>in flow</em> while coding? You got a ton done and felt great.</p>
				<p styleName="p">But staying in flow is hard. While coding, you often waste minutes digging for examples in Q&amp;A forums, finding documentation, deciphering code, or interrupting teammates.</p>
				<p styleName="p">Sourcegraph helps you find the answers you need in seconds, not minutes&mdash;so you stay in flow, get more done, and feel great.</p>

				<Heading level="3" underline="blue" className={styles.h5}>What is Sourcegraph?</Heading>
				<p styleName="p">Sourcegraph is a fast, global, semantic code search and cross-reference engine. You can search for any function, type, or package, and see how other developers use it, globally. It's cross-repository and massively scalable, with 2,000,000,000+ nodes in the public code index (and growing).</p>
				<p styleName="p">Sourcegraph Inc. creates and operates Sourcegraph. We're based in <Link to="/contact">San Francisco</Link>, and <a href="https://boards.greenhouse.io/sourcegraph" target="_blank">we're hiring</a>.</p>
				<p styleName="p">In the last 24 hours, you almost certainly used a product built by developers who use Sourcegraph.</p>

				{!signedIn && <div styleName="cta">
					<GitHubAuthButton color="purple" className={base.mr3}>
						<strong>Sign up with GitHub</strong>
					</GitHubAuthButton>
				</div>}

				<Heading level="4" underline="blue" className={styles.h5}>Using Sourcegraph</Heading>
				<p styleName="p">Try it:</p>
				<ul>
					<li><Link to="/search?q=http.NewRequest">Instantly jump to any function/type/package in any repository</Link> — global, semantic code search</li>
					<li><Link to="/github.com/golang/go/-/info/GoPackage/net/http/-/NewRequest">See where/how a function/type/package is used, across all repositories</Link> — live usage examples &amp; global cross-refs</li>
					<li><Link to="/github.com/golang/go/-/def/GoPackage/net/http/-/NewRequest">Navigate and jump around code like an IDE</Link></li>
				</ul>
				<p styleName="p">No installation or signup required. <em>It just works</em>, for both open-source code and your private projects (unless you do crazy stuff with your build tooling).</p>
<p styleName="p">Sourcegraph is free for public and private projects. <Link to="/pricing">Paid plans</Link> are available. The <a href="https://github.com/sourcegraph/sourcegraph">code that powers Sourcegraph</a> is public and <a href="https://fair.io/">Fair Source</a> licensed.</p>

				<Heading level="5">Supported languages</Heading>
<ul>
<li>Go &mdash; <Link to="/github.com/golang/go/-/def/GoPackage/net/http/-/NewRequest">try it</Link></li>
<li>Java &mdash; <Link to="/github.com/square/okhttp/-/def/JavaArtifact/com.squareup.okhttp3/okhttp/-/okhttp3/Request:type/Builder:type/method:java.lang.String:okhttp3.RequestBody">try it</Link></li>
</ul>
				<p styleName="p"><em>Coming soon: JavaScript, Python, C#, PHP, Objective-C, C/C++, Scala, Perl, TypeScript, etc.</em> <a href="mailto:support@sourcegraph.com">Email us</a> to get early beta access to these languages for your team or project.</p>

				{!signedIn && <div styleName="cta">
					<GitHubAuthButton color="purple" className={base.mr3}>
						<strong>Sign up with GitHub</strong>
					</GitHubAuthButton>
				</div>}

				<Heading level="3" underline="purple" className={styles.h5}>Our purpose: the future sooner</Heading>
				<p styleName="p">From lifesaving medicine to self-driving cars, the future’s most groundbreaking innovations will all rely on code, in one way or another. With so much software to write in the coming decades, we all need a better way to discover and understand code&mdash;one that will finally free us from re-doing work that’s been done 50,000 times before.</p>
				<p styleName="p">At Sourcegraph, we help developers <em>bring the future sooner</em>&mdash;by turning great ideas into great software more efficiently.</p>

				<Heading level="3" underline="orange" className={styles.h5}>Stickers for screenshots</Heading>
				<p styleName="p">Developers love stickers, and we love understanding our users better. We'll mail you a Sourcegraph sticker free of charge if you <a href="mailto:hi@sourcegrah.com">email us a screenshot or video</a> of your full screen (including editor/IDE) while you're using Sourcegraph in your usual development workflow. In the email, be sure to tell us your mailing address so we know where to send the sticker.</p>
			</div>
		</div>
	);
}
AboutPage.contextTypes = {
	signedIn: React.PropTypes.bool,
};

export default CSSModules(AboutPage, styles);
