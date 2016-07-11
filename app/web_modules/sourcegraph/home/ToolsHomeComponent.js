import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/Tools.css";
import base from "sourcegraph/components/styles/_base.css";
import {Heading, Hero, Panel, Button} from "sourcegraph/components";
import Component from "sourcegraph/Component";
import {urlToGitHubOAuth} from "sourcegraph/util/urlTo";
import ToolComponent from "./ToolComponent";
import * as AnalyticsConstants from "sourcegraph/util/constants/AnalyticsConstants";

class ToolsHomeComponent extends Component {

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
		this.state = {
			showChromeExtensionCTA: !document.getElementById("sourcegraph-app-bootstrap"),
		};
		this.supportedTools = {
			browser: {
				hero: {
					title: "Browser extensions",
					subtitle: "Jump-to-definition, code search, and documentation.",
					paragraph: "This extension enhances code pages on GitHub by making every identifier a jump-to-definition link. Hovering over identifiers displays a tooltip with documentation and type information. The new keyboard shortcut Shift-T allows you to search for functions, types, and other definitions. After installing it, view some code on GitHub and hover your mouse over identifiers.",
					img: "/img/Dashboard/GoogleChromeAsset.svg",
				},
				primaryButton: this._browserCTA.bind(this),
			},
			editor: {
				hero: {
					title: "Editor integrations",
					subtitle: "See usage examples for Go code instantly, as you type. Currently in beta.",
					paragraph: "When Sourcegraph is installed in your editor you get real usage examples from GitHub, immediate access to source code, and documentation as you type. It’s like pair programming with the smartest developer in the world. Sourcegraph currently supports Go in Vim and Sublime Text. More languages and editors are coming soon.",
				},
				primaryButton: this._sfyeCTA.bind(this),
				youtube: "https://www.youtube.com/embed/ssON7dfaDZo",
				interestForm: {
					title: "Use another editor or language? Get early access to Sourcegraph for your editor and language of choice.",
				},
			},
		};
	}

	componentDidMount() {
		setTimeout(() => this.setState({
			showChromeExtensionCTA: !document.getElementById("sourcegraph-app-bootstrap"),
		}), 1);
	}

	reconcileState(state, props, context) {
		Object.assign(state, props);
		state.githubToken = context.githubToken;
		const toolName = state.location.pathname.split("/").slice(-1)[0];
		this.optionalSelectedToolComponent = this.supportedTools[toolName] ? <ToolComponent supportedTool={this.supportedTools[toolName]} location={state.location}/> : null;
	}

	_toolClicked(toolType) {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_TOOLS, AnalyticsConstants.ACTION_CLICK, "ToolCTAClicked", {toolType: toolType, page_name: AnalyticsConstants.PAGE_TOOLS});
		this.context.router.replace({pathname: `/tools/${toolType}`});
	}

	_browserCTA() {
		if (global.chrome) {
			if (!this.state.showChromeExtensionCTA) {
				return (
					<Button disabled={true}>Installed</Button>
				);
			}

			return (
				<Button color="purple" disabled={false} onClick={this._installChromeExtensionClicked.bind(this)}>Install</Button>
			);
		}

		return (
			<Button color="purple" onClick={this._browserLearnMoreCTAClicked.bind(this)}>View on the chrome web store</Button>
		);
	}

	_browserLearnMoreCTAClicked() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_TOOLS, AnalyticsConstants.ACTION_CLICK, "ChromeExtensionStoreCTAClicked", {page_name: AnalyticsConstants.PAGE_TOOLS});
		window.location.assign("https://chrome.google.com/webstore/detail/sourcegraph-for-github/dgjhfomjieaadpoljlnidmbgkdffpack?hl=en");
	}

	_successHandler() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_TOOLS, AnalyticsConstants.ACTION_SUCCESS, "ChromeExtensionInstalled", {page_name: AnalyticsConstants.PAGE_TOOLS});
		this.context.eventLogger.setUserProperty("installed_chrome_extension", "true");
		this.setState({showChromeExtensionCTA: false});
		setTimeout(() => document.dispatchEvent(new CustomEvent("sourcegraph:identify", this.context.eventLogger.getAmplitudeIdentificationProps())), 10);
	}

	_failHandler() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_TOOLS, AnalyticsConstants.ACTION_ERROR, "ChromeExtensionInstallFailed", {page_name: AnalyticsConstants.PAGE_TOOLS});
		this.context.eventLogger.setUserProperty("installed_chrome_extension", "false");
		this.setState({showChromeExtensionCTA: true});
	}

	_installChromeExtensionClicked() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_TOOLS, AnalyticsConstants.ACTION_CLICK, "ChromeExtensionCTAClicked", {page_name: AnalyticsConstants.PAGE_TOOLS});
		if (global.chrome) {
			global.chrome.webstore.install("https://chrome.google.com/webstore/detail/dgjhfomjieaadpoljlnidmbgkdffpack", this._successHandler.bind(this), this._failHandler.bind(this));
		}
	}

	_chromeCTAClicked() {
		if (global.chrome && this.state.showChromeExtensionCTA) {
			this._installChromeExtensionClicked();
		}

		this._toolClicked("browser");
	}

	_installEditorForSublimeCTAClicked() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_TOOLS, AnalyticsConstants.ACTION_CLICK, "SourcegraphLiveCTAClicked", {page_name: AnalyticsConstants.PAGE_TOOLS, editorType: AnalyticsConstants.INTEGRATION_EDITOR_SUBLIME});
		window.location.assign("https://github.com/sourcegraph/sourcegraph-sublime");
	}

	_installEditorForVimCTAClicked() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_TOOLS, AnalyticsConstants.ACTION_CLICK, "SourcegraphLiveCTAClicked", {page_name: AnalyticsConstants.PAGE_TOOLS, editorType: AnalyticsConstants.INTEGRATION_EDITOR_VIM});
		window.location.assign("https://github.com/sourcegraph/sourcegraph-vim");
	}

	_sfyeCTA() {
		return (
			<div styleName="multiple-install">
				<div className={base.ph1} styleName={"mv2-sm"}>
					<Button color="purple" imageUrl={`${this.context.siteConfig.assetsRoot}/img/Dashboard/SourcegraphSublime.svg`} onClick={this._installEditorForSublimeCTAClicked.bind(this)}>Install for Sublime</Button>
				</div>
				<div className={base.ph1} styleName={"mv2-sm"}>
					<Button color="purple" imageUrl={`${this.context.siteConfig.assetsRoot}/img/Dashboard/SourcegraphVim.svg`} onClick={this._installEditorForVimCTAClicked.bind(this)}>Install for Vim</Button>
				</div>
			</div>
		);
	}

	_installAlfredClicked() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_AUTH, AnalyticsConstants.ACTION_CLICK, "AlfredCTAClicked", {page_name: AnalyticsConstants.PAGE_TOOLS});
		window.open("https://github.com/sourcegraph/sourcegraph-alfred");
	}

	_connectGitHubClicked() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_AUTH, AnalyticsConstants.ACTION_CLICK, "InitiateGitHubOAuth2Flow", {page_name: AnalyticsConstants.PAGE_TOOLS, scopes: "", upgrade: true});
		window.open(urlToGitHubOAuth(null, this.props.location));
	}

	render() {
		return (
			<div styleName="container">
			{this.optionalSelectedToolComponent}
				<Hero color="purple" pattern="objects">
					<div styleName="container-fixed">
						<Heading level="1" color="white" underline="white">Get Sourcegraph everywhere you code</Heading>
						<p style={{maxWidth: "560px"}} className={base.center}>
							Add Sourcegraph's instant coding assistance to your workflow.
						</p>
					</div>
				</Hero>
				{<div styleName="panel-container">
					{!this.context.signedIn && <div styleName="panel-item">
						<Panel hoverLevel="high">
							<img styleName="img" src={`${this.context.siteConfig.assetsRoot}/img/Dashboard/github-octocat.svg`}></img>
							<Heading align="center" level="4" className={base.ph4}>For your repositories</Heading>
							<p styleName="cool-mid-gray" className={base.ph4}>
								Start searching, browsing, and cross-referencing your code.
							</p>
							<div styleName="button-container">
								<Button onClick={this._connectGitHubClicked.bind(this)} color="purple">Connect</Button>
							</div>
						</Panel>
					</div>}
					<div styleName="panel-item">
						<Panel hoverLevel="high">
							<img styleName="img" src={`${this.context.siteConfig.assetsRoot}/img/Dashboard/GoogleChromeAsset.svg`}></img>
							<Heading align="center" level="4" className={base.ph4}>For your browser</Heading>
							<p styleName="cool-mid-gray" className={base.ph4}>
								Jump-to-definition, code search, and documentation.
							</p>
							<div styleName="button-container">
								<Button onClick={this._chromeCTAClicked.bind(this)} color="purple">{!this.state.showChromeExtensionCTA ? "Learn more" : "Install"}</Button>
							</div>
						</Panel>
					</div>
					<div styleName="panel-item">
						<Panel hoverLevel="high">
							<img styleName="img" src={`${this.context.siteConfig.assetsRoot}/img/Dashboard/SourcegraphSublime.svg`}></img>
							<img styleName="img" src={`${this.context.siteConfig.assetsRoot}/img/Dashboard/SourcegraphVim.svg`}></img>

							<Heading align="center" level="4" className={base.ph4}>For your editor</Heading>
							<p styleName="cool-mid-gray" className={base.ph4}>
								See usage examples for Go code instantly, as you type.
							</p>
							<div styleName="button-container">
								<Button onClick={this._toolClicked.bind(this, "editor")} color="purple">
									Install
								</Button>
							</div>
						</Panel>
					</div>
					<div styleName="panel-item">
						<Panel hoverLevel="high">
							<img styleName="img" src={`${this.context.siteConfig.assetsRoot}/img/Dashboard/AlfredLogo.png`}></img>
							<Heading align="center" level="4" className={base.ph4}>For your launcher</Heading>
							<p styleName="cool-mid-gray" className={base.ph4}>
								Instant access to global code search from Alfred.
							</p>
							<div styleName="button-container">
								<Button onClick={this._installAlfredClicked.bind(this)} color="purple">
									Install
								</Button>
							</div>
						</Panel>
					</div>
				</div>}
			</div>
		);
	}
}

export default CSSModules(ToolsHomeComponent, styles, {allowMultiple: true});
