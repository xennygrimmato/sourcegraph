// @flow weak

import React from "react";
import {Link} from "react-router";
import CSSModules from "react-css-modules";
import Container from "sourcegraph/Container";
import Dispatcher from "sourcegraph/Dispatcher";
import styles from "./styles/RepoHome.css";
import TreeMain from "sourcegraph/tree/TreeMain";
import SearchStore from "sourcegraph/search/SearchStore";
import "sourcegraph/search/SearchBackend";
import * as SearchActions from "sourcegraph/search/SearchActions";
import {Heading} from "sourcegraph/components";
import {qualifiedNameAndType} from "sourcegraph/def/Formatter";
import {urlToDefInfo} from "sourcegraph/def/routes";

const DEFS_DISPLAY_LIMIT = 15;
const DEFS_FETCH_LIMIT = 45; // need to fetch more due to client-side filtering (HACK)a

class RepoHome extends Container {
	static propTypes = {
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string,
		commitID: React.PropTypes.string,
		repoObj: React.PropTypes.object,
	};

	stores() { return [SearchStore]; }

	reconcileState(state, props) {
		Object.assign(state, props);

		let defs = SearchStore.results.get("", [state.repo], null, DEFS_FETCH_LIMIT);
		if (state.defs !== defs) {
			state.defs = defs;
			if (defs && defs.Defs) {
				state.matchingDefs = {
					Defs: defs.Defs.filter((d) => (
						// TODO(sqs): Hack to filter to only exported funcs/types for Go, or
						// to funcs/types for other langs (which is the best we can do). Current global
						// search does not support filtering to exported definitions only.
						(d.UnitType !== "GoPackage" || (d.Data && d.Data.Exported)) &&
						(d.Kind === "func" || d.Kind === "type" || d.Kind === "method" || d.Kind === "class" || d.Kind === "function")
					)).slice(0, DEFS_DISPLAY_LIMIT),
				};
			} else {
				state.matchingDefs = null;
			}
		}
	}

	onStateTransition(prevState, nextState) {
		if (prevState.repo !== nextState.repo || (!nextState.defs && nextState.defs !== prevState.defs)) {
			Dispatcher.Backends.dispatch(new SearchActions.WantResults("", [nextState.repo], null, DEFS_FETCH_LIMIT));
		}
	}

	render() {
		return (
			<div styleName="container">
				{this.state.repoObj && !this.state.repoObj.Error && (
					<div styleName="info">
						<Heading level="2" underline="blue">{this.state.repoObj.Name}</Heading>
						{this.state.repoObj.Description && <p styleName="description">{this.state.repoObj.Description}</p>}
						{this.state.matchingDefs && this.state.matchingDefs.Defs && this.state.matchingDefs.Defs.length > 0 && <div styleName="defs">
							<Heading level="4">Frequently used</Heading>
							<ul styleName="defs-list">
								{this.state.matchingDefs.Defs.map((def, i) => (
									<li key={i}>
										<Link to={urlToDefInfo(def, this.state.rev)} styleName="def">
											{qualifiedNameAndType(def)}
										</Link>
									</li>
								))}
							</ul>
						</div>}
					</div>
				)}
				<TreeMain {...this.props} />
			</div>
		);
	}
}

export default CSSModules(RepoHome, styles);
