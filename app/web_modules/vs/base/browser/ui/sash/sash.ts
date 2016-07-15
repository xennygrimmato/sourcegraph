/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./sash';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {Builder, $} from 'vs/base/browser/builder';
import {isIPad} from 'vs/base/browser/browser';
import {isMacintosh} from 'vs/base/common/platform';
import types = require('vs/base/common/types');
import DOM = require('vs/base/browser/dom');
import {Gesture, EventType, GestureEvent} from 'vs/base/browser/touch';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';

export interface ISashLayoutProvider { }

export interface IVerticalSashLayoutProvider extends ISashLayoutProvider {
	getVerticalSashLeft(sash: Sash): number;
	getVerticalSashTop?(sash: Sash): number;
	getVerticalSashHeight?(sash: Sash): number;
}

export interface IHorizontalSashLayoutProvider extends ISashLayoutProvider {
	getHorizontalSashTop(sash: Sash): number;
	getHorizontalSashLeft?(sash: Sash): number;
	getHorizontalSashWidth?(sash: Sash): number;
}

export interface ISashEvent {
	startX: number;
	currentX: number;
	startY: number;
	currentY: number;
}

export interface ISashOptions {
	baseSize?: number;
	orientation?: Orientation;
}

export enum Orientation {
	VERTICAL,
	HORIZONTAL
}

export class Sash extends EventEmitter {

	private $e: Builder;
	private gesture: Gesture;
	private layoutProvider: ISashLayoutProvider;
	private isDisabled: boolean;
	private hidden: boolean;
	private orientation: Orientation;
	private size: number;

	constructor(container: HTMLElement, layoutProvider: ISashLayoutProvider, options: ISashOptions = {}) {
		super();

		this.$e = $('.monaco-sash').appendTo(container);

		if (isMacintosh) {
			this.$e.addClass('mac');
		}

		this.gesture = new Gesture(this.$e.getHTMLElement());

		this.$e.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => { this.onMouseDown(e); });
		this.$e.on(DOM.EventType.DBLCLICK, (e: MouseEvent) => { this.emit('reset', e); });
		this.$e.on(EventType.Start, (e: GestureEvent) => { this.onTouchStart(e); });

		this.orientation = options.orientation || Orientation.VERTICAL;
		this.$e.addClass(this.getOrientation());

		this.size = options.baseSize || 5;

		if (isIPad) {
			this.size *= 4; // see also http://ux.stackexchange.com/questions/39023/what-is-the-optimum-button-size-of-touch-screen-applications
			this.$e.addClass('touch');
		}

		if (this.orientation === Orientation.HORIZONTAL) {
			this.$e.size(null, this.size);
		} else {
			this.$e.size(this.size);
		}

		this.isDisabled = false;
		this.hidden = false;
		this.layoutProvider = layoutProvider;
	}

	public getHTMLElement(): HTMLElement {
		return this.$e.getHTMLElement();
	}

	private getOrientation(): 'horizontal' | 'vertical' {
		return this.orientation === Orientation.HORIZONTAL ? 'horizontal' : 'vertical';
	}

	private onMouseDown(e: MouseEvent): void {
		DOM.EventHelper.stop(e, false);

		if (this.isDisabled) {
			return;
		}

		$(DOM.getElementsByTagName('iframe')).style('pointer-events', 'none'); // disable mouse events on iframes as long as we drag the sash

		let mouseDownEvent = new StandardMouseEvent(e);
		let startX = mouseDownEvent.posx;
		let startY = mouseDownEvent.posy;

		let startEvent: ISashEvent = {
			startX: startX,
			currentX: startX,
			startY: startY,
			currentY: startY
		};

		this.$e.addClass('active');
		this.emit('start', startEvent);

		let $window = $(window);
		let containerCSSClass = `${this.getOrientation()}-cursor-container${isMacintosh ? '-mac' : ''}`;

		let lastCurrentX = startX;
		let lastCurrentY = startY;

		$window.on('mousemove', (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);
			let mouseMoveEvent = new StandardMouseEvent(e);

			let event: ISashEvent = {
				startX: startX,
				currentX: mouseMoveEvent.posx,
				startY: startY,
				currentY: mouseMoveEvent.posy
			};

			lastCurrentX = mouseMoveEvent.posx;
			lastCurrentY = mouseMoveEvent.posy;

			this.emit('change', event);
		}).once('mouseup', (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);
			this.$e.removeClass('active');
			this.emit('end');

			$window.off('mousemove');
			document.body.classList.remove(containerCSSClass);

			$(DOM.getElementsByTagName('iframe')).style('pointer-events', 'auto');
		});

		document.body.classList.add(containerCSSClass);
	}

	private onTouchStart(event: GestureEvent): void {
		DOM.EventHelper.stop(event);

		let listeners: IDisposable[] = [];

		let startX = event.pageX;
		let startY = event.pageY;

		this.emit('start', {
			startX: startX,
			currentX: startX,
			startY: startY,
			currentY: startY
		});

		let lastCurrentX = startX;
		let lastCurrentY = startY;

		listeners.push(DOM.addDisposableListener(this.$e.getHTMLElement(), EventType.Change, (event: GestureEvent) => {
			if (types.isNumber(event.pageX) && types.isNumber(event.pageY)) {
				this.emit('change', {
					startX: startX,
					currentX: event.pageX,
					startY: startY,
					currentY: event.pageY
				});

				lastCurrentX = event.pageX;
				lastCurrentY = event.pageY;
			}
		}));

		listeners.push(DOM.addDisposableListener(this.$e.getHTMLElement(), EventType.End, (event: GestureEvent) => {
			this.emit('end');
			dispose(listeners);
		}));
	}

	public layout(): void {
		let style: { top?: string; left?: string; height?: string; width?: string; };

		if (this.orientation === Orientation.VERTICAL) {
			let verticalProvider = (<IVerticalSashLayoutProvider>this.layoutProvider);
			style = { left: verticalProvider.getVerticalSashLeft(this) - (this.size / 2) + 'px' };

			if (verticalProvider.getVerticalSashTop) {
				style.top = verticalProvider.getVerticalSashTop(this) + 'px';
			}

			if (verticalProvider.getVerticalSashHeight) {
				style.height = verticalProvider.getVerticalSashHeight(this) + 'px';
			}
		} else {
			let horizontalProvider = (<IHorizontalSashLayoutProvider>this.layoutProvider);
			style = { top: horizontalProvider.getHorizontalSashTop(this) - (this.size / 2) + 'px' };

			if (horizontalProvider.getHorizontalSashLeft) {
				style.left = horizontalProvider.getHorizontalSashLeft(this) + 'px';
			}

			if (horizontalProvider.getHorizontalSashWidth) {
				style.width = horizontalProvider.getHorizontalSashWidth(this) + 'px';
			}
		}

		this.$e.style(style);
	}

	public show(): void {
		this.hidden = false;
		this.$e.show();
	}

	public hide(): void {
		this.hidden = true;
		this.$e.hide();
	}

	public isHidden(): boolean {
		return this.hidden;
	}

	public enable(): void {
		this.$e.removeClass('disabled');
		this.isDisabled = false;
	}

	public disable(): void {
		this.$e.addClass('disabled');
		this.isDisabled = true;
	}

	public dispose(): void {
		if (this.$e) {
			this.$e.destroy();
			this.$e = null;
		}

		super.dispose();
	}
}
