import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/Tools.css";

class Selector extends React.Component {

	static propTypes = {
		mapping: React.PropTypes.object.isRequired,
	};

	render() {
		let optionalRender = [];
		optionalRender.push(<option key="none" value="none" disabled="true"> -- select an option -- </option>);
		for (let key in this.props.mapping) {
			optionalRender.push(<option key={key} name={key}>{this.props.mapping[key]}</option>);
		}
		return (
			<select styleName="elem-width" defaultValue="none">
				{optionalRender}
			</select>
		);
	}
}

export default CSSModules(Selector, styles);
