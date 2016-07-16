/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {localize} from 'vs/nls';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel} from 'vs/editor/common/editorCommon';
import {Dimension, Builder} from 'vs/base/browser/builder';
import {empty as EmptyDisposable} from 'vs/base/common/lifecycle';
import {EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {Position} from 'vs/platform/editor/common/editor';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {BaseTextEditorModel} from 'vs/workbench/common/editor/textEditorModel';
import {HtmlInput} from 'vs/workbench/parts/html/common/htmlInput';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IOpenerService} from 'vs/platform/opener/common/opener';
import Webview from './webview';

/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the HTML input.
 */
export class HtmlPreviewPart extends BaseEditor {

	static ID: string = 'workbench.editor.htmlPreviewPart';

	private _editorService: IWorkbenchEditorService;
	private _themeService: IThemeService;
	private _openerService: IOpenerService;
	private _webview: Webview;
	private _container: HTMLDivElement;

	private _baseUrl: URI;

	private _model: IModel;
	private _modelChangeSubscription = EmptyDisposable;
	private _themeChangeSubscription = EmptyDisposable;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService,
		@IOpenerService openerService: IOpenerService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(HtmlPreviewPart.ID, telemetryService);

		this._editorService = editorService;
		this._themeService = themeService;
		this._openerService = openerService;
		this._baseUrl = contextService.toResource('/');
	}

	dispose(): void {
		// remove from dom
		this._webview.dispose();

		// unhook listeners
		this._themeChangeSubscription.dispose();
		this._modelChangeSubscription.dispose();
		this._model = undefined;
		super.dispose();
	}

	public createEditor(parent: Builder): void {
		this._container = document.createElement('div');
		this._container.style.paddingLeft = '20px';
		parent.getHTMLElement().appendChild(this._container);
	}

	private get webview(): Webview {
		if (!this._webview) {
			this._webview = new Webview(this._container,
				document.querySelector('.monaco-editor-background'),
				uri => this._openerService.open(uri));

			this._webview.baseUrl = this._baseUrl && this._baseUrl.toString(true);
		}
		return this._webview;
	}

	public changePosition(position: Position): void {
		// what this actually means is that we got reparented. that
		// has caused the webview to stop working and we need to reset it
		this._doSetVisible(false);
		this._doSetVisible(true);

		super.changePosition(position);
	}

	public setEditorVisible(visible: boolean, position?: Position): void {
		this._doSetVisible(visible);
		super.setEditorVisible(visible, position);
	}

	private _doSetVisible(visible: boolean):void {
		if (!visible) {
			this._themeChangeSubscription.dispose();
			this._modelChangeSubscription.dispose();
			this._webview.dispose();
			this._webview = undefined;
		} else {
			this._themeChangeSubscription = this._themeService.onDidThemeChange(themeId => this.webview.style(themeId));
			this.webview.style(this._themeService.getTheme());

			if (this._hasValidModel()) {
				this._modelChangeSubscription = this._model.onDidChangeContent(() => this.webview.contents = this._model.getLinesContent());
				this.webview.contents = this._model.getLinesContent();
			}
		}
	}

	private _hasValidModel(): boolean {
		return this._model && !this._model.isDisposed();
	}

	public layout(dimension: Dimension): void {
		const {width, height} = dimension;
		// we take the padding we set on create into account
		this._container.style.width = `${Math.max(width - 20, 0)}px`;
		this._container.style.height = `${height}px`;
	}

	public focus(): void {
		this.webview.focus();
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {

		if (this.input === input && this._hasValidModel()) {
			return TPromise.as(undefined);
		}

		this._model = undefined;
		this._modelChangeSubscription.dispose();

		if (!(input instanceof HtmlInput)) {
			return TPromise.wrapError<void>('Invalid input');
		}

		return super.setInput(input, options).then(() => {
			return this._editorService.resolveEditorModel({ resource: (<HtmlInput>input).getResource() }).then(model => {
				if (model instanceof BaseTextEditorModel) {
					this._model = model.textEditorModel;
				}
				if (!this._model) {
					return TPromise.wrapError<void>(localize('html.voidInput', "Invalid editor input."));
				}
				this._modelChangeSubscription = this._model.onDidChangeContent(() => this.webview.contents = this._model.getLinesContent());
				this.webview.contents = this._model.getLinesContent();
			});
		});
	}
}
