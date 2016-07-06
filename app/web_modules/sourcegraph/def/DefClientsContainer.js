// @flow

import React from "react";
import Container from "sourcegraph/Container";
import CSSModules from "react-css-modules";
import Dispatcher from "sourcegraph/Dispatcher";
import DefStore from "sourcegraph/def/DefStore";
import RefsContainer from "sourcegraph/def/RefsContainer";
import ClientList from "sourcegraph/def/ClientList";
import * as DefActions from "sourcegraph/def/DefActions";
import styles from "./styles/DefInfo.css";
import base from "sourcegraph/components/styles/_base.css";
import {Panel, Heading} from "sourcegraph/components";

const _undefined = undefined; // eslint-disable-line no-undefined

class DefClientsContainer extends Container {
	static propTypes = {
		repo: React.PropTypes.string,
		rev: React.PropTypes.string,
		commitID: React.PropTypes.string,
		def: React.PropTypes.string,
		defObj: React.PropTypes.object,
		className: React.PropTypes.string,
		activeClientEmail: React.PropTypes.string,
		location: React.PropTypes.object.isRequired,
	};

	stores() {
		return [DefStore];
	}

	reconcileState(state, props) {
		Object.assign(state, props);
		state.clients = state.def && state.commitID ? DefStore.clients.get(state.repo, state.commitID, state.def) : null;

		state.activeClientEmail = props.location.query ? props.location.query.client : null;
		state.activeClient = state.clients && !state.clients.Error && state.activeClientEmail ? state.clients.DefClients.filter(c => c.Email === state.activeClientEmail)[0] : null;
	}

	onStateTransition(prevState, nextState) {
		if (nextState.repo !== prevState.repo || nextState.rev !== prevState.rev || nextState.commitID !== prevState.commitID || nextState.def !== prevState.def) {
			if (nextState.repo && nextState.commitID && nextState.def) {
				Dispatcher.Backends.dispatch(new DefActions.WantClients(nextState.repo, nextState.commitID, nextState.def));
			}
		}
	}

	render() {
		return (
			<div>
				<div styleName="flex flex-center" className={base.mb2}>
					<Heading level="7" styleName="cool-mid-gray">
						Used by
					</Heading>
					{this.state.clients && !this.state.clients.Error && (
						<ClientList horizontal={true}
							clients={this.state.clients.DefClients}
							styleName="flex-grow flex-wrap clients"
							urlForClient={c => ({...this.props.location, query: {...this.props.location.query, client: c === this.state.activeClientEmail ? _undefined : c}})} />)}
				</div>
				{this.state.activeClient && <Panel
					hoverLevel="low"
					styleName="full-width-sm b--cool-pale-gray"
					className={base.ba}>
					<div className={this.props.className}>
						<RefsContainer
							repo={this.props.repo}
							rev={this.props.rev}
							commitID={this.props.commitID}
							def={this.props.def}
							defObj={this.props.defObj}
							refs={this.state.activeClient}
							initExpanded={true}
							initNumSnippets={3}
							rangeLimit={2}
							showAllFiles={true}
							prefetch={true}
							fileCollapseThreshold={5} />
					</div>
				</Panel>}
			</div>
		);
	}
}
export default CSSModules(DefClientsContainer, styles, {allowMultiple: true});
