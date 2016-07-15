/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./hover';
import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import {TPromise} from 'vs/base/common/winjs.base';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IOpenerService} from 'vs/platform/opener/common/opener';
import {IModeService} from 'vs/editor/common/services/modeService';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {Range} from 'vs/editor/common/core/range';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditor, IEditorMouseEvent} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {ModesContentHoverWidget} from './modesContentHover';
import {ModesGlyphHoverWidget} from './modesGlyphHover';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';

class ModesHoverController implements editorCommon.IEditorContribution {

	static ID = 'editor.contrib.hover';

	private _editor: ICodeEditor;
	private _toUnhook:IDisposable[];

	private _contentWidget: ModesContentHoverWidget;
	private _glyphWidget: ModesGlyphHoverWidget;

	static getModesHoverController(editor: editorCommon.ICommonCodeEditor): ModesHoverController {
		return <ModesHoverController>editor.getContribution(ModesHoverController.ID);
	}

	constructor(editor: ICodeEditor,
		@IOpenerService openerService: IOpenerService,
		@IModeService modeService: IModeService
	) {
		this._editor = editor;

		this._toUnhook = [];

		if (editor.getConfiguration().contribInfo.hover) {
			this._toUnhook.push(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
			this._toUnhook.push(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._toUnhook.push(this._editor.onMouseLeave((e: IEditorMouseEvent) => this._hideWidgets()));
			this._toUnhook.push(this._editor.onKeyDown((e:IKeyboardEvent) => this._onKeyDown(e)));
			this._toUnhook.push(this._editor.onDidChangeModel(() => this._hideWidgets()));
			this._toUnhook.push(this._editor.onDidChangeModelDecorations(() => this._onModelDecorationsChanged()));
			this._toUnhook.push(this._editor.onDidScrollChange((e) => {
				if (e.scrollTopChanged || e.scrollLeftChanged) {
					this._hideWidgets();
				}
			}));

			this._contentWidget = new ModesContentHoverWidget(editor, openerService, modeService);
			this._glyphWidget = new ModesGlyphHoverWidget(editor);
		}
	}

	private _onModelDecorationsChanged(): void {
		this._contentWidget.onModelDecorationsChanged();
		this._glyphWidget.onModelDecorationsChanged();
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		var targetType = mouseEvent.target.type;

		if (targetType === editorCommon.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail ===  ModesContentHoverWidget.ID) {
			// mouse down on top of content hover widget
			return;
		}

		if (targetType === editorCommon.MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail === ModesGlyphHoverWidget.ID) {
			// mouse down on top of overlay hover widget
			return;
		}

		this._hideWidgets();
	}

	private _onEditorMouseMove(mouseEvent: IEditorMouseEvent): void {
		var targetType = mouseEvent.target.type;
		var stopKey = platform.isMacintosh ? 'metaKey' : 'ctrlKey';

		if (targetType === editorCommon.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail ===  ModesContentHoverWidget.ID && !mouseEvent.event[stopKey]) {
			// mouse moved on top of content hover widget
			return;
		}

		if (targetType === editorCommon.MouseTargetType.OVERLAY_WIDGET && mouseEvent.target.detail === ModesGlyphHoverWidget.ID && !mouseEvent.event[stopKey]) {
			// mouse moved on top of overlay hover widget
			return;
		}

		if (this._editor.getConfiguration().contribInfo.hover && targetType === editorCommon.MouseTargetType.CONTENT_TEXT) {
			this._glyphWidget.hide();
			this._contentWidget.startShowingAt(mouseEvent.target.range, false);
		} else if (targetType === editorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN) {
			this._contentWidget.hide();
			this._glyphWidget.startShowingAt(mouseEvent.target.position.lineNumber);
		} else {
			this._hideWidgets();
		}
	}

	private _onKeyDown(e: IKeyboardEvent): void {
		var stopKey = platform.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
		if (e.keyCode !== stopKey) {
			// Do not hide hover when Ctrl/Meta is pressed
			this._hideWidgets();
		}
	}

	private _hideWidgets(): void {
		this._glyphWidget.hide();
		this._contentWidget.hide();
	}

	public showContentHover(range: Range, focus: boolean): void {
		this._contentWidget.startShowingAt(range, focus);
	}

	public getId(): string {
		return ModesHoverController.ID;
	}

	public dispose(): void {
		this._toUnhook = dispose(this._toUnhook);
		if (this._glyphWidget) {
			this._glyphWidget.dispose();
			this._glyphWidget = null;
		}
		if (this._contentWidget) {
			this._contentWidget.dispose();
			this._contentWidget = null;
		}
	}
}

class ShowHoverAction extends EditorAction {
	static ID = 'editor.action.showHover';

	constructor(descriptor: editorCommon.IEditorActionDescriptorData, editor: editorCommon.ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<any> {
		const position = this.editor.getPosition();
		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		(<ModesHoverController>this.editor.getContribution(ModesHoverController.ID)).showContentHover(range, true);

		return TPromise.as(null);
	}
}

EditorBrowserRegistry.registerEditorContribution(ModesHoverController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ShowHoverAction, ShowHoverAction.ID, nls.localize('showHover', "Show Hover"), {
	context: ContextKey.EditorTextFocus,
	kbExpr: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS),
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_I)
}, 'Show Hover'));
