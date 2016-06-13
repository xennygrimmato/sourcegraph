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


// base is the branch we're merging into (so will have the red stuff)
// head is the new branch (so will have the green stuff)
// byteOffsetsByLine* is a {[line#]: byteOffsetStart}
export default function addAnnotationsForPullRequest(filePath, byteOffsetsByLineBase, byteOffsetsByLineHead, baseAnnsJson, headAnnsJson, blobWrapperEl) {
	if (document.getElementById(`sourcegraph-annotation-marker-${filePath}`)) {
		// This function is not idempotent; don't let it run twice.
		return;
	}

	let baseAnns = indexAnnotations(baseAnnsJson.Annotations);
	// let headAnns = indexAnnotations(headAnnsJson.Annotations);

	traverseDOM(blobWrapperEl, byteOffsetsByLineBase, baseAnns, true);
	// traverseDOM(blobWrapperEl, byteOffsetsByLineHead, headAnns, false);

	// Prevent double annotation on any file by adding some hidden
	// state to the page.
	if (blobWrapperEl) {
		const annotationMarker = document.createElement("div");
		annotationMarker.id = `sourcegraph-annotation-marker-${filePath}`;
		annotationMarker.style.display = "none";
		blobWrapperEl.appendChild(annotationMarker);
	}
}

function indexAnnotations(annotations) {
	let annsByStartByte = {};
	let annsByEndByte = {};
	for (let i = 0; i < annotations.length; i++){
		if (annotations[i].URL) {
			let ann = annotations[i];
			annsByStartByte[ann.StartByte] = ann;
			annsByEndByte[ann.EndByte] = ann;
		}
	}
	return {annsByStartByte, annsByEndByte};
}

let annotating = false; // imperative private value indicating whether annotation is in progress for a single token (def)

// traverseDOM handles the actual DOM manipulation.
function traverseDOM(el, byteOffsetsByLine, anns, isBase){
	const annsByStartByte = anns.annsByStartByte;
	const annsByEndByte = anns.annsByEndByte;

	// on the table, the first column is the base line number, second is head line number, 3rd is content
	let table = el.children[0]; // <table>
	let count = 0;

	// get output HTML for each line and replace the original <td>
	for (let i = 0; i < table.rows.length; i++){
		let output = "";
		let row = table.rows[i];

		if (row.className === "js-expandable-line") continue;

		// row is an element with 3 children
		const lineNumber = isBase ? row.cells[0].dataset.lineNumber : row.cells[1].dataset.lineNumber;

		// Code is always the third <td> element; we want to replace code.innerhtml
		// with a Sourcegraph-"linkified" version of the token, or the same token.
		// For pull requests, the first two characters on each line should be ignored
		// (is +/- or whitespace).
		let codeCell = row.cells[2];

		// childNodes contains the following array:
		// [ignorable, addCommentButton, ignorable, code(withextraleadingchars), ignorable]
		let children = codeCell.childNodes;


		let startByte = count;
		count += utf8.encode(codeCell.innerText).length; // TODO(rothfels): verify if this works for normal files (used to be .textContent)
		if (codeCell.innerText !== "\n") {
			// TODO(rothfels): suspicious, make sure this is actually necessary
			count++; // newline
		}

		const codeEl = children[3];
		let code = codeEl.innerText;

		const leadingChars = code.substring(0, 2); // keep these around and add them back later
		code = code.substring(2);

		if (leadingChars.indexOf("+") !== -1 && isBase) continue;
		if (leadingChars.indexOf("-") !== -1 && !isBase) continue;
		if (leadingChars[1] === " ") continue; // TODO(rothfels): add annotations for white sections

		console.log("getting into our lovelty method")
		addAnnotationsToCodeLine(codeEl, byteOffsetsByLine[lineNumber], annsByStartByte);


		// // manipulate the DOM asynchronously so the page doesn't freeze while large
		// // code files are being annotated
		// setTimeout(() => {
		// 	code.innerHTML = output;
		// 	let newRows = code.childNodes
		// 	for (let n = 0; n < newRows.length; n++) {
		// 		addPopover(newRows[n]);
		// 	}
		// });
	}
}

function addAnnotationsToCodeLine(codeEl, lineStartByte, annsByStartByte) {
	let innerHTML = [];
	let currentInnerHTML = codeEl.innerHTML.split("");
	let currByte = lineStartByte;

	const annotator = function(node, i) {
		if (node.nodeType === Node.TEXT_NODE) {
				const nodeText = node.wholeText; // e.g. "-  fmt."
				let currChar = 0;
				while (currChar < nodeText.length) {
					if (i === 0 && currChar === 0) {
						innerHTML.push(nodeText[currChar]);
						currChar++;
						continue;
					}

					let matchDetails = annsByStartByte[currByte];
					if (!matchDetails) {
						innerHTML.push(nodeText[currChar]);
						currChar++;
						currByte++;
						continue;
					}

					const defIsOnGitHub = matchDetails.URL && matchDetails.URL.includes("github.com/");
					const url = defIsOnGitHub ? urlToDef(matchDetails.URL) : `https://sourcegraph.com${matchDetails.URL}`;
					const annotationLength = matchDetails.EndByte - matchDetails.StartByte;
					innerHTML.push(`<a href="${url}" ${defIsOnGitHub ? "data-sourcegraph-ref" : "target=tab"} data-src="https://sourcegraph.com${matchDetails.URL}" class=${styles.sgdef}>${nodeText.substring(currChar, currChar + annotationLength)}`);

					currChar += annotationLength;
					currByte += annotationLength; // TODO(rothfels); ut8-encoding
					cacheDefaultBranch(matchDetails.URL)
				}
		} else {
			if (node.children.length === 0) { // e.g. <span class="pl-c1">Println</span>
				const nodeText = node.innerText; // e.g. "Println"
				let nodeInnerHTML = [];

				let currChar = 0;
				while (currChar < nodeText.length) {
					// Annotate node's inner text content
					let matchDetails = annsByStartByte[currByte];
					if (!matchDetails) {
						nodeInnerHTML.push(nodeText[currChar]);
						currChar++;
						currByte++;
						continue;
					}

					const defIsOnGitHub = matchDetails.URL && matchDetails.URL.includes("github.com/");
					const url = defIsOnGitHub ? urlToDef(matchDetails.URL) : `https://sourcegraph.com${matchDetails.URL}`;
					const annotationLength = matchDetails.EndByte - matchDetails.StartByte;
					nodeInnerHTML.push(`<a href="${url}" ${defIsOnGitHub ? "data-sourcegraph-ref" : "target=tab"} data-src="https://sourcegraph.com${matchDetails.URL}" class=${styles.sgdef}>${nodeText.substring(currChar, currChar + annotationLength)}`);

					currChar += annotationLength;
					currByte += annotationLength; // TODO(rothfels); ut8-encoding
					cacheDefaultBranch(matchDetails.URL);
				}
				node.innerHTML = nodeInnerHTML.join("");
				innerHTML.push(node.outerHTML);
			} else { // e.g. <span class="pl-s"><span class="pl-pds">"</span>hi<span class="pl-pds">"</span></span>
				const nodeText = node.innerText; // e.g. ""hi"", assume this is a single token
				currByte += nodeText.length;
				innerHTML.push(node.outerHTML); // TODO(rothfels): add annotations
			}
		}
	}

	codeEl.childNodes.forEach(annotator)
	codeEl.innerHTML = innerHTML.join("");
}

export const defaultBranchCache = {};
// fetchingDefaultBranchCache ensures we only make one API call per repo to get default branch.
export const fetchingDefaultBranchCache = {};
function cacheDefaultBranch(annURL) {
	// Assumes annURL has the form github.com/user/repo. If we can't fetch the default branch, we default to master.
	let annURLsplit = annURL.split("/");
	let annRepo = [annURLsplit[1], annURLsplit[2], annURLsplit[3]]
	let repo = annRepo.join("/");
	if (fetchingDefaultBranchCache[repo]) {
		return;
	}
	if (!defaultBranchCache[repo]) {
		fetchingDefaultBranchCache[repo] = true;
		fetch(`https://sourcegraph.com/.api/repos/${repo}`)
			.then((response) => {
				defaultBranchCache[repo] = response.ok ? response.DefaultBranch : "master";
				fetchingDefaultBranchCache[repo] = false;
			})
			.catch((err) => console.log("Error getting default branch"))
	}
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
					html = `<div><div class=${styles.popoverTitle}>${f.DefKeyword || ""}${f.DefKeyword ? " " : ""}<b style="color:#4078C0">${f.Name.Unqualified}</b>${f.NameAndTypeSeparator || ""}${f.Type.ScopeQualified === f.DefKeyword ? "" : f.Type.ScopeQualified}</div>${doc}<div class=${styles.popoverRepo}>${json.Repo}</div></div>`;
				}
				popoverCache[url] = html;
				cb(html, json);
			})
			.catch((err) => console.log("Error getting definition info.") && cb(null, null));
	}
}
