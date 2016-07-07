import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/Integrations.css";
import {Heading} from "sourcegraph/components";
import Component from "sourcegraph/Component";
import Helmet from "react-helmet";
import IntegrationComponent from "./IntegrationComponent";
import * as AnalyticsConstants from "sourcegraph/util/constants/AnalyticsConstants";

class IntegrationsComponent extends Component {

	static propTypes = {
		location: React.PropTypes.object.isRequired,
	};
	static contextTypes = {
		siteConfig: React.PropTypes.object.isRequired,
		eventLogger: React.PropTypes.object.isRequired,
		router: React.PropTypes.object.isRequired,
		signedIn: React.PropTypes.bool.isRequired,
		githubToken: React.PropTypes.object,
	};

	constructor(props, context) {
		super(props);


	}

	componentDidMount() {

	}

	reconcileState(state, props, context) {

	}
	_item(integration) {
		let installState = integration.installState || "normal";
		return (
			<IntegrationComponent small_title={integration.small_title} image_url={integration.image_url} id={integration.id} url={integration.url} installState={installState} analyticsConstant={integration.analyticsConstant}/>
		);
	}

	render() {
		this.integrations = [
			{
				small_title: "Alfred",
				image_url: `${this.context.siteConfig.assetsRoot}/img/Integrations/AlfredAsset.png`,
				id: "alfred",
				url: "https://github.com/sourcegraph/sourcegraph-alfred",
				analyticsConstant: AnalyticsConstants.INTEGRATION_ALFRED,
			},
			{
				small_title: "Chrome",
				image_url: `${this.context.siteConfig.assetsRoot}/img/Integrations/GoogleChromeAsset.svg`,
				id: "chrome",
				url: "https://chrome.google.com/webstore/detail/sourcegraph-for-github/dgjhfomjieaadpoljlnidmbgkdffpack?hl=en",
				analyticsConstant: AnalyticsConstants.INTEGRATION_CHROME,
			},
			{
				small_title: "Emacs",
				image_url: `${this.context.siteConfig.assetsRoot}/img/Integrations/EmacsAsset.svg`,
				id: "emacs",
				url: "https://github.com/sourcegraph/sourcegraph-emacs",
				analyticsConstant: AnalyticsConstants.INTEGRATION_EMACS,
			},
			{
				small_title: "Firefox",
				image_url: `${this.context.siteConfig.assetsRoot}/img/Integrations/FirefoxAsset.svg`,
				id: "firefox",
				enabled: false,
				url: "",
				analyticsConstant: AnalyticsConstants.INTEGRATION_FIREFOX,
			},
			{
				small_title: "IntelliJ",
				image_url: `${this.context.siteConfig.assetsRoot}/img/Integrations/IntelliJAsset.svg`,
				id: "vim",
				url: "https://github.com/sourcegraph/sourcegraph-intellij",
				analyticsConstant: AnalyticsConstants.INTEGRATION_INTELLIJ,
			},
			{
				small_title: "Sublime",
				image_url: `${this.context.siteConfig.assetsRoot}/img/Integrations/SublimeAsset.svg`,
				id: "sublime",
				url: "https://github.com/sourcegraph/sourcegraph-sublime",
				analyticsConstant: AnalyticsConstants.INTEGRATION_SUBLIME,
			},
			{
				small_title: "Vim",
				image_url: `${this.context.siteConfig.assetsRoot}/img/Integrations/VimAsset.svg`,
				id: "vim",
				url: "https://github.com/sourcegraph/sourcegraph-vim",
				analyticsConstant: AnalyticsConstants.INTEGRATION_VIM,
				installState: "installed",
			},
			{
				small_title: "Visual Studio Code",
				image_url: `${this.context.siteConfig.assetsRoot}/img/Integrations/VisualStudioCodeAsset.png`,
				id: "vscode",
				url: "https://github.com/sourcegraph/sourcegraph-vscode",
				analyticsConstant: AnalyticsConstants.INTEGRATION_VSCODE,
			},
		];
		const components = this.integrations.filter((integration) => integration.enabled || typeof integration.enabled==="undefined").map((integration) => this._item(integration));
		return (
			<div>
				<Helmet title="Integrations" />
				<Heading level="1">Integrations</Heading>
				<div styleName="integrationsContainer">{components}</div>
			</div>
		);
	}
}

export default CSSModules(IntegrationsComponent, styles);
