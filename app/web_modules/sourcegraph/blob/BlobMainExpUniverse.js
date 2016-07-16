// @flow weak

import React from "react";
import Helmet from "react-helmet";

import Container from "sourcegraph/Container";
import Dispatcher from "sourcegraph/Dispatcher";
import Blob from "sourcegraph/blob/Blob";
import * as BlobActions from "sourcegraph/blob/BlobActions";
import * as DefActions from "sourcegraph/def/DefActions";
import {routeParams as defRouteParams} from "sourcegraph/def";
import DefStore from "sourcegraph/def/DefStore";
import "sourcegraph/blob/BlobBackend";
import "sourcegraph/def/DefBackend";
import "sourcegraph/build/BuildBackend";
import Style from "sourcegraph/blob/styles/BlobExpUniverse.css";
import {lineCol, lineRange, parseLineRange} from "sourcegraph/blob/lineCol";
import urlTo from "sourcegraph/util/urlTo";
import {makeRepoRev, trimRepo} from "sourcegraph/repo";
import httpStatusCode from "sourcegraph/util/httpStatusCode";
import Header from "sourcegraph/components/Header";
import {createLineFromByteFunc} from "sourcegraph/blob/lineFromByte";
import {isExternalLink} from "sourcegraph/util/externalLink";
import {defTitle, defTitleOK} from "sourcegraph/def/Formatter";
import Editor from "sourcegraph/editor/Editor";

function langFromFilename(filename: string): ?string {
	if (filename.endsWith(".go")) return "go";
	return null;
}

export default class BlobMainExpUniverse extends Container {
	static propTypes = {
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string,
		commitID: React.PropTypes.string,
		path: React.PropTypes.string,
		blob: React.PropTypes.object,
		startLine: React.PropTypes.number,
		startCol: React.PropTypes.number,
		startByte: React.PropTypes.number,
		endLine: React.PropTypes.number,
		endCol: React.PropTypes.number,
		endByte: React.PropTypes.number,
		location: React.PropTypes.object,

		// children are the boxes shown in the blob margin.
		children: React.PropTypes.oneOfType([
			React.PropTypes.arrayOf(React.PropTypes.element),
			React.PropTypes.element,
		]),
	};

	static contextTypes = {
		router: React.PropTypes.object.isRequired,
	};

	componentDidMount() {
		if (super.componentDidMount) super.componentDidMount();
		this._dispatcherToken = Dispatcher.Stores.register(this.__onDispatch.bind(this));
	}

	componentWillUnmount() {
		if (super.componentWillUnmount) super.componentWillUnmount();
		Dispatcher.Stores.unregister(this._dispatcherToken);
	}

	_dispatcherToken: string;

	reconcileState(state, props) {
		Object.assign(state, props);

		// TODO(sqs): i think defObj is already on props?
		//state.defObj = state.def && state.commitID ? DefStore.defs.get(state.repo, state.commitID, state.def) : null;
	}

	stores() { return [DefStore]; }

	__onDispatch(action) {
		if (action instanceof BlobActions.SelectLine) {
			this._navigate(action.repo, action.rev, action.path, action.line ? `L${action.line}` : null);
		} else if (action instanceof BlobActions.SelectLineRange) {
			let pos = this.props.location.hash ? parseLineRange(this.props.location.hash.replace(/^#L/, "")) : null;
			const startLine = Math.min(pos ? pos.startLine : action.line, action.line);
			const endLine = Math.max(pos ? (pos.endLine || pos.startLine) : action.line, action.line);
			this._navigate(action.repo, action.rev, action.path, startLine && endLine ? `L${lineRange(startLine, endLine)}` : null);
		} else if (action instanceof BlobActions.SelectCharRange) {
			let hash = action.startLine ? `L${lineRange(lineCol(action.startLine, action.startCol), action.endLine && lineCol(action.endLine, action.endCol))}` : null;
			this._navigate(action.repo, action.rev, action.path, hash);
		}
	}

	_navigate(repo, rev, path, hash) {
		let url = urlTo("blob", {splat: [makeRepoRev(repo, rev), path]});

		// Replace the URL if we're just changing the hash. If we're changing
		// more (e.g., from a def URL to a blob URL), then push.
		const replace = this.props.location.pathname === url;
		if (hash) {
			url = `${url}#${hash}`;
		}
		if (replace) this.context.router.replace(url);
		else this.context.router.push(url);
	}

	render() {
		if (this.state.blob && this.state.blob.Error) {
			let msg;
			switch (this.state.blob.Error.response.status) {
			case 413:
				msg = "Sorry, this file is too large to display.";
				break;
			default:
				msg = "File is not available.";
			}
			return (
				<Header
					title={`${httpStatusCode(this.state.blob.Error)}`}
					subtitle={msg} />
			);
		}

		// NOTE: Title should be kept in sync with app/internal/ui in Go.
		let title = trimRepo(this.state.repo);
		const pathParts = this.state.path ? this.state.path.split("/") : null;
		if (pathParts) title = `${pathParts[pathParts.length - 1]} · ${title}`;
		if (this.state.defObj && !this.state.defObj.Error && defTitleOK(this.state.defObj)) {
			title = `${defTitle(this.state.defObj)} · ${title}`;
		}

		return (
			<div className={Style.container}>
				{title && <Helmet title={title} />}
				<Editor
					className={Style.editor}
					path={this.props.path}
					language={langFromFilename(this.props.path)}
					startLine={this.state.startLine}
					startCol={this.state.startCol}
					startByte={this.state.startByte}
					endLine={this.state.endLine}
					endCol={this.state.endCol}
					endByte={this.state.endByte}
					contents={this.state.blob ? this.state.blob.ContentsString : ""} />
			</div>
		);
	}
}
