// @flow weak

import React from "react";
import Helmet from "react-helmet";

import Container from "sourcegraph/Container";
import type {Def} from "sourcegraph/def";
import Dispatcher from "sourcegraph/Dispatcher";
import Blob from "sourcegraph/blob/Blob";
import BlobExpUniverse from "sourcegraph/blob/BlobExpUniverse";
import BlobContentPlaceholder from "sourcegraph/blob/BlobContentPlaceholder";
import BlobToolbar from "sourcegraph/blob/BlobToolbar";
import FileMargin from "sourcegraph/blob/FileMargin";
import DefTooltip from "sourcegraph/def/DefTooltip";
import * as BlobActions from "sourcegraph/blob/BlobActions";
import * as DefActions from "sourcegraph/def/DefActions";
import {routeParams as defRouteParams} from "sourcegraph/def";
import DefStore from "sourcegraph/def/DefStore";
import "sourcegraph/blob/BlobBackend";
import "sourcegraph/def/DefBackend";
import "sourcegraph/build/BuildBackend";
import Style from "sourcegraph/blob/styles/Blob.css";
import {lineCol, lineRange, parseLineRange} from "sourcegraph/blob/lineCol";
import urlTo from "sourcegraph/util/urlTo";
import {urlToSearch} from "sourcegraph/search/routes";
import {urlToDef} from "sourcegraph/def/routes";
import {makeRepoRev, trimRepo} from "sourcegraph/repo";
import httpStatusCode from "sourcegraph/util/httpStatusCode";
import Header from "sourcegraph/components/Header";
import {createLineFromByteFunc} from "sourcegraph/blob/lineFromByte";
import {isExternalLink} from "sourcegraph/util/externalLink";
import {defTitle, defTitleOK} from "sourcegraph/def/Formatter";

export default class BlobMain extends Container {
	static propTypes = {
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string,
		commitID: React.PropTypes.string,
		path: React.PropTypes.string,
		blob: React.PropTypes.object,
		anns: React.PropTypes.object,
		skipAnns: React.PropTypes.bool,
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
		features: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this.state = {
			selectionStartLine: null,
		};

	}

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
		state.repo = props.repo;
		state.rev = props.rev || null;
		state.commitID = props.commitID || null;
		state.path = props.path || null;
		state.blob = props.blob || null;
		state.anns = props.anns || null;
		state.skipAnns = props.skipAnns || false;
		state.startLine = props.startLine || null;
		state.startCol = props.startCol || null;
		state.startByte = props.startByte || null;
		state.endLine = props.endLine || null;
		state.endCol = props.endCol || null;
		state.endByte = props.endByte || null;
		state.def = props.def || null;
		state.defObj = state.def && state.commitID ? DefStore.defs.get(state.repo, state.commitID, state.def) : null;
		state.children = props.children || null;
		if (!state.fuzzyDefs) state.fuzzyDefs = null;

		// Def-specific
		state.highlightedDef = DefStore.highlightedDef;
		if (state.highlightedDef && !isExternalLink(state.highlightedDef)) {
			let {repo, rev, def} = defRouteParams(state.highlightedDef);
			state.highlightedDefObj = DefStore.defs.get(repo, rev, def);
		} else {
			state.highlightedDefObj = null;
		}
	}

	onStateTransition(prevState, nextState) {
		if (nextState.fuzzyDefs && nextState.fuzzyDefs.length > 0) {
			let topDefNameMatch = false;
			let topDef = nextState.fuzzyDefs[0];
			if (nextState.fuzzyDefQuery.name === topDef.Name) {
				topDefNameMatch = true;
			}
			let otherNameMatch = false;
			for (let i = 1; i < nextState.fuzzyDefs.length; i++) {
				let def = nextState.fuzzyDefs[i];
				if (nextState.fuzzyDefQuery.name === def.Name) {
					otherNameMatch = true;
					break;
				}
			}

			if (topDefNameMatch && !otherNameMatch) {
				nextState.fuzzyDefs = null;
				nextState.fuzzyDefQuery= null;
				this._navigateToDef(topDef);
			} else {
				this._navigateToSearch("", "", "", nextState.fuzzyDefQuery.token);
			}
		}

		if (nextState.highlightedDef && prevState.highlightedDef !== nextState.highlightedDef) {
			if (!isExternalLink(nextState.highlightedDef)) { // kludge to filter out external def links
				let {repo, rev, def, err} = defRouteParams(nextState.highlightedDef);
				if (err) {
					console.err(err);
				} else {
					Dispatcher.Backends.dispatch(new DefActions.WantDef(repo, rev, def));
				}
			}
		}

		if (prevState.blob !== nextState.blob) {
			nextState.lineFromByte = nextState.blob && typeof nextState.blob.ContentsString !== "undefined" ? createLineFromByteFunc(nextState.blob.ContentsString) : null;
		}
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
		} else if (action instanceof DefActions.FuzzyDefsFetched) {
			let fd = DefStore.fuzzyDefs.get(action.p.q);
			this.setState({
				fuzzyDefs: fd,
				fuzzyDefQuery: action.p.q,
			});
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

	_navigateToSearch(repo: string, commitID: string, file: string, query: string) {
		this.context.router.push(urlToSearch(query));
	}

	_navigateToDef(def: Def) {
		this.context.router.push(urlToDef(def));
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

		const BlobComponent = this.context.features.ExpUniverse ? BlobExpUniverse : Blob;

		return (
			<div className={Style.container}>
				{title && <Helmet title={title} />}
				<div className={Style.blobAndToolbar}>
					<BlobToolbar
						repo={this.state.repo}
						rev={this.state.rev}
						commitID={this.state.commitID}
						path={this.state.path} />
					{(!this.state.blob || (this.state.blob && !this.state.blob.Error && !this.state.skipAnns && !this.state.anns)) && !this.context.features.ExpUniverse && <BlobContentPlaceholder />}
					{this.state.blob && !this.state.blob.Error && typeof this.state.blob.ContentsString !== "undefined" && (this.state.skipAnns || (this.state.anns && !this.state.anns.Error)) &&
					<BlobComponent
						repo={this.state.repo}
						rev={this.state.rev}
						commitID={this.state.commitID}
						ref={(c) => { this.setState({selectionStartLine: (c && c.refs && c.refs.startLineComponent) ? c.refs.startLineComponent : null}); }}
						path={this.state.path}
						contents={this.state.blob.ContentsString}
						annotations={this.state.anns}
						skipAnns={this.state.skipAnns}
						lineNumbers={true}
						highlightSelectedLines={true}
						highlightedDef={this.state.highlightedDef}
						highlightedDefObj={this.state.highlightedDefObj}
						activeDef={this.state.def}
						startLine={this.state.startLine}
						startCol={this.state.startCol}
						startByte={this.state.startByte}
						endLine={this.state.endLine}
						endCol={this.state.endCol}
						endByte={this.state.endByte}
						scrollToStartLine={true}
						dispatchSelections={true} />}
					{this.state.highlightedDefObj && !this.state.highlightedDefObj.Error && <DefTooltip currentRepo={this.state.repo} def={this.state.highlightedDefObj} />}
				</div>
				<FileMargin
					className={Style.margin}
					style={(!this.state.blob || !this.state.anns) ? {visibility: "hidden"} : null}
					lineFromByte={this.state.lineFromByte}
					selectionStartLine={this.state.selectionStartLine ? this.state.selectionStartLine : null}
					startByte={this.state.startByte}>
					{this.state.children}
				</FileMargin>
			</div>
		);
	}
}
