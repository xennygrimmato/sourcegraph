/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {FastDomNode, createFastDomNode} from 'vs/base/browser/styleMutator';
import {IConfigurationChangedEvent, IPosition, TextEditorCursorStyle} from 'vs/editor/common/editorCommon';
import {Configuration} from 'vs/editor/browser/config/configuration';
import {ViewContext} from 'vs/editor/common/view/viewContext';
import {IRenderingContext, IRestrictedRenderingContext} from 'vs/editor/common/view/renderingContext';

export class ViewCursor {
	private _context:ViewContext;
	private _position: IPosition;
	private _domNode:FastDomNode;
	private _positionTop:number;
	private _positionLeft:number;
	private _isInEditableRange:boolean;
	private _isVisible:boolean;
	private _isInViewport:boolean;
	private _cursorStyle: TextEditorCursorStyle;
	private _lastRenderedContent: string;
	private _lineHeight: number;

	constructor(context:ViewContext, isSecondary:boolean) {
		this._context = context;
		this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._lastRenderedContent = '';

		this._isInEditableRange = true;

		this._domNode = this._createCursorDomNode(isSecondary);
		Configuration.applyFontInfo(this._domNode, this._context.configuration.editor.fontInfo);
		this._isVisible = true;
		this._domNode.setDisplay('none');
		this.updatePosition({
			lineNumber: 1,
			column: 1
		});
	}

	private _createCursorDomNode(isSecondary: boolean): FastDomNode {
		let domNode = createFastDomNode(document.createElement('div'));
		if (isSecondary) {
			domNode.setClassName('cursor secondary');
		} else {
			domNode.setClassName('cursor');
		}
		domNode.setHeight(this._lineHeight);
		domNode.setTop(0);
		domNode.setLeft(0);
		domNode.domNode.setAttribute('role', 'presentation');
		domNode.domNode.setAttribute('aria-hidden', 'true');
		return domNode;
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	public getIsInEditableRange(): boolean {
		return this._isInEditableRange;
	}

	public getPositionTop(): number {
		return this._positionTop;
	}

	public getPosition(): IPosition {
		return this._position;
	}

	public show(): void {
		if (!this._isVisible) {
			this._domNode.setVisibility('inherit');
			this._isVisible = true;
		}
	}

	public hide(): void {
		if (this._isVisible) {
			this._domNode.setVisibility('hidden');
			this._isVisible = false;
		}
	}

	public onModelFlushed(): boolean {
		this.updatePosition({
			lineNumber: 1,
			column: 1
		});
		this._isInEditableRange = true;
		return true;
	}

	public onCursorPositionChanged(position: IPosition, isInEditableRange: boolean): boolean {
		this.updatePosition(position);
		this._isInEditableRange = isInEditableRange;
		return true;
	}

	public onConfigurationChanged(e:IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.viewInfo.cursorStyle) {
			this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
		}
		if (e.fontInfo) {
			Configuration.applyFontInfo(this._domNode, this._context.configuration.editor.fontInfo);
		}
		return true;
	}

	public prepareRender(ctx:IRenderingContext): void {
		var visibleRange = ctx.visibleRangeForPosition(this._position);
		if (visibleRange) {
			this._positionTop = visibleRange.top;
			this._positionLeft = visibleRange.left;
			this._isInViewport = true;
		} else {
			this._isInViewport = false;
		}
	}

	private _getRenderedContent(): string {
		if (this._cursorStyle === TextEditorCursorStyle.Block) {
			let lineContent = this._context.model.getLineContent(this._position.lineNumber);
			return lineContent.charAt(this._position.column - 1);
		}
		return '';
	}

	public render(ctx:IRestrictedRenderingContext): void {
		if (this._isInViewport) {
			let renderContent = this._getRenderedContent();
			if (this._lastRenderedContent !== renderContent) {
				this._lastRenderedContent = renderContent;
				this._domNode.domNode.textContent = this._lastRenderedContent;
			}

			this._domNode.setDisplay('block');
			this._domNode.setLeft(this._positionLeft);
			this._domNode.setTop(this._positionTop + ctx.viewportTop - ctx.bigNumbersDelta);
			this._domNode.setLineHeight(this._lineHeight);
			this._domNode.setHeight(this._lineHeight);
		} else {
			this._domNode.setDisplay('none');
		}
	}

	private updatePosition(newPosition:IPosition): void {
		this._position = newPosition;
		this._domNode.domNode.setAttribute('lineNumber', this._position.lineNumber.toString());
		this._domNode.domNode.setAttribute('column', this._position.column.toString());
		this._isInViewport = false;
	}
}
