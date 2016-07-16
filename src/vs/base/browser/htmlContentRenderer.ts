/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import DOM = require('vs/base/browser/dom');
import {defaultGenerator} from 'vs/base/common/idGenerator';
import {escape} from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {IHTMLContentElement, MarkedString} from 'vs/base/common/htmlContent';
import {marked} from 'vs/base/common/marked/marked';
import {IMouseEvent} from 'vs/base/browser/mouseEvent';

export type RenderableContent = string | IHTMLContentElement | IHTMLContentElement[];

export interface RenderOptions {
	actionCallback?: (content: string, event?: IMouseEvent) => void;
	codeBlockRenderer?: (modeId: string, value: string) => string | TPromise<string>;
}

export function renderMarkedString(markedStrings: MarkedString[], options: RenderOptions = {}): Node {
	let htmlContentElements = markedStrings.map(value => {
		if (typeof value === 'string') {
			return { markdown: value };
		} else if (typeof value === 'object') {
			return { code: value };
		};
	});
	return renderHtml(htmlContentElements, options);
}

/**
 * Create html nodes for the given content element.
 *
 * @param content a html element description
 * @param actionCallback a callback function for any action links in the string. Argument is the zero-based index of the clicked action.
 */
export function renderHtml(content: RenderableContent, options: RenderOptions = {}): Node {
	if (typeof content === 'string') {
		return _renderHtml({ isText: true, text: content }, options);
	} else if (Array.isArray(content)) {
		return _renderHtml({ children: content }, options);
	} else if (content) {
		return _renderHtml(content, options);
	}
}

function _renderHtml(content: IHTMLContentElement, options: RenderOptions = {}): Node {

	let {codeBlockRenderer, actionCallback} = options;

	if (content.isText) {
		return document.createTextNode(content.text);
	}

	var tagName = getSafeTagName(content.tagName) || 'div';
	var element = document.createElement(tagName);

	if (content.className) {
		element.className = content.className;
	}
	if (content.text) {
		element.textContent = content.text;
	}
	if (content.style) {
		element.setAttribute('style', content.style);
	}
	if (content.customStyle) {
		Object.keys(content.customStyle).forEach((key) => {
			element.style[key] = content.customStyle[key];
		});
	}
	if (content.children) {
		content.children.forEach((child) => {
			element.appendChild(renderHtml(child, options));
		});
	}
	if (content.formattedText) {
		renderFormattedText(element, parseFormattedText(content.formattedText), actionCallback);
	}

	if (content.code && codeBlockRenderer) {
		// this is sort of legacy given that we have full
		// support for markdown. Turn this into markdown
		// and continue
		let {language, value} = content.code;
		content.markdown = '```' + language + '\n' + value + '\n```';
	}
	if (content.markdown) {

		// signal to code-block render that the
		// element has been created
		let signalInnerHTML: Function;
		const withInnerHTML = new TPromise(c => signalInnerHTML = c);

		const renderer = new marked.Renderer();
		renderer.link = (href, title, text): string => {
			return `<a href="#" data-href="${href}" title="${title || text}">${text}</a>`;
		};
		renderer.paragraph = (text): string => {
			return `<div>${text}</div>`;
		};

		if (options.codeBlockRenderer) {
			renderer.code = (code, lang) => {
				let value = options.codeBlockRenderer(lang, code);
				if (typeof value === 'string') {
					return value;
				}

				if (TPromise.is(value)) {
					// when code-block rendering is async we return sync
					// but update the node with the real result later.
					const id = defaultGenerator.nextId();
					TPromise.join([value, withInnerHTML]).done(values => {
						let [value] = values;
						let span = element.querySelector(`span[data-code="${id}"]`);
						if (span) {
							span.innerHTML = value;
						}
					}, err => {
						// ignore
					});
					return `<span data-code="${id}">${escape(code)}</span>`;
				}

				return code;
			};
		}

		if (options.actionCallback) {
			DOM.addStandardDisposableListener(element, 'click', event => {
				if (event.target.tagName === 'A') {
					const href = event.target.dataset['href'];
					if (href) {
						options.actionCallback(href, event);
					}
				}
			});
		}

		element.innerHTML = marked(content.markdown, {
			sanitize: true,
			renderer
		});
		signalInnerHTML();
	}

	return element;
}

var SAFE_TAG_NAMES = {
	a: true,
	b: true,
	blockquote: true,
	code: true,
	del: true,
	dd: true,
	div: true,
	dl: true,
	dt: true,
	em: true,
	h1h2h3i: true,
	img: true,
	kbd: true,
	li: true,
	ol: true,
	p: true,
	pre: true,
	s: true,
	span: true,
	sup: true,
	sub: true,
	strong: true,
	strike: true,
	ul: true,
	br: true,
	hr: true,
};

function getSafeTagName(tagName: string): string {
	if (!tagName) {
		return null;
	}
	if (SAFE_TAG_NAMES.hasOwnProperty(tagName)) {
		return tagName;
	}
	return null;
}

// --- formatted string parsing

class StringStream {
	private source: string;
	private index: number;

	constructor(source: string) {
		this.source = source;
		this.index = 0;
	}

	public eos(): boolean {
		return this.index >= this.source.length;
	}

	public next(): string {
		var next = this.peek();
		this.advance();
		return next;
	}

	public peek(): string {
		return this.source[this.index];
	}

	public advance(): void {
		this.index++;
	}
}

enum FormatType {
	Invalid,
	Root,
	Text,
	Bold,
	Italics,
	Action,
	ActionClose,
	NewLine
}

interface IFormatParseTree {
	type: FormatType;
	content?: string;
	index?: number;
	children?: IFormatParseTree[];
}

function renderFormattedText(element: Node, treeNode: IFormatParseTree, actionCallback?: (content: string, event?: IMouseEvent) => void) {
	var child: Node;

	if (treeNode.type === FormatType.Text) {
		child = document.createTextNode(treeNode.content);
	}
	else if (treeNode.type === FormatType.Bold) {
		child = document.createElement('b');
	}
	else if (treeNode.type === FormatType.Italics) {
		child = document.createElement('i');
	}
	else if (treeNode.type === FormatType.Action) {
		var a = document.createElement('a');
		a.href = '#';
		DOM.addStandardDisposableListener(a, 'click', (event) => {
			actionCallback(String(treeNode.index), event);
		});

		child = a;
	}
	else if (treeNode.type === FormatType.NewLine) {
		child = document.createElement('br');
	}
	else if (treeNode.type === FormatType.Root) {
		child = element;
	}

	if (element !== child) {
		element.appendChild(child);
	}

	if (Array.isArray(treeNode.children)) {
		treeNode.children.forEach((nodeChild) => {
			renderFormattedText(child, nodeChild, actionCallback);
		});
	}
}

function parseFormattedText(content: string): IFormatParseTree {

	var root: IFormatParseTree = {
		type: FormatType.Root,
		children: []
	};

	var actionItemIndex = 0;
	var current = root;
	var stack: IFormatParseTree[] = [];
	var stream = new StringStream(content);

	while (!stream.eos()) {
		var next = stream.next();

		var isEscapedFormatType = (next === '\\' && formatTagType(stream.peek()) !== FormatType.Invalid);
		if (isEscapedFormatType) {
			next = stream.next(); // unread the backslash if it escapes a format tag type
		}

		if (!isEscapedFormatType && isFormatTag(next) && next === stream.peek()) {
			stream.advance();

			if (current.type === FormatType.Text) {
				current = stack.pop();
			}

			var type = formatTagType(next);
			if (current.type === type || (current.type === FormatType.Action && type === FormatType.ActionClose)) {
				current = stack.pop();
			} else {
				var newCurrent: IFormatParseTree = {
					type: type,
					children: []
				};

				if (type === FormatType.Action) {
					newCurrent.index = actionItemIndex;
					actionItemIndex++;
				}

				current.children.push(newCurrent);
				stack.push(current);
				current = newCurrent;
			}
		} else if (next === '\n') {
			if (current.type === FormatType.Text) {
				current = stack.pop();
			}

			current.children.push({
				type: FormatType.NewLine
			});

		} else {
			if (current.type !== FormatType.Text) {
				var textCurrent: IFormatParseTree = {
					type: FormatType.Text,
					content: next
				};
				current.children.push(textCurrent);
				stack.push(current);
				current = textCurrent;

			} else {
				current.content += next;
			}
		}
	}

	if (current.type === FormatType.Text) {
		current = stack.pop();
	}

	if (stack.length) {
		// incorrectly formatted string literal
	}

	return root;
}

function isFormatTag(char: string): boolean {
	return formatTagType(char) !== FormatType.Invalid;
}

function formatTagType(char: string): FormatType {
	switch (char) {
		case '*':
			return FormatType.Bold;
		case '_':
			return FormatType.Italics;
		case '[':
			return FormatType.Action;
		case ']':
			return FormatType.ActionClose;
		default:
			return FormatType.Invalid;
	}
}