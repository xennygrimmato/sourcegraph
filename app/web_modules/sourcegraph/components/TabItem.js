// @flow

import React from "react";
import Icon from "./Icon";
import CSSModules from "react-css-modules";
import styles from "sourcegraph/components/styles/tabItem.css";

class TabItem extends React.Component {
	static propTypes = {
		className: React.PropTypes.string,
		children: React.PropTypes.any,
		hideMobile: React.PropTypes.bool,
		active: React.PropTypes.bool,
		color: React.PropTypes.string, // blue, purple
		size: React.PropTypes.string, // small, large
		icon: React.PropTypes.oneOfType([React.PropTypes.string, React.PropTypes.element]),
		direction: React.PropTypes.string,
		tabItem: React.PropTypes.bool,
	};

	static defaultProps = {
		active: false,
		color: "blue",
		direction: "horizontal",
		tabItem: true,
	};

	render() {
		const {size, children, hideMobile, active, color, icon, direction} = this.props;
		return (
			<span
				styleName={`${size ? size : ""} ${hideMobile ? "hidden-s" : ""} ${active ? "active" : "inactive"} ${color} ${direction}`}>
				{icon && typeof icon === "string" && <Icon icon={`${icon}-blue`} height="14px" width="auto" styleName={`icon ${!active ? "hide" : ""}`}/>}
				{icon && typeof icon === "string" && <Icon icon={`${icon}-gray`} height="14px" width="auto" styleName={`icon ${active ? "hide" : ""}`}/>}
				{icon && typeof icon !== "string" && React.cloneElement(icon, {styleName: active ? `component-icon active ${color}` : "component-icon inactive"})}
				{children}
			</span>
		);
	}
}

export default CSSModules(TabItem, styles, {allowMultiple: true});
