// @flow weak

import React from "react";
import monaco from "sourcegraph/editor/init";

// Run the web worker from a webpack script that is in the bundle but that
// doesn't have its own separate URL.
//
// See http://stackoverflow.com/questions/10343913/how-to-create-a-web-worker-from-a-string and
// http://stackoverflow.com/questions/5408406/web-workers-without-a-separate-javascript-file
// for more information about (and limitations of) this technique.
//
// $FlowHack
global.HACK_vsGetWorkerUrl = (workerId: string, label: string): any => require("worker?inline!vs/base/worker/workerMain");

export default class Editor extends React.Component {
	static propTypes = {
		contents: React.PropTypes.string.isRequired,
		path: React.PropTypes.string.isRequired,
		language: React.PropTypes.string,

		// selection
		startByte: React.PropTypes.number,
		endByte: React.PropTypes.number,

		className: React.PropTypes.string,
	};

	componentDidMount() {
		this._model = monaco.editor.createModel(
			this.props.contents,
			this.props.language,
			monaco.Uri.file(this.props.path),
		);

		this._editor = monaco.editor.create(this._elem, {
			model: this._model,
			readOnly: true,
			scrollBeyondLastLine: false,
			contextmenu: false,
			automaticLayout: true,

			wrappingColumn: 0,
			wrappingIndent: "indent",

			theme: "vs",
		});
		/* this._editor.onDidChangeCursorSelection((e) => {
			console.log(e);
		});*/

		// For easy debugging via the JavaScript console.
		window.editor = this._editor;

		if (this.props.startByte || this.props.endByte)	this._setActiveRange(this.props.startByte, this.props.endByte);
	}

	componentWillReceiveProps(nextProps: any) {
		if (this.props.contents !== nextProps.contents) {
			this._model.setValue(nextProps.contents);
		}
		if (this.props.startByte !== nextProps.startByte || this.props.endByte !== nextProps.endByte) {
			this._setActiveRange(nextProps.startByte, nextProps.endByte);
		}
	}

	componentWillUnmount() {
		if (this._editor) this._editor.destroy();
		if (this._model) this._model.destroy();
	}

	_elem: HTMLElement;
	_editor: any;
	_model: any;

	_setActiveRange(startByte: number, endByte: number) {
		const start = this._model.getPositionAt(startByte);
		const end = this._model.getPositionAt(endByte);
		this._editor.setSelection(new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column));
		this._editor.revealRangeInCenterIfOutsideViewport(new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column));
	}

	render() {
		return <div className={this.props.className} ref={(e) => this._elem = e} />;
	}
}

