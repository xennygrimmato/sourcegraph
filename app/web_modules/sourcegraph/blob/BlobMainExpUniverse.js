// @flow weak

import React from "react";
import Helmet from "react-helmet";

import Dispatcher from "sourcegraph/Dispatcher";
import * as BlobActions from "sourcegraph/blob/BlobActions";
import Style from "sourcegraph/blob/styles/BlobExpUniverse.css";
import {lineCol, lineRange, parseLineRange} from "sourcegraph/blob/lineCol";
import urlTo from "sourcegraph/util/urlTo";
import {makeRepoRev, trimRepo} from "sourcegraph/repo";
import httpStatusCode from "sourcegraph/util/httpStatusCode";
import Header from "sourcegraph/components/Header";
import {defTitle, defTitleOK} from "sourcegraph/def/Formatter";
import Editor from "sourcegraph/editor/Editor";

function langFromFilename(filename: string): ?string {
	if (filename.endsWith(".go")) return "go";
	return null;
}

export default class BlobMainExpUniverse extends React.Component {
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
		if (this.props.blob && this.props.blob.Error) {
			let msg;
			switch (this.props.blob.Error.response.status) {
			case 413:
				msg = "Sorry, this file is too large to display.";
				break;
			default:
				msg = "File is not available.";
			}
			return (
				<Header
					title={`${httpStatusCode(this.props.blob.Error)}`}
					subtitle={msg} />
			);
		}

		// NOTE: Title should be kept in sync with app/internal/ui in Go.
		let title = trimRepo(this.props.repo);
		const pathParts = this.props.path ? this.props.path.split("/") : null;
		if (pathParts) title = `${pathParts[pathParts.length - 1]} · ${title}`;
		if (this.props.defObj && !this.props.defObj.Error && defTitleOK(this.props.defObj)) {
			title = `${defTitle(this.props.defObj)} · ${title}`;
		}

		return (
			<div className={Style.container}>
				{title && <Helmet title={title} />}
				{this.props.path && this.props.blob && !this.props.blob.Error && <Editor
					className={Style.editor}
					path={this.props.path}
					language={langFromFilename(this.props.path)}
					startLine={this.props.startLine}
					startCol={this.props.startCol}
					startByte={this.props.startByte}
					endLine={this.props.endLine}
					endCol={this.props.endCol}
					endByte={this.props.endByte}
					contents={this.props.blob ? this.props.blob.ContentsString : ""} />}
			</div>
		);
	}
}
