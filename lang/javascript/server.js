const grpc = require("grpc");
const path = require("path");
const defs = require("./defs");
const refs = require("./refs");

const protoDescriptor = grpc.load({
	root: path.resolve(__dirname, "../../vendor"),
	file: "../lang/lang.proto",
});
const lang = protoDescriptor.lang;

function getServer() {
	const s = new grpc.Server();
	s.addProtoService(lang.Lang.service, {
		defs: function(call, callback) {
			// console.log("JS: CALL DEFS!", call.request);
			defs(call.request, callback);
		},
		refs: function(call, callback) {
			// console.log("JS: CALL REFS!", call.request);
			refs(call.request, callback);
		},
	});
	return s;
}

if (require.main === module) {
	if (!process.env.NOSERVER) {
		// If this is run as a script, start a server on an unused port
		const s = getServer();
		s.bind("0.0.0.0:50051", grpc.ServerCredentials.createInsecure());
		s.start();
	}

	console.log("========= TEST");
	const sources = {
		"a.js": "export function F(n) { return n * 123 + F(n); }",
		"b.js": "import {F} from \"./a\"; const x = F(1) + F(2);",
	};
	if (false) defs({sources: sources, origins: ["a.js"]}, (err, res) => {
		if (err) throw err;
		console.log("========= TEST DEFS:");
		console.log(JSON.stringify(res, null, 2));
		console.log();
	});
	refs({sources: sources, origins: [{file: "b.js"}]}, (err, res) => {
		if (err) throw err;
		console.log("========= TEST REFS:");
		console.log(JSON.stringify(res, null, 2));
		console.log();
	});
}
