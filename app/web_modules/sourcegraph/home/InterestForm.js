import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/InterestForm.css";
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
			submitted: false,
			formError: null,
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
		const name = ev.currentTarget[0]["value"];
		let firstName = null;
		let lastName = null;
		if (name) {
			const names = name.match(/\S+/g); //	gets rid of leading whitespaces and splits on whitespace
			if (names) {
				firstName = names[0];
				lastName = names.slice(1).join(" ");
			}
		}

		this.props.onSubmitted();
		Dispatcher.Backends.dispatch(new UserActions.SubmitEmailSubscription(
			ev.currentTarget[1]["value"].trim(),
			firstName.trim(),
			lastName.trim(),
			ev.currentTarget[3]["value"].trim(),
			ev.currentTarget[2]["value"].trim(),
			ev.currentTarget[4]["value"].trim(),
		));
	}

	render() {
		return (
			<form onSubmit={this._sendForm.bind(this)}>
				{this.state.formError && <div>{this.state.formError}</div>}
				<div styleName="container">
					<div styleName="table-row">
						<span styleName="full-input">
							<input styleName="input-field" type="text" name="firstName" placeholder="Full name*" required={true}/>
						</span>
					</div>
					<div styleName="table-row">
						<span styleName="full-input">
							<input styleName="input-field" type="text" name="emailAddress" placeholder="Email address*" required={true}/>
						</span>
					</div>
					<div styleName="table-row">
						<span styleName="full-input">
							<Selector requiredTitle="Select your preferred editor" mapping={this.editors} />
						</span>
					</div>
					<div styleName="table-row">
						<span styleName="full-input">
							<Selector requiredTitle="Select your primary language" mapping={this.languages} />
						</span>
					</div>
					<div styleName="table-row">
						<span styleName="full-input">
							<textarea styleName="input-field" name="message" placeholder="Any other features you'd like to see?"></textarea>
						</span>
					</div>
					<div styleName="table-row">
						<span styleName="full-input">
							<Button styleName="button" type="submit" color="purple">Keep me updated!</Button>
						</span>
					</div>
				</div>
			</form>
		);
	}
}

export default CSSModules(InterestForm, styles, {allowMultiple: true});
