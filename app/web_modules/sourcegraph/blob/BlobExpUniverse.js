import React from "react";
import monaco from "sourcegraph/editor/init";
import * as expGo from "./expGo";

export default class BlobExpUniverse extends React.Component {
	static propTypes = {
		contents: React.PropTypes.string,
		repo: React.PropTypes.string.isRequired,
		rev: React.PropTypes.string,
		commitID: React.PropTypes.string.isRequired,
		path: React.PropTypes.string.isRequired,
	};
	static contextTypes = {
		siteConfig: React.PropTypes.object.isRequired,
	};

	_elem: HTMLElement;
	_editor: any;
	_model: any;

	componentDidMount() {
		global.HACK_vsGetWorkerUrl = (workerId: string, label: string): any => {
			// Run the web worker from a webpack script that is in the bundle but that
			// doesn't have its own separate URL.
			//
			// See http://stackoverflow.com/questions/10343913/how-to-create-a-web-worker-from-a-string and
			// http://stackoverflow.com/questions/5408406/web-workers-without-a-separate-javascript-file
			// for more information about (and limitations of) this technique.

			return require("worker?inline!vs/base/worker/workerMain");
		};

		monaco.languages.register({id: "go"});

		this._model = monaco.editor.createModel(this.props.contents, "go", monaco.Uri.file(this.props.path));

		monaco.languages.setLanguageConfiguration("go", expGo.conf);
		monaco.languages.setMonarchTokensProvider("go", expGo.language);

		monaco.languages.registerHoverProvider("go", {
			provideHover: (model, pos) => {
				return {contents: ["hello"], range: new monaco.Range(38, 5, 38, 11)};
			}
		});

		monaco.languages.registerReferenceProvider("go", {
			provideReferences: function(model, position, context) {
				return Promise.resolve([
					{uri: monaco.Uri.file(this.props.path), range: new monaco.Range(38, 5, 38, 11)},
					{uri: monaco.Uri.file(this.props.path), range: new monaco.Range(42, 1, 42, 7)},
				]);
			}
		});

		monaco.languages.registerDefinitionProvider("go", {
			provideDefinition: (model, pos) => {
				return Promise.resolve([
					{uri: monaco.Uri.file(this.props.path), range: new monaco.Range(38, 5, 38, 11)},
					{uri: monaco.Uri.file(this.props.path), range: new monaco.Range(42, 1, 42, 7)},
				]);
			}
		});

		this._editor = monaco.editor.create(this._elem, {
			model: this._model,
			readOnly: true,
			scrollBeyondLastLine: false,
			contextmenu: false,
		});
		window.editor = this._editor;

		this._scrollTo(this.props);
	}

	componentWillReceiveProps(nextProps) {
		this._scrollTo(nextProps);
	}
	
	_scrollTo(p) {
		const start = p.startByte;
		const end = p.endByte;
		if (!start) return;
		const start2 = this._model.getPositionAt(start);
		const end2 = this._model.getPositionAt(end);
		console.log(start2, end2);
		setTimeout(() => {
			this._editor.setSelection(new monaco.Range(start2.lineNumber, start2.column, end2.lineNumber, end2.column));
			this._editor.revealRange(new monaco.Range(start2.lineNumber, start2.column, end2.lineNumber, end2.column));
			}, 200);
	}

	componentWillUnmount() {
		if (this._editor) this._editor.destroy();
		if (this._model) this._model.destroy();
	}

	render() {
		return <div style={{height: "800px"}} ref={(e) => this._elem = e} />;
	}
}
