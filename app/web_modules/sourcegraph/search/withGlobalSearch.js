// @flow weak

import React from "react";
import {getRouteName} from "sourcegraph/app/routePatterns";

export const SEARCH_MODAL_NAME = "search";

// withGlobalSearch registers a global hotkey that opens the global search modal.
export default function withGlobalSearch(Component) {
	class WithGlobalSearch extends React.Component {
		static propTypes = {
			location: React.PropTypes.object.isRequired,
			routes: React.PropTypes.array.isRequired,
		};

		static contextTypes = {
			router: React.PropTypes.object.isRequired,
		};

		constructor(props) {
			super(props);
			this._onKeyDown = this._onKeyDown.bind(this);
		}

		componentDidMount() {
			if (typeof document !== "undefined") {
				document.addEventListener("keydown", this._onKeyDown);
			}
		}

		componentWillUnmount() {
			if (typeof document !== "undefined") {
				document.removeEventListener("keydown", this._onKeyDown);
			}
		}

		_onKeyDown: Function;

		_onKeyDown(ev: KeyboardEvent) {
			// Don't steal keypresses from form fields.
			if (typeof document !== "undefined") {
				const ae = document.activeElement;
				if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")) {
					return;
				}
			}

			// Don't steal ctrl-S (save), etc.
			if (ev.altKey || ev.ctrlKey || ev.metaKey) return;

			// Don't show search modal on search page itself.
			if (getRouteName(this.props.routes) === "search") {
				return;
			}

			if (ev.keyCode === 83 /* "s" key */) {
				ev.preventDefault();
				const active = this.props.location.state === SEARCH_MODAL_NAME;
				this.context.router.replace({
					...this.props.location,
					state: {...this.props.location.state, modal: active ? null : SEARCH_MODAL_NAME},
				});
			}
		}

		render() {
			return <Component {...this.props} />;
		}
	}
	return WithGlobalSearch;
}
