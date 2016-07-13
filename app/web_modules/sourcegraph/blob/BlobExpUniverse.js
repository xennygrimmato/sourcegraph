// @flow

import React from "react";
import loader from "imports?require=>false,global=>window,define=>function(){_amdLoaderGlobal.define.apply(this%2C arguments)}!exports?_amdLoaderGlobal!vs/loader";
console.log("QQ", loader);
//import monaco from "vs/editor/editor.main.js";

export default class BlobExpUniverse extends React.Component {
	static propTypes = {
		contents: React.PropTypes.string,
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string,
		path: React.PropTypes.string.isRequired,
	};
	static contextTypes = {
		siteConfig: React.PropTypes.object.isRequired,
	};

	componentDidMount() {
		const onGotAmdLoader = () => {
			// const a = global.require;
			// const b = require;
			// console.log("a === b", a === b);
			global.require = loader.require;
			global.define = loader.define;
			loader.require.config({paths: {vs: `${this.context.siteConfig.assetsRoot}/node_modules/monaco-editor/min/vs`}});
			loader.require(['vs/editor/editor.main'], () => {
				this._initMonaco();
			});
		};
		onGotAmdLoader();
	}

	_initMonaco() {
		console.log("INIT MONACO");
	}

	render() {
		return <h1>Hello! {this.state && this.state.hello}</h1>;
	}
}
