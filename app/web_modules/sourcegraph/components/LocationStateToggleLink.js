import React from "react";

// Copied from react-router Link.js.
function isLeftClickEvent(ev) { return ev.button === 0; }
function isModifiedEvent(ev) { return Boolean(ev.metaKey || ev.altKey || ev.ctrlKey || ev.shiftKey); }

// LocationStateToggleLink is like react-router's <Link>, but instead of going
// to a new URL, it merely toggles a boolean field on the location's state.
//
// It can be used for showing modals, whose on/off state should not be
// reflected in the URL. Something else will have to read the location state
// to determine whether to show it.
export default function LocationStateToggleLink(props, {router}) {
	const {location, children, modalName, noop, ...other} = props;
	const active = location.state && location.state.modal === modalName;

	// Copied from react-router Link.js.
	const handleClick = (ev) => {
		if (isModifiedEvent(ev) || !isLeftClickEvent(ev)) return;

		// If target prop is set (e.g., to "_blank"), let browser handle link.
		if (props.target) return;

		ev.preventDefault();

		if (noop) return;

		router.push({...location, state: {...location.state, modal: active ? null : modalName}});

		if (props.onToggle) props.onToggle(!active);
	};

	return (
		<a {...other} // eslint-disable-line no-undef
			href={props.href}
			onClick={handleClick}>
			{children}
		</a>
	);
}
LocationStateToggleLink.propTypes = {
	location: React.PropTypes.object.isRequired,

	// modalName is the name of the modal (location.state.modal value) that this
	// LocationStateToggleLink component toggles.
	modalName: React.PropTypes.string.isRequired,

	// href is the URL used if the user opens the link in
	// a new tab or copies the link.
	href: React.PropTypes.string,

	// onToggle is called when the link is toggled ON.
	onToggle: React.PropTypes.func,

	// noop, if true, causes clicks to have no effect. It is useful when the link toggles
	// a modal, but you don't want the modal to be shown on the same page that contains
	// the same UI (e.g., not showing the search modal on the search page).
	noop: React.PropTypes.bool,
};
LocationStateToggleLink.contextTypes = {
	router: React.PropTypes.object.isRequired,
};
