// @flow

import React from "react";
import * as monaco from "exports?global.monaco!vs/editor/editor.main";

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

	_elem: HTMLElement;
	_editor: any;

	componentDidMount() {
		global.HACK_vsGetWorkerUrl = (workerId: string, label: string): any => {
			// Run the web worker from a webpack script that is in the bundle but that
			// doesn't have its own separate URL.
			//
			// See http://stackoverflow.com/questions/10343913/how-to-create-a-web-worker-from-a-string and
			// http://stackoverflow.com/questions/5408406/web-workers-without-a-separate-javascript-file
			// for more information about (and limitations of) this technique.

			return require("worker?inline!vs/base/worker/workerMain");
			//const b = new Blob([require("raw!worker?inline!vs/base/worker/workerMain")], {type: "text/javascript"});
			//return URL.createObjectURL(b);
		};

		this._editor = monaco.editor.create(this._elem, {
			value: [
				'function x() {', '\tconsole.log("Hello world!");', '}', '', 'function x() {', '\tconsole.log("Hello world!");', '}', 'function x() {', '\tconsole.log("Hello world!");', '}', 'function x() {', '\tconsole.log("Hello world!");', '}', '', 'function x() {', '\tconsole.log("Hello world!");', '}', '', 'function x() {', '\tconsole.log("Hello world!");', '}', 'function x() {', '\tconsole.log("Hello world!");', '}', '', 'function x() {', '\tconsole.log("Hello world!");', '}', 'function x() {', '\tconsole.log("Hello world!");', '}', 'function x() {', '\tconsole.log("Hello world!");', '}', '', 'function x() {', '\tconsole.log("Hello world!");', '}', '', 'function x() {', '\tconsole.log("Hello world!");', '}',
			].join('\n'),
			//readOnly: true,
			theme: "vs-dark",
			language: 'javascript',
			scrollBeyondLastLine: false,
		});
		window.editor = this._editor;
	}

	componentWillUnmount() {
		if (this._editor) this._editor.destroy();
	}

	render() {
		return <div style={{height: "500px"}} ref={(e) => this._elem = e} />;
	}
}
