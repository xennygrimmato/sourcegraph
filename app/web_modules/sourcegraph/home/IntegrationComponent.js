import React from "react";
import CSSModules from "react-css-modules";
import styles from "./styles/Integrations.css";
import Component from "sourcegraph/Component";
import * as AnalyticsConstants from "sourcegraph/util/constants/AnalyticsConstants";

class IntegrationComponent extends Component {

	static propTypes = {
		small_title: React.PropTypes.string.isRequired,
		id: React.PropTypes.string.isRequired,
		image_url: React.PropTypes.string.isRequired,
		url: React.PropTypes.string.isRequired,
		analyticsConstant: React.PropTypes.string.isRequired,
		installState: React.PropTypes.string.isRequired,
	};

	static contextTypes = {
		eventLogger: React.PropTypes.object.isRequired,
	};

	constructor(props, context) {
		super(props);

	}

	reconcileState(state, props, context) {

	}

	_itemClicked() {
		this.context.eventLogger.logEventForCategory(AnalyticsConstants.CATEGORY_INTEGRATIONS, AnalyticsConstants.ACTION_CLICK, "IntegrationClicked", {page_name: this.analyticsConstant});
	}

	render() {
		let integrationStyle = "integrationContainer";
		if (this.props.installState==="installed") {
			integrationStyle = "installedIntegrationContainer";
		}
		return (
			<div id={`integration-${this.props.id}`} key={`integration-${this.props.id}`}>
				<a target="_window" href={this.props.url} onClick={this._itemClicked.bind(this)}>
					<div styleName={`${integrationStyle}`}>
						<div><img styleName="imageAsset" src={`${this.props.image_url}`} /></div>
						<div>{`${this.props.small_title}`}</div>
					</div>
				</a>
			</div>
		);
	}
}

export default CSSModules(IntegrationComponent, styles);
