import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/Tools.css";
import base from "sourcegraph/components/styles/_base.css";
import {Heading, Panel, Button} from "sourcegraph/components";
import {CloseIcon} from "sourcegraph/components/Icons";
import Modal from "sourcegraph/components/Modal";
import Selector from "./Selector";
import {TriangleRightIcon, TriangleDownIcon} from "sourcegraph/components/Icons";
import HomeBackend from "sourcegraph/home/HomeBackend";
import Dispatcher from "sourcegraph/Dispatcher";

class ToolComponent extends React.Component {

	static propTypes = {
		location: React.PropTypes.object.isRequired,
		supportedTool: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		siteConfig: React.PropTypes.object.isRequired,
		eventLogger: React.PropTypes.object.isRequired,
		router: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this.state = {
			visibility: false,
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
		this.setState({visibility: !this.state.visibility});
		console.log(this.state.visibility);
	}
	_getVisibility() {
		return this.state.visibility;
	}
	_sendForm(ev) {
		this.setState({submitted: true});
		let data = {
			email: ev.currentTarget[0]['value'],
			editor: ev.currentTarget[1]['value'],
			lanuage: ev.currentTarget[2]['value'],
		};
		Dispatcher.Backends.dispatch(new HomeBackend.FormSignup("form_id", data));
	}

	render() {
		// flex-container ${this._getVisibility() ? "visible" : "invisible"}
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
								<div>{this._getVisibility()?<TriangleDownIcon />:<TriangleRightIcon />}<a onClick={() => this._toggleView()}>Don't see the editor that you use? Let us know what we should work on next!</a>
								</div>
								<div styleName={this._getVisibility() ? "visible" : "invisible"}>
								{!this.state.submitted?
									<form onSubmit={this._sendForm}>
										<div styleName="question-container">
											<span>Email</span>
											<input type="text" name="email" />
											<div>
												<span>Preferred editor:</span>
												<Selector mapping={this.editors} />
											</div>
											<div>
												<span>Programming langauge:</span>
												<Selector mapping={this.languages} />
											</div>
										</div>
									<Button>Let me know when Sourcegraph is ready for my editor!</Button>
								</form> :
								<span>Thanks for your feedback!</span>
								}
							</div>
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
