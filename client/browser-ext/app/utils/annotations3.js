import utf8 from "utf8";
import fetch from "../actions/xhr";
import styles from "../components/App.css";
import _ from "lodash";
import EventLogger from "../analytics/EventLogger";

// addAnnotations takes json annotation data returned from the
// Sourcegraph annotations API and manipulates the DOM to add
// hover-over tooltips and links.
//
// It assumes the caller has verified that the current view
// is "ready" to be annotated (e.g. DOM elements have all been rendered)
// and that there are no overlapping annotations in the json
// returned by the Sourcegraph API.
//
// It assumes that the formatted html provided by the Sourcegraph API
// for doc tooltips is "safe" to be injected into the page.
//
// It does *not* assume that the code that is being annotated is safe
// to be executed in our script, so we take care to properly escape
// characters during the annotation loop.
export default function addAnnotations(el, anns) {
	if (document.getElementById("sourcegraph-annotation-marker")) {
		// This function is not idempotent; don't let it run twice.
		return;
	}
	console.log('hello')

	applyAnnotations(el, indexAnnotations(anns));

	// Prevent double annotation on any file by adding some hidden
	// state to the page.
	if (el) {
		const annotationMarker = document.createElement("div");
		annotationMarker.id = "sourcegraph-annotation-marker";
		annotationMarker.style.display = "none";
		el.appendChild(annotationMarker);
	}
}

function indexAnnotations(anns) {
	let annsByStartByte = {};
	let annsByEndByte = {};
	for (let i = 0; i < anns.length; i++){
		if (anns[i].URL) {
			let ann = anns[i];
			annsByStartByte[ann.StartByte] = ann;
			annsByEndByte[ann.EndByte] = ann;
		}
	}
	return {annsByStartByte, annsByEndByte};
}

// pre/post processing steps for strings
function preProcess(str) {
	return utf8.encode(_.unescape(str));
}

function postProcess(str) {
	return utf8.decode(_.escape(str));
}

function convertTextNode(node, annsByStartByte, currOffset) {
	let innerHTML = [];
	let bytesConsumed = 0;

	for (let char of preProcess(node.wholeText).split("")) {
		let matchDetails = annsByStartByte[currOffset + bytesConsumed];
		if (!matchDetails) {
			innerHTML.push(char);
			++bytesConsumed;
			continue;
		}

		const defIsOnGitHub = matchDetails.URL && matchDetails.URL.includes("github.com/");
		const url = defIsOnGitHub ? urlToDef(matchDetails.URL) : `https://sourcegraph.com${matchDetails.URL}`;

		const annLen = matchDetails.EndByte - matchDetails.StartByte;
		innerHTML.push(`<a href="${url}" ${defIsOnGitHub ? "data-sourcegraph-ref" : "target=tab"} data-src="https://sourcegraph.com${matchDetails.URL}" class=${styles.sgdef}>${nodeText.slice(byte + bytesConsumed, byte + bytesConsumed + annLen).join("")}`);
		byte += annLen;
	}

	return {result: postProcess(r.innerHTML.join("")), bytesConsumed};
}

function convertElementNode(node, annsByStartByte, currOffset) {
	let innerHTML = [];
	let bytesConsumed = 0;

	for (let node of iterable(node.childNodes)) {
		const r2 = convertNode(node, annsByStartByte, currOffset + bytesConsumed);
		innerHTML.push(r2.result);
		bytesConsumed += r2.bytesConsumed;
	}

	return {result: postProcess(innerHTML.join("")), bytesConsumed};
}

function convertNode(node, annsByStartByte, currOffset) {
	if (node.nodeType === Node.ELEMENT_NODE) {
		return convertElementNode(node, annsByStartByte, currOffset);
	} else if (node.nodeType === Node.TEXT_NODE) {
		return convertTextNode(node, annsByStartByte, currOffset);
	}
}


function iterable(elList) {
	const it = [];
	for (let i = 0; i < elList.length; ++i) {
		it.push(elList[i]);
	}
	return it;
}

function applyAnnotations(el, {annsByStartByte, annsByEndByte}) {
	const table = el.querySelector("table");

	let currOffset = 0;
	for (let i = 0; i < table.rows.length; ++i) {
		const row = table.rows[i];
		const line = row.cells[0].dataset.lineNumber;
		const codeCell = row.cells[1];

		const {result, bytesConsumed} = convertNode(codeCell, annsByStartByte, 0).result;
		coseCell.outerHTML = result;
		currOffset += bytesConsumed;
	}
	// 	// manipulate the DOM asynchronously so the page doesn't freeze while large
	// 	// code files are being annotated
	// 	setTimeout(() => {
	// 		code.innerHTML = output;
	// 		let newRows = code.childNodes
	// 		for (let n = 0; n < newRows.length; n++) {
	// 			addPopover(newRows[n]);
	// 		}
	// 	});
	// }
}

// export const defaultBranchCache = {};
// // fetchingDefaultBranchCache ensures we only make one API call per repo to get default branch.
// export const fetchingDefaultBranchCache = {};
// function cacheDefaultBranch(annURL) {
// 	// Assumes annURL has the form github.com/user/repo. If we can't fetch the default branch, we default to master.
// 	let annURLsplit = annURL.split("/");
// 	let annRepo = [annURLsplit[1], annURLsplit[2], annURLsplit[3]]
// 	let repo = annRepo.join("/");
// 	if (fetchingDefaultBranchCache[repo]) {
// 		return;
// 	}
// 	if (!defaultBranchCache[repo]) {
// 		fetchingDefaultBranchCache[repo] = true;
// 		fetch(`https://sourcegraph.com/.api/repos/${repo}`)
// 			.then((response) => {
// 				defaultBranchCache[repo] = response.ok ? response.DefaultBranch : "master";
// 				fetchingDefaultBranchCache[repo] = false;
// 			})
// 			.catch((err) => console.log("Error getting default branch"))
// 	}
// }

function urlToDef(origURL) {
	if (!origURL) return null;
	const parts = origURL.split("/-/");
	if (parts.length < 2) return null;
	const repo = parts[0]; // remove leading slash
	const def = parts.slice(1).join("/-/").replace("def/", "");
	if (repo.startsWith("/github.com/")) {
		return `https:/${repo}#sourcegraph&def=${def}`;
	}
	return `https://github.com/#sourcegraph&repo=${repo}&def=${def}`;
}

let popoverCache = {};
export const defCache = {};
function addPopover(el) {
	let activeTarget, popover;

	el.addEventListener("mouseout", (e) => {
		hidePopover();
		activeTarget = null;
	});

	el.addEventListener("mouseover", (e) => {
		let t = getTarget(e.target);
		if (!t) return;
		if (activeTarget !== t) {
			activeTarget = t;
			let url = activeTarget.dataset.src.split("https://sourcegraph.com")[1];
			url = `https://sourcegraph.com/.api/repos${url}?ComputeLineRange=true&Doc=true`;
			fetchPopoverData(url, function(html, data) {
				if (activeTarget && html) showPopover(html, e.pageX, e.pageY);
			});
		}
	});

	function getTarget(t) {
		while (t && t.tagName === "SPAN") {t = t.parentNode;}
		if (t && t.tagName === "A" && t.classList.contains(styles.sgdef)) return t;
	}

	function showPopover(html, x, y) {
		if (!popover) {
			EventLogger.logEvent("HighlightDef");
			popover = document.createElement("div");
			popover.classList.add(styles.popover);
			popover.innerHTML = html;
			positionPopover(x, y);
			document.body.appendChild(popover);
		}
	}

	function hidePopover() {
		if (popover) {
			popover.remove();
			popover = null;
		}
	}

	function positionPopover(x, y) {
		if (popover) {
			popover.style.top = (y + 15) + "px";
			popover.style.left = (x + 15) + "px";
		}
	}

	function fetchPopoverData(url, cb) {
		if (popoverCache[url]) return cb(popoverCache[url], defCache[url]);
		fetch(url)
			.then((json) => {
				defCache[url] = json;
				let html;
				if (json.Data) {
					const f = json.FmtStrings;
					const doc = json.DocHTML ? `<div>${json.DocHTML.__html}</div>` : "";
					html = `<div><div class=${styles.popoverTitle}>${f.DefKeyword || ""}${f.DefKeyword ? " " : ""}<b style="color:#4078C0">${f.Name.Unqualified}</b>${f.NameAndTypeSeparator || ""}${f.Type.ScopeQualified === f.DefKeyword ? "" : f.Type.ScopeQualified || ""}</div>${doc}<div class=${styles.popoverRepo}>${json.Repo}</div></div>`;
				}
				popoverCache[url] = html;
				cb(html, json);
			})
			.catch((err) => console.log("Error getting definition info.") && cb(null, null));
	}
}
