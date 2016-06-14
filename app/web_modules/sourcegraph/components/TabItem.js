// @flow

import React from "react";
import Icon from "./Icon";
import CSSModules from "react-css-modules";
import styles from "sourcegraph/components/styles/tabItem.css";

// @TODO(chexee): Create a higher order component that iterates through and renders children. Also adds an underline

class TabItem extends React.Component {
	static propTypes = {
		className: React.PropTypes.string,
		children: React.PropTypes.any,
		hideMobile: React.PropTypes.bool,
		active: React.PropTypes.bool,
		color: React.PropTypes.string, // blue, purple
		size: React.PropTypes.string, // small, large
		icon: React.PropTypes.string,
	};

	static defaultProps = {
		active: null,
		color: "blue",
		size: null,
	};

	render() {
		const {size, children, hideMobile, active, color, icon} = this.props;
		return (
			<span
				styleName={`tab ${size ? size : ""} ${hideMobile ? "hidden-s" : ""} ${active ? "active" : "inactive"} ${color}`
			}>
				{icon && <Icon icon={`${icon}-blue`} height="14px" width="auto" styleName={`icon ${!active ? "hide" : ""}`}/>}
				{icon && <Icon icon={`${icon}-gray`} height="14px" width="auto" styleName={`icon ${active ? "hide" : ""}`}/>}
				{children}
			</span>
		);
	}
}

export default CSSModules(TabItem, styles, {allowMultiple: true});
