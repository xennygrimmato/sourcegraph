/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/sidebyside';
import arrays = require('vs/base/common/arrays');
import Event, {Emitter} from 'vs/base/common/event';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import types = require('vs/base/common/types');
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {Sash, ISashEvent, IVerticalSashLayoutProvider} from 'vs/base/browser/ui/sash/sash';
import {ProgressBar} from 'vs/base/browser/ui/progressbar/progressbar';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import DOM = require('vs/base/browser/dom');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import {RunOnceScheduler} from 'vs/base/common/async';
import {isMacintosh} from 'vs/base/common/platform';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {Position, POSITIONS} from 'vs/platform/editor/common/editor';
import {IEditorGroupService, GroupArrangement} from 'vs/workbench/services/group/common/groupService';
import {IEventService} from 'vs/platform/event/common/event';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TabsTitleControl} from 'vs/workbench/browser/parts/editor/tabsTitleControl';
import {TitleControl} from 'vs/workbench/browser/parts/editor/titleControl';
import {NoTabsTitleControl} from 'vs/workbench/browser/parts/editor/noTabsTitleControl';
import {IEditorStacksModel, IStacksModelChangeEvent, IWorkbenchEditorConfiguration, IEditorGroup, EditorOptions, TextEditorOptions, IEditorIdentifier} from 'vs/workbench/common/editor';
import {ITitleAreaControl} from 'vs/workbench/browser/parts/editor/titleControl';
import {extractResources} from 'vs/base/browser/dnd';

export enum Rochade {
	NONE,
	CENTER_TO_LEFT,
	RIGHT_TO_CENTER,
	CENTER_AND_RIGHT_TO_LEFT
}

export enum ProgressState {
	INFINITE,
	DONE,
	STOP
}

export interface ISideBySideEditorControl {

	onGroupFocusChanged: Event<void>;

	show(editor: BaseEditor, position: Position, preserveActive: boolean, widthRatios?: number[]): void;
	hide(editor: BaseEditor, position: Position, layoutAndRochade: boolean): Rochade;

	setActive(editor: BaseEditor): void;

	getActiveEditor(): BaseEditor;
	getActivePosition(): Position;

	move(from: Position, to: Position): void;

	isDragging(): boolean;

	getInstantiationService(position: Position): IInstantiationService;
	getProgressBar(position: Position): ProgressBar;
	updateProgress(position: Position, state: ProgressState): void;

	layout(dimension: Dimension): void;
	layout(position: Position): void;

	arrangeGroups(arrangement: GroupArrangement): void;

	getWidthRatios(): number[];
	dispose(): void;
}

/**
 * Helper class to manage multiple side by side editors for the editor part.
 */
export class SideBySideEditorControl implements ISideBySideEditorControl, IVerticalSashLayoutProvider {

	private static TITLE_AREA_CONTROL_KEY = '__titleAreaControl';
	private static PROGRESS_BAR_CONTROL_KEY = '__progressBar';
	private static INSTANTIATION_SERVICE_KEY = '__instantiationService';

	private static MIN_EDITOR_WIDTH = 170;
	private static EDITOR_TITLE_HEIGHT = 35;
	private static SNAP_TO_MINIMIZED_THRESHOLD = 50;

	private stacks: IEditorStacksModel;

	private parent: Builder;
	private dimension: Dimension;
	private dragging: boolean;

	private silos: Builder[];
	private siloWidths: number[];
	private siloInitialRatios: number[];

	private leftSash: Sash;
	private startLeftContainerWidth: number;

	private rightSash: Sash;
	private startRightContainerWidth: number;

	private visibleEditors: BaseEditor[];

	private lastActiveEditor: BaseEditor;
	private lastActivePosition: Position;

	private visibleEditorFocusTrackers: DOM.IFocusTracker[];

	private _onGroupFocusChanged: Emitter<void>;

	private onStacksChangeScheduler: RunOnceScheduler;
	private stacksChangedBuffer: IStacksModelChangeEvent[];

	private toDispose: IDisposable[];

	constructor(
		parent: Builder,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IEventService private eventService: IEventService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IExtensionService private extensionService: IExtensionService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.stacks = editorGroupService.getStacksModel();
		this.toDispose = [];

		this.parent = parent;
		this.dimension = new Dimension(0, 0);

		this.silos = [];
		this.siloWidths = [];

		this.visibleEditors = [];
		this.visibleEditorFocusTrackers = [];

		this._onGroupFocusChanged = new Emitter<void>();

		this.onStacksChangeScheduler = new RunOnceScheduler(() => this.handleStacksChanged(), 0);
		this.toDispose.push(this.onStacksChangeScheduler);
		this.stacksChangedBuffer = [];

		this.create(this.parent);
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.stacks.onModelChanged(e => this.onStacksChanged(e)));
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config)));
		this.extensionService.onReady().then(() => this.onExtensionsReady());
	}

	private onConfigurationUpdated(configuration: IWorkbenchEditorConfiguration): void {
		const useTabs = configuration.workbench.editor.showTabs;

		POSITIONS.forEach(position => {
			const titleControl = this.getTitleAreaControl(position);

			// TItle Container
			const titleContainer = $(titleControl.getContainer());
			if (useTabs) {
				titleContainer.addClass('tabs');
			} else {
				titleContainer.removeClass('tabs');
			}

			// Title Control
			if (titleControl) {
				const usingTabs = (titleControl instanceof TabsTitleControl);
				if (usingTabs !== useTabs) {

					// Dispose old
					titleControl.dispose();
					titleContainer.empty();

					// Create new
					this.createTitleControl(this.stacks.groupAt(position), this.silos[position], titleContainer, this.getInstantiationService(position));
				}
			}
		});
	}

	private onExtensionsReady(): void {

		// Up to date title areas
		POSITIONS.forEach(position => this.getTitleAreaControl(position).update());
	}

	private onStacksChanged(e: IStacksModelChangeEvent): void {
		this.stacksChangedBuffer.push(e);
		this.onStacksChangeScheduler.schedule();
	}

	private handleStacksChanged(): void {

		// Read and reset buffer of events
		const buffer = this.stacksChangedBuffer;
		this.stacksChangedBuffer = [];

		// Up to date context for all title controls
		POSITIONS.forEach(position => {
			const titleAreaControl = this.getTitleAreaControl(position);
			const context = this.stacks.groupAt(position);
			titleAreaControl.setContext(context);
			if (!context) {
				titleAreaControl.refresh(); // clear out the control if the context is no longer present
			}
		});

		// Refresh / update if group is visible and has a position
		buffer.forEach(e => {
			const position = this.stacks.positionOfGroup(e.group);
			if (position >= 0) { // group could be gone by now because we run from a scheduler with timeout
				if (e.structural) {
					this.getTitleAreaControl(position).refresh();
				} else {
					this.getTitleAreaControl(position).update();
				}
			}
		});
	}

	public get onGroupFocusChanged(): Event<void> {
		return this._onGroupFocusChanged.event;
	}

	public show(editor: BaseEditor, position: Position, preserveActive: boolean, widthRatios?: number[]): void {
		const visibleEditorCount = this.getVisibleEditorCount();

		// Store into editor bucket
		this.visibleEditors[position] = editor;

		// Store as active unless preserveActive is set
		if (!preserveActive || !this.lastActiveEditor) {
			this.doSetActive(editor, position);
		}

		// Track focus
		this.trackFocus(editor, position);

		// Find target container and build into
		const target = this.silos[position].child();
		editor.getContainer().build(target);

		// Adjust layout according to provided ratios (used when restoring multiple editors at once)
		if (widthRatios && (widthRatios.length === 2 || widthRatios.length === 3)) {
			const hasLayoutInfo = this.dimension && this.dimension.width;

			// We received width ratios but were not layouted yet. So we keep these ratios for when we layout()
			if (!hasLayoutInfo) {
				this.siloInitialRatios = widthRatios;
			}

			// Adjust layout: -> [!][!]
			if (widthRatios.length === 2) {
				if (hasLayoutInfo) {
					this.siloWidths[position] = this.dimension.width * widthRatios[position];
				}
			}

			// Adjust layout: -> [!][!][!]
			else if (widthRatios.length === 3) {
				if (hasLayoutInfo) {
					this.siloWidths[position] = this.dimension.width * widthRatios[position];
				}

				if (this.rightSash.isHidden()) {
					this.rightSash.show();
					this.rightSash.layout();
				}
			}

			if (this.leftSash.isHidden()) {
				this.leftSash.show();
				this.leftSash.layout();
			}

			if (hasLayoutInfo) {
				this.layoutContainers();
			}
		}

		// Adjust layout: -> [!]
		else if (visibleEditorCount === 0 && this.dimension) {
			this.siloWidths[position] = this.dimension.width;

			this.layoutContainers();
		}

		// Adjust layout: [] -> []|[!]
		else if (position === Position.CENTER && this.leftSash.isHidden() && this.rightSash.isHidden() && this.dimension) {
			this.siloWidths[Position.LEFT] = this.dimension.width / 2;
			this.siloWidths[Position.CENTER] = this.dimension.width - this.siloWidths[Position.LEFT];

			this.leftSash.show();
			this.leftSash.layout();

			this.layoutContainers();
		}

		// Adjust layout: []|[] -> []|[]|[!]
		else if (position === Position.RIGHT && this.rightSash.isHidden() && this.dimension) {
			this.siloWidths[Position.LEFT] = this.dimension.width / 3;
			this.siloWidths[Position.CENTER] = this.dimension.width / 3;
			this.siloWidths[Position.RIGHT] = this.dimension.width - this.siloWidths[Position.LEFT] - this.siloWidths[Position.CENTER];

			this.leftSash.layout();
			this.rightSash.show();
			this.rightSash.layout();

			this.layoutContainers();
		}

		// Show editor container
		editor.getContainer().show();

		// Styles
		this.updateParentStyle();
	}

	private getVisibleEditorCount(): number {
		return this.visibleEditors.filter(v => !!v).length;
	}

	private trackFocus(editor: BaseEditor, position: Position): void {

		// In case there is a previous tracker on the position, dispose it first
		if (this.visibleEditorFocusTrackers[position]) {
			this.visibleEditorFocusTrackers[position].dispose();
		}

		// Track focus on editor container
		this.visibleEditorFocusTrackers[position] = DOM.trackFocus(editor.getContainer().getHTMLElement());
		this.visibleEditorFocusTrackers[position].addFocusListener(() => {
			this.onFocusGained(editor);
		});
	}

	private onFocusGained(editor: BaseEditor): void {
		this.setActive(editor);
	}

	public setActive(editor: BaseEditor): void {

		// Update active editor and position
		if (this.lastActiveEditor !== editor) {
			this.doSetActive(editor, this.visibleEditors.indexOf(editor));

			// Automatically maximize this position if it has min editor width
			if (this.siloWidths[this.lastActivePosition] === SideBySideEditorControl.MIN_EDITOR_WIDTH) {

				// Log this fact in telemetry
				if (this.telemetryService) {
					this.telemetryService.publicLog('workbenchEditorMaximized');
				}

				let remainingWidth = this.dimension.width;

				// Minimize all other positions to min width
				POSITIONS.forEach(p => {
					if (this.lastActivePosition !== p && !!this.visibleEditors[p]) {
						this.siloWidths[p] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
						remainingWidth -= this.siloWidths[p];
					}
				});

				// Grow focussed position if there is more width to spend
				if (remainingWidth > SideBySideEditorControl.MIN_EDITOR_WIDTH) {
					this.siloWidths[this.lastActivePosition] = remainingWidth;

					if (!this.leftSash.isHidden()) {
						this.leftSash.layout();
					}

					if (!this.rightSash.isHidden()) {
						this.rightSash.layout();
					}

					this.layoutContainers();
				}
			}

			// Re-emit to outside
			this._onGroupFocusChanged.fire();
		}
	}

	private focusNextNonMinimized(): void {

		// If the current focussed editor is minimized, try to focus the next largest editor
		if (!types.isUndefinedOrNull(this.lastActivePosition) && this.siloWidths[this.lastActivePosition] === SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			let candidate: Position = null;
			let currentWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			POSITIONS.forEach(position => {

				// Skip current active position and check if the editor is larger than min width
				if (position !== this.lastActivePosition) {
					if (this.visibleEditors[position] && this.siloWidths[position] > currentWidth) {
						candidate = position;
						currentWidth = this.siloWidths[position];
					}
				}
			});

			// Focus editor if a candidate has been found
			if (!types.isUndefinedOrNull(candidate)) {
				this.editorGroupService.focusGroup(candidate);
			}
		}
	}

	public hide(editor: BaseEditor, position: Position, layoutAndRochade: boolean): Rochade {
		let result = Rochade.NONE;

		const visibleEditorCount = this.getVisibleEditorCount();

		const hasCenter = !!this.visibleEditors[Position.CENTER];
		const hasRight = !!this.visibleEditors[Position.RIGHT];

		// If editor is not showing for position, return
		if (editor !== this.visibleEditors[position]) {
			return result;
		}

		// Clear Position
		this.clearPosition(position);

		// Take editor container offdom and hide
		editor.getContainer().offDOM().hide();

		// Adjust layout and rochade if instructed to do so
		if (layoutAndRochade) {

			// Adjust layout: [x] ->
			if (visibleEditorCount === 1) {
				this.siloWidths[position] = 0;

				this.leftSash.hide();
				this.rightSash.hide();

				this.layoutContainers();
			}

			// Adjust layout: []|[x] -> [] or [x]|[] -> []
			else if (hasCenter && !hasRight) {
				this.siloWidths[Position.LEFT] = this.dimension.width;
				this.siloWidths[Position.CENTER] = 0;

				this.leftSash.hide();
				this.rightSash.hide();

				// Move CENTER to LEFT ([x]|[] -> [])
				if (position === Position.LEFT) {
					this.rochade(Position.CENTER, Position.LEFT);
					result = Rochade.CENTER_TO_LEFT;
				}

				this.layoutContainers();
			}

			// Adjust layout: []|[]|[x] -> [ ]|[ ] or []|[x]|[] -> [ ]|[ ] or [x]|[]|[] -> [ ]|[ ]
			else if (hasCenter && hasRight) {
				this.siloWidths[Position.LEFT] = this.dimension.width / 2;
				this.siloWidths[Position.CENTER] = this.dimension.width - this.siloWidths[Position.LEFT];
				this.siloWidths[Position.RIGHT] = 0;

				this.leftSash.layout();
				this.rightSash.hide();

				// Move RIGHT to CENTER ([]|[x]|[] -> [ ]|[ ])
				if (position === Position.CENTER) {
					this.rochade(Position.RIGHT, Position.CENTER);
					result = Rochade.RIGHT_TO_CENTER;
				}

				// Move RIGHT to CENTER and CENTER to LEFT ([x]|[]|[] -> [ ]|[ ])
				else if (position === Position.LEFT) {
					this.rochade(Position.CENTER, Position.LEFT);
					this.rochade(Position.RIGHT, Position.CENTER);
					result = Rochade.CENTER_AND_RIGHT_TO_LEFT;
				}

				this.layoutContainers();
			}
		}

		// Automatically pick the next editor as active if any
		if (this.lastActiveEditor === editor) {

			// Clear old
			this.doSetActive(null, null);

			// Find new active position by taking the next one close to the closed one to the left
			if (layoutAndRochade) {
				let newActivePosition: Position;
				switch (position) {
					case Position.LEFT:
						newActivePosition = hasCenter ? Position.LEFT : null;
						break;
					case Position.CENTER:
						newActivePosition = Position.LEFT;
						break;
					case Position.RIGHT:
						newActivePosition = Position.CENTER;
						break;
				}

				if (!types.isUndefinedOrNull(newActivePosition)) {
					this.doSetActive(this.visibleEditors[newActivePosition], newActivePosition);
				}
			}
		}

		// Styles
		this.updateParentStyle();

		return result;
	}

	private updateParentStyle(): void {
		const editorCount = this.getVisibleEditorCount();
		if (editorCount > 1) {
			this.parent.addClass('multiple-editors');
		} else {
			this.parent.removeClass('multiple-editors');
		}
	}

	private doSetActive(editor: BaseEditor, newActive: Position): void {
		this.lastActivePosition = newActive;
		this.lastActiveEditor = editor;
	}

	private clearPosition(position: Position): void {

		// Unregister Listeners
		if (this.visibleEditorFocusTrackers[position]) {
			this.visibleEditorFocusTrackers[position].dispose();
			this.visibleEditorFocusTrackers[position] = null;
		}

		// Clear from active editors
		this.visibleEditors[position] = null;
	}

	private rochade(from: Position, to: Position): void {

		// Move container to new position
		const containerFrom = this.silos[from].child();
		containerFrom.appendTo(this.silos[to]);

		const containerTo = this.silos[to].child();
		containerTo.appendTo(this.silos[from]);

		// Inform editor
		const editor = this.visibleEditors[from];
		editor.changePosition(to);

		// Change data structures
		const listeners = this.visibleEditorFocusTrackers[from];
		this.visibleEditorFocusTrackers[to] = listeners;
		this.visibleEditorFocusTrackers[from] = null;

		this.visibleEditors[to] = editor;
		this.visibleEditors[from] = null;

		// Update last active position
		if (this.lastActivePosition === from) {
			this.doSetActive(this.lastActiveEditor, to);
		}
	}

	public move(from: Position, to: Position): void {

		// Distance 1: Swap Editors
		if (Math.abs(from - to) === 1) {

			// Move containers to new position
			const containerFrom = this.silos[from].child();
			containerFrom.appendTo(this.silos[to]);

			const containerTo = this.silos[to].child();
			containerTo.appendTo(this.silos[from]);

			// Inform Editors
			this.visibleEditors[from].changePosition(to);
			this.visibleEditors[to].changePosition(from);

			// Update last active position accordingly
			if (this.lastActivePosition === from) {
				this.doSetActive(this.lastActiveEditor, to);
			} else if (this.lastActivePosition === to) {
				this.doSetActive(this.lastActiveEditor, from);
			}
		}

		// Otherwise Move Editors
		else {

			// Find new positions
			let newLeftPosition: Position;
			let newCenterPosition: Position;
			let newRightPosition: Position;

			if (from === Position.LEFT) {
				newLeftPosition = Position.RIGHT;
				newCenterPosition = Position.LEFT;
				newRightPosition = Position.CENTER;
			} else {
				newLeftPosition = Position.CENTER;
				newCenterPosition = Position.RIGHT;
				newRightPosition = Position.LEFT;
			}

			// Move containers to new position
			const containerPos1 = this.silos[Position.LEFT].child();
			containerPos1.appendTo(this.silos[newLeftPosition]);

			const containerPos2 = this.silos[Position.CENTER].child();
			containerPos2.appendTo(this.silos[newCenterPosition]);

			const containerPos3 = this.silos[Position.RIGHT].child();
			containerPos3.appendTo(this.silos[newRightPosition]);

			// Inform Editors
			this.visibleEditors[Position.LEFT].changePosition(newLeftPosition);
			this.visibleEditors[Position.CENTER].changePosition(newCenterPosition);
			this.visibleEditors[Position.RIGHT].changePosition(newRightPosition);

			// Update last active position accordingly
			if (this.lastActivePosition === Position.LEFT) {
				this.doSetActive(this.lastActiveEditor, newLeftPosition);
			} else if (this.lastActivePosition === Position.CENTER) {
				this.doSetActive(this.lastActiveEditor, newCenterPosition);
			} else if (this.lastActivePosition === Position.RIGHT) {
				this.doSetActive(this.lastActiveEditor, newRightPosition);
			}
		}

		// Change data structures
		arrays.move(this.visibleEditors, from, to);
		arrays.move(this.visibleEditorFocusTrackers, from, to);
		arrays.move(this.siloWidths, from, to);

		// Layout
		if (!this.leftSash.isHidden()) {
			this.leftSash.layout();
		}

		if (!this.rightSash.isHidden()) {
			this.rightSash.layout();
		}

		this.layoutContainers();
	}

	public arrangeGroups(arrangement: GroupArrangement): void {
		if (!this.dimension) {
			return; // too early
		}

		let availableWidth = this.dimension.width;
		const visibleEditors = this.getVisibleEditorCount();

		if (visibleEditors <= 1) {
			return; // need more editors
		}

		// Minimize Others
		if (arrangement === GroupArrangement.MINIMIZE_OTHERS) {
			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					if (position !== this.lastActivePosition) {
						this.siloWidths[position] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
						availableWidth -= SideBySideEditorControl.MIN_EDITOR_WIDTH;
					}
				}
			});

			this.siloWidths[this.lastActivePosition] = availableWidth;
		}

		// Even Widths
		else if (arrangement === GroupArrangement.EVEN_WIDTH) {
			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					this.siloWidths[position] = availableWidth / visibleEditors;
				}
			});
		}

		this.layoutControl(this.dimension);
	}

	public getWidthRatios(): number[] {
		const ratio: number[] = [];

		if (this.dimension) {
			const fullWidth = this.dimension.width;

			POSITIONS.forEach(position => {
				if (this.visibleEditors[position]) {
					ratio.push(this.siloWidths[position] / fullWidth);
				}
			});
		}

		return ratio;
	}

	public getActiveEditor(): BaseEditor {
		return this.lastActiveEditor;
	}

	public getActivePosition(): Position {
		return this.lastActivePosition;
	}

	private create(parent: Builder): void {

		// Allow to drop into container to open
		this.enableDropTarget(parent.getHTMLElement());

		// Left Silo
		this.silos[Position.LEFT] = $(parent).div({ class: 'one-editor-silo editor-left monaco-editor-background' });

		// Left Sash
		this.leftSash = new Sash(parent.getHTMLElement(), this, { baseSize: 5 });
		this.toDispose.push(this.leftSash.addListener2('start', () => this.onLeftSashDragStart()));
		this.toDispose.push(this.leftSash.addListener2('change', (e: ISashEvent) => this.onLeftSashDrag(e)));
		this.toDispose.push(this.leftSash.addListener2('end', () => this.onLeftSashDragEnd()));
		this.toDispose.push(this.leftSash.addListener2('reset', () => this.onLeftSashReset()));
		this.leftSash.hide();

		// Center Silo
		this.silos[Position.CENTER] = $(parent).div({ class: 'one-editor-silo editor-center monaco-editor-background' });

		// Right Sash
		this.rightSash = new Sash(parent.getHTMLElement(), this, { baseSize: 5 });
		this.toDispose.push(this.rightSash.addListener2('start', () => this.onRightSashDragStart()));
		this.toDispose.push(this.rightSash.addListener2('change', (e: ISashEvent) => this.onRightSashDrag(e)));
		this.toDispose.push(this.rightSash.addListener2('end', () => this.onRightSashDragEnd()));
		this.toDispose.push(this.rightSash.addListener2('reset', () => this.onRightSashReset()));
		this.rightSash.hide();

		// Right Silo
		this.silos[Position.RIGHT] = $(parent).div({ class: 'one-editor-silo editor-right monaco-editor-background' });

		// For each position
		const useTabs = !!this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.showTabs;
		POSITIONS.forEach(position => {
			const silo = this.silos[position];

			// Containers (they contain everything and can move between silos)
			const container = $(silo).div({ 'class': 'container' });

			// InstantiationServices
			const instantiationService = this.instantiationService.createChild(new ServiceCollection(
				[IKeybindingService, this.keybindingService.createScoped(container.getHTMLElement())]
			));
			container.setProperty(SideBySideEditorControl.INSTANTIATION_SERVICE_KEY, instantiationService); // associate with container

			// Title containers
			const titleContainer = $(container).div({ 'class': 'title' });
			if (useTabs) {
				titleContainer.addClass('tabs');
			}
			this.hookTitleDragListener(titleContainer);

			// Title Control
			this.createTitleControl(this.stacks.groupAt(position), silo, titleContainer, instantiationService);

			// Progress Bar
			const progressBar = new ProgressBar($(container));
			progressBar.getContainer().hide();
			container.setProperty(SideBySideEditorControl.PROGRESS_BAR_CONTROL_KEY, progressBar); // associate with container
		});
	}

	private enableDropTarget(node: HTMLElement): void {
		const $this = this;
		const overlayId = 'monaco-workbench-editor-drop-overlay';
		const splitToPropertyKey = 'splitToPosition';
		const stacks = this.editorGroupService.getStacksModel();

		let overlay: Builder;
		let draggedResources: URI[];

		function cleanUp(): void {
			draggedResources = void 0;

			if (overlay) {
				overlay.destroy();
				overlay = void 0;
			}

			DOM.removeClass(node, 'dragged-over');
		}

		function optionsFromDraggedEditor(identifier: IEditorIdentifier): EditorOptions {

			// When moving an editor, try to preserve as much view state as possible by checking
			// for th editor to be a text editor and creating the options accordingly if so
			let options = EditorOptions.create({ pinned: true });
			const activeEditor = $this.editorService.getActiveEditor();
			if (activeEditor instanceof BaseTextEditor && activeEditor.position === stacks.positionOfGroup(identifier.group) && identifier.editor.matches(activeEditor.input)) {
				options = TextEditorOptions.create({ pinned: true });
				(<TextEditorOptions>options).viewState(activeEditor.getControl().saveViewState());
			}

			return options;
		}

		function onDrop(e: DragEvent, position: Position, splitTo?: Position): void {
			const droppedResources = draggedResources;
			DOM.removeClass(node, 'dropfeedback');
			cleanUp();

			const editorService = $this.editorService;
			const groupService = $this.editorGroupService;

			const splitEditor = (typeof splitTo === 'number'); // TODO@Ben ugly split code should benefit from empty group support once available!
			const freeGroup = (stacks.groups.length === 1) ? Position.CENTER : Position.RIGHT;

			// Check for transfer from title control
			const draggedEditor = TitleControl.getDraggedEditor();
			if (draggedEditor) {
				const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);

				// Copy editor to new location
				if (isCopy) {
					if (splitEditor) {
						editorService.openEditor(draggedEditor.editor, optionsFromDraggedEditor(draggedEditor), freeGroup).then(() => {
							if (splitTo !== freeGroup) {
								groupService.moveGroup(freeGroup, splitTo);
							}
						}).done(null, errors.onUnexpectedError);
					} else {
						editorService.openEditor(draggedEditor.editor, optionsFromDraggedEditor(draggedEditor), position).done(null, errors.onUnexpectedError);
					}
				}

				// Move editor to new location
				else {
					const sourcePosition = stacks.positionOfGroup(draggedEditor.group);
					if (splitEditor) {
						if (draggedEditor.group.count === 1) {
							groupService.moveGroup(sourcePosition, splitTo);
						} else {
							editorService.openEditor(draggedEditor.editor, optionsFromDraggedEditor(draggedEditor), freeGroup).then(() => {
								if (splitTo !== freeGroup) {
									groupService.moveGroup(freeGroup, splitTo);
								}
								groupService.moveEditor(draggedEditor.editor, stacks.positionOfGroup(draggedEditor.group), splitTo);
							}).done(null, errors.onUnexpectedError);
						}

					} else {
						groupService.moveEditor(draggedEditor.editor, sourcePosition, position);
					}
				}
			}

			// Check for URI transfer
			else {
				if (droppedResources.length) {
					window.focus(); // make sure this window has focus so that the open call reaches the right window!

					// Open all
					editorService.openEditors(droppedResources.map(resource => { return { input: { resource, options: { pinned: true } }, position: splitEditor ? freeGroup : position }; }))
						.then(() => {
							if (splitEditor && splitTo !== freeGroup) {
								groupService.moveGroup(freeGroup, splitTo);
							}

							groupService.focusGroup(splitEditor ? splitTo : position);
						})
						.done(null, errors.onUnexpectedError);
				}
			}
		}

		function positionOverlay(e: DragEvent, groups: number, position: Position): void {
			const target = <HTMLElement>e.target;
			const posXOnOverlay = e.offsetX;
			const overlayIsSplit = typeof overlay.getProperty(splitToPropertyKey) === 'number';
			const overlayWidth = target.clientWidth;
			const splitThreshold = overlayIsSplit ? overlayWidth / 5 : overlayWidth / 10;
			const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);
			const draggedEditor = TitleControl.getDraggedEditor();

			const isOverSplitLeft = posXOnOverlay < splitThreshold;
			const isOverSplitRight = posXOnOverlay + splitThreshold > overlayWidth;

			let splitTarget: Position;

			// No splitting if we reached maximum group count
			if (groups === POSITIONS.length) {
				splitTarget = null;
			}

			// Special splitting if we drag an editor of a group with only one editor
			else if (!isCopy && draggedEditor && draggedEditor.group.count === 1) {
				const positionOfDraggedEditor = stacks.positionOfGroup(draggedEditor.group);
				switch (positionOfDraggedEditor) {
					case Position.LEFT:
						if (position === Position.CENTER && isOverSplitRight) {
							splitTarget = Position.CENTER; // allow to move single editor from LEFT to CENTER
						}
						break;
					case Position.CENTER:
						if (position === Position.LEFT && isOverSplitLeft) {
							splitTarget = Position.LEFT; // allow to move single editor from CENTER to LEFT
						}
						break;
					default:
						splitTarget = null; // splitting not allowed
				}
			}

			// Any other case, check for mouse position
			else {
				if (isOverSplitRight) {
					splitTarget = (position === Position.LEFT) ? Position.CENTER : Position.RIGHT;
				} else if (isOverSplitLeft) {
					splitTarget = (position === Position.LEFT) ? Position.LEFT : Position.CENTER;
				}
			}

			// Apply split target
			const canSplit = (typeof splitTarget === 'number');
			if (canSplit) {
				overlay.setProperty(splitToPropertyKey, splitTarget);
			} else {
				overlay.removeProperty(splitToPropertyKey);
			}

			// Update overlay styles
			if (canSplit && isOverSplitRight) {
				overlay.style({
					left: '50%',
					width: '50%',
				});
			} else if (canSplit && isOverSplitLeft) {
				overlay.style({
					width: '50%'
				});
			} else {
				overlay.style({
					left: '0',
					width: '100%'
				});
			}

			// Make sure the overlay is visible
			overlay.style({ opacity: 1 });

			// Indicate a drag over is happening
			DOM.addClass(node, 'dragged-over');
		}

		function createOverlay(target: HTMLElement): void {
			if (!overlay) {
				const containers = $this.visibleEditors.filter(e => !!e).map(e => e.getContainer());
				containers.forEach((container, index) => {
					if (container && DOM.isAncestor(target, container.getHTMLElement())) {
						const useTabs = !!$this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.showTabs;

						overlay = $('div').style({
							top: useTabs ? SideBySideEditorControl.EDITOR_TITLE_HEIGHT + 'px' : 0,
							height: useTabs ? `calc(100% - ${SideBySideEditorControl.EDITOR_TITLE_HEIGHT}px` : '100%'
						}).id(overlayId);

						overlay.appendTo(container);

						overlay.on(DOM.EventType.DROP, (e: DragEvent) => {
							DOM.EventHelper.stop(e, true);
							onDrop(e, index, overlay.getProperty(splitToPropertyKey));
						});

						overlay.on(DOM.EventType.DRAG_OVER, (e: DragEvent) => {
							positionOverlay(e, containers.length, index);
						});

						overlay.on([DOM.EventType.DRAG_LEAVE, DOM.EventType.DRAG_END], () => {
							cleanUp();
						});

						// Under some circumstances we have seen reports where the drop overlay is not being
						// cleaned up and as such the editor area remains under the overlay so that you cannot
						// type into the editor anymore. This seems related to using VMs and DND via host and
						// guest OS, though some users also saw it without VMs.
						// To protect against this issue we always destroy the overlay as soon as we detect a
						// mouse event over it. The delay is used to guarantee we are not interfering with the
						// actual DROP event that can also trigger a mouse over event.
						overlay.once(DOM.EventType.MOUSE_OVER, () => {
							setTimeout(() => {
								cleanUp();
							}, 100);
						});
					}
				});
			}
		}

		// const a dropped file open inside Code (only if dropped over editor area)
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DROP, (e: DragEvent) => {
			if (e.target === node) {
				DOM.EventHelper.stop(e, true);
				onDrop(e, Position.LEFT);
			} else {
				DOM.removeClass(node, 'dropfeedback');
			}
		}));

		// Drag over
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DRAG_OVER, (e: DragEvent) => {

			// Upon first drag, detect the dragged resources and only take valid ones
			if (!draggedResources) {
				draggedResources = extractResources(e).filter(r => r.scheme === 'file' || r.scheme === 'untitled');
			}

			if (!draggedResources.length && !TitleControl.getDraggedEditor()) {
				return; // do not show drop feedback if we drag invalid resources or no tab around
			}

			if (e.target === node) {
				DOM.addClass(node, 'dropfeedback');
			}

			const target = <HTMLElement>e.target;
			if (target) {
				if (overlay && target.id !== overlayId) {
					cleanUp(); // somehow we managed to move the mouse quickly out of the current overlay, so destroy it
				}
				createOverlay(target);

				if (overlay) {
					DOM.removeClass(node, 'dropfeedback'); // if we show an overlay, we can remove the drop feedback from the editor background
				}
			}
		}));

		// Drag leave
		this.toDispose.push(DOM.addDisposableListener(node, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			DOM.removeClass(node, 'dropfeedback');
		}));

		// Drag end (also install globally to be safe)
		[node, window].forEach(container => {
			this.toDispose.push(DOM.addDisposableListener(container, DOM.EventType.DRAG_END, (e: DragEvent) => {
				DOM.removeClass(node, 'dropfeedback');
				cleanUp();
			}));
		});
	}

	private createTitleControl(context: IEditorGroup, silo: Builder, container: Builder, instantiationService: IInstantiationService): void {
		const useTabs = !!this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.showTabs;

		const titleAreaControl = instantiationService.createInstance<ITitleAreaControl>(useTabs ? TabsTitleControl : NoTabsTitleControl);
		titleAreaControl.create(container.getHTMLElement());
		titleAreaControl.setContext(context);
		titleAreaControl.refresh(true /* instant */);

		silo.child().setProperty(SideBySideEditorControl.TITLE_AREA_CONTROL_KEY, titleAreaControl); // associate with container
	}

	private findPosition(element: HTMLElement): Position {
		let parent = element.parentElement;
		while (parent) {
			for (let i = 0; i < POSITIONS.length; i++) {
				const position = POSITIONS[i];
				if (this.silos[position].getHTMLElement() === parent) {
					return position;
				}
			}

			parent = parent.parentElement;
		}

		return null;
	}

	private hookTitleDragListener(titleContainer: Builder): void {
		let wasDragged = false;

		// Allow to reorder positions by dragging the title
		titleContainer.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			const position = this.findPosition(titleContainer.getHTMLElement());
			const titleAreaControl = this.getTitleAreaControl(position);
			if (!titleAreaControl.allowDragging(<any>e.target || e.srcElement)) {
				return; // return early if we are not in the drag zone of the title widget
			}

			// Reset flag
			wasDragged = false;
			titleAreaControl.setDragged(false);

			// Return early if there is only one editor active or the user clicked into the toolbar
			if (this.getVisibleEditorCount() <= 1) {
				return;
			}

			// Only allow for first mouse button click!
			if (e.button !== 0) {
				return;
			}

			DOM.EventHelper.stop(e);

			// Overlay the editor area with a div to be able to capture all mouse events
			const overlayDiv = $('div').style({
				top: SideBySideEditorControl.EDITOR_TITLE_HEIGHT + 'px',
				height: '100%'
			}).id('monaco-workbench-editor-move-overlay');
			overlayDiv.appendTo(this.parent);

			// Update flag
			this.dragging = true;

			const visibleEditorCount = this.getVisibleEditorCount();
			const mouseDownEvent = new StandardMouseEvent(e);
			const startX = mouseDownEvent.posx;
			let oldNewLeft: number = null;

			this.silos[position].addClass('drag');
			this.parent.addClass('drag');

			const $window = $(window);
			$window.on(DOM.EventType.MOUSE_MOVE, (e: MouseEvent) => {
				DOM.EventHelper.stop(e, false);

				const mouseMoveEvent = new StandardMouseEvent(e);
				const diffX = mouseMoveEvent.posx - startX;
				let newLeft: number = null;

				if (Math.abs(diffX) > 5) {
					wasDragged = true;
				}

				switch (position) {

					// [ ! ]|[ ]: Moves only to the right but not outside of dimension width to the right
					case Position.LEFT: {
						newLeft = Math.max(-1 /* 1px border accomodation */, Math.min(diffX, this.dimension.width - this.siloWidths[Position.LEFT]));
						break;
					}

					case Position.CENTER: {

						// [ ]|[ ! ]: Moves only to the left but not outside of dimension width to the left
						if (visibleEditorCount === 2) {
							newLeft = Math.min(this.siloWidths[Position.LEFT], Math.max(-1 /* 1px border accomodation */, this.siloWidths[Position.LEFT] + diffX));
						}

						// [ ]|[ ! ]|[ ]: Moves to left and right but not outside of dimensions width on both sides
						else {
							newLeft = Math.min(this.dimension.width - this.siloWidths[Position.CENTER], Math.max(-1 /* 1px border accomodation */, this.siloWidths[Position.LEFT] + diffX));
						}
						break;
					}

					// [ ]|[ ]|[ ! ]: Moves to the right but not outside of dimension width on the left side
					case Position.RIGHT: {
						newLeft = Math.min(this.siloWidths[Position.LEFT] + this.siloWidths[Position.CENTER], Math.max(-1 /* 1px border accomodation */, this.siloWidths[Position.LEFT] + this.siloWidths[Position.CENTER] + diffX));
						break;
					}
				}

				// Return early if position did not change
				if (oldNewLeft === newLeft) {
					return;
				}

				oldNewLeft = newLeft;

				// Live drag Feedback
				const moveTo: Position = this.findMoveTarget(position, diffX);
				switch (position) {
					case Position.LEFT: {
						if (moveTo === Position.LEFT || moveTo === null) {
							this.silos[Position.CENTER].style({ left: this.siloWidths[Position.LEFT] + 'px', right: 'auto', borderLeftWidth: '1px' });
							this.silos[Position.RIGHT].style({ left: 'auto', right: 0 });
						} else if (moveTo === Position.CENTER) {
							this.silos[Position.CENTER].style({ left: 0, right: 'auto', borderLeftWidth: 0 });
							this.silos[Position.CENTER].addClass('draggedunder');
							this.silos[Position.RIGHT].style({ left: 'auto', right: 0 });
						} else if (moveTo === Position.RIGHT) {
							this.silos[Position.CENTER].style({ left: 0, right: 'auto' });
							this.silos[Position.RIGHT].style({ left: 'auto', right: this.siloWidths[Position.LEFT] + 'px' });
							this.silos[Position.RIGHT].addClass('draggedunder');
						}
						break;
					}

					case Position.CENTER: {
						if (moveTo === Position.LEFT) {
							this.silos[Position.LEFT].style({ left: this.siloWidths[Position.CENTER] + 'px', right: 'auto' });
							this.silos[Position.LEFT].addClass('draggedunder');
						} else if (moveTo === Position.CENTER || moveTo === null) {
							this.silos[Position.LEFT].style({ left: 0, right: 'auto' });
							this.silos[Position.RIGHT].style({ left: 'auto', right: 0 });
						} else if (moveTo === Position.RIGHT) {
							this.silos[Position.RIGHT].style({ left: 'auto', right: this.siloWidths[Position.CENTER] + 'px' });
							this.silos[Position.RIGHT].addClass('draggedunder');
							this.silos[Position.LEFT].style({ left: 0, right: 'auto' });
						}
						break;
					}

					case Position.RIGHT: {
						if (moveTo === Position.LEFT) {
							this.silos[Position.LEFT].style({ left: this.siloWidths[Position.RIGHT] + 'px', right: 'auto' });
							this.silos[Position.LEFT].addClass('draggedunder');
						} else if (moveTo === Position.CENTER) {
							this.silos[Position.LEFT].style({ left: 0, right: 'auto' });
							this.silos[Position.CENTER].style({ left: (this.siloWidths[Position.LEFT] + this.siloWidths[Position.RIGHT]) + 'px', right: 'auto' });
							this.silos[Position.CENTER].addClass('draggedunder');
						} else if (moveTo === Position.RIGHT || moveTo === null) {
							this.silos[Position.LEFT].style({ left: 0, right: 'auto' });
							this.silos[Position.CENTER].style({ left: this.siloWidths[Position.LEFT] + 'px', right: 'auto' });
						}
						break;
					}
				}

				// Move the editor to provide feedback to the user and add class
				if (newLeft !== null) {
					this.silos[position].style({ left: newLeft + 'px' });
					this.silos[position].addClass('dragging');
					this.parent.addClass('dragging');
				}
			}).once(DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
				DOM.EventHelper.stop(e, false);

				// Destroy overlay
				overlayDiv.destroy();

				// Update flag
				this.dragging = false;
				if (wasDragged) {
					titleAreaControl.setDragged(true);
				}

				// Restore styles
				this.parent.removeClass('drag');
				this.silos[position].removeClass('drag');
				this.parent.removeClass('dragging');
				this.silos[position].removeClass('dragging');
				POSITIONS.forEach(p => this.silos[p].removeClass('draggedunder'));
				this.silos[Position.LEFT].style({ left: 0, right: 'auto' });
				this.silos[Position.CENTER].style({ left: 'auto', right: 'auto', borderLeftWidth: '1px' });
				this.silos[Position.RIGHT].style({ left: 'auto', right: 0, borderLeftWidth: '1px' });

				// Find move target
				const mouseUpEvent = new StandardMouseEvent(e);
				const diffX = mouseUpEvent.posx - startX;
				const moveTo: Position = this.findMoveTarget(position, diffX);

				// Move to valid position if any
				if (moveTo !== null) {
					this.editorGroupService.moveGroup(position, moveTo);
				}

				// Otherwise layout to restore proper positioning
				else {
					this.layoutContainers();
				}

				// If not dragging, make editor group active unless already active
				if (!wasDragged && position !== this.getActivePosition()) {
					this.editorGroupService.focusGroup(position);
				}

				$window.off('mousemove');
			});
		});
	}

	private findMoveTarget(position: Position, diffX: number): Position {
		const visibleEditorCount = this.getVisibleEditorCount();

		switch (position) {
			case Position.LEFT: {

				// [ ! ]|[] -> []|[ ! ]
				if (visibleEditorCount === 2 && (diffX >= this.siloWidths[Position.LEFT] / 2 || diffX >= this.siloWidths[Position.CENTER] / 2)) {
					return Position.CENTER;
				}

				// [ ! ]|[]|[] -> []|[]|[ ! ]
				if (visibleEditorCount === 3 && (diffX >= this.siloWidths[Position.LEFT] / 2 + this.siloWidths[Position.CENTER] || diffX >= this.siloWidths[Position.RIGHT] / 2 + this.siloWidths[Position.CENTER])) {
					return Position.RIGHT;
				}

				// [ ! ]|[]|[] -> []|[ ! ]|[]
				if (visibleEditorCount === 3 && (diffX >= this.siloWidths[Position.LEFT] / 2 || diffX >= this.siloWidths[Position.CENTER] / 2)) {
					return Position.CENTER;
				}
				break;
			}

			case Position.CENTER: {
				if (visibleEditorCount === 2 && diffX > 0) {
					return null; // Return early since CENTER cannot be moved to the RIGHT unless there is a RIGHT position
				}

				// []|[ ! ] -> [ ! ]|[]
				if (visibleEditorCount === 2 && (Math.abs(diffX) >= this.siloWidths[Position.CENTER] / 2 || Math.abs(diffX) >= this.siloWidths[Position.LEFT] / 2)) {
					return Position.LEFT;
				}

				// []|[ ! ]|[] -> [ ! ]|[]|[]
				if (visibleEditorCount === 3 && ((diffX < 0 && Math.abs(diffX) >= this.siloWidths[Position.CENTER] / 2) || (diffX < 0 && Math.abs(diffX) >= this.siloWidths[Position.LEFT] / 2))) {
					return Position.LEFT;
				}

				// []|[ ! ]|[] -> []|[]|[ ! ]
				if (visibleEditorCount === 3 && ((diffX > 0 && Math.abs(diffX) >= this.siloWidths[Position.CENTER] / 2) || (diffX > 0 && Math.abs(diffX) >= this.siloWidths[Position.RIGHT] / 2))) {
					return Position.RIGHT;
				}
				break;
			}

			case Position.RIGHT: {
				if (diffX > 0) {
					return null; // Return early since RIGHT cannot be moved more to the RIGHT
				}

				// []|[]|[ ! ] -> [ ! ]|[]|[]
				if (Math.abs(diffX) >= this.siloWidths[Position.RIGHT] / 2 + this.siloWidths[Position.CENTER] || Math.abs(diffX) >= this.siloWidths[Position.LEFT] / 2 + this.siloWidths[Position.CENTER]) {
					return Position.LEFT;
				}

				// []|[]|[ ! ] -> []|[ ! ]|[]
				if (Math.abs(diffX) >= this.siloWidths[Position.RIGHT] / 2 || Math.abs(diffX) >= this.siloWidths[Position.CENTER] / 2) {
					return Position.CENTER;
				}
				break;
			}
		}

		return null;
	}

	private centerSash(a: Position, b: Position): void {
		const sumWidth = this.siloWidths[a] + this.siloWidths[b];
		const meanWidth = sumWidth / 2;
		this.siloWidths[a] = meanWidth;
		this.siloWidths[b] = sumWidth - meanWidth;
		this.layoutContainers();
	}

	private onLeftSashDragStart(): void {
		this.startLeftContainerWidth = this.siloWidths[Position.LEFT];
	}

	private onLeftSashDrag(e: ISashEvent): void {
		let oldLeftContainerWidth = this.siloWidths[Position.LEFT];
		let newLeftContainerWidth = this.startLeftContainerWidth + e.currentX - e.startX;

		// Side-by-Side
		if (this.rightSash.isHidden()) {

			// []|[      ] : left side can not get smaller than MIN_EDITOR_WIDTH
			if (newLeftContainerWidth < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [      ]|[] : right side can not get smaller than MIN_EDITOR_WIDTH
			else if (this.dimension.width - newLeftContainerWidth < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = this.dimension.width - SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [ <-]|[      ] : left side can snap into minimized
			else if (newLeftContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [      ]|[-> ] : right side can snap into minimized
			else if (this.dimension.width - newLeftContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = this.dimension.width - SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			this.siloWidths[Position.LEFT] = newLeftContainerWidth;
			this.siloWidths[Position.CENTER] = this.dimension.width - newLeftContainerWidth;
		}

		// Side-by-Side-by-Side
		else {

			// [!]|[      ]|[  ] : left side can not get smaller than MIN_EDITOR_WIDTH
			if (newLeftContainerWidth < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [      ]|[!]|[  ] : center side can not get smaller than MIN_EDITOR_WIDTH
			else if (this.dimension.width - newLeftContainerWidth - this.siloWidths[Position.RIGHT] < SideBySideEditorControl.MIN_EDITOR_WIDTH) {

				// [      ]|[ ]|[!] : right side can not get smaller than MIN_EDITOR_WIDTH
				if (this.dimension.width - newLeftContainerWidth - this.siloWidths[Position.CENTER] < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
					newLeftContainerWidth = this.dimension.width - (2 * SideBySideEditorControl.MIN_EDITOR_WIDTH);
					this.siloWidths[Position.CENTER] = this.siloWidths[Position.RIGHT] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
				}

				// [      ]|[ ]|[-> ] : right side can snap into minimized
				else if (this.dimension.width - newLeftContainerWidth - this.siloWidths[Position.CENTER] - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
					this.siloWidths[Position.RIGHT] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
				}

				// [      ]|[ ]|[ ] : right side shrinks
				else {
					this.siloWidths[Position.RIGHT] = this.siloWidths[Position.RIGHT] - (newLeftContainerWidth - oldLeftContainerWidth);
				}

				this.rightSash.layout();
			}

			// [ <-]|[      ]|[  ] : left side can snap into minimized
			else if (newLeftContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [      ]|[-> ]|[  ] : center side can snap into minimized
			else if (this.dimension.width - this.siloWidths[Position.RIGHT] - newLeftContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newLeftContainerWidth = this.dimension.width - this.siloWidths[Position.RIGHT] - SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			this.siloWidths[Position.LEFT] = newLeftContainerWidth;
			this.siloWidths[Position.CENTER] = this.dimension.width - this.siloWidths[Position.LEFT] - this.siloWidths[Position.RIGHT];
		}

		// Pass on to containers
		this.layoutContainers();
	}

	private onLeftSashDragEnd(): void {
		this.leftSash.layout();
		this.rightSash.layout(); // Moving left sash might have also moved right sash, so layout() both
		this.focusNextNonMinimized();
	}

	private onLeftSashReset(): void {
		this.centerSash(Position.LEFT, Position.CENTER);
		this.leftSash.layout();
	}

	private onRightSashDragStart(): void {
		this.startRightContainerWidth = this.siloWidths[Position.RIGHT];
	}

	private onRightSashDrag(e: ISashEvent): void {
		let oldRightContainerWidth = this.siloWidths[Position.RIGHT];
		let newRightContainerWidth = this.startRightContainerWidth - e.currentX + e.startX;

		// [  ]|[      ]|[!] : right side can not get smaller than MIN_EDITOR_WIDTH
		if (newRightContainerWidth < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			newRightContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
		}

		// [      ]|[!]|[  ] : center side can not get smaller than MIN_EDITOR_WIDTH
		else if (this.dimension.width - newRightContainerWidth - this.siloWidths[Position.LEFT] < SideBySideEditorControl.MIN_EDITOR_WIDTH) {

			// [!]|[ ]|[    ] : left side can not get smaller than MIN_EDITOR_WIDTH
			if (this.dimension.width - newRightContainerWidth - this.siloWidths[Position.CENTER] < SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				newRightContainerWidth = this.dimension.width - (2 * SideBySideEditorControl.MIN_EDITOR_WIDTH);
				this.siloWidths[Position.LEFT] = this.siloWidths[Position.CENTER] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [ <-]|[ ]|[    ] : left side can snap into minimized
			else if (this.dimension.width - newRightContainerWidth - this.siloWidths[Position.CENTER] - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
				this.siloWidths[Position.LEFT] = SideBySideEditorControl.MIN_EDITOR_WIDTH;
			}

			// [  ]|[ ]|[   ] : left side shrinks
			else {
				this.siloWidths[Position.LEFT] = this.siloWidths[Position.LEFT] - (newRightContainerWidth - oldRightContainerWidth);
			}

			this.leftSash.layout();
		}

		// [ ]|[      ]|[-> ] : right side can snap into minimized
		else if (newRightContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			newRightContainerWidth = SideBySideEditorControl.MIN_EDITOR_WIDTH;
		}

		// [ ]|[ <-]|[      ] : center side can snap into minimized
		else if (this.dimension.width - this.siloWidths[Position.LEFT] - newRightContainerWidth - SideBySideEditorControl.SNAP_TO_MINIMIZED_THRESHOLD <= SideBySideEditorControl.MIN_EDITOR_WIDTH) {
			newRightContainerWidth = this.dimension.width - this.siloWidths[Position.LEFT] - SideBySideEditorControl.MIN_EDITOR_WIDTH;
		}

		this.siloWidths[Position.RIGHT] = newRightContainerWidth;
		this.siloWidths[Position.CENTER] = this.dimension.width - this.siloWidths[Position.LEFT] - this.siloWidths[Position.RIGHT];

		this.layoutContainers();
	}

	private onRightSashDragEnd(): void {
		this.leftSash.layout(); // Moving right sash might have also moved left sash, so layout() both
		this.rightSash.layout();
		this.focusNextNonMinimized();
	}

	private onRightSashReset(): void {
		this.centerSash(Position.CENTER, Position.RIGHT);
		this.rightSash.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		return sash === this.leftSash ? this.siloWidths[Position.LEFT] : this.siloWidths[Position.CENTER] + this.siloWidths[Position.LEFT];
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this.dimension.height;
	}

	public isDragging(): boolean {
		return this.dragging;
	}

	public layout(dimension: Dimension): void;
	public layout(position: Position): void;
	public layout(arg: any): void {
		if (arg instanceof Dimension) {
			this.layoutControl(<Dimension>arg);
		} else {
			this.layoutEditor(<Position>arg);
		}
	}

	private layoutControl(dimension: Dimension): void {
		let oldDimension = this.dimension;
		this.dimension = dimension;

		// Use the current dimension in case an editor was opened before we had any dimension
		if (!oldDimension || !oldDimension.width || !oldDimension.height) {
			oldDimension = dimension;
		}

		// Apply to visible editors
		let totalWidth = 0;

		// Set preferred dimensions based on ratio to previous dimenions
		POSITIONS.forEach(position => {
			if (this.visibleEditors[position]) {

				// Keep minimized editors in tact by not letting them grow if we have width to give
				if (this.siloWidths[position] !== SideBySideEditorControl.MIN_EDITOR_WIDTH) {
					let sashWidthRatio: number;

					// We have some stored initial ratios when the editor was restored on startup
					// Use those ratios over anything else but only once.
					if (this.siloInitialRatios && types.isNumber(this.siloInitialRatios[position])) {
						sashWidthRatio = this.siloInitialRatios[position];
						delete this.siloInitialRatios[position]; // dont use again
					} else {
						sashWidthRatio = this.siloWidths[position] / oldDimension.width;
					}

					this.siloWidths[position] = Math.max(Math.round(this.dimension.width * sashWidthRatio), SideBySideEditorControl.MIN_EDITOR_WIDTH);
				}

				totalWidth += this.siloWidths[position];
			}
		});

		// Compensate for overflow either through rounding error or min editor width
		if (totalWidth > 0) {
			let overflow = totalWidth - this.dimension.width;

			// We have width to give
			if (overflow < 0) {

				// Find the first position from left to right that is not minimized
				// to give width. This ensures that minimized editors are left like
				// that if the user chose this layout.
				let positionToGive: Position = null;
				POSITIONS.forEach(position => {
					if (this.visibleEditors[position] && positionToGive === null && this.siloWidths[position] !== SideBySideEditorControl.MIN_EDITOR_WIDTH) {
						positionToGive = position;
					}
				});

				if (positionToGive === null) {
					positionToGive = Position.LEFT; // maybe all are minimized, so give LEFT the extra width
				}

				this.siloWidths[positionToGive] -= overflow;
			}

			// We have width to take
			else if (overflow > 0) {
				POSITIONS.forEach(position => {
					const maxCompensation = this.siloWidths[position] - SideBySideEditorControl.MIN_EDITOR_WIDTH;
					if (maxCompensation >= overflow) {
						this.siloWidths[position] -= overflow;
						overflow = 0;
					} else if (maxCompensation > 0) {
						const compensation = overflow - maxCompensation;
						this.siloWidths[position] -= compensation;
						overflow -= compensation;
					}
				});
			}
		}

		// Sash positioning
		this.leftSash.layout();
		this.rightSash.layout();

		// Pass on to Editor Containers
		this.layoutContainers();
	}

	private layoutContainers(): void {

		// Layout containers
		POSITIONS.forEach(position => {
			this.silos[position].size(this.siloWidths[position], this.dimension.height);
		});

		// Position center depending on visibility of right hand editor
		if (this.visibleEditors[Position.RIGHT]) {
			this.silos[Position.CENTER].position(null, this.siloWidths[Position.RIGHT]);
		} else {
			this.silos[Position.CENTER].position(null, this.dimension.width - this.siloWidths[Position.LEFT] - this.siloWidths[Position.CENTER]);
		}

		// Visibility
		POSITIONS.forEach(position => {
			if (this.visibleEditors[position] && this.silos[position].isHidden()) {
				this.silos[position].show();
			} else if (!this.visibleEditors[position] && !this.silos[position].isHidden()) {
				this.silos[position].hide();
			}
		});

		// Layout visible editors
		POSITIONS.forEach(position => {
			this.layoutEditor(position);
		});

		// Layout title controls
		POSITIONS.forEach(position => {
			this.getTitleAreaControl(position).layout();
		});
	}

	private layoutEditor(position: Position): void {
		const editorWidth = this.siloWidths[position];
		if (editorWidth && this.visibleEditors[position]) {
			this.visibleEditors[position].layout(new Dimension(editorWidth, this.dimension.height - SideBySideEditorControl.EDITOR_TITLE_HEIGHT));
		}
	}

	public getInstantiationService(position: Position): IInstantiationService {
		return this.getFromContainer(position, SideBySideEditorControl.INSTANTIATION_SERVICE_KEY);
	}

	public getProgressBar(position: Position): ProgressBar {
		return this.getFromContainer(position, SideBySideEditorControl.PROGRESS_BAR_CONTROL_KEY);
	}

	private getTitleAreaControl(position: Position): ITitleAreaControl {
		return this.getFromContainer(position, SideBySideEditorControl.TITLE_AREA_CONTROL_KEY);
	}

	private getFromContainer(position: Position, key: string): any {
		return this.silos[position].child().getProperty(key);
	}

	public updateProgress(position: Position, state: ProgressState): void {
		switch (state) {
			case ProgressState.INFINITE:
				this.getProgressBar(position).infinite().getContainer().show();
				break;
			case ProgressState.DONE:
				this.getProgressBar(position).done().getContainer().hide();
				break;
			case ProgressState.STOP:
				this.getProgressBar(position).stop().getContainer().hide();
				break;
		}
	}

	public dispose(): void {
		dispose(this.toDispose);

		// Positions
		POSITIONS.forEach(position => {
			this.clearPosition(position);
		});

		// Controls
		POSITIONS.forEach(position => {
			this.getTitleAreaControl(position).dispose();
			this.getProgressBar(position).dispose();
		});

		// Sash
		this.leftSash.dispose();
		this.rightSash.dispose();

		// Destroy Container
		this.silos.forEach(silo => {
			silo.destroy();
		});

		this.lastActiveEditor = null;
		this.lastActivePosition = null;
		this.visibleEditors = null;

		this._onGroupFocusChanged.dispose();
	}
}
