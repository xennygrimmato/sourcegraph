import React from "react";
import fuzzysearch from "fuzzysearch";
import Dispatcher from "sourcegraph/Dispatcher";
import debounce from "lodash/function/debounce";
import "sourcegraph/repo/RepoBackend";
import * as RepoActions from "sourcegraph/repo/RepoActions";
import * as TreeActions from "sourcegraph/tree/TreeActions";
import Component from "sourcegraph/Component";
import {Link} from "react-router";
import styles from "./styles/RevSwitcher.css";

import {TriangleDownIcon, CheckIcon} from "sourcegraph/components/Icons";
import {Input, Menu, Heading} from "sourcegraph/components";
import CSSModules from "react-css-modules";
import {urlWithRev} from "sourcegraph/repo/routes";

class RevSwitcher extends Component {
	static propTypes = {
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string,
		commitID: React.PropTypes.string.isRequired,
		repoObj: React.PropTypes.object,
		isCloning: React.PropTypes.bool.isRequired,

		// branches is RepoStore.branches.
		branches: React.PropTypes.object.isRequired,

		// tags is RepoStore.tags.
		tags: React.PropTypes.object.isRequired,

		// srclibDataVersions is TreeStore.srclibDataVersions.
		srclibDataVersions: React.PropTypes.object.isRequired,

		// to construct URLs
		routes: React.PropTypes.array.isRequired,
		routeParams: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		router: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this.state = {
			open: false,
		};
		this._closeDropdown = this._closeDropdown.bind(this);
		this._onToggleDropdown = this._onToggleDropdown.bind(this);
		this._onChangeQuery = this._onChangeQuery.bind(this);
		this._onClickOutside = this._onClickOutside.bind(this);
		this._onKeydown = this._onKeydown.bind(this);
		this._debouncedSetQuery = debounce((query) => {
			this.setState({query: query});
		}, 150, {leading: true, trailing: true});
	}

	componentDidMount() {
		if (super.componentDidMount) super.componentDidMount();
		if (typeof document !== "undefined") {
			document.addEventListener("click", this._onClickOutside);
			document.addEventListener("keydown", this._onKeydown);
		}
	}

	componentWillUnmount() {
		if (super.componentWillUnmount) super.componentWillUnmount();
		if (typeof document !== "undefined") {
			document.removeEventListener("click", this._onClickOutside);
			document.removeEventListener("keydown", this._onKeydown);
		}
	}

	reconcileState(state, props) {
		Object.assign(state, props);

		state.srclibDataVersion = state.srclibDataVersions ? state.srclibDataVersions.get(state.repo, state.commitID) : null;

		// effectiveRev is the rev from the URL, or else the repo's default branch.
		state.effectiveRev = state.rev || (state.repoObj && !state.repoObj.Error ? state.repoObj.DefaultBranch : null);
	}

	onStateTransition(prevState, nextState) {
		const becameOpen = nextState.open && nextState.open !== prevState.open;
		if (becameOpen || nextState.repo !== prevState.repo) {
			// Don't load when page loads until we become open.
			const initialLoad = !prevState.repo && !nextState.open;
			if (!initialLoad || nextState.prefetch) {
				Dispatcher.Backends.dispatch(new RepoActions.WantBranches(nextState.repo));
				Dispatcher.Backends.dispatch(new RepoActions.WantTags(nextState.repo));
				Dispatcher.Backends.dispatch(new TreeActions.WantSrclibDataVersion(nextState.repo, nextState.commitID, null));
			}
		}
	}

	_loadingItem(what) {
		return <li role="presentation" styleName="disabled">Loading {what}&hellip;</li>;
	}

	_errorItem(what) {
		return <li role="presentation" styleName="disabled">Error</li>;
	}

	_emptyItem(what) {
		return <li role="presentation" styleName="disabled">None found</li>;
	}

	_item(name, commitID) {
		let isCurrent = name === this.state.effectiveRev;

		const unindexed = this.state.srclibDataVersion && !this.state.srclibDataVersion.CommitID;
		const commitsBehind = this.state.srclibDataVersion && !this.state.srclibDataVersion.Error ? this.state.srclibDataVersion.CommitsBehind : 0;

		return (
			<div key={`r${name}.${commitID}`} role="menu-item">
				<Link to={this._revSwitcherURL(name)} title={commitID}
					onClick={this._closeDropdown}>
					<CheckIcon styleName={isCurrent ? "icon" : "icon-hidden"} /> {name && <span>{abbrevRev(name)}</span>}
					{isCurrent && commitsBehind ? <span styleName="detail">{commitsBehind} commit{commitsBehind !== 1 && "s"} ahead of index</span> : null}
					{isCurrent && unindexed ? <span styleName="detail">not indexed</span> : null}
				</Link>
			</div>
		);
	}

	_closeDropdown(ev) {
		// HACK: If the user clicks to a rev that they have already loaded all
		// of the data for, the transition occurs synchronously and the dropdown
		// does not close for some reason. Bypassing this.setState and setting it
		// directly fixes this issue.
		this.state.open = false; // eslint-disable-line react/no-direct-mutation-state
		this.setState({open: false});
	}

	// If path is not present, it means this is the rev switcher on commits page.
	_revSwitcherURL(rev) {
		return `${urlWithRev(this.state.routes, this.state.routeParams, rev)}${window.location.hash}`;
	}

	_onToggleDropdown(ev) {
		ev.preventDefault();
		ev.stopPropagation();
		this.setState({open: !this.state.open}, () => {
			if (this.state.open && this._input) this._input.focus();
		});
	}

	_onChangeQuery(ev) {
		if (this._input) this._debouncedSetQuery(this._input.value);
	}

	// _onClickOutside causes clicks outside the menu to close the menu.
	_onClickOutside(ev) {
		if (!this.state.open) return;
		if (this._wrapper && !this._wrapper.contains(ev.target)) this.setState({open: false});
	}

	// _onKeydown causes ESC to close the menu.
	_onKeydown(ev) {
		if (ev.defaultPrevented) {
			return;
		}

		// Don't trigger if there's a modifier key or if the cursor is focused
		// in an input field.
		const tag = ev.target.tagName;
		if (!(ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) && typeof document !== "undefined" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
			// Global hotkeys.
			let handled = false;
			if (ev.keyCode === 89 /* y */) {
				// Make the URL absolute by adding the absolute 40-char commit ID
				// as the rev.
				if (this.state.commitID) {
					handled = true;
					this.context.router.push(this._revSwitcherURL(this.state.commitID));
				}
			} else if (ev.keyCode === 85 /* u */) {
				// Remove the rev from the URL entirely.
				handled = true;
				this.context.router.push(this._revSwitcherURL(null));
			} else if (ev.keyCode === 73 /* i */) {
				// Set the rev to be the repository's default branch.
				if (this.state.repoObj.DefaultBranch) {
					handled = true;
					this.context.router.push(this._revSwitcherURL(this.state.repoObj.DefaultBranch));
				}
			}
			if (handled) {
				ev.preventDefault();
				ev.stopPropagation();
				return;
			}
		}

		if (!this.state.open) return;
		if (ev.keyCode === 27 /* ESC */) {
			this.setState({open: false});
		}
	}

	render() {
		// Hide if cloning the repo, since we require the user to hard-reload. Seeing
		// the RevSwitcher would confuse them.
		if (this.state.isCloning) return null;

		let branches = this.state.branches.list(this.state.repo);
		if (this.state.branches.error(this.state.repo)) {
			branches = this._errorItem("branches");
		} else if (!branches) {
			branches = this._loadingItem("branches");
		} else if (this.state.query) {
			branches = branches.filter((b) => fuzzysearch(this.state.query, b.Name));
		}
		if (branches.length === 0) {
			branches = this._emptyItem("branches");
		}

		let tags = this.state.tags.list(this.state.repo);
		if (this.state.tags.error(this.state.repo)) {
			tags = this._errorItem("tags");
		} else if (!tags) {
			tags = this._loadingItem("tags");
		} else if (this.state.query) {
			tags = tags.filter((t) => fuzzysearch(this.state.query, t.Name));
		}
		if (tags.length === 0) {
			tags = this._emptyItem("tags");
		}

		let currentItem;
		if (branches instanceof Array) {
			branches.forEach((b) => {
				if (b.Name === this.state.effectiveRev) currentItem = b;
			});
		}
		if (tags instanceof Array) {
			tags.forEach((t) => {
				if (t.Name === this.state.effectiveRev) currentItem = t;
			});
		}

		if (branches instanceof Array) branches = branches.map((b) => this._item(b.Name, b.Head));
		if (tags instanceof Array) tags = tags.map((t) => this._item(t.Name, t.CommitID));

		let title;
		if (this.state.rev) title = `Viewing revision: ${abbrevRev(this.state.rev)}`;
		else if (this.state.srclibDataVersion && this.state.srclibDataVersion.CommitID) title = `Viewing last-built revision on default branch: ${this.state.commitID ? abbrevRev(this.state.commitID) : ""}`;
		else title = `Viewing revision: ${abbrevRev(this.state.commitID)} (not indexed)`;

		return (
			<div styleName="wrapper"
				ref={(e) => this._wrapper = e}>
				<span styleName="toggle"
					title={title}
					onClick={this._onToggleDropdown}>
					<TriangleDownIcon />
				</span>
				<div styleName={this.state.open ? "dropdown-menu open" : "dropdown-menu closed"}>
					<Menu>
						<div>
							<Input block={true}
								domRef={(e) => this._input = e}
								type="text"
								styleName="input"
								placeholder="Find branch or tag"
								onChange={this._onChangeQuery}/>
						</div>
						{this.state.rev && !currentItem && !this.state.query && this._item(this.state.rev, this.state.commitID)}
						<Heading level="5">Branches</Heading>
						{branches}
						<Heading level="5">Tags</Heading>
						{tags}
					</Menu>
				</div>
			</div>
		);
	}
}

// abbrevRev shortens rev if it is an absolute commit ID.
function abbrevRev(rev) {
	if (rev.length === 40) return rev.substring(0, 12);
	return rev;
}

export default CSSModules(RevSwitcher, styles, {allowMultiple: true});
