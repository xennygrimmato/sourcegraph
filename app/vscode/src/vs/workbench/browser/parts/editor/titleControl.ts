/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import './media/titlecontrol.css';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {Scope, IActionBarRegistry, Extensions, prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import {IAction, Action} from 'vs/base/common/actions';
import errors = require('vs/base/common/errors');
import DOM = require('vs/base/browser/dom');
import {TPromise} from 'vs/base/common/winjs.base';
import {BaseEditor, IEditorInputActionContext} from 'vs/workbench/browser/parts/editor/baseEditor';
import {RunOnceScheduler} from 'vs/base/common/async';
import arrays = require('vs/base/common/arrays');
import {IEditorStacksModel, IEditorGroup, IEditorIdentifier, EditorInput, IWorkbenchEditorConfiguration, IStacksModelChangeEvent, getResource} from 'vs/workbench/common/editor';
import {EventType as BaseEventType} from 'vs/base/common/events';
import {IActionItem, ActionsOrientation, Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {CloseEditorsInGroupAction, SplitEditorAction, CloseEditorAction, KeepEditorAction, CloseOtherEditorsInGroupAction, CloseRightEditorsInGroupAction, ShowEditorsInGroupAction} from 'vs/workbench/browser/parts/editor/editorActions';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {createActionItem, fillInActions} from 'vs/platform/actions/browser/menuItemActionItem';
import {IMenuService, IMenu, MenuId} from 'vs/platform/actions/common/actions';
import {ResourceContextKey} from 'vs/platform/actions/common/resourceContextKey';

export interface IToolbarActions {
	primary: IAction[];
	secondary: IAction[];
}

export interface ITitleAreaControl {
	setContext(group: IEditorGroup): void;
	allowDragging(element: HTMLElement): boolean;
	setDragged(dragged: boolean): void;
	create(parent: HTMLElement): void;
	getContainer(): HTMLElement;
	refresh(instant?: boolean): void;
	update(instant?: boolean): void;
	layout(): void;
	dispose(): void;
}

const showTabsOverflowAction = false; // TODO@Ben temporary

export abstract class TitleControl implements ITitleAreaControl {

	private static draggedEditor: IEditorIdentifier;

	protected stacks: IEditorStacksModel;
	protected context: IEditorGroup;
	protected toDispose: IDisposable[];

	protected dragged: boolean;

	protected closeEditorAction: CloseEditorAction;
	protected pinEditorAction: KeepEditorAction;
	protected closeOtherEditorsAction: CloseOtherEditorsInGroupAction;
	protected closeRightEditorsAction: CloseRightEditorsInGroupAction;
	protected closeEditorsInGroupAction: CloseEditorsInGroupAction;
	protected splitEditorAction: SplitEditorAction;
	protected showEditorsInGroupAction: ShowEditorsInGroupAction;

	private parent: HTMLElement;

	private previewEditors: boolean;
	private showTabs: boolean;

	private currentPrimaryEditorActionIds: string[] = [];
	private currentSecondaryEditorActionIds: string[] = [];
	protected editorActionsToolbar: ToolBar;

	private mapActionsToEditors: { [editorId: string]: IToolbarActions; };
	private scheduler: RunOnceScheduler;
	private refreshScheduled: boolean;

	private resourceContext: ResourceContextKey;

	private contributedTitleBarMenu: IMenu;

	constructor(
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IMessageService protected messageService: IMessageService,
		@IMenuService protected menuService: IMenuService,
		@IQuickOpenService protected quickOpenService: IQuickOpenService
	) {
		this.toDispose = [];
		this.stacks = editorGroupService.getStacksModel();
		this.mapActionsToEditors = Object.create(null);

		this.onConfigurationUpdated(configurationService.getConfiguration<IWorkbenchEditorConfiguration>());

		this.scheduler = new RunOnceScheduler(() => this.onSchedule(), 0);
		this.toDispose.push(this.scheduler);

		this.resourceContext = instantiationService.createInstance(ResourceContextKey);

		this.contributedTitleBarMenu = this.menuService.createMenu(MenuId.EditorTitle, this.keybindingService);
		this.toDispose.push(this.contributedTitleBarMenu);
		this.toDispose.push(this.contributedTitleBarMenu.onDidChange(e => this.update()));

		this.initActions();
		this.registerListeners();
	}

	public static getDraggedEditor(): IEditorIdentifier {
		return TitleControl.draggedEditor;
	}

	public setDragged(dragged: boolean): void {
		this.dragged = dragged;
	}

	protected onEditorDragStart(editor: IEditorIdentifier): void {
		TitleControl.draggedEditor = editor;
	}

	protected onEditorDragEnd(): void {
		TitleControl.draggedEditor = void 0;
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config)));
		this.toDispose.push(this.stacks.onModelChanged(e => this.onStacksChanged(e)));
	}

	private onStacksChanged(e: IStacksModelChangeEvent): void {
		if (e.structural) {
			this.updateSplitActionEnablement();
		}
	}

	private onConfigurationUpdated(config: IWorkbenchEditorConfiguration): void {
		this.previewEditors = config.workbench.editor.enablePreview;
		this.showTabs = config.workbench.editor.showTabs;
	}

	private updateSplitActionEnablement(): void {
		if (!this.context) {
			return;
		}

		const groupCount = this.stacks.groups.length;

		// Split editor
		this.splitEditorAction.enabled = groupCount < 3;
	}

	private onSchedule(): void {
		if (this.refreshScheduled) {
			this.doRefresh();
		} else {
			this.doUpdate();
		}

		this.refreshScheduled = false;
	}

	public setContext(group: IEditorGroup): void {
		this.context = group;
	}

	public update(instant?: boolean): void {
		if (instant) {
			this.scheduler.cancel();
			this.onSchedule();
		} else {
			this.scheduler.schedule();
		}
	}

	public refresh(instant?: boolean) {
		this.refreshScheduled = true;

		if (instant) {
			this.scheduler.cancel();
			this.onSchedule();
		} else {
			this.scheduler.schedule();
		}
	}

	public create(parent: HTMLElement): void {
		this.parent = parent;
	}

	public getContainer(): HTMLElement {
		return this.parent;
	}

	protected abstract doRefresh(): void;

	protected doUpdate(): void {
		this.doRefresh();
	}

	public layout(): void {
		// Subclasses can opt in to react on layout
	}

	public allowDragging(element: HTMLElement): boolean {
		return !DOM.findParentWithClass(element, 'monaco-action-bar', 'one-editor-silo');
	}

	private initActions(): void {
		this.closeEditorAction = this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, nls.localize('close', "Close"));
		this.closeOtherEditorsAction = this.instantiationService.createInstance(CloseOtherEditorsInGroupAction, CloseOtherEditorsInGroupAction.ID, nls.localize('closeOthers', "Close Others"));
		this.closeRightEditorsAction = this.instantiationService.createInstance(CloseRightEditorsInGroupAction, CloseRightEditorsInGroupAction.ID, nls.localize('closeRight', "Close to the Right"));
		this.closeEditorsInGroupAction = this.instantiationService.createInstance(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, nls.localize('closeAll', "Close All"));
		this.pinEditorAction = this.instantiationService.createInstance(KeepEditorAction, KeepEditorAction.ID, nls.localize('keepOpen', "Keep Open"));
		this.showEditorsInGroupAction = this.instantiationService.createInstance(ShowEditorsInGroupAction, ShowEditorsInGroupAction.ID, nls.localize('showOpenedEditors', "Show Opened Editors"));
		this.splitEditorAction = this.instantiationService.createInstance(SplitEditorAction, SplitEditorAction.ID, SplitEditorAction.LABEL);

		this.showEditorsInGroupAction.class = 'show-group-editors-action';
	}

	protected createEditorActionsToolBar(container: HTMLElement): void {
		this.editorActionsToolbar = new ToolBar(container, this.contextMenuService, {
			actionItemProvider: (action: Action) => this.actionItemProvider(action),
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: nls.localize('araLabelEditorActions', "Editor actions"),
			getKeyBinding: (action) => {
				const opts = this.keybindingService.lookupKeybindings(action.id);
				if (opts.length > 0) {
					return opts[0]; // only take the first one
				}

				return null;
			}
		});

		// Action Run Handling
		this.toDispose.push(this.editorActionsToolbar.actionRunner.addListener2(BaseEventType.RUN, (e: any) => {

			// Check for Error
			if (e.error && !errors.isPromiseCanceledError(e.error)) {
				this.messageService.show(Severity.Error, e.error);
			}

			// Log in telemetry
			if (this.telemetryService) {
				this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'editorPart' });
			}
		}));
	}

	protected actionItemProvider(action: Action): IActionItem {
		if (!this.context) {
			return null;
		}

		const group = this.context;
		const position = this.stacks.positionOfGroup(group);
		const editor = this.editorService.getVisibleEditors()[position];

		let actionItem: IActionItem;

		// Check Active Editor
		if (editor instanceof BaseEditor) {
			actionItem = editor.getActionItem(action);
		}

		// Check Registry
		if (!actionItem) {
			const actionBarRegistry = Registry.as<IActionBarRegistry>(Extensions.Actionbar);
			actionItem = actionBarRegistry.getActionItemForContext(Scope.EDITOR, { input: editor && editor.input, editor, position }, action);
		}

		// Check extensions
		if (!actionItem) {
			actionItem = createActionItem(action, this.keybindingService, this.messageService);
		}

		return actionItem;
	}

	protected getEditorActions(identifier: IEditorIdentifier): IToolbarActions {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		const {group} = identifier;
		const position = this.stacks.positionOfGroup(group);

		// Update the resource context
		this.resourceContext.set(group && getResource(group.activeEditor));

		// Editor actions require the editor control to be there, so we retrieve it via service
		const control = this.editorService.getVisibleEditors()[position];
		if (control instanceof BaseEditor && control.input && typeof control.position === 'number') {

			// Editor Control Actions
			let editorActions = this.mapActionsToEditors[control.getId()];
			if (!editorActions) {
				editorActions = this.getEditorActionsForContext(control);
				this.mapActionsToEditors[control.getId()] = editorActions;
			}
			primary.push(...editorActions.primary);
			secondary.push(...editorActions.secondary);

			// Editor Input Actions
			const editorInputActions = this.getEditorActionsForContext({ input: control.input, editor: control, position: control.position });
			primary.push(...editorInputActions.primary);
			secondary.push(...editorInputActions.secondary);

			// MenuItems
			fillInActions(this.contributedTitleBarMenu, { primary, secondary });
		}

		return { primary, secondary };
	}

	private getEditorActionsForContext(context: BaseEditor | IEditorInputActionContext): IToolbarActions {
		const primaryActions: IAction[] = [];
		const secondaryActions: IAction[] = [];

		// From Editor
		if (context instanceof BaseEditor) {
			primaryActions.push(...(<BaseEditor>context).getActions());
			secondaryActions.push(...(<BaseEditor>context).getSecondaryActions());
		}

		// From Contributions
		else {
			const actionBarRegistry = Registry.as<IActionBarRegistry>(Extensions.Actionbar);
			primaryActions.push(...actionBarRegistry.getActionBarActionsForContext(Scope.EDITOR, context));
			secondaryActions.push(...actionBarRegistry.getSecondaryActionBarActionsForContext(Scope.EDITOR, context));
		}

		return {
			primary: primaryActions,
			secondary: secondaryActions
		};
	}

	protected updateEditorActionsToolbar(): void {
		const group = this.context;
		if (!group) {
			return;
		}

		const editor = group && group.activeEditor;
		const isActive = this.stacks.isActive(group);

		// Update Editor Actions Toolbar
		let primaryEditorActions: IAction[] = [];
		let secondaryEditorActions: IAction[] = [];
		if (isActive) {
			const editorActions = this.getEditorActions({ group, editor });
			primaryEditorActions = prepareActions(editorActions.primary);
			if (isActive && editor instanceof EditorInput && editor.supportsSplitEditor()) {
				primaryEditorActions.push(this.splitEditorAction);
			}
			secondaryEditorActions = prepareActions(editorActions.secondary);
		}

		if (this.showTabs && showTabsOverflowAction) {
			primaryEditorActions.push(this.showEditorsInGroupAction);
		}

		if (this.showTabs) {
			if (!showTabsOverflowAction) {
				secondaryEditorActions.push(new Separator());
				secondaryEditorActions.push(this.showEditorsInGroupAction);
			}
			secondaryEditorActions.push(new Separator());
			secondaryEditorActions.push(this.closeEditorsInGroupAction);
		}

		const primaryEditorActionIds = primaryEditorActions.map(a => a.id);
		if (!this.showTabs) {
			primaryEditorActionIds.push(this.closeEditorAction.id); // always show "Close" when tabs are disabled
		}

		const secondaryEditorActionIds = secondaryEditorActions.map(a => a.id);

		if (!arrays.equals(primaryEditorActionIds, this.currentPrimaryEditorActionIds) || !arrays.equals(secondaryEditorActionIds, this.currentSecondaryEditorActionIds)) {
			this.editorActionsToolbar.setActions(primaryEditorActions, secondaryEditorActions)();

			if (!this.showTabs) {
				this.editorActionsToolbar.addPrimaryAction(this.closeEditorAction)();
			}

			this.currentPrimaryEditorActionIds = primaryEditorActionIds;
			this.currentSecondaryEditorActionIds = secondaryEditorActionIds;
		}
	}

	protected clearEditorActionsToolbar(): void {
		this.editorActionsToolbar.setActions([], [])();

		this.currentPrimaryEditorActionIds = [];
		this.currentSecondaryEditorActionIds = [];
	}

	protected onContextMenu(identifier: IEditorIdentifier, e: Event, node: HTMLElement): void {
		let anchor: HTMLElement | { x: number, y: number } = node;
		if (e instanceof MouseEvent) {
			const event = new StandardMouseEvent(e);
			anchor = { x: event.posx, y: event.posy };
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.as(this.getContextMenuActions(identifier)),
			getActionsContext: () => identifier,
			getKeyBinding: (action) => {
				const opts = this.keybindingService.lookupKeybindings(action.id);
				if (opts.length > 0) {
					return opts[0]; // only take the first one
				}

				return null;
			}
		});
	}

	protected getContextMenuActions(identifier: IEditorIdentifier): IAction[] {
		const {editor, group} = identifier;

		// Enablement
		this.closeOtherEditorsAction.enabled = group.count > 1;
		this.pinEditorAction.enabled = !group.isPinned(editor);
		this.closeRightEditorsAction.enabled = group.indexOf(editor) !== group.count - 1;

		// Actions: For all editors
		const actions: IAction[] = [
			this.closeEditorAction,
			this.closeOtherEditorsAction
		];

		if (this.showTabs) {
			actions.push(this.closeRightEditorsAction);
		}

		actions.push(this.closeEditorsInGroupAction);

		if (this.previewEditors) {
			actions.push(new Separator(), this.pinEditorAction);
		}

		return actions;
	}

	public dispose(): void {
		dispose(this.toDispose);

		// Actions
		[
			this.splitEditorAction,
			this.showEditorsInGroupAction,
			this.closeEditorAction,
			this.closeRightEditorsAction,
			this.closeOtherEditorsAction,
			this.closeEditorsInGroupAction,
			this.pinEditorAction
		].forEach((action) => {
			action.dispose();
		});

		// Toolbar
		this.editorActionsToolbar.dispose();
	}
}