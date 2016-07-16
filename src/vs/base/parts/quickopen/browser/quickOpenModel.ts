/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import types = require('vs/base/common/types');
import URI from 'vs/base/common/uri';
import {ITree, IElementCallback} from 'vs/base/parts/tree/browser/tree';
import filters = require('vs/base/common/filters');
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import {IQuickNavigateConfiguration, IModel, IDataSource, IFilter, IAccessiblityProvider, IRenderer, IRunner, Mode} from 'vs/base/parts/quickopen/common/quickOpen';
import {IActionProvider} from 'vs/base/parts/tree/browser/actionsRenderer';
import {Action, IAction, IActionRunner} from 'vs/base/common/actions';
import {compareAnything, compareByPrefix} from 'vs/base/common/comparers';
import {ActionBar, IActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {LegacyRenderer, ILegacyTemplateData} from 'vs/base/parts/tree/browser/treeDefaults';
import {HighlightedLabel} from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import DOM = require('vs/base/browser/dom');
import scorer = require('vs/base/common/scorer');

export interface IContext {
	event: any;
	quickNavigateConfiguration: IQuickNavigateConfiguration;
}

export interface IHighlight {
	start: number;
	end: number;
}

let IDS = 0;

export class QuickOpenEntry {
	private id: string;
	private labelHighlights: IHighlight[];
	private descriptionHighlights: IHighlight[];
	private detailHighlights: IHighlight[];
	private hidden: boolean;

	constructor(highlights: IHighlight[] = []) {
		this.id = (IDS++).toString();
		this.labelHighlights = highlights;
		this.descriptionHighlights = [];
	}

	/**
	 * A unique identifier for the entry
	 */
	public getId(): string {
		return this.id;
	}

	/**
	 * The label of the entry to identify it from others in the list
	 */
	public getLabel(): string {
		return null;
	}

	/**
	 * The label of the entry to use when a screen reader wants to read about the entry
	 */
	public getAriaLabel(): string {
		return this.getLabel();
	}

	/**
	 * Detail information about the entry that is optional and can be shown below the label
	 */
	public getDetail(): string {
		return null;
	}

	/**
	 * The icon of the entry to identify it from others in the list
	 */
	public getIcon(): string {
		return null;
	}

	/**
	 * A secondary description that is optional and can be shown right to the label
	 */
	public getDescription(): string {
		return null;
	}

	/**
	 * A resource for this entry. Resource URIs can be used to compare different kinds of entries and group
	 * them together.
	 */
	public getResource(): URI {
		return null;
	}

	/**
	 * Extra CSS class name to add to the quick open entry to do custom styling of entries.
	 */
	public getExtraClass(): string {
		return null;
	}

	/**
	 * Allows to reuse the same model while filtering. Hidden entries will not show up in the viewer.
	 */
	public isHidden(): boolean {
		return this.hidden;
	}

	/**
	 * Allows to reuse the same model while filtering. Hidden entries will not show up in the viewer.
	 */
	public setHidden(hidden: boolean): void {
		this.hidden = hidden;
	}

	/**
	 * Allows to set highlight ranges that should show up for the entry label and optionally description if set.
	 */
	public setHighlights(labelHighlights: IHighlight[], descriptionHighlights?: IHighlight[], detailHighlights?: IHighlight[]): void {
		this.labelHighlights = labelHighlights;
		this.descriptionHighlights = descriptionHighlights;
		this.detailHighlights = detailHighlights;
	}

	/**
	 * Allows to return highlight ranges that should show up for the entry label and description.
	 */
	public getHighlights(): [IHighlight[] /* Label */, IHighlight[] /* Description */, IHighlight[] /* Detail */] {
		return [this.labelHighlights, this.descriptionHighlights, this.detailHighlights];
	}

	/**
	 * Called when the entry is selected for opening. Returns a boolean value indicating if an action was performed or not.
	 * The mode parameter gives an indication if the element is previewed (using arrow keys) or opened.
	 *
	 * The context parameter provides additional context information how the run was triggered.
	 */
	public run(mode: Mode, context: IContext): boolean {
		return false;
	}

	/**
	 * A good default sort implementation for quick open entries respecting highlight information
	 * as well as associated resources.
	 */
	public static compare(elementA: QuickOpenEntry, elementB: QuickOpenEntry, lookFor: string): number {

		// Normalize
		if (lookFor) {
			lookFor = strings.stripWildcards(lookFor).toLowerCase();
		}

		// Give matches with label highlights higher priority over
		// those with only description highlights
		const labelHighlightsA = elementA.getHighlights()[0] || [];
		const labelHighlightsB = elementB.getHighlights()[0] || [];
		if (labelHighlightsA.length && !labelHighlightsB.length) {
			return -1;
		} else if (!labelHighlightsA.length && labelHighlightsB.length) {
			return 1;
		}

		// Fallback to the full path if labels are identical and we have associated resources
		let nameA = elementA.getLabel();
		let nameB = elementB.getLabel();
		if (nameA === nameB) {
			let resourceA = elementA.getResource();
			let resourceB = elementB.getResource();

			if (resourceA && resourceB) {
				nameA = resourceA.fsPath;
				nameB = resourceB.fsPath;
			}
		}

		return compareAnything(nameA, nameB, lookFor);
	}

	public static compareByScore(elementA: QuickOpenEntry, elementB: QuickOpenEntry, lookFor: string, lookForNormalizedLower: string, scorerCache?: { [key: string]: number }): number {
		const labelA = elementA.getLabel();
		const labelB = elementB.getLabel();

		// treat prefix matches highest in any case
		const prefixCompare = compareByPrefix(labelA, labelB, lookFor);
		if (prefixCompare) {
			return prefixCompare;
		}

		// Give higher importance to label score
		const labelAScore = scorer.score(labelA, lookFor, scorerCache);
		const labelBScore = scorer.score(labelB, lookFor, scorerCache);

		// Useful for understanding the scoring
		// elementA.setPrefix(labelAScore + ' ');
		// elementB.setPrefix(labelBScore + ' ');

		if (labelAScore !== labelBScore) {
			return labelAScore > labelBScore ? -1 : 1;
		}

		// Score on full resource path comes next (if available)
		let resourceA = elementA.getResource();
		let resourceB = elementB.getResource();
		if (resourceA && resourceB) {
			const resourceAScore = scorer.score(resourceA.fsPath, lookFor, scorerCache);
			const resourceBScore = scorer.score(resourceB.fsPath, lookFor, scorerCache);

			// Useful for understanding the scoring
			// elementA.setPrefix(elementA.getPrefix() + ' ' + resourceAScore + ': ');
			// elementB.setPrefix(elementB.getPrefix() + ' ' + resourceBScore + ': ');

			if (resourceAScore !== resourceBScore) {
				return resourceAScore > resourceBScore ? -1 : 1;
			}
		}

		// At this place, the scores are identical so we check for string lengths and favor shorter ones
		if (labelA.length !== labelB.length) {
			return labelA.length < labelB.length ? -1 : 1;
		}

		if (resourceA && resourceB && resourceA.fsPath.length !== resourceB.fsPath.length) {
			return resourceA.fsPath.length < resourceB.fsPath.length ? -1 : 1;
		}

		// Finally compare by label or resource path
		if (labelA === labelB && resourceA && resourceB) {
			return compareAnything(resourceA.fsPath, resourceB.fsPath, lookForNormalizedLower);
		}

		return compareAnything(labelA, labelB, lookForNormalizedLower);
	}

	/**
	 * A good default highlight implementation for an entry with label and description.
	 */
	public static highlight(entry: QuickOpenEntry, lookFor: string, fuzzyHighlight = false): { labelHighlights: IHighlight[], descriptionHighlights: IHighlight[] } {
		let labelHighlights: IHighlight[] = [];
		let descriptionHighlights: IHighlight[] = [];

		const normalizedLookFor = strings.stripWildcards(lookFor);
		const label = entry.getLabel();
		const description = entry.getDescription();

		// Highlight file aware
		if (entry.getResource()) {

			// Highlight entire label and description if searching for full absolute path
			if (lookFor.toLowerCase() === entry.getResource().fsPath.toLowerCase()) {
				labelHighlights.push({ start: 0, end: label.length });
				descriptionHighlights.push({ start: 0, end: description.length });
			}

			// Fuzzy/Full-Path: Highlight is special
			else if (fuzzyHighlight || lookFor.indexOf(paths.nativeSep) >= 0) {
				let candidateLabelHighlights = filters.matchesFuzzy(lookFor, label, fuzzyHighlight);
				if (!candidateLabelHighlights) {
					const pathPrefix = description ? (description + paths.nativeSep) : '';
					const pathPrefixLength = pathPrefix.length;

					// If there are no highlights in the label, build a path out of description and highlight and match on both,
					// then extract the individual label and description highlights back to the original positions
					let pathHighlights = filters.matchesFuzzy(lookFor, pathPrefix + label, fuzzyHighlight);
					if (!pathHighlights && lookFor !== normalizedLookFor) {
						pathHighlights = filters.matchesFuzzy(normalizedLookFor, pathPrefix + label, fuzzyHighlight);
					}

					if (pathHighlights) {
						pathHighlights.forEach(h => {

							// Match overlaps label and description part, we need to split it up
							if (h.start < pathPrefixLength && h.end > pathPrefixLength) {
								labelHighlights.push({ start: 0, end: h.end - pathPrefixLength });
								descriptionHighlights.push({ start: h.start, end: pathPrefixLength });
							}

							// Match on label part
							else if (h.start >= pathPrefixLength) {
								labelHighlights.push({ start: h.start - pathPrefixLength, end: h.end - pathPrefixLength });
							}

							// Match on description part
							else {
								descriptionHighlights.push(h);
							}
						});
					}
				} else {
					labelHighlights = candidateLabelHighlights;
				}
			}

			// Highlight only inside label
			else {
				labelHighlights = filters.matchesFuzzy(lookFor, label);
			}
		}

		// Highlight by label otherwise
		else {
			labelHighlights = filters.matchesFuzzy(lookFor, label);
		}

		return { labelHighlights, descriptionHighlights };
	}
}

export class QuickOpenEntryItem extends QuickOpenEntry {

	/**
	 * Must return the height as being used by the render function.
	 */
	public getHeight(): number {
		return 0;
	}

	/**
	 * Allows to present the quick open entry in a custom way inside the tree.
	 */
	public render(tree: ITree, container: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {
		return null;
	}
}

export class QuickOpenEntryGroup extends QuickOpenEntry {
	private entry: QuickOpenEntry;
	private groupLabel: string;
	private withBorder: boolean;

	constructor(entry?: QuickOpenEntry, groupLabel?: string, withBorder?: boolean) {
		super();

		this.entry = entry;
		this.groupLabel = groupLabel;
		this.withBorder = withBorder;
	}

	/**
	 * The label of the group or null if none.
	 */
	public getGroupLabel(): string {
		return this.groupLabel;
	}

	public setGroupLabel(groupLabel: string): void {
		this.groupLabel = groupLabel;
	}

	/**
	 * Whether to show a border on top of the group entry or not.
	 */
	public showBorder(): boolean {
		return this.withBorder;
	}

	public setShowBorder(showBorder: boolean): void {
		this.withBorder = showBorder;
	}

	public getLabel(): string {
		return this.entry ? this.entry.getLabel() : super.getLabel();
	}

	public getAriaLabel(): string {
		return this.entry ? this.entry.getAriaLabel() : super.getAriaLabel();
	}

	public getDetail(): string {
		return this.entry ? this.entry.getDetail() : super.getDetail();
	}

	public getResource(): URI {
		return this.entry ? this.entry.getResource() : super.getResource();
	}

	public getIcon(): string {
		return this.entry ? this.entry.getIcon() : super.getIcon();
	}

	public getDescription(): string {
		return this.entry ? this.entry.getDescription() : super.getDescription();
	}

	public getEntry(): QuickOpenEntry {
		return this.entry;
	}

	public getHighlights(): [IHighlight[], IHighlight[], IHighlight[]] {
		return this.entry ? this.entry.getHighlights() : super.getHighlights();
	}

	public getExtraClass(): string {
		return this.entry ? this.entry.getExtraClass() : super.getExtraClass();
	}

	public isHidden(): boolean {
		return this.entry ? this.entry.isHidden() : super.isHidden();
	}

	public setHighlights(labelHighlights: IHighlight[], descriptionHighlights?: IHighlight[], detailHighlights?: IHighlight[]): void {
		this.entry ? this.entry.setHighlights(labelHighlights, descriptionHighlights, detailHighlights) : super.setHighlights(labelHighlights, descriptionHighlights, detailHighlights);
	}

	public setHidden(hidden: boolean): void {
		this.entry ? this.entry.setHidden(hidden) : super.setHidden(hidden);
	}

	public run(mode: Mode, context: IContext): boolean {
		return this.entry ? this.entry.run(mode, context) : super.run(mode, context);
	}
}

const templateEntry = 'quickOpenEntry';
const templateEntryGroup = 'quickOpenEntryGroup';
const templateEntryItem = 'quickOpenEntryItem';

class EntryItemRenderer extends LegacyRenderer {

	public getTemplateId(tree: ITree, element: any): string {
		return templateEntryItem;
	}

	protected render(tree: ITree, element: any, container: HTMLElement, previousCleanupFn?: IElementCallback): IElementCallback {
		if (element instanceof QuickOpenEntryItem) {
			return (<QuickOpenEntryItem>element).render(tree, container, previousCleanupFn);
		}

		return super.render(tree, element, container, previousCleanupFn);
	}
}

class NoActionProvider implements IActionProvider {

	public hasActions(tree: ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as(null);
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return false;
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as(null);
	}

	public getActionItem(tree: ITree, element: any, action: Action): IActionItem {
		return null;
	}
}

export interface IQuickOpenEntryTemplateData {
	container: HTMLElement;
	entry: HTMLElement;
	icon: HTMLSpanElement;
	label: HighlightedLabel;
	detail: HighlightedLabel;
	description: HighlightedLabel;
	actionBar: ActionBar;
}

export interface IQuickOpenEntryGroupTemplateData extends IQuickOpenEntryTemplateData {
	group: HTMLDivElement;
}

class Renderer implements IRenderer<QuickOpenEntry> {

	private actionProvider: IActionProvider;
	private actionRunner: IActionRunner;
	private entryItemRenderer: EntryItemRenderer;

	constructor(actionProvider: IActionProvider = new NoActionProvider(), actionRunner: IActionRunner = null) {
		this.actionProvider = actionProvider;
		this.actionRunner = actionRunner;
		this.entryItemRenderer = new EntryItemRenderer();
	}

	public getHeight(entry: QuickOpenEntry): number {
		if (entry instanceof QuickOpenEntryItem) {
			return (<QuickOpenEntryItem>entry).getHeight();
		}
		if (entry.getDetail()) {
			return 44;
		}
		return 22;
	}

	public getTemplateId(entry: QuickOpenEntry): string {
		if (entry instanceof QuickOpenEntryItem) {
			return templateEntryItem;
		}

		if (entry instanceof QuickOpenEntryGroup) {
			return templateEntryGroup;
		}

		return templateEntry;
	}

	public renderTemplate(templateId: string, container: HTMLElement): IQuickOpenEntryGroupTemplateData {

		// Entry Item
		if (templateId === templateEntryItem) {
			return this.entryItemRenderer.renderTemplate(null, templateId, container);
		}

		// Entry Group
		let group: HTMLDivElement;
		if (templateId === templateEntryGroup) {
			group = document.createElement('div');
			DOM.addClass(group, 'results-group');
			container.appendChild(group);
		}

		// Action Bar
		DOM.addClass(container, 'actions');

		let entryContainer = document.createElement('div');
		DOM.addClass(entryContainer, 'sub-content');
		container.appendChild(entryContainer);

		let actionBarContainer = document.createElement('div');
		DOM.addClass(actionBarContainer, 'primary-action-bar');
		container.appendChild(actionBarContainer);

		let actionBar = new ActionBar(actionBarContainer, {
			actionRunner: this.actionRunner
		});

		// Entry
		let entry = document.createElement('div');
		DOM.addClass(entry, 'quick-open-entry');
		entryContainer.appendChild(entry);

		// Icon
		let icon = document.createElement('span');
		entry.appendChild(icon);

		// Label
		let label = new HighlightedLabel(entry);

		// Description
		let descriptionContainer = document.createElement('span');
		entry.appendChild(descriptionContainer);
		DOM.addClass(descriptionContainer, 'quick-open-entry-description');
		let description = new HighlightedLabel(descriptionContainer);

		// Detail
		let detailContainer = document.createElement('div');
		entry.appendChild(detailContainer);
		DOM.addClass(detailContainer, 'quick-open-entry-meta');
		let detail = new HighlightedLabel(detailContainer);

		return {
			container,
			entry,
			icon,
			label,
			detail,
			description,
			group,
			actionBar
		};
	}

	public renderElement(entry: QuickOpenEntry, templateId: string, templateData: any): void {

		// Entry Item
		if (templateId === templateEntryItem) {
			this.entryItemRenderer.renderElement(null, entry, templateId, <ILegacyTemplateData>templateData);
			return;
		}

		let data: IQuickOpenEntryTemplateData = templateData;

		// Action Bar
		if (this.actionProvider.hasActions(null, entry)) {
			DOM.addClass(data.container, 'has-actions');
		} else {
			DOM.removeClass(data.container, 'has-actions');
		}

		data.actionBar.context = entry; // make sure the context is the current element

		this.actionProvider.getActions(null, entry).then((actions) => {
			// TODO@Ben this will not work anymore as soon as quick open has more actions
			// but as long as there is only one are ok
			if (data.actionBar.isEmpty() && actions && actions.length > 0) {
				data.actionBar.push(actions, { icon: true, label: false });
			} else if (!data.actionBar.isEmpty() && (!actions || actions.length === 0)) {
				data.actionBar.clear();
			}
		});

		// Entry group
		if (entry instanceof QuickOpenEntryGroup) {
			let group = <QuickOpenEntryGroup>entry;

			// Border
			if (group.showBorder()) {
				DOM.addClass(data.container, 'results-group-separator');
			} else {
				DOM.removeClass(data.container, 'results-group-separator');
			}

			// Group Label
			let groupLabel = group.getGroupLabel() || '';
			(<IQuickOpenEntryGroupTemplateData>templateData).group.textContent = groupLabel;
		}

		// Normal Entry
		if (entry instanceof QuickOpenEntry) {
			let [labelHighlights, descriptionHighlights, detailHighlights] = entry.getHighlights();

			// Extra Class
			let extraClass = entry.getExtraClass();
			if (extraClass) {
				DOM.addClass(data.entry, extraClass);
			} else {
				data.entry.className = 'quick-open-entry';
			}

			// Icon
			let iconClass = entry.getIcon() ? ('quick-open-entry-icon ' + entry.getIcon()) : '';
			data.icon.className = iconClass;

			// Label
			data.label.set(entry.getLabel(), labelHighlights || []);

			// Meta
			data.detail.set(entry.getDetail(), detailHighlights);

			// Description
			data.description.set(entry.getDescription(), descriptionHighlights || []);
			data.description.element.title = entry.getDescription();
		}
	}

	public disposeTemplate(templateId: string, templateData: any): void {
		if (templateId === templateEntryItem) {
			this.entryItemRenderer.disposeTemplate(null, templateId, templateData);
		} else {
			const data = templateData as IQuickOpenEntryGroupTemplateData;
			data.actionBar.dispose();
			data.actionBar = null;
			data.container = null;
			data.entry = null;
			data.description.dispose();
			data.description = null;
			data.detail.dispose();
			data.detail = null;
			data.group = null;
			data.icon = null;
			data.label.dispose();
			data.label = null;
		}
	}
}

export class QuickOpenModel implements
	IModel<QuickOpenEntry>,
	IDataSource<QuickOpenEntry>,
	IFilter<QuickOpenEntry>,
	IRunner<QuickOpenEntry>
{
	private _entries: QuickOpenEntry[];
	private _dataSource: IDataSource<QuickOpenEntry>;
	private _renderer: IRenderer<QuickOpenEntry>;
	private _filter: IFilter<QuickOpenEntry>;
	private _runner: IRunner<QuickOpenEntry>;
	private _accessibilityProvider: IAccessiblityProvider<QuickOpenEntry>;

	constructor(entries: QuickOpenEntry[] = [], actionProvider: IActionProvider = new NoActionProvider()) {
		this._entries = entries;
		this._dataSource = this;
		this._renderer = new Renderer(actionProvider);
		this._filter = this;
		this._runner = this;
		this._accessibilityProvider = this;
	}

	public get entries() { return this._entries; }
	public get dataSource() { return this._dataSource; }
	public get renderer() { return this._renderer; }
	public get filter() { return this._filter; }
	public get runner() { return this._runner; }
	public get accessibilityProvider() { return this._accessibilityProvider; }

	public set entries(entries: QuickOpenEntry[]) {
		this._entries = entries;
	}

	/**
	 * Adds entries that should show up in the quick open viewer.
	 */
	public addEntries(entries: QuickOpenEntry[]): void {
		if (types.isArray(entries)) {
			this._entries = this._entries.concat(entries);
		}
	}

	/**
	 * Set the entries that should show up in the quick open viewer.
	 */
	public setEntries(entries: QuickOpenEntry[]): void {
		if (types.isArray(entries)) {
			this._entries = entries;
		}
	}

	/**
	 * Get the entries that should show up in the quick open viewer.
	 *
	 * @visibleOnly optional parameter to only return visible entries
	 */
	public getEntries(visibleOnly?: boolean): QuickOpenEntry[] {
		if (visibleOnly) {
			return this._entries.filter((e) => !e.isHidden());
		}

		return this._entries;
	}

	getId(entry: QuickOpenEntry): string {
		return entry.getId();
	}

	getLabel(entry: QuickOpenEntry): string {
		return entry.getLabel();
	}

	getAriaLabel(entry: QuickOpenEntry): string {
		const ariaLabel = entry.getAriaLabel();
		if (ariaLabel) {
			return nls.localize('quickOpenAriaLabelEntry', "{0}, picker", entry.getAriaLabel());
		}

		return nls.localize('quickOpenAriaLabel', "picker");
	}

	isVisible<T>(entry: QuickOpenEntry): boolean {
		return !entry.isHidden();
	}

	run(entry: QuickOpenEntry, mode: Mode, context: IContext): boolean {
		return entry.run(mode, context);
	}
}
