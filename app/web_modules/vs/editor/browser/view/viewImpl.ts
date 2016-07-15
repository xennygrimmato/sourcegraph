/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import {EventEmitter, EmitterEvent, IEventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import * as timer from 'vs/base/common/timer';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {ICommandService} from 'vs/platform/commands/common/commands';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {Configuration} from 'vs/editor/browser/config/configuration';
import {KeyboardHandler, IKeyboardHandlerHelper} from 'vs/editor/browser/controller/keyboardHandler';
import {PointerHandler} from 'vs/editor/browser/controller/pointerHandler';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import {ViewController, TriggerCursorHandler} from 'vs/editor/browser/view/viewController';
import {ViewEventDispatcher} from 'vs/editor/browser/view/viewEventDispatcher';
import {ContentViewOverlays, MarginViewOverlays} from 'vs/editor/browser/view/viewOverlays';
import {LayoutProvider} from 'vs/editor/browser/viewLayout/layoutProvider';
import {ViewContentWidgets} from 'vs/editor/browser/viewParts/contentWidgets/contentWidgets';
import {CurrentLineHighlightOverlay} from 'vs/editor/browser/viewParts/currentLineHighlight/currentLineHighlight';
import {DecorationsOverlay} from 'vs/editor/browser/viewParts/decorations/decorations';
import {GlyphMarginOverlay} from 'vs/editor/browser/viewParts/glyphMargin/glyphMargin';
import {LineNumbersOverlay} from 'vs/editor/browser/viewParts/lineNumbers/lineNumbers';
import {IndentGuidesOverlay} from 'vs/editor/browser/viewParts/indentGuides/indentGuides';
import {ViewLines} from 'vs/editor/browser/viewParts/lines/viewLines';
import {LinesDecorationsOverlay} from 'vs/editor/browser/viewParts/linesDecorations/linesDecorations';
import {ViewOverlayWidgets} from 'vs/editor/browser/viewParts/overlayWidgets/overlayWidgets';
import {DecorationsOverviewRuler} from 'vs/editor/browser/viewParts/overviewRuler/decorationsOverviewRuler';
import {OverviewRuler} from 'vs/editor/browser/viewParts/overviewRuler/overviewRuler';
import {Rulers} from 'vs/editor/browser/viewParts/rulers/rulers';
import {ScrollDecorationViewPart} from 'vs/editor/browser/viewParts/scrollDecoration/scrollDecoration';
import {SelectionsOverlay} from 'vs/editor/browser/viewParts/selections/selections';
import {ViewCursors} from 'vs/editor/browser/viewParts/viewCursors/viewCursors';
import {ViewZones} from 'vs/editor/browser/viewParts/viewZones/viewZones';
import {ViewPart} from 'vs/editor/browser/view/viewPart';
import {ViewContext, IViewEventHandler} from 'vs/editor/common/view/viewContext';
import {IViewModel} from 'vs/editor/common/viewModel/viewModel';
import {ViewLinesViewportData} from 'vs/editor/common/viewLayout/viewLinesViewportData';
import {IRenderingContext} from 'vs/editor/common/view/renderingContext';
import {IPointerHandlerHelper} from 'vs/editor/browser/controller/mouseHandler';

export class View extends ViewEventHandler implements editorBrowser.IView, IDisposable {

	private eventDispatcher:ViewEventDispatcher;

	private listenersToRemove:IDisposable[];
	private listenersToDispose:IDisposable[];

	private layoutProvider: LayoutProvider;
	public _context: ViewContext;

	// The view lines
	private viewLines: ViewLines;

	// These are parts, but we must do some API related calls on them, so we keep a reference
	private viewZones: ViewZones;
	private contentWidgets: ViewContentWidgets;
	private overlayWidgets: ViewOverlayWidgets;
	private viewParts: ViewPart[];

	private keyboardHandler: KeyboardHandler;
	private pointerHandler: PointerHandler;

	private outgoingEventBus: EventEmitter;

	// Dom nodes
	private linesContent: HTMLElement;
	public domNode: HTMLElement;
	public textArea: HTMLTextAreaElement;
	private textAreaCover: HTMLElement;
	private linesContentContainer: HTMLElement;
	private overflowGuardContainer: HTMLElement;

	// Actual mutable state
	private hasFocus:boolean;
	private _isDisposed: boolean;

	private handleAccumulatedModelEventsTimeout:number;
	private accumulatedModelEvents: EmitterEvent[];
	private _renderAnimationFrame: IDisposable;

	private _keybindingService: IKeybindingService;
	private _editorTextFocusContextKey: IKeybindingContextKey<boolean>;

	constructor(
		keybindingService: IKeybindingService,
		commandService: ICommandService,
		configuration:Configuration,
		model:IViewModel,
		triggerCursorHandler:TriggerCursorHandler
	) {
		super();
		this._isDisposed = false;
		this._renderAnimationFrame = null;
		this.outgoingEventBus = new EventEmitter();

		var viewController = new ViewController(model, triggerCursorHandler, this.outgoingEventBus, commandService);

		this.listenersToRemove = [];
		this.listenersToDispose = [];

		// The event dispatcher will always go through _renderOnce before dispatching any events
		this.eventDispatcher = new ViewEventDispatcher((callback:()=>void) => this._renderOnce(callback));

		// These two dom nodes must be constructed up front, since references are needed in the layout provider (scrolling & co.)
		this.linesContent = document.createElement('div');
		this.linesContent.className = editorBrowser.ClassNames.LINES_CONTENT + ' monaco-editor-background';
		this.domNode = document.createElement('div');
		this.domNode.className = configuration.editor.viewInfo.editorClassName;

		this.overflowGuardContainer = document.createElement('div');
		this.overflowGuardContainer.className = editorBrowser.ClassNames.OVERFLOW_GUARD;

		// The layout provider has such responsibilities as:
		// - scrolling (i.e. viewport / full size) & co.
		// - whitespaces (a.k.a. view zones) management & co.
		// - line heights updating & co.
		this.layoutProvider = new LayoutProvider(configuration, model, this.eventDispatcher, this.linesContent, this.domNode, this.overflowGuardContainer);
		this.eventDispatcher.addEventHandler(this.layoutProvider);

		// The view context is passed on to most classes (basically to reduce param. counts in ctors)
		this._context = new ViewContext(
				configuration, model, this.eventDispatcher,
				(eventHandler:IViewEventHandler) => this.eventDispatcher.addEventHandler(eventHandler),
				(eventHandler:IViewEventHandler) => this.eventDispatcher.removeEventHandler(eventHandler)
		);

		this.createTextArea(keybindingService);
		this.createViewParts();

		// Keyboard handler
		this.keyboardHandler = new KeyboardHandler(this._context, viewController, this.createKeyboardHandlerHelper());

		// Pointer handler
		this.pointerHandler = new PointerHandler(this._context, viewController, this.createPointerHandlerHelper());

		this.hasFocus = false;
		this.codeEditorHelper = null;

		this.eventDispatcher.addEventHandler(this);

		// The view lines rendering calls model.getLineTokens() that might emit events that its tokens have changed.
		// This delayed processing of incoming model events acts as a guard against undesired/unexpected recursion.
		this.handleAccumulatedModelEventsTimeout = -1;
		this.accumulatedModelEvents = [];
		this.listenersToRemove.push(model.addBulkListener2((events:EmitterEvent[]) => {
			this.accumulatedModelEvents = this.accumulatedModelEvents.concat(events);
			if (this.handleAccumulatedModelEventsTimeout === -1) {
				this.handleAccumulatedModelEventsTimeout = setTimeout(() => {
					this.handleAccumulatedModelEventsTimeout = -1;
					this._flushAnyAccumulatedEvents();
				});
			}
		}));
	}

	private _flushAnyAccumulatedEvents(): void {
		var toEmit = this.accumulatedModelEvents;
		this.accumulatedModelEvents = [];
		if (toEmit.length > 0) {
			this.eventDispatcher.emitMany(toEmit);
		}
	}

	private createTextArea(keybindingService: IKeybindingService): void {
		// Text Area (The focus will always be in the textarea when the cursor is blinking)
		this.textArea = <HTMLTextAreaElement>document.createElement('textarea');
		this._keybindingService = keybindingService.createScoped(this.textArea);
		this._editorTextFocusContextKey = this._keybindingService.createKey(editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS, undefined);
		this.textArea.className = editorBrowser.ClassNames.TEXTAREA;
		this.textArea.setAttribute('wrap', 'off');
		this.textArea.setAttribute('autocorrect', 'off');
		this.textArea.setAttribute('autocapitalize', 'off');
		this.textArea.setAttribute('spellcheck', 'false');
		this.textArea.setAttribute('aria-label', this._context.configuration.editor.viewInfo.ariaLabel);
		this.textArea.setAttribute('role', 'textbox');
		this.textArea.setAttribute('aria-multiline', 'true');
		this.textArea.setAttribute('aria-haspopup', 'false');
		this.textArea.setAttribute('aria-autocomplete', 'both');

		StyleMutator.setTop(this.textArea, 0);
		StyleMutator.setLeft(this.textArea, 0);

		this.listenersToDispose.push(dom.addDisposableListener(this.textArea, 'focus', () => this._setHasFocus(true)));
		this.listenersToDispose.push(dom.addDisposableListener(this.textArea, 'blur', () => this._setHasFocus(false)));

		// On top of the text area, we position a dom node to cover it up
		// (there have been reports of tiny blinking cursors)
		// (in WebKit the textarea is 1px by 1px because it cannot handle input to a 0x0 textarea)
		this.textAreaCover = document.createElement('div');
		if (this._context.configuration.editor.viewInfo.glyphMargin) {
			this.textAreaCover.className = 'monaco-editor-background ' + editorBrowser.ClassNames.GLYPH_MARGIN + ' ' + editorBrowser.ClassNames.TEXTAREA_COVER;
		} else {
			if (this._context.configuration.editor.viewInfo.lineNumbers) {
				this.textAreaCover.className = 'monaco-editor-background ' + editorBrowser.ClassNames.LINE_NUMBERS + ' ' + editorBrowser.ClassNames.TEXTAREA_COVER;
			} else {
				this.textAreaCover.className = 'monaco-editor-background ' + editorBrowser.ClassNames.TEXTAREA_COVER;
			}
		}
		this.textAreaCover.style.position = 'absolute';
		StyleMutator.setWidth(this.textAreaCover, 1);
		StyleMutator.setHeight(this.textAreaCover, 1);
		StyleMutator.setTop(this.textAreaCover, 0);
		StyleMutator.setLeft(this.textAreaCover, 0);
	}

	private createViewParts(): void {
		this.viewParts = [];

		// View Lines
		this.viewLines = new ViewLines(this._context, this.layoutProvider);

		// View Zones
		this.viewZones = new ViewZones(this._context, this.layoutProvider);
		this.viewParts.push(this.viewZones);

		// Decorations overview ruler
		var decorationsOverviewRuler = new DecorationsOverviewRuler(
				this._context, this.layoutProvider.getScrollHeight(),
				(lineNumber:number) => this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber)
		);
		this.viewParts.push(decorationsOverviewRuler);


		var scrollDecoration = new ScrollDecorationViewPart(this._context);
		this.viewParts.push(scrollDecoration);

		var contentViewOverlays = new ContentViewOverlays(this._context, this.layoutProvider);
		this.viewParts.push(contentViewOverlays);
		contentViewOverlays.addDynamicOverlay(new CurrentLineHighlightOverlay(this._context, this.layoutProvider));
		contentViewOverlays.addDynamicOverlay(new SelectionsOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new DecorationsOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new IndentGuidesOverlay(this._context));

		var marginViewOverlays = new MarginViewOverlays(this._context, this.layoutProvider);
		this.viewParts.push(marginViewOverlays);
		marginViewOverlays.addDynamicOverlay(new GlyphMarginOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new LinesDecorationsOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new LineNumbersOverlay(this._context));


		// Content widgets
		this.contentWidgets = new ViewContentWidgets(this._context, this.domNode);
		this.viewParts.push(this.contentWidgets);

		var viewCursors = new ViewCursors(this._context);
		this.viewParts.push(viewCursors);

		// Overlay widgets
		this.overlayWidgets = new ViewOverlayWidgets(this._context);
		this.viewParts.push(this.overlayWidgets);

		var rulers = new Rulers(this._context, this.layoutProvider);
		this.viewParts.push(rulers);

		// -------------- Wire dom nodes up

		this.linesContentContainer = this.layoutProvider.getScrollbarContainerDomNode();
		this.linesContentContainer.style.position = 'absolute';

		if (decorationsOverviewRuler) {
			var overviewRulerData = this.layoutProvider.getOverviewRulerInsertData();
			overviewRulerData.parent.insertBefore(decorationsOverviewRuler.getDomNode(), overviewRulerData.insertBefore);
		}

		this.linesContent.appendChild(contentViewOverlays.getDomNode());
		this.linesContent.appendChild(rulers.domNode);
		this.linesContent.appendChild(this.viewZones.domNode);
		this.linesContent.appendChild(this.viewLines.getDomNode());
		this.linesContent.appendChild(this.contentWidgets.domNode);
		this.linesContent.appendChild(viewCursors.getDomNode());
		this.overflowGuardContainer.appendChild(marginViewOverlays.getDomNode());
		this.overflowGuardContainer.appendChild(this.linesContentContainer);
		this.overflowGuardContainer.appendChild(scrollDecoration.getDomNode());
		this.overflowGuardContainer.appendChild(this.overlayWidgets.domNode);
		this.overflowGuardContainer.appendChild(this.textArea);
		this.overflowGuardContainer.appendChild(this.textAreaCover);
		this.domNode.appendChild(this.overflowGuardContainer);
		this.domNode.appendChild(this.contentWidgets.overflowingContentWidgetsDomNode);
	}

	private _flushAccumulatedAndRenderNow(): void {
		this._flushAnyAccumulatedEvents();
		this._renderNow();
	}

	private createPointerHandlerHelper(): IPointerHandlerHelper {
		return {
			viewDomNode: this.domNode,
			linesContentDomNode: this.linesContent,

			focusTextArea: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.focusTextArea: View is disposed');
				}
				this.focus();
			},

			isDirty: (): boolean => {
				return (this.accumulatedModelEvents.length > 0);
			},

			getScrollLeft: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getScrollLeft: View is disposed');
				}
				return this.layoutProvider.getScrollLeft();
			},
			getScrollTop: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getScrollTop: View is disposed');
				}
				return this.layoutProvider.getScrollTop();
			},

			setScrollPosition: (position:editorCommon.INewScrollPosition) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.setScrollPosition: View is disposed');
				}
				this.layoutProvider.setScrollPosition(position);
			},

			isAfterLines: (verticalOffset: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.isAfterLines: View is disposed');
				}
				return this.layoutProvider.isAfterLines(verticalOffset);
			},
			getLineNumberAtVerticalOffset: (verticalOffset: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getLineNumberAtVerticalOffset: View is disposed');
				}
				return this.layoutProvider.getLineNumberAtVerticalOffset(verticalOffset);
			},
			getVerticalOffsetForLineNumber: (lineNumber: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getVerticalOffsetForLineNumber: View is disposed');
				}
				return this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber);
			},
			getWhitespaceAtVerticalOffset: (verticalOffset: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getWhitespaceAtVerticalOffset: View is disposed');
				}
				return this.layoutProvider.getWhitespaceAtVerticalOffset(verticalOffset);
			},
			shouldSuppressMouseDownOnViewZone: (viewZoneId: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.shouldSuppressMouseDownOnViewZone: View is disposed');
				}
				return this.viewZones.shouldSuppressMouseDownOnViewZone(viewZoneId);
			},

			getPositionFromDOMInfo: (spanNode: HTMLElement, offset: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getPositionFromDOMInfo: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				return this.viewLines.getPositionFromDOMInfo(spanNode, offset);
			},

			visibleRangeForPosition2: (lineNumber: number, column: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.visibleRangeForPosition2: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(lineNumber, column, lineNumber, column), 0);
				if (!visibleRanges) {
					return null;
				}
				return visibleRanges[0];
			},

			getLineWidth: (lineNumber: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getLineWidth: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				return this.viewLines.getLineWidth(lineNumber);
			}
		};
	}

	private createKeyboardHandlerHelper(): IKeyboardHandlerHelper {
		return {
			viewDomNode: this.domNode,
			textArea: this.textArea,
			visibleRangeForPositionRelativeToEditor: (lineNumber: number, column: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.keyboardHandler.visibleRangeForPositionRelativeToEditor: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				var linesViewPortData = this.layoutProvider.getLinesViewportData();
				var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(lineNumber, column, lineNumber, column), linesViewPortData.visibleRangesDeltaTop);
				if (!visibleRanges) {
					return null;
				}
				return visibleRanges[0];
			},
			flushAnyAccumulatedEvents: () => {
				this._flushAnyAccumulatedEvents();
			}
		};
	}

	public setAriaActiveDescendant(id:string): void {
		if (id) {
			this.textArea.setAttribute('role', 'combobox');
			if (this.textArea.getAttribute('aria-activedescendant') !== id) {
				this.textArea.setAttribute('aria-haspopup', 'true');
				this.textArea.setAttribute('aria-activedescendant', id);
			}
		} else {
			this.textArea.setAttribute('role', 'textbox');
			this.textArea.removeAttribute('aria-activedescendant');
			this.textArea.removeAttribute('aria-haspopup');
		}
	}

	// --- begin event handlers

	public onLayoutChanged(layoutInfo:editorCommon.EditorLayoutInfo): boolean {
		if (browser.isChrome) {
			/* tslint:disable:no-unused-variable */
			// Access overflowGuardContainer.clientWidth to prevent relayouting bug in Chrome
			// See Bug 19676: Editor misses a layout event
			var clientWidth = this.overflowGuardContainer.clientWidth + 'px';
			/* tslint:enable:no-unused-variable */
		}
		StyleMutator.setWidth(this.domNode, layoutInfo.width);
		StyleMutator.setHeight(this.domNode, layoutInfo.height);

		StyleMutator.setWidth(this.overflowGuardContainer, layoutInfo.width);
		StyleMutator.setHeight(this.overflowGuardContainer, layoutInfo.height);

		StyleMutator.setWidth(this.linesContent, 1000000);
		StyleMutator.setHeight(this.linesContent, 1000000);

		StyleMutator.setLeft(this.linesContentContainer, layoutInfo.contentLeft);
		StyleMutator.setWidth(this.linesContentContainer, layoutInfo.contentWidth);
		StyleMutator.setHeight(this.linesContentContainer, layoutInfo.contentHeight);

		this.outgoingEventBus.emit(editorCommon.EventType.ViewLayoutChanged, layoutInfo);
		return false;
	}
	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		if (e.viewInfo.editorClassName) {
			this.domNode.className = this._context.configuration.editor.viewInfo.editorClassName;
		}
		if (e.viewInfo.ariaLabel) {
			this.textArea.setAttribute('aria-label', this._context.configuration.editor.viewInfo.ariaLabel);
		}
		return false;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		this.outgoingEventBus.emit('scroll', e);
		return false;
	}
	public onViewFocusChanged(isFocused:boolean): boolean {
		dom.toggleClass(this.domNode, 'focused', isFocused);
		if (isFocused) {
			this._editorTextFocusContextKey.set(true);
			this.outgoingEventBus.emit(editorCommon.EventType.ViewFocusGained, {});
		} else {
			this._editorTextFocusContextKey.reset();
			this.outgoingEventBus.emit(editorCommon.EventType.ViewFocusLost, {});
		}
		return false;
	}
	// --- end event handlers

	public dispose(): void {
		this._isDisposed = true;
		if (this.handleAccumulatedModelEventsTimeout !== -1) {
			clearTimeout(this.handleAccumulatedModelEventsTimeout);
			this.handleAccumulatedModelEventsTimeout = -1;
		}
		if (this._renderAnimationFrame !== null) {
			this._renderAnimationFrame.dispose();
			this._renderAnimationFrame = null;
		}
		this.accumulatedModelEvents = [];

		this.eventDispatcher.removeEventHandler(this);
		this.outgoingEventBus.dispose();
		this.listenersToRemove = dispose(this.listenersToRemove);
		this.listenersToDispose = dispose(this.listenersToDispose);

		this.keyboardHandler.dispose();
		this.pointerHandler.dispose();

		this.viewLines.dispose();

		// Destroy IViewPart second
		for (var i = 0, len = this.viewParts.length; i < len; i++) {
			this.viewParts[i].dispose();
		}
		this.viewParts = [];

		this.layoutProvider.dispose();
		this._keybindingService.dispose();
	}

	// --- begin Code Editor APIs

	private codeEditorHelper:editorBrowser.ICodeEditorHelper;
	public getCodeEditorHelper(): editorBrowser.ICodeEditorHelper {
		if (!this.codeEditorHelper) {
			this.codeEditorHelper = {
				getScrollWidth: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollWidth: View is disposed');
					}
					return this.layoutProvider.getScrollWidth();
				},
				getScrollLeft: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollLeft: View is disposed');
					}
					return this.layoutProvider.getScrollLeft();
				},

				getScrollHeight: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollHeight: View is disposed');
					}
					return this.layoutProvider.getScrollHeight();
				},
				getScrollTop: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollTop: View is disposed');
					}
					return this.layoutProvider.getScrollTop();
				},

				setScrollPosition: (position:editorCommon.INewScrollPosition) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.setScrollPosition: View is disposed');
					}
					this.layoutProvider.setScrollPosition(position);
				},

				getVerticalOffsetForPosition: (modelLineNumber:number, modelColumn:number) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getVerticalOffsetForPosition: View is disposed');
					}
					var modelPosition = this._context.model.validateModelPosition({
						lineNumber: modelLineNumber,
						column: modelColumn
					});
					var viewPosition = this._context.model.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column);
					return this.layoutProvider.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
				},
				delegateVerticalScrollbarMouseDown: (browserEvent: MouseEvent) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.delegateVerticalScrollbarMouseDown: View is disposed');
					}
					this.layoutProvider.delegateVerticalScrollbarMouseDown(browserEvent);
				},
				getOffsetForColumn: (modelLineNumber: number, modelColumn: number) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getOffsetForColumn: View is disposed');
					}
					var modelPosition = this._context.model.validateModelPosition({
						lineNumber: modelLineNumber,
						column: modelColumn
					});
					var viewPosition = this._context.model.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column);
					this._flushAccumulatedAndRenderNow();
					var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column), 0);
					if (!visibleRanges) {
						return -1;
					}
					return visibleRanges[0].left;
				}
			};
		}
		return this.codeEditorHelper;
	}

	public getCenteredRangeInViewport(): Range {
		if (this._isDisposed) {
			throw new Error('ViewImpl.getCenteredRangeInViewport: View is disposed');
		}
		var viewLineNumber = this.layoutProvider.getCenteredViewLineNumberInViewport();
		var viewModel = this._context.model;
		var currentCenteredViewRange = new Range(viewLineNumber, 1, viewLineNumber, viewModel.getLineMaxColumn(viewLineNumber));
		return viewModel.convertViewRangeToModelRange(currentCenteredViewRange);
	}

//	public getLineInfoProvider():view.ILineInfoProvider {
//		return this.viewLines;
//	}

	public getInternalEventBus(): IEventEmitter {
		if (this._isDisposed) {
			throw new Error('ViewImpl.getInternalEventBus: View is disposed');
		}
		return this.outgoingEventBus;
	}

	public saveState(): editorCommon.IViewState {
		if (this._isDisposed) {
			throw new Error('ViewImpl.saveState: View is disposed');
		}
		return this.layoutProvider.saveState();
	}

	public restoreState(state: editorCommon.IViewState): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.restoreState: View is disposed');
		}
		this._flushAnyAccumulatedEvents();
		return this.layoutProvider.restoreState(state);
	}

	public focus(): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.focus: View is disposed');
		}
		this.keyboardHandler.focusTextArea();

		// IE does not trigger the focus event immediately, so we must help it a little bit
		this._setHasFocus(true);
	}

	public isFocused(): boolean {
		if (this._isDisposed) {
			throw new Error('ViewImpl.isFocused: View is disposed');
		}
		return this.hasFocus;
	}

	public createOverviewRuler(cssClassName: string, minimumHeight: number, maximumHeight: number): OverviewRuler {
		if (this._isDisposed) {
			throw new Error('ViewImpl.createOverviewRuler: View is disposed');
		}
		return new OverviewRuler(
				this._context, cssClassName, this.layoutProvider.getScrollHeight(), minimumHeight, maximumHeight,
				(lineNumber:number) => this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber)
		);
	}

	public change(callback: (changeAccessor: editorBrowser.IViewZoneChangeAccessor) => any): boolean {
		if (this._isDisposed) {
			throw new Error('ViewImpl.change: View is disposed');
		}
		var zonesHaveChanged = false;
		this._renderOnce(() => {
			// Handle events to avoid "adjusting" newly inserted view zones
			this._flushAnyAccumulatedEvents();
			var changeAccessor:editorBrowser.IViewZoneChangeAccessor = {
				addZone: (zone:editorBrowser.IViewZone): number => {
					zonesHaveChanged = true;
					return this.viewZones.addZone(zone);
				},
				removeZone: (id:number): void => {
					zonesHaveChanged = this.viewZones.removeZone(id) || zonesHaveChanged;
				},
				layoutZone: (id: number): void => {
					zonesHaveChanged = this.viewZones.layoutZone(id) || zonesHaveChanged;
				}
			};

			var r: any = safeInvoke1Arg(callback, changeAccessor);

			// Invalidate changeAccessor
			changeAccessor.addZone = null;
			changeAccessor.removeZone = null;

			if (zonesHaveChanged) {
				this._context.privateViewEventBus.emit(editorCommon.EventType.ViewZonesChanged, null);
			}

			return r;
		});
		return zonesHaveChanged;
	}

	public getWhitespaces(): editorCommon.IEditorWhitespace[]{
		if (this._isDisposed) {
			throw new Error('ViewImpl.getWhitespaces: View is disposed');
		}
		return this.layoutProvider.getWhitespaces();
	}

	public addContentWidget(widgetData: editorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.addContentWidget: View is disposed');
		}
		this._renderOnce(() => {
			this.contentWidgets.addWidget(widgetData.widget);
			this.layoutContentWidget(widgetData);
		});
	}

	public layoutContentWidget(widgetData: editorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.layoutContentWidget: View is disposed');
		}

		this._renderOnce(() => {
			let newPosition = widgetData.position ? widgetData.position.position : null;
			let newPreference = widgetData.position ? widgetData.position.preference : null;
			this.contentWidgets.setWidgetPosition(widgetData.widget, newPosition, newPreference);
		});
	}

	public removeContentWidget(widgetData: editorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.removeContentWidget: View is disposed');
		}
		this._renderOnce(() => {
			this.contentWidgets.removeWidget(widgetData.widget);
		});
	}

	public addOverlayWidget(widgetData: editorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.addOverlayWidget: View is disposed');
		}
		this._renderOnce(() => {
			this.overlayWidgets.addWidget(widgetData.widget);
			this.layoutOverlayWidget(widgetData);
		});
	}

	public layoutOverlayWidget(widgetData: editorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.layoutOverlayWidget: View is disposed');
		}

		let newPreference = widgetData.position ? widgetData.position.preference : null;
		let shouldRender = this.overlayWidgets.setWidgetPosition(widgetData.widget, newPreference);
		if (shouldRender) {
			this._scheduleRender();
		}
	}

	public removeOverlayWidget(widgetData: editorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.removeOverlayWidget: View is disposed');
		}
		this._renderOnce(() => {
			this.overlayWidgets.removeWidget(widgetData.widget);
		});
	}

	public render(now:boolean, everything:boolean): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.render: View is disposed');
		}
		if (everything) {
			// Force a render with a layout event
			this.layoutProvider.emitLayoutChangedEvent();
		}
		if (now) {
			this._flushAccumulatedAndRenderNow();
		}
	}

	public renderOnce(callback: () => any): any {
		if (this._isDisposed) {
			throw new Error('ViewImpl.renderOnce: View is disposed');
		}
		return this._renderOnce(callback);
	}

	// --- end Code Editor APIs

	private _renderOnce(callback: () => any): any {
		if (this._isDisposed) {
			throw new Error('ViewImpl._renderOnce: View is disposed');
		}
		return this.outgoingEventBus.deferredEmit(() => {
			let r = safeInvokeNoArg(callback);
			this._scheduleRender();
			return r;
		});
	}

	private _scheduleRender(): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl._scheduleRender: View is disposed');
		}
		if (this._renderAnimationFrame === null) {
			this._renderAnimationFrame = dom.runAtThisOrScheduleAtNextAnimationFrame(this._onRenderScheduled.bind(this), 100);
		}
	}

	private _onRenderScheduled(): void {
		this._renderAnimationFrame = null;
		this._flushAccumulatedAndRenderNow();
	}

	private _renderNow(): void {
		safeInvokeNoArg(() => this._actualRender());
	}

	private createRenderingContext(linesViewportData:ViewLinesViewportData): IRenderingContext {

		var vInfo = this.layoutProvider.getCurrentViewport();

		var deltaTop = linesViewportData.visibleRangesDeltaTop;

		var r:IRenderingContext = {
			linesViewportData: linesViewportData,
			scrollWidth: this.layoutProvider.getScrollWidth(),
			scrollHeight: this.layoutProvider.getScrollHeight(),

			visibleRange: linesViewportData.visibleRange,
			bigNumbersDelta: linesViewportData.bigNumbersDelta,

			viewportWidth: vInfo.width,
			viewportHeight: vInfo.height,
			viewportLeft: vInfo.left,
			viewportTop: vInfo.top,

			getScrolledTopFromAbsoluteTop: (absoluteTop:number) => {
				return this.layoutProvider.getScrolledTopFromAbsoluteTop(absoluteTop);
			},

			getViewportVerticalOffsetForLineNumber: (lineNumber:number) => {
				var verticalOffset = this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber);
				var scrolledTop = this.layoutProvider.getScrolledTopFromAbsoluteTop(verticalOffset);
				return scrolledTop;
			},

			getDecorationsInViewport: () => linesViewportData.getDecorationsInViewport(),

			linesVisibleRangesForRange: (range:editorCommon.IRange, includeNewLines:boolean) => {
				return this.viewLines.linesVisibleRangesForRange(range, includeNewLines);
			},

			visibleRangeForPosition: (position:editorCommon.IPosition) => {
				var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(position.lineNumber, position.column, position.lineNumber, position.column), deltaTop);
				if (!visibleRanges) {
					return null;
				}
				return visibleRanges[0];
			},

			lineIsVisible: (lineNumber:number) => {
				return linesViewportData.visibleRange.startLineNumber <= lineNumber && lineNumber <= linesViewportData.visibleRange.endLineNumber;
			}
		};
		return r;
	}

	private _getViewPartsToRender(): ViewPart[] {
		let result:ViewPart[] = [];
		for (let i = 0, len = this.viewParts.length; i < len; i++) {
			let viewPart = this.viewParts[i];
			if (viewPart.shouldRender()) {
				result.push(viewPart);
			}
		}
		return result;
	}

	private _actualRender(): void {
		if (!dom.isInDOM(this.domNode)) {
			return;
		}
		let t = timer.start(timer.Topic.EDITOR, 'View.render');

		let viewPartsToRender = this._getViewPartsToRender();

		if (!this.viewLines.shouldRender() && viewPartsToRender.length === 0) {
			// Nothing to render
			this.keyboardHandler.writeToTextArea();
			t.stop();
			return;
		}

		let linesViewportData = this.layoutProvider.getLinesViewportData();

		if (this.viewLines.shouldRender()) {
			this.viewLines.renderText(linesViewportData, () => {
				this.keyboardHandler.writeToTextArea();
			});
			this.viewLines.onDidRender();

			// Rendering of viewLines might cause scroll events to occur, so collect view parts to render again
			viewPartsToRender = this._getViewPartsToRender();
		} else {
			this.keyboardHandler.writeToTextArea();
		}

		let renderingContext = this.createRenderingContext(linesViewportData);

		// Render the rest of the parts
		for (let i = 0, len = viewPartsToRender.length; i < len; i++) {
			let viewPart = viewPartsToRender[i];
			viewPart.prepareRender(renderingContext);
		}

		for (let i = 0, len = viewPartsToRender.length; i < len; i++) {
			let viewPart = viewPartsToRender[i];
			viewPart.render(renderingContext);
			viewPart.onDidRender();
		}

		// Render the scrollbar
		this.layoutProvider.renderScrollbar();

		t.stop();
	}

	private _setHasFocus(newHasFocus:boolean): void {
		if (this.hasFocus !== newHasFocus) {
			this.hasFocus = newHasFocus;
			this._context.privateViewEventBus.emit(editorCommon.EventType.ViewFocusChanged, this.hasFocus);
		}
	}
}

function safeInvokeNoArg(func:Function): any {
	try {
		return func();
	} catch(e) {
		onUnexpectedError(e);
	}
}

function safeInvoke1Arg(func:Function, arg1:any): any {
	try {
		return func(arg1);
	} catch(e) {
		onUnexpectedError(e);
	}
}
