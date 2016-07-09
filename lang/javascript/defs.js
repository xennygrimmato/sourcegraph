const jsctags = require("jsctags");
const srclibanalysis = require("srclib-javascript/lib/analysis");
const path = require("path");

module.exports = function defs(op, callback) {
	const t0 = Date.now();
	
	const origin = op.origins[0];
	if (false) {
	const resp = srclibanalysis.initTernServer({
		origins: op.origins,
		dir: ".",
		sources: op.sources,
	});
	const res = resp.out;
	const srv = resp.tern;
	const defs = [];
	res.Defs.forEach(def => {
		const def2 = oldToNewDef(srv, def);
		if (def2) defs.push(def2);
	});
	if (false) callback(null, {
		defs: defs,
		messages: [`took ${Date.now() - t0} msec`],
	});
	}

	
	if (true) {
		const defs = [];
		op.origins.forEach(origin => {
			if (!((origin === "modules/Link.js" || origin === "modules/routerWarning.js" || origin === "modules/PropTypes.js" || origin.includes("src/") || origin.startsWith("modules/") || origin.includes("invariant")) && !origin.includes("__test") && !origin.includes("example"))) return;
			jsctags({
				file: origin,
				dir: ".",
				content: op.sources[origin].toString(),
			}, (err, tags) => {
				if (err) {
					throw err;
				}
				// console.log("TAGS", JSON.stringify(tags, null, 2));
				defs.push.apply(defs, tagsToDefs(tags).map(def => Object.assign(def, {path: origin})));
			});
		});
		callback(null, {
			defs: defs,
			messages: [`took ${Date.now() - t0} msec`],
		});
		console.log(`took ${Date.now() - t0} msec`);
	}
}

function oldToNewDef(tern, old) {
	if (!old.DefStart) return null;
	if (old.Path.includes("✖")) return null; // unexported

	const f = tern.findFile(old.File);
	if (!f) return null;
	const start = f.asLineChar(old.DefStart);
	const end = f.asLineChar(old.DefEnd);
	return {
		id: old.Path.replace(/\//g, "."),
		span: {
			start_byte: old.DefStart,
			byte_len: old.DefEnd - old.DefStart,
			start_line: start.line + 1,
			start_col: start.ch,
			end_line: end.line + 1,
			end_col: end.ch,
		},
	};
}

function parentDefPath(defPath) {
	if (!defPath) return undefined;
	const parts = defPath.split("/");
	if (parts.length > 2) return parts[parts.length - 2];
	return undefined;
}

function tagsToDefs(tags) {
	return tags.map(tag => tag.name.includes("prototype") ? null : ({
		id: tag.name,
		title: makeTitle(tag.name, tag.origin["!type"]),
		span: makeSpan(tag.origin["!span"]),
	})).filter(Boolean);
}

// Given "a.b.c", returns "c". For some reason, namespaces include function names above
// (but at the same scope/level as) the current function.
function lastNamespaceName(ns) {
	const parts = ns.split(".");
	return parts[parts.length - 1];
}

function makeTitle(name, typeStr) {
	if (!typeStr) return name;
	typeStr = typeStr.replace(/^fn\(/, `function ${name}(`);
	return typeStr;
}

function makeSpan(spanStr) {
	var m = /^(\d+)\[(\d+):(\d+)\]-(\d+)\[(\d+):(\d+)\]$/.exec(spanStr);
	return {
		start_byte: Number(m[1]),
		byte_len: Number(m[4]) - Number(m[1]),
		start_line: Number(m[2]) + 1,
		start_col: Number(m[3]),
		end_line: Number(m[5]) + 1, // TODO(sqs): omit if same as start_line for brevity
		end_col: Number(m[6]),
	};
}

