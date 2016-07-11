const srclibanalysis = require("srclib-javascript/lib/analysis");
const path = require("path");
const tern = require("tern");
const fs = require("fs");
require("srclib-javascript/lib/reactjs.js");
require("tern/plugin/doc_comment");
require("tern/plugin/commonjs");
require("tern/plugin/modules");
require("tern/plugin/es_modules");
require("tern/plugin/node");
require("tern/plugin/node_resolve");
require("tern/plugin/es_modules");

module.exports = function refs(op, callback) {
	const t0 = Date.now();
	
	const origin = op.origins[0].file;

	const s = new tern.Server({
        dependencyBudget: 500000,
        projectDir: ".",
        defs: loadTernDefinitions(),
        async: false,
        getFile: function(file) {
			const f = op.sources[file];
			if (f) return f.toString();
			console.log("!!!! getFile failed to load file %s (not in sources list)", file);
			return null;
        },
        plugins: {
            node: true,
            requirejs: true,
            modules: true,
            es_modules: true,
            commonjs: true,
            doc_comment: true,
            reactjs: true
        }
    });

	// console.log(Object.keys(op.sources).join("\n"));
	Object.keys(op.sources).forEach(file => (file === "modules/Link.js" || file === "modules/routerWarning.js" || file === "modules/PropTypes.js" || file.includes("src/") || file.startsWith("modules/") || file.includes("invariant")) && !file.includes("__test") && s.addFile(console.log("F", file) || file));

	const refs = [];
	let i = 0;
	while (i < op.sources[origin].length) {
		s.request({
			query: {
				type: "definition",
				file: origin,
				start: i,
				end: i + 1,
				doc: true,
				url: true,
				origin: true,
			},
		}, (err, data) => {
			if (data && Object.keys(data).length > 0 && data.origin && !isStandardOrigin(data.origin) && (data.end - data.start) < 25) {
				refs.push({
					span: makeSpan(s, origin, i, i + (data.end - data.start)),
					target: {
						file: data.file,
						span: makeSpan(s, data.file, data.start, data.end),
					},
				});
				i += data.end - data.start;
			} else {
				i++;
			}
		});
	}
	
	callback(null, {
		files: {[origin]: {refs: refs}},
		messages: [`took ${Date.now() - t0} msec`],
	});
}

function makeSpan(tern, file, start, end) {
	const f = tern.findFile(file);
	const startLC = f.asLineChar(start);
	const endLC = f.asLineChar(end);
	return {
		start_byte: start,
		byte_len: end - start,
		start_line: startLC.line + 1,
		start_col: startLC.ch,
		end_line: endLC.line + 1,
		end_col: endLC.ch,
	};
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
	if (!old.Start) return null;
	const f = tern.findFile(old.File);
	if (!f) return null;
	const start = f.asLineChar(old.Start);
	const end = f.asLineChar(old.End);
	return {
		target: {
			id: old.DefPath.replace(/\//g, "."),
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

/**
 * Loads all tern definitions
 * @return {Object[]} parsed definitions
 */
function loadTernDefinitions() {
    return [
        readTernDefinitions(('ecma5')),
        readTernDefinitions(('ecma6')),
        readTernDefinitions(('browser'))
    ];
}

/**
 * Loads specific tern definitions
 * @param {string} id definitions id (for example ecma5)
 * @return {Object} parsed definitions
 */
function readTernDefinitions(id) {
    var p = path.join(__dirname, "node_modules/tern/defs/" + id + ".json");
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * @param {string} origin
 * @returns {boolean} true if origin points to "standard" one
 */
function isStandardOrigin(origin) {
    return ["node", "commonjs", "ecma5", "ecma6", "browser"].indexOf(origin) >= 0;
}
