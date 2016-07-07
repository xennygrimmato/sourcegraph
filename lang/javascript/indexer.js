const jsctags = require("jsctags");
const path = require("path");

function index(op, callback) {
	const t0 = Date.now();
	
	const target = op.targets[0];
	jsctags({
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
