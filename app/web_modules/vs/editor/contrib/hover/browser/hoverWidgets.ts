/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {CommonKeybindings} from 'vs/base/common/keyCodes';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {Position} from 'vs/editor/common/core/position';
import {IPosition, IConfigurationChangedEvent} from 'vs/editor/common/editorCommon';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import {Widget} from 'vs/base/browser/ui/widget';

export class ContentHoverWidget extends Widget implements editorBrowser.IContentWidget {

	private _id: string;
	protected _editor: editorBrowser.ICodeEditor;
	protected _isVisible: boolean;
	private _containerDomNode: HTMLElement;
	protected _domNode: HTMLElement;
	protected _showAtPosition: Position;
	private _stoleFocus: boolean;

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	constructor(id: string, editor: editorBrowser.ICodeEditor) {
		super();
		this._id = id;
		this._editor = editor;
		this._isVisible = false;

		this._containerDomNode = document.createElement('div');
		this._containerDomNode.className = 'monaco-editor-hover monaco-editor-background';

		this._domNode = document.createElement('div');
		this._domNode.style.display = 'inline-block';
		this._containerDomNode.appendChild(this._domNode);
		this._containerDomNode.tabIndex = 0;
		this.onkeydown(this._containerDomNode, (e: IKeyboardEvent) => {
			if (e.equals(CommonKeybindings.ESCAPE)) {
				this.hide();
			}
		});

		this._editor.applyFontInfo(this._domNode);
		this._register(this._editor.onDidChangeConfiguration((e:IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this._editor.applyFontInfo(this._domNode);
			}
		}));

		this._editor.addContentWidget(this);
		this._showAtPosition = null;
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._containerDomNode;
	}

	public showAt(position:IPosition, focus: boolean): void {

		// Position has changed
		this._showAtPosition = new Position(position.lineNumber, position.column);
		this._isVisible = true;
		var editorMaxWidth = Math.min(800, parseInt(this._containerDomNode.style.maxWidth, 10));

		// When scrolled horizontally, the div does not want to occupy entire visible area.
		StyleMutator.setWidth(this._containerDomNode, editorMaxWidth);
		StyleMutator.setHeight(this._containerDomNode, 0);
		StyleMutator.setLeft(this._containerDomNode, 0);

		var renderedWidth = Math.min(editorMaxWidth, this._domNode.clientWidth + 5);
		var renderedHeight = this._domNode.clientHeight + 1;

		StyleMutator.setWidth(this._containerDomNode, renderedWidth);
		StyleMutator.setHeight(this._containerDomNode, renderedHeight);

		this._editor.layoutContentWidget(this);
		// Simply force a synchronous render on the editor
		// such that the widget does not really render with left = '0px'
		this._editor.render();
		this._stoleFocus = focus;
		if (focus) {
			this._containerDomNode.focus();
		}
	}

	public hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._editor.layoutContentWidget(this);
		if (this._stoleFocus) {
			this._editor.focus();
		}
	}

	public getPosition():editorBrowser.IContentWidgetPosition {
		if (this._isVisible) {
			return {
				position: this._showAtPosition,
				preference: [
					editorBrowser.ContentWidgetPositionPreference.ABOVE,
					editorBrowser.ContentWidgetPositionPreference.BELOW
				]
			};
		}
		return null;
	}

	public dispose(): void {
		this._editor.removeContentWidget(this);
		super.dispose();
	}
}

export class GlyphHoverWidget extends Widget implements editorBrowser.IOverlayWidget {

	private _id: string;
	protected _editor: editorBrowser.ICodeEditor;
	protected _isVisible: boolean;
	protected _domNode: HTMLElement;
	protected _showAtLineNumber: number;

	constructor(id: string, editor: editorBrowser.ICodeEditor) {
		super();
		this._id = id;
		this._editor = editor;
		this._isVisible = false;

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-editor-hover monaco-editor-background';
		this._domNode.style.display = 'none';
		this._domNode.setAttribute('aria-hidden', 'true');
		this._domNode.setAttribute('role', 'presentation');

		this._showAtLineNumber = -1;

		this._editor.applyFontInfo(this._domNode);
		this._register(this._editor.onDidChangeConfiguration((e:IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this._editor.applyFontInfo(this._domNode);
			}
		}));

		this._editor.addOverlayWidget(this);
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public showAt(lineNumber: number): void {
		this._showAtLineNumber = lineNumber;

		if (!this._isVisible) {
			this._isVisible = true;
			this._domNode.style.display = 'block';
		}

		var editorLayout = this._editor.getLayoutInfo();
		var topForLineNumber = this._editor.getTopForLineNumber(this._showAtLineNumber);
		var editorScrollTop = this._editor.getScrollTop();

		this._domNode.style.left = (editorLayout.glyphMarginLeft + editorLayout.glyphMarginWidth) + 'px';
		this._domNode.style.top = (topForLineNumber - editorScrollTop) + 'px';
	}

	public hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._domNode.style.display = 'none';
	}

	public getPosition():editorBrowser.IOverlayWidgetPosition {
		return null;
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}
}
