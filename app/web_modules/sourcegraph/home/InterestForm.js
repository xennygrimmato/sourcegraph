import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/Tools.css";
import {Button} from "sourcegraph/components";
import Selector from "./Selector";
import Dispatcher from "sourcegraph/Dispatcher";
import * as UserActions from "sourcegraph/user/UserActions";

class InterestForm extends React.Component {

	static propTypes = {
		onSubmitted: React.PropTypes.func.isRequired,
	}

	constructor(props) {
		super(props);
		this.state = {
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

	_sendForm(ev) {
		ev.preventDefault();
		let data = {
			firstName: ev.currentTarget[0]["value"],
			lastName: ev.currentTarget[0]["value"],
			email: ev.currentTarget[1]["value"],
			editor: ev.currentTarget[2]["value"],
			language: ev.currentTarget[3]["value"],
			message: ev.currentTarget[4]["value"],
		};

		if (!data["name"]) {
			this.setState({formError: "Please provide your name."});
		} else if (!data["email"]) {
			this.setState({formError: "Please provide your email."});
		} else if (!data["editor"] === "none") {
			this.setState({formError: "Please choose an editor."});
		} else if (!data["language"] === "none") {
			this.setState({formError: "Please choose an editor."});
		} else {
			this.setState({formError: "none"});
		}
		if (this.state.formError === "none") {
			this.props.onSubmitted();
			Dispatcher.Backends.dispatch(new UserActions.SubmitEmailSubscription(
				data.email,
				data.firstName,
				data.lastName,
				data.language,
				data.editor,
				data.message,
			));
		}
	}

	render() {
		return (
			<form onSubmit={this._sendForm.bind(this)}>
				<div styleName="question-container">
					<ul styleName="form-style">
						<li>
							<label styleName="label">Full Name:<span styleName="required">*</span></label>
							<input styleName="elem-width" type="text" name="name" placeholder="Full name" />
						</li>
						<li>
							<label styleName="label">Email:<span styleName="required">*</span></label>
							<input styleName="elem-width" type="email" name="email" placeholder="Email address" />
						</li>
						<li>
							<label styleName="label">Preferred editor:<span styleName="required">*</span></label>
							<Selector mapping={this.editors} />
						</li>
						<li>
							<label styleName="label">Primary language:<span styleName="required">*</span></label>
							<Selector mapping={this.languages} />
						</li>
						<li>
							<label styleName="label">Any other features you'd like to see?:</label>
							<textarea styleName="elem-width" name="message"></textarea>
						</li>
					</ul>
				</div>
				<Button color="purple">Let me know when Sourcegraph is available for my editor!</Button>
			</form>
		);
	}
}

export default CSSModules(InterestForm, styles, {allowMultiple: true});
