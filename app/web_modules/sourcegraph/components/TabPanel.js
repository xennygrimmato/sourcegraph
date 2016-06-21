// @flow

import React from "react";

class TabPanel extends React.Component {
	static propTypes = {
		className: React.PropTypes.string,
		children: React.PropTypes.any,
		active: React.PropTypes.bool,
		tabPanel: React.PropTypes.bool,
	};

	static defaultProps = {
		tabPanel: true,
	};

	render() {
		const {className, children, active} = this.props;
		return (
			<div className={className} style={{display: active ? "block" : "none"}}>
				{children}
			</div>
		);
	}
}

export default TabPanel;
