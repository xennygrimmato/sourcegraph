// @flow

import React from "react";
import TreeSearch from "sourcegraph/tree/TreeSearch";
import {urlToTree} from "sourcegraph/tree/routes";
import {treeParam} from "sourcegraph/tree";
import {trimRepo} from "sourcegraph/repo";
import CSSModules from "react-css-modules";
import styles from "./styles/Tree.css";
import Helmet from "react-helmet";

import {renderTreeSearch} from "sourcegraph/jump/TreeSearch";

class TreeMain extends React.Component {
	static propTypes = {
		location: React.PropTypes.object,
		repo: React.PropTypes.string,
		rev: React.PropTypes.string,
		commitID: React.PropTypes.string,
		route: React.PropTypes.object,
		routeParams: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		router: React.PropTypes.object.isRequired,
	};

	_onSelectPath(path: string) {
		this.context.router.push(urlToTree(this.props.repo, this.props.rev, path));
	}

	_onChangeQuery(query: string) {
		this.context.router.replace({...this.props.location, query: {q: query || undefined}}); // eslint-disable-line no-undefined
	}

	render() {
		if (!this.props.commitID) return null;
		const path = treeParam(this.props.routeParams.splat);

		// TODO: update router URL

		return (
			<div styleName="tree-container">
				{/* Let RepoMain set title for the root path. */}
				{path !== "/" && <Helmet title={`${path} · ${trimRepo(this.props.repo)}`} />}
				{renderTreeSearch(this.props.repo, this.props.rev, this.props.commitID, path, true, true, this.context.router)}
			</div>
		);
	}
}

export default CSSModules(TreeMain, styles);
