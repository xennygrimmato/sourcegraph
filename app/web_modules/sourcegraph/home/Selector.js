import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/Tools.css";

class Selector extends React.Component {

	static propTypes = {
		mapping: React.PropTypes.object.isRequired,
	};

	render() {
		let optionalRender = [];
		for (let key in this.props.mapping) {
			optionalRender.push(<option key={key} name={key}>{this.props.mapping[key]}</option>);
		}
		return (
			<select>
				{optionalRender}
			</select>
		);
	}
}

export default CSSModules(Selector, styles);
