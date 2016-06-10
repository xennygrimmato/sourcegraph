import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/Tools.css";
import base from "sourcegraph/components/styles/_base.css";
import {Heading, Panel, Button} from "sourcegraph/components";
import {CloseIcon} from "sourcegraph/components/Icons";
import Modal from "sourcegraph/components/Modal";
import {TriangleRightIcon, TriangleDownIcon, CheckIcon} from "sourcegraph/components/Icons";
import InterestForm from "./InterestForm";

class ToolComponent extends React.Component {

	static propTypes = {
		location: React.PropTypes.object.isRequired,
		supportedTool: React.PropTypes.object.isRequired,
		formExpanded: React.PropTypes.bool,
	};

	static contextTypes = {
		siteConfig: React.PropTypes.object.isRequired,
		eventLogger: React.PropTypes.object.isRequired,
		router: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this.state = {
			formExpanded: false,
			formError: "none",
			submitted: false,
		};

		this.languages = {
			java: "Java",
			python: "Python",
			php: "PHP",
			csharp: "C#",
			javascript: "Javascript",
			cplusplus: "C++",
			c: "C",
			objectivec: "Objective C",
			ruby: "Ruby",
			swift: "Swift",
		};

		this.editors = {
			eclipse: "Eclipse",
			emacs: "Emacs",
			atom: "Atom",
			vscode: "Visual Studio Code",
			pycharm: "PyCharm",
			rubymine: "RubyMine",
			IntelliJ: "IntelliJ",
		};
	}

	_dismissModal() {
		this.context.eventLogger.logEvent("ToolBackButtonClicked", {toolType: this.props.location.query.tool});
		this.context.router.replace({...this.props.location, query: ""});
	}
	_toggleView() {
		this.setState({formExpanded: !this.state.formExpanded});
	}
	_getVisibility() {
		return this.state.formExpanded;
	}

	_hasSubmittedInterestForm() {
		this.setState({
			submitted: true,
		});
	}

	render() {
		return (
			<Modal onDismiss={this._dismissModal.bind(this)}>
					<div styleName="tool-item">
						<Panel hoverLevel="high">
							<span styleName="panel-cta">
							<Button onClick={this._dismissModal.bind(this)} color="white">
								<CloseIcon className={base.pt2} />
							</Button>
							</span>
							<div styleName="flex-container">
								<span><img styleName="tool-img" src={`${this.context.siteConfig.assetsRoot}${this.props.supportedTool.hero.img}`}></img></span>
								<div>
									<Heading align="left" level="2" className={base.pt5}>{this.props.supportedTool.hero.title}</Heading>
									<div styleName="tool-item-paragraph">
										<b>{this.props.supportedTool.hero.subtitle}</b>
										<br/><br/>
										{this.props.supportedTool.hero.paragraph}
									</div>
								</div>
							</div>
							<div styleName="button-container">{this.props.supportedTool.primaryButton}</div>
							<div>
								{!this.state.submitted ?
									<div>
										<div>
											<a styleName="dont-see-link" onClick={() => this._toggleView()}>{this._getVisibility()?<TriangleDownIcon />:<TriangleRightIcon />}Don't see the editor that you use? Let us know what we should work on next!</a>
										</div>
										<div className={base.mb5} styleName={this._getVisibility() ? "visible" : "invisible"}>
											{this.state.formError ? <div>{this.state.formError}</div> : ""}
											<InterestForm onSubmitted={this._hasSubmittedInterestForm.bind(this)} />
									</div>
								</div> :
								<span className={base.mb5}>
									<CheckIcon />Thanks for your feedback!
								</span>
								}
							</div>

							{this.props.supportedTool.secondaryButton}
							{this.props.supportedTool.gif && <div styleName="tool-gif-container">
								<img styleName="tool-gif" src={`${this.context.siteConfig.assetsRoot}${this.props.supportedTool.gif}`}></img>
							</div>}
						</Panel>
					</div>
			</Modal>
		);
	}
}

export default CSSModules(ToolComponent, styles, {allowMultiple: true});
