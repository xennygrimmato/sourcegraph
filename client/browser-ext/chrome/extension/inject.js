import React from "react";
import {render} from "react-dom";
import {Provider} from "react-redux";

import EventLogger from "../../app/analytics/EventLogger";
import {useAccessToken} from "../../app/actions/xhr";
import * as Actions from "../../app/actions";

import Background from "../../app/components/Background";
import SearchFrame from "../../app/components/SearchFrame";
import {SearchIcon} from "../../app/components/Icons";
import BuildIndicator from "../../app/components/BuildIndicator";
import BlobAnnotator from "../../app/components/BlobAnnotator";
import styles from "../../app/components/App.css";
import createStore from "../../app/store/configureStore";

import {parseGitHubURL, isGitHubURL} from "../../app/utils";

let isSearchAppShown = false; // global state indicating whether the search app is visible

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
	// EventLogger.logEvent("ToggleSearchInput", {visibility: isSearchAppShown ? "hidden" : "visible"});
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

function injectBuildIndicators() {
	if (!isGitHubURL()) return;

	const {user, repo, rev, path, isDelta} = parseGitHubURL();

	const fileInfos = document.querySelectorAll(".file-info");
	for (let i = 0; i < fileInfos.length; ++i) {
		const info = fileInfos[i];
		const infoFilePath = getFileName(info, {isDelta, path});
		if (!infoFilePath) continue;

		const buildIndicatorId = `sourcegraph-build-indicator-${infoFilePath}`;
		let buildIndicatorContainer = document.getElementById(buildIndicatorId);
		if (!buildIndicatorContainer) { // prevent injecting build indicator twice
			let buildSeparator = document.createElement("span");
			buildSeparator.className = "file-info-divider";
			info.appendChild(buildSeparator);

			buildIndicatorContainer = document.createElement("span");
			buildIndicatorContainer.id = buildIndicatorId;
			info.appendChild(buildIndicatorContainer);
			injectComponent(<BuildIndicator path={infoFilePath} />, buildIndicatorContainer);
		}
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

function injectBlobAnnotator() {
	if (!isGitHubURL()) return;

	const {user, repo, rev, path, isDelta} = parseGitHubURL();
	const fileInfos = document.querySelectorAll(".file-info");
	const blobs = document.querySelectorAll(".blob-wrapper");

	for (let i = 0; i < fileInfos.length; ++i) {
		const info = fileInfos[i];
		const infoFilePath = getFileName(info, {isDelta, path});
		if (!infoFilePath) continue;

		const blobAnnotatorId = `sourcegraph-blob-annotator-${infoFilePath}`;
		let blobAnnotatorContainer = document.getElementById(blobAnnotatorId);
		if (!blobAnnotatorContainer) { // prevent injecting build indicator twice
			blobAnnotatorContainer = document.createElement("span");
			blobAnnotatorContainer.id = blobAnnotatorId;
			blobAnnotatorContainer.style.display = "none";
			info.appendChild(blobAnnotatorContainer);
			injectComponent(<BlobAnnotator path={infoFilePath} blobElement={blobs[i]} />, blobAnnotatorContainer);
		}
	}
}

function injectComponent(component, mountElement) {
	chrome.runtime.sendMessage(null, {type: "get"}, {}, (state) => {
		render(<Provider store={createStore(state)}>{component}</Provider>, mountElement);
	});
}

function injectModules() {
	injectBackgroundApp();
	injectSearchApp();
	injectBuildIndicators();
	injectBlobAnnotator();

	// Add invisible div to the page to indicate injection has completed.
	if (!document.getElementById("sourcegraph-app-bootstrap")) {
		let el = document.createElement("div");
		el.id = "sourcegraph-app-bootstrap";
		el.style.display = "none";
		document.body.appendChild(el);
	}
}

window.addEventListener("load", injectModules);
document.addEventListener("pjax:success", () => {
	hideSearchFrame();
	injectModules();
});
