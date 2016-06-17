import utf8 from "utf8";
import fetch from "../actions/xhr";
import styles from "../components/App.css";
import _ from "lodash";
import EventLogger from "../analytics/EventLogger";

export default function addAnnotations(el, anns, lineStartBytes) {
	if (document.getElementById("sourcegraph-annotation-marker")) {
		// This function is not idempotent; don't let it run twice.
		return;
	} else {
		const annotationMarker = document.createElement("div");
		annotationMarker.id = "sourcegraph-annotation-marker";
		annotationMarker.style.display = "none";
		el.appendChild(annotationMarker);
	}
	applyAnnotations(el, indexAnnotations(anns), indexLineStartBytes(lineStartBytes));
}

function indexAnnotations(anns) {
	let annsByStartByte = {};
	let annsByEndByte = {};
	for (let i = 0; i < anns.length; i++) {
		if (anns[i].URL) {
			let ann = anns[i];
			annsByStartByte[ann.StartByte] = ann;
			annsByEndByte[ann.EndByte] = ann;
		}
	}
	return {annsByStartByte, annsByEndByte};
}

function indexLineStartBytes(lineStartBytes) {
	let startBytesByLine = {};
	for (let i = 0; i < lineStartBytes.length; i++) {
		startBytesByLine[i + 1] = lineStartBytes[i];
	}
	return startBytesByLine;
}

// pre/post processing steps for strings
function preProcess(str) {
	return utf8.encode(str);
}

function postProcess(str) {
	return utf8.decode(str);
}

function annGenerator(annsByStartByte, byte) {
	const match = annsByStartByte[byte];
	if (!match) return null;

	const defIsOnGitHub = match.URL && match.URL.includes("github.com/");
	const url = defIsOnGitHub ? urlToDef(match.URL) : `https://sourcegraph.com${match.URL}`;

	const annLen = match.EndByte - match.StartByte;
	const annGen = (innerHTML) => `<a href="${url}" ${defIsOnGitHub ? "data-sourcegraph-ref" : "target=tab"} data-src="https://sourcegraph.com${match.URL}" class=${styles.sgdef}>${innerHTML}</a>`;

	return {annLen, annGen};
}

function convertTextNode(node, annsByStartByte, currOffset) {
	let innerHTML = [];
	let bytesConsumed = 0;

	const nodeText = preProcess(node.wholeText).split("");
	// console.log(nodeText, "currentOffset", currOffset);
	for (/* initialized outside */; bytesConsumed < nodeText.length; /* incremented inside */) {
		const match = annGenerator(annsByStartByte, currOffset + bytesConsumed);
		if (!match) {
			innerHTML.push(_.escape(nodeText[bytesConsumed++]));
			continue;
		}

		innerHTML.push(match.annGen(_.escape(nodeText.slice(bytesConsumed, bytesConsumed + match.annLen).join(""))));
		bytesConsumed += match.annLen;
	}

	return {result: postProcess(innerHTML.join("")), bytesConsumed};
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

function isQuotedStringNode(node) {
	return node.childNodes.length === 3 && node.querySelectorAll(".pl-pds").length === 2 &&
		node.innerText.startsWith("\"") && node.innerText.endsWith("\"");
}

function convertQuotedStringNode(node, annsByStartByte, currOffset) {
	const match = annGenerator(annsByStartByte, currOffset);
	// match could be undefined; if so, assume there is no change that the inner quoted string
	// will have annotations (or else that annotatins will be ignored)

	if (!match) return {result: node.innerHTML, bytesConsumed: node.innerText.length};
	if (match.annLen !== node.innerText.length) {
		throw new Error(`annotation for quoted string node has length mismatch, got ${match.annLen} wanted ${node.innerText.length}`);
	}
	return {result: match.annGen(node.innerHTML), bytesConsumed: match.annLen};
}

function getOpeningTag(node) {
	let i;
	let inAttribute = false;
	const outerHTML = node.outerHTML;
	for (i = 0; i < outerHTML.length; ++i) {
		if (outerHTML[i] === "\"") inAttribute = !inAttribute;
		if (outerHTML[i] === ">" && !inAttribute) break;
	}
	return outerHTML.substring(0, i+1);
}

function convertNode(node, annsByStartByte, currOffset) {
	let result, bytesConsumed, c;
	if (node.nodeType === Node.ELEMENT_NODE) {
		const wrap = node.tagName === "TD" ? false : true;

		const outerTag = getOpeningTag(node);
		const endTag = "</span>";
		if (wrap && outerTag.indexOf("<span") !== 0) {
			throw new Error(`element node tag is not SPAN: ${node.tagName}, outer tag is ${outerTag}`);
		}

		c = isQuotedStringNode(node) ?
			convertQuotedStringNode(node, annsByStartByte, currOffset) :
			convertElementNode(node, annsByStartByte, currOffset);
		result = wrap ? `${outerTag}${c.result}${endTag}` : c.result;
		bytesConsumed = c.bytesConsumed;
	} else if (node.nodeType === Node.TEXT_NODE) {
		c = convertTextNode(node, annsByStartByte, currOffset);
		result = c.result;
		bytesConsumed = c.bytesConsumed;
	}

	// console.log(`converted node (type=${node.nodeType === Node.ELEMENT_NODE ? "element" : "text"}), result(${result}), bytesConsumed(${bytesConsumed})`);
	return {result, bytesConsumed};
}

function iterable(elList) {
	const it = [];
	for (let i = 0; i < elList.length; ++i) {
		it.push(elList[i]);
	}
	return it;
}

function applyAnnotations(el, {annsByStartByte}, startBytesByLine) {
	const table = el.querySelector("table");

	// console.log(annsByStartByte)

	for (let i = 0; i < table.rows.length; ++i) {
		const row = table.rows[i];

		const line = row.cells[0].dataset.lineNumber;
		let currOffset = startBytesByLine[line];

		const codeCell = row.cells[1];

		const {result, bytesConsumed} = convertNode(codeCell, annsByStartByte, currOffset);
		codeCell.innerHTML = result;
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
