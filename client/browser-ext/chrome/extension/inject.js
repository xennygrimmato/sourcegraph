import React from "react";
import {render} from "react-dom";
import {Provider} from "react-redux";

import EventLogger from "../../app/analytics/EventLogger";
import * as Actions from "../../app/actions";

import Background from "../../app/components/Background";
import SearchFrame from "../../app/components/SearchFrame";
import SettingsFrame from "../../app/components/SettingsFrame";
import {SearchIcon} from "../../app/components/Icons";
import BlobAnnotator from "../../app/components/BlobAnnotator";
import createStore from "../../app/store/configureStore";

import {parseURL, isGitHubURL} from "../../app/utils";

let isSearchAppShown = false; // global state indicating whether the search app is visible
let store = createStore({});

function getSearchFrame() {
	return document.getElementById("sourcegraph-search-frame");
}

function createSearchFrame() {
	let searchFrame = getSearchFrame();
	if (!searchFrame) {
		searchFrame = document.createElement("div");
		searchFrame.id = "sourcegraph-search-frame";
		injectComponent(<SearchFrame />, searchFrame);
	}
	return searchFrame;
}

function toggleSearchFrame() {
	EventLogger.logEvent("ToggleSearchInput", {visibility: isSearchAppShown ? "hidden" : "visible"});
	function focusInput() {
		const el = document.querySelector(".sg-input");
		if (el) setTimeout(() => el.focus()); // Auto focus input, with slight delay so 'T' doesn't appear
	}

	let frame = getSearchFrame();
	if (!frame) {
		// Lazy application bootstrap; add app frame to DOM the first time toggle is called.
		frame = createSearchFrame();
		document.querySelector(".repository-content").style.display = "none";
		document.querySelector(".container.new-discussion-timeline").appendChild(frame);
		frame.style.display = "block";
		isSearchAppShown = true;
		focusInput();
	} else if (isSearchAppShown) {
		// Toggle visibility off.
		hideSearchFrame();
	} else {
		// Toggle visiblity on.
		document.querySelector(".repository-content").style.display = "none";
		if (frame) frame.style.display = "block";
		isSearchAppShown = true;
		focusInput();
	}
};

function hideSearchFrame() {
	const el = document.querySelector(".repository-content");
	if (el) el.style.display = "block";
	const frame = getSearchFrame();
	if (frame) frame.style.display = "none";
	isSearchAppShown = false;
}

function injectSearchApp() {
	if (!isGitHubURL()) return;

	let pagehead = document.querySelector("ul.pagehead-actions");
	if (pagehead && !pagehead.querySelector("#sourcegraph-search-button")) {
		let button = document.createElement("li");
		button.id = "sourcegraph-search-button";
		render(
			// this button inherits styles from GitHub
			<button className="btn btn-sm minibutton tooltipped tooltipped-s"
				aria-label="Keyboard shortcut: shift-T"
				onClick={toggleSearchFrame}>
				<SearchIcon /><span style={{paddingLeft: "5px"}}>Search code</span>
			</button>, button
		);
		pagehead.insertBefore(button, pagehead.firstChild);

		document.addEventListener("keydown", (e) => {
			if (e.which === 84 &&
				e.shiftKey && (e.target.tagName.toLowerCase()) !== "input" &&
				e.target.tagName.toLowerCase() !== "textarea" &&
				!isSearchAppShown) {
				toggleSearchFrame();
			} else if (e.keyCode === 27 && isSearchAppShown) {
				toggleSearchFrame();
			}
		});
	}
}

function getFileName(info, {isDelta, path}) {
	if (isDelta) {
		const userSelect = info.querySelector(".user-select-contain");
		if (userSelect) {
			return userSelect.title;
		} else if (info.title) {
			return info.title;
		} else {
			return null;
		}
	} else {
		return path;
	}
}

function injectBackgroundApp() {
	// Inject the background app on github.com AND sourcegraph.com
	if (!document.getElementById("sourcegraph-app-background")) {
		let backgroundContainer = document.createElement("div");
		backgroundContainer.id = "sourcegraph-app-background";
		backgroundContainer.style.display = "none";
		document.body.appendChild(backgroundContainer);
		injectComponent(<Background />, backgroundContainer);
	}
}



//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>


function showSourcegraphSettings() {
	let frame = getSettingsFrame();
	if (!frame) {
		frame = createSettingsFrame();
		document.querySelector(".js-selected-navigation-item.reponav-item.selected").className = "js-selected-navigation-item reponav-item";
		document.getElementById("settings").className = "js-selected-navigation-item reponav-item selected";
		document.querySelector(".repository-content").style.display = "none";
		document.querySelector(".container.new-discussion-timeline").appendChild(frame);
		frame.style.display = "block";
	}
}

function getSettingsFrame() {
	return document.getElementById("sourcegraph-settings-frame");
}

function createSettingsFrame() {
	let settingsFrame = document.createElement("div");
	settingsFrame.id = "sourcegraph-settings-frame";
	injectComponent(<SettingsFrame/>, settingsFrame);
	return settingsFrame;
}

function onHashChange() {
	if (window.location.hash == "#sourcegraph-settings") {
		showSourcegraphSettings();
	} else {
		const el = document.querySelector(".repository-content");
		if (el) el.style.display = "";
	}
}

function injectSourcegraphSettings() {
	if (!isGitHubURL()) return;

	let nav= document.querySelector(".reponav.js-repo-nav.js-sidenav-container-pjax");
	if (nav && !nav.querySelector("#sourcegraph-settings-tab")) {
		let tab = document.createElement("span");
		tab.id = "sourcegraph-settings-tab";
		render(
			// this inherits styles from GitHub
			<a href={'#sourcegraph-settings'} id="settings" className="js-selected-navigation-item reponav-item" itemProp="url">
  				<span itemProp="name">Sourcegraph</span>
  				<meta itemProp="position" content="1"></meta>
			</a>, tab
		);
		nav.insertBefore(tab, nav.lastChild);
	}
}


//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

function injectBlobAnnotator() {
	if (!isGitHubURL()) return;

	const {user, repo, rev, path, isDelta} = parseURL();
	const files = document.querySelectorAll(".file");
	for (let i = 0; i < files.length; ++i) {
		const file = files[i];
		const info = file.querySelector(".file-info");
		const blob = file.querySelector(".blob-wrapper");
		if (!blob) continue;

		const infoFilePath = getFileName(info, {isDelta, path});
		if (!infoFilePath) continue;

		if (file.dataset && file.dataset["sgAnnotator"]) continue; // prevent injecting twice
		file.dataset["sgAnnotator"] = true;

		const blobAnnotatorContainer = document.createElement("span");
		info.appendChild(blobAnnotatorContainer);
		injectComponent(<BlobAnnotator path={infoFilePath} blobElement={blob} />, blobAnnotatorContainer);
	}
}

function injectComponent(component, mountElement) {
	render(<Provider store={store}>{component}</Provider>, mountElement);
}

function injectModules() {
	injectBackgroundApp();
	injectSearchApp();
	injectBlobAnnotator();
	injectSourcegraphSettings();

	window.location = "#";

	// Add invisible div to the page to indicate injection has completed.
	if (!document.getElementById("sourcegraph-app-bootstrap")) {
		let el = document.createElement("div");
		el.id = "sourcegraph-app-bootstrap";
		el.style.display = "none";
		document.body.appendChild(el);
	}
}

window.addEventListener('hashchange', onHashChange);

window.addEventListener("load", () => {
	injectModules();
	chrome.runtime.sendMessage(null, {type: "getIdentity"}, {}, (identity) => {
		if (identity) EventLogger.updateAmplitudePropsForUser(identity);
	});
});

document.addEventListener("pjax:success", () => {
	hideSearchFrame();
	injectModules();
});

document.addEventListener("sourcegraph:identify", (ev) => {
	if (ev && ev.detail) {
		EventLogger.updateAmplitudePropsForUser(ev.detail);
		chrome.runtime.sendMessage(null, {type: "setIdentity", identity: ev.detail}, {});
	}
});
