const jsctags = require("jsctags");
const srclibanalysis = require("srclib-javascript/lib/analysis");
const path = require("path");

function index(op, callback) {
	const t0 = Date.now();
	
	const target = op.targets[0];

	const resp = srclibanalysis.initTernServer({
		targets: op.targets,
		dir: ".",
		sources: op.sources,
	});
	const res = resp.out;
	const srv = resp.tern;
	// console.log("TERN", JSON.stringify(res, null, 2));
	const fileData = {};
	res.Defs.forEach(def => {
		if (!fileData[def.File]) fileData[def.File] = {defs: []};
		const def2 = oldToNewDef(srv, def);
		if (def2) fileData[def.File].defs.push(def2);
	});
	res.Refs.forEach(ref => {
		if (!fileData[ref.File]) fileData[ref.File] = {refs: []};
		if (!fileData[ref.File].refs) fileData[ref.File].refs = [];
		const ref2 = old2ToNewRef(srv, ref);
		if (ref2) fileData[ref.File].refs.push(ref2);
	});
	callback(null, {
		files: fileData,
		messages: [`took ${Date.now() - t0} msec`],
	});

	
	if (false) jsctags({
		file: target,
		dir: path.dirname(target),
		content: op.sources[target].toString(),
	}, (err, tags) => {
		if (err) {
			callback(err);
			return;
		}
		console.log("TAGS", JSON.stringify(tags, null, 2));
		callback(null, {
			files: {
				[target]: {
					defs: tagsToDefs(tags),
				},
			},
			messages: [`took ${Date.now() - t0} msec`],
		});
	});
}

function oldToNewDef(tern, old) {
	if (!old.DefStart) return null;

	const f = tern.findFile(old.File);
	if (!f) return null;
	const start = f.asLineChar(old.DefStart);
	const end = f.asLineChar(old.DefEnd);
	return {
		ident: old.Name,
		parent_ident: parentDefPath(old.Path),
		kind: old.Kind,
		global: !old.Path.includes("✖"),
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

function oldToNewRef(tern, old) {
	if (!old.Start) return null;
	const f = tern.findFile(old.file);
	const start = f.asLineChar(old.start);
	const end = f.asLineChar(old.end);
	return {
		target: {
			context: parentDefPath(old.DefPath),
		},
		span: {
			start_byte: old.Start,
			byte_len: old.End - old.Start,
			start_line: start.line + 1,
			start_col: start.ch,
			end_line: end.line + 1,
			end_col: end.ch,
		},
	};
}

function old2ToNewRef(tern, old) {
	console.log("EEEEEE", old);
	if (!old.Start) return null;
	const f = tern.findFile(old.File);
	if (!f) return null;
	const start = f.asLineChar(old.Start);
	const end = f.asLineChar(old.End);
	return {
		target: {
			context: parentDefPath(old.DefPath),
		},
		span: {
			start_byte: old.Start,
			byte_len: old.End - old.Start,
			start_line: start.line + 1,
			start_col: start.ch,
			end_line: end.line + 1,
			end_col: end.ch,
		},
	};
}

function tagsToDefs(tags) {
	return tags.map(tag => ({
		ident: tag.name,
		title: makeTitle(tag.name, tag.origin["!type"]),
		global: !tag.origin["!data"].scoped,
		// TODO(sqs): add kind field

		// TODO(sqs): this is not working
		//
		// parent_ident: tag.namespace ? lastNamespaceName(tag.namespace) : undefined,

		span: makeSpan(tag.origin["!span"]),
	}));
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

module.exports = {index: index};
