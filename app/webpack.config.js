const webpack = require("webpack");
const autoprefixer = require("autoprefixer");
const url = require("url");
const log = require("logalot");
const FlowStatusWebpackPlugin = require("flow-status-webpack-plugin");
const ProgressBarPlugin = require("progress-bar-webpack-plugin");

// Check dev dependencies.
if (process.env.NODE_ENV === "development") {
	const flow = require("flow-bin/lib");
	flow.run(["--version"], (err) => {
		if (err) {
			log.error(err.message);
			log.error("ERROR: flow is not properly installed. Run 'rm app/node_modules/flow-bin/vendor/flow; make dep' to fix.");
			return;
		}
	});

	if (process.platform === "darwin") {
		try {
			require("fsevents");
		} catch (error) {
			log.warn("WARNING: fsevents not properly installed. This causes a high CPU load when webpack is idle. Run 'make dep' to fix.");
		}
	}
}

const plugins = [
	new webpack.NormalModuleReplacementPlugin(/\/iconv-loader$/, "node-noop"),
	new webpack.ProvidePlugin({
		fetch: "imports?this=>global!exports?global.fetch!isomorphic-fetch",
	}),
	new webpack.DefinePlugin({
		"process.env": {
			NODE_ENV: JSON.stringify(process.env.NODE_ENV || "development"),
		},
	}),
	new webpack.IgnorePlugin(/testdata\//),
	new webpack.IgnorePlugin(/\.json$/),
	new webpack.IgnorePlugin(/\_test\.js$/),
	new webpack.optimize.OccurrenceOrderPlugin(),
	new webpack.optimize.LimitChunkCountPlugin({maxChunks: 1}),
	new ProgressBarPlugin(),
];

if (process.env.NODE_ENV !== "production") {
	plugins.push(new FlowStatusWebpackPlugin({quietSuccess: true}));
}

if (process.env.NODE_ENV === "production" && !process.env.WEBPACK_QUICK) {
	plugins.push(
		new webpack.optimize.DedupePlugin(),
		new webpack.optimize.UglifyJsPlugin({
			compress: {
				warnings: false,
			},
		})
	);
}

const useHot = process.env.NODE_ENV !== "production" || process.env.WEBPACK_QUICK;
if (useHot) {
	plugins.push(
		new webpack.HotModuleReplacementPlugin()
	);
}

// port to listen
var webpackDevServerPort = 8080;
if (process.env.WEBPACK_DEV_SERVER_URL) {
	webpackDevServerPort = url.parse(process.env.WEBPACK_DEV_SERVER_URL).port;
}
// address to listen on
const webpackDevServerAddr = process.env.WEBPACK_DEV_SERVER_ADDR || "127.0.0.1";
// public address of webpack dev server
var publicWebpackDevServer = "localhost:8080";
if (process.env.PUBLIC_WEBPACK_DEV_SERVER_URL) {
	var uStruct = url.parse(process.env.PUBLIC_WEBPACK_DEV_SERVER_URL);
	publicWebpackDevServer = uStruct.host;
}

const preLoaders = [
	{ test: /\.js$/, loader: "source-map-loader" },
];

// Allow skipping eslint to speed up builds (with WEBPACK_SKIP=eslint env var).
if (!/eslint/.test(process.env.WEBPACK_SKIP)) {
	preLoaders.push({test: /\.js$/, exclude: /node_modules/, loader: "eslint-loader"});
}

module.exports = {
	name: "browser",
	target: "web",
	cache: true,
	entry: [
		"./web_modules/sourcegraph/init/browser.js",
	],
	resolve: {
		modules: [
			`${__dirname}/web_modules`,
			`${__dirname}/vscode/src`,
			"node_modules",
		],
		extensions: ["", ".js", ".ts"],
	},
	devtool: (process.env.NODE_ENV === "production" && !process.env.WEBPACK_QUICK) ? "source-map" : "cheap-module-eval-source-map",
	output: {
		path: `${__dirname}/assets`,
		filename: "[name].browser.js",
		sourceMapFilename: "[file].map",
	},
	plugins: plugins,
	module: {
		preLoaders: preLoaders,
		loaders: [
			{test: /\.js$/, exclude: /node_modules/, loader: "babel-loader?cacheDirectory"},
			{test: /\.json$/, exclude: /node_modules/, loader: "json-loader"},
			{test: /\.(eot|ttf|woff)$/, loader: "file-loader?name=fonts/[name].[ext]"},
			{test: /\.(svg|png)$/, loader: "url"},
			{
				test: /\.css$/,
				include: `${__dirname}/web_modules`,
				loader: "style!css?sourceMap&modules&importLoaders=1&localIdentName=[name]__[local]___[hash:base64:5]!postcss",
			},

			// Loaders for vscode (vendored in ./vscore).
			{test: /\.ts$/, include: `${__dirname}/vscode/src/vs`, loader: "ts-loader?" + JSON.stringify({transpileOnly: true, compilerOptions: {declaration: false, module: "commonjs", sourceMap: true}})},
			{test: /\.css$/, include: `${__dirname}/vscode/src/vs`, loader: "style!css?sourceMap"},
		],
		noParse: /\.min\.js$/,
	},
	postcss: [require("postcss-modules-values"), autoprefixer({remove: false})],
	devServer: {
		host: webpackDevServerAddr,
		public: publicWebpackDevServer,
		port: webpackDevServerPort,
		headers: {"Access-Control-Allow-Origin": "*"},
		noInfo: true,
		quiet: true,
		hot: useHot,
	},
};

if (useHot) {
	module.exports.entry.unshift("webpack/hot/only-dev-server");
	module.exports.entry.unshift("react-hot-loader/patch");
}
if (process.env.NODE_ENV !== "production") {
	module.exports.entry.unshift(`webpack-dev-server/client?http://${publicWebpackDevServer}`);
}
