// @flow

import React from "react";
import ReactDOM from "react-dom";
import {Link} from "react-router";
import {browserHistory} from "react-router";
import {rel} from "sourcegraph/app/routePatterns";
import Container from "sourcegraph/Container";
import Dispatcher from "sourcegraph/Dispatcher";
import debounce from "lodash/function/debounce";
import trimLeft from "lodash/string/trimLeft";
import {Input, Icon} from "sourcegraph/components";
import {FileIcon, FolderIcon} from "sourcegraph/components/Icons";
import * as AnalyticsConstants from "sourcegraph/util/constants/AnalyticsConstants";

import CSSModules from "react-css-modules";
import base from "sourcegraph/components/styles/_base.css";
import styles from "./styles/JumpTable.css";


export type Row = {
	id: string;

	// Generic row fields (only used if def and repo unset)
	icon?: any;
	title?: string;
	body?: string;
	url: string;

	def?: {
		Repo: string,
		QualifiedNameAndType: string,
		DefURL: string,
		Docstring: string,
	};
	repo?: {
		URI: string,
		Description: string,
	};
	file?: {
		isParentDirectory: bool;
		isDirectory: bool;
		name: string;
		URL: string;
	};
}

export type Section = {
	id: string;
	header: string;
	rows: Array<Row>;
}

type JumpTableProps = {
	// context is a string representation of external state that will affect the
	// output of fetch or getResults. If context changes, then fetch will be
	// called.
	context: string;

	initialQuery: string;
	placeholder: string;
	stores: Array<Object>;
	fetch: (query: string) => void;
	onSelect: (section: Section, row: Row) => void;
	onChangeQuery: (query: string) => void;
	getResults: (query: string) => Array<Section>;
}

type JumpTableState = {
	query: string;
	sections: Array<Section>;
	selection: { i: number, j: number },
	focused: bool,
}

// JumpTable is a generic component that enables the following chain of user actions:
//  1. User issues query.
//  2. Display table of results.
//  3. User highlights results with arrow keys or mouse.
//  4. User selects a result (e.g., hits "enter").
//
// JumpTable can be used to implement search views and action bars (a la the Emacs minibuffer or Gnome Do).
class JumpTable extends Container {
	static propTypes = {
		placeholder: React.PropTypes.string.isRequired,
		stores: React.PropTypes.array.isRequired,
		fetch: React.PropTypes.func.isRequired,
		sections: React.PropTypes.array,
	};

	props: JumpTableProps;
	state: JumpTableState;

	static contextTypes = {
		router: React.PropTypes.object.isRequired,
		user: React.PropTypes.object,
	};

	constructor(props: JumpTableProps) {
		super(props);
		this.state = {
			query: props.initialQuery,
			focused: true,
			selection: { i: 0, j: 0},
			sections: this.props.getResults(this.state.query),
		};

		this._handleKeyDown = this._handleKeyDown.bind(this);
		this._selectItem = this._selectItem.bind(this);
		this._handleInput = this._handleInput.bind(this);
		this._setSelectedItem = this._setSelectedItem.bind(this);
		this._selectItem = this._selectItem.bind(this);
		this._mouseSelectItem = this._mouseSelectItem.bind(this);

		this._onChangeQuery = this._onChangeQuery.bind(this);
		this._debouncedSetQuery = debounce((query) => {
			if (query !== this.state.query) {
				this._onChangeQuery(query);
			}
		}, 200, {leading: false, trailing: true});
	}

	_dispatcherToken: string;

	componentDidMount() {
		super.componentDidMount();
		if (global.document) {
			document.addEventListener("keydown", this._handleKeyDown);
		}
		this._dispatcherToken = Dispatcher.Stores.register(this.__onDispatch.bind(this));
		this.props.fetch(this.state.query);
	}

	componentWillUnmount() {
		super.componentWillUnmount();
		if (global.document) {
			document.removeEventListener("keydown", this._handleKeyDown);
		}
		Dispatcher.Stores.unregister(this._dispatcherToken);
	}

	componentWillReceiveProps(nextProps) {
		if (nextProps.context !== this.props.context) {
			this.setState({sections: nextProps.getResults(this.state.query)});
		}
	}

	stores(): Array<Object> { return this.props.stores; }

	reconcileState(state: JumpTableState, props: JumpTableProps): void {}

	onStateTransition(prevState: JumpTableState, nextState: JumpTableState) {
		if (prevState.query !== nextState.query) {
			nextState.sections = this.props.getResults(nextState.query);
			this.props.onChangeQuery(nextState.query);
			this.props.fetch(nextState.query);
		}
	}

	__onDispatch(action) {
		this.setState({sections: this.props.getResults(this.state.query)});
	}

	_navigateTo(url: string) {
	}

	_numRows(): number {
		let n = 0;
		for (let i = 0; i < this.state.sections.length; i++) {
			n += this.state.sections[i].rows.length;
		}
		return n;
	}

	// _temporarilyIgnoreMouseSelection is used to ignore mouse selections. See
	// _mouseSelectItem.
	_temporarilyIgnoreMouseSelection() {
		if (!this._debouncedUnignoreMouseSelection) {
			this._debouncedUnignoreMouseSelection = debounce(() => {
				this._ignoreMouseSelection = false;
			}, 200, {leading: false, trailing: true});
		}
		this._debouncedUnignoreMouseSelection();
		this._ignoreMouseSelection = true;
	}

	_handleKeyDown(e: KeyboardEvent) {
		if (!this.state.focused) return;

		let max = this._numRows();
		let newSel;
		let {i, j} = this.state.selection;
		switch (e.keyCode) {
		case 40: { // ArrowDown
			j++;
			if (j >= this.state.sections[i].rows.length) {
				i++;
				if (i >= this.state.sections.length) { // do nothing
					return;
				}
				j = 0;
			}
			this._temporarilyIgnoreMouseSelection();
			e.preventDefault();

			newSel = { i: i, j: j };
			break;
		}
		case 38: { // ArrowUp
			j--;
			if (j < 0) {
				i--;
				if (i < 0) { // do nothing
					return;
				}
				j = this.state.sections[i].rows.length - 1;
			}
			this._temporarilyIgnoreMouseSelection();
			e.preventDefault();

			if (i < 0) {
				// do nothing
				return;
			}

			newSel = { i: i, j: j };
			break;
		}
		case 13: { // Enter
			this._onSelection(i, j);
			this._temporarilyIgnoreMouseSelection();
			e.preventDefault();
			return;
		}
		default: {
			// Changes to the input value are handled by _handleInput.
			return;
		}
		}

		this.setState({ selection: newSel }, this._scrollToVisibleSelection);
	}

	_handleInput(e: KeyboardEvent) {
		if (this.state.focused) {
			this._debouncedSetQuery(this._queryInput ? this._queryInput.value : "");
		}
	}

	_count(): number {
		let count = 0;
		for (let i = 0; i < this.state.sections.length; i++) {
			count += this.state.sections[i].rows.length;
		}
		return count;
	}

	_sectionCount(i: number): number {
		return this.state.sections[i].rows.length;
	}

	_onChangeQuery(query: string) {
		this.setState({query: query, sections: this.props.getResults(query)});
	}


	/*
	 * Selection logic
	 */

	_normalizedSelectionIndex(): { section: number, item: number } {
		return { section: 0, item: 0 };
	}

	_onSelection(i: number, j: number) {
		const section = this.state.sections[i];
		const row = section.rows[j];
		this.props.onSelect(section, row);
	}

	_scrollToVisibleSelection() {
		if (this._selectedItem) ReactDOM.findDOMNode(this._selectedItem).scrollIntoView(false);
	}

	_setSelectedItem(e: any) {
		this._selectedItem = e;
	}

	_selectItem(i: number, j: number): void {
		this.setState({
			selection: { i: i, j: j },
		});
	}

	// _mouseSelectItem causes i to be selected ONLY IF the user is using the
	// mouse to select. It ignores the case where the user is using the up/down
	// keys to change the selection and the window scrolls, causing the mouse cursor
	// to incidentally hover a different element. We ignore mouse selections except
	// those where the mouse was actually moved.
	_mouseSelectItem(ev: MouseEvent, i: number, j: number): void {
		if (this._ignoreMouseSelection) {
			return;
		}
		this._selectItem(i, j);
	}

	_renderedResult(i: number, j: number, row: Row): any {
		let selected = false;
		if (this.state.selection.i === i && this.state.selection.j === j) {
			selected = true;
		}

		let id = String(i) + ":" + String(j);
		if (row.def) {
			const def = row.def;
			const firstLineDocString = firstLine(def.Docstring);
			return (
				<Link styleName={selected ? "block result-selected" : "block result"}
					onMouseOver={(ev) => this._mouseSelectItem(ev, i, j)}
					ref={selected ? this._setSelectedItem : null}
					to={def.DefURL}
					key={def.DefURL}
					onClick={() => this._onSelection(i, j)}>
					<div styleName="cool-gray flex-container" className={base.pt3}>
						<div styleName="flex-icon hidden-s">
							<Icon icon="doc-code" width="32px" />
						</div>
						<div styleName="flex" className={base.pb3}>
							<code styleName="f4 block" className={base.mb2}>
								{def.QualifiedNameAndType}
							</code>
							<p>
							from {def.Repo}
							<span styleName="cool-mid-gray">{firstLineDocString ? ` – ${firstLineDocString}` : ""}</span>
							</p>
						</div>
					</div>
				</Link>
			);
		} else if (row.repo) {
			const repo = row.repo;
			const firstLineDescription = firstLine(row.repo.Description);
			return (
				<Link styleName={selected ? "block result-selected" : "block result"}
					onMouseOver={(ev) => this._mouseSelectItem(ev, i, j)}
					ref={selected ? this._setSelectedItem : null}
					to={repo.URI}
					key={repo.URI}
					onClick={() => this._onSelection(i, j)}>
					<div styleName="cool-gray flex-container" className={base.pt3}>
						<div styleName="flex-icon hidden-s">
							<Icon icon="repository-gray" width="32px" />
						</div>
						<div styleName="flex" className={base.pb3}>
							<code styleName="f4 block" className={base.mb2}>
								Repository
								<span styleName="bold"> {repo.URI.split(/[// ]+/).pop()}</span>
							</code>
							<p>
								from {repo.URI}
								<span styleName="cool-mid-gray">{firstLineDescription ? ` – ${firstLineDescription}` : ""}</span>
							</p>
						</div>
					</div>
			</Link>
			);
		} else if (row.file) {
			let key = `f:${row.file.URL}`;
			let icon;
			if (row.file.isParentDirectory) {
				icon = null;
			} else if (row.file.isDirectory) {
				// icon = <FolderIcon styleName="icon" />;
				icon = <Icon icon="folder" width="32px" />;
			} else {
				// icon = <FileIcon styleName="icon" width="32px" />;
				icon = <Icon icon="docs" width="32px" />;
			}

			return (
				<Link styleName={`${selected ? "block result-selected" : "block result"} ${row.file.isParentDirectory ? "parent-dir" : ""}`}
					onMouseOver={(ev) => this._mouseSelectItem(ev, i, j)}
					ref={selected ? this._setSelectedItem : null}
					to={row.file.URL}
					key={key}>
					<div styleName="cool-gray flex-container" className={base.pt3}>
						<div styleName="flex-icon hidden-s">{icon}</div>
						<div styleName="flex" className={base.pb3}>
							{row.file.name}
						</div>
					</div>
				</Link>
			);
		}

		// Generic result
		return (
			<Link styleName={selected ? "block result-selected" : "block result"}
				onMouseOver={(ev) => this._mouseSelectItem(ev, i, j)}
				ref={selected ? this._setSelectedItem : null}
				to="{row.url}"
				key={id}
				onClick={() => this._onSelection(i, j)}>
				<div styleName="cool-gray flex-container" className={base.pt3}>
					<div styleName="flex-icon hidden-s"></div>
					<div styleName="flex" className={base.pb3}>
						<code styleName="f4 block" className={base.mb2}>
							<span styleName="bold"> {row.title}</span>
						</code>
						<p>{row.body}</p>
					</div>
				</div>
			</Link>
		);
	}

	_renderedResults(): Array<any> {
		let rows = [];
		for (let i = 0; i < this.state.sections.length; i++) {
			let section = this.state.sections[i];
			let sectionID = `section-${section.header}`;
			rows.push(<div styleName="section-header" key={sectionID}>{section.header}</div>);

			for (let j = 0; j < section.rows.length; j++) {
				rows.push(this._renderedResult(i, j, section.rows[j]));
			}
		}
		return rows;
	}

	render() {
		return (<div styleName="jump-table-container">
						<div styleName="jump-table-inner-container">
						<div styleName="search-input relative">
 						<Input type="text"
						block={true}
						onFocus={() => this.setState({focused: true})}
						onBlur={() => this.setState({focused: false})}
						onInput={this._handleInput}
						autoFocus={true}
						defaultValue={this.state.query}
						placeholder={this.props.placeholder}
						spellCheck={false}
						domRef={(e) => this._queryInput = e} />
						</div>
						<div>
						{this._renderedResults()}
						</div>
						</div>
						</div>);
	}
}

function firstLine(text: string): string {
	text = trimLeft(text);
	let i = text.indexOf("\n");
	if (i >= 0) {
		text = text.substr(0, i);
	}
	if (text.length > 100) {
		text = text.substr(0, 100);
	}
	return text;
}

export default CSSModules(JumpTable, styles, {allowMultiple: true});
