import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/InterestForm.css";

class Selector extends React.Component {

	static propTypes = {
		mapping: React.PropTypes.object.isRequired,
		requiredTitle: React.PropTypes.string.isRequired,
	};

	render() {
		let optionalRender = [];
		optionalRender.push(<option key="none" value="" disabled="true">{this.props.requiredTitle}</option>);
		for (let key in this.props.mapping) {
			optionalRender.push(<option key={key} name={key}>{this.props.mapping[key]}</option>);
		}
		return (
			<select styleName="input-select" required={true} defaultValue="">
				{optionalRender}
			</select>);
	}
}

export default CSSModules(Selector, styles);
