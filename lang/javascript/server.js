const grpc = require("grpc");
const path = require("path");
const index = require("./indexer").index;

const protoDescriptor = grpc.load({
	root: path.resolve(__dirname, "../../vendor"),
	file: "../lang/lang.proto",
});
const lang = protoDescriptor.lang;

function getServer() {
	const s = new grpc.Server();
	s.addProtoService(lang.Indexer.service, {
		index: function(call, callback) {
			console.log("JS: CALL INDEX!", call.request);
			index(call.request, callback);
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
	const filename = path.resolve(__dirname, "../../app/web_modules/sourcegraph/app/routePatterns.js");
	require("fs").readFile(filename, (err, data) => {
		if (err) throw err;
		index({sources: {[filename]: data}, targets: [filename]}, (err, res) => {
			if (err) throw err;
			console.log("========= TEST OUTPUT:");
			console.log(JSON.stringify(res, null, 2));
			console.log();
		});
	});
}
