/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import * as dom from 'vs/base/browser/dom';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { IMatch } from 'vs/base/common/filters';
import { matchesFuzzyOcticonAware, parseOcticons } from 'vs/base/common/octicon';
import { compareAnything } from 'vs/base/common/comparers';
import { Emitter, Event, mapEvent } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IconLabel, IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';

const $ = dom.$;

interface ISelectableElement {
	index: number;
	item: IPickOpenEntry;
	selected: boolean;
}

class SelectableElement implements ISelectableElement {
	index: number;
	item: IPickOpenEntry;
	shouldAlwaysShow = false;
	hidden = false;
	private _onSelected = new Emitter<boolean>();
	onSelected = this._onSelected.event;
	_selected: boolean;
	get selected() {
		return this._selected;
	}
	set selected(value: boolean) {
		if (value !== this._selected) {
			this._selected = value;
			this._onSelected.fire(value);
		}
	}
	labelHighlights?: IMatch[];
	descriptionHighlights?: IMatch[];
	detailHighlights?: IMatch[];

	constructor(init: ISelectableElement) {
		assign(this, init);
	}
}

interface ISelectedElementTemplateData {
	checkbox: HTMLInputElement;
	label: IconLabel;
	detail: HighlightedLabel;
	element: SelectableElement;
	toDisposeElement: IDisposable[];
	toDisposeTemplate: IDisposable[];
}

class SelectedElementRenderer implements IRenderer<SelectableElement, ISelectedElementTemplateData> {

	static readonly ID = 'selectedelement';

	get templateId() {
		return SelectedElementRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ISelectedElementTemplateData {
		const data: ISelectedElementTemplateData = Object.create(null);

		const entry = dom.append(container, $('.quick-input-checkbox-list-entry'));
		const label = dom.append(entry, $('label.quick-input-checkbox-list-label'));

		// Entry
		data.checkbox = <HTMLInputElement>dom.append(label, $('input.quick-input-checkbox-list-checkbox'));
		data.checkbox.type = 'checkbox';
		data.toDisposeElement = [];
		data.toDisposeTemplate = [];
		data.toDisposeTemplate.push(dom.addStandardDisposableListener(data.checkbox, dom.EventType.CHANGE, e => {
			data.element.selected = data.checkbox.checked;
		}));

		const rows = dom.append(label, $('.quick-input-checkbox-list-rows'));
		const row1 = dom.append(rows, $('.quick-input-checkbox-list-row'));
		const row2 = dom.append(rows, $('.quick-input-checkbox-list-row'));

		// Label
		data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true });

		// Detail
		const detailContainer = dom.append(row2, $('.quick-input-checkbox-list-label-meta'));
		data.detail = new HighlightedLabel(detailContainer);

		return data;
	}

	renderElement(element: SelectableElement, index: number, data: ISelectedElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.element = element;
		data.checkbox.checked = element.selected;
		data.toDisposeElement.push(element.onSelected(selected => data.checkbox.checked = selected));

		const { labelHighlights, descriptionHighlights, detailHighlights } = element;

		// Label
		const options: IIconLabelValueOptions = Object.create(null);
		options.matches = labelHighlights || [];
		options.descriptionTitle = element.item.description;
		options.descriptionMatches = descriptionHighlights || [];
		data.label.setValue(element.item.label, element.item.description, options);

		// Meta
		data.detail.set(element.item.detail, detailHighlights);
	}

	disposeTemplate(data: ISelectedElementTemplateData): void {
		data.toDisposeElement = dispose(data.toDisposeElement);
		data.toDisposeTemplate = dispose(data.toDisposeTemplate);
	}
}

class SelectedElementDelegate implements IDelegate<SelectableElement> {

	getHeight(element: SelectableElement): number {
		return element.item.detail ? 44 : 22;
	}

	getTemplateId(element: SelectableElement): string {
		return SelectedElementRenderer.ID;
	}
}

export class QuickInputCheckboxList {

	private container: HTMLElement;
	private list: WorkbenchList<SelectableElement>;
	private elements: SelectableElement[] = [];
	matchOnDescription = false;
	matchOnDetail = false;
	private _onAllVisibleSelectedChanged = new Emitter<boolean>(); // TODO: Debounce
	onAllVisibleSelectedChanged: Event<boolean> = this._onAllVisibleSelectedChanged.event;
	private _onSelectedCountChanged = new Emitter<number>(); // TODO: Debounce
	onSelectedCountChanged: Event<number> = this._onSelectedCountChanged.event;
	private _onLeave = new Emitter<void>();
	onLeave: Event<void> = this._onLeave.event;
	private elementDisposables: IDisposable[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.container = dom.append(this.parent, $('.quick-input-checkbox-list'));
		const delegate = new SelectedElementDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, this.container, delegate, [new SelectedElementRenderer()], {
			identityProvider: element => element.label,
			multipleSelectionSupport: false
		}) as WorkbenchList<SelectableElement>;
		this.disposables.push(this.list);
		this.disposables.push(this.list.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Space:
					this.toggleCheckbox();
					break;
				case KeyCode.UpArrow:
					const focus = this.list.getFocus();
					if (focus.length === 1 && focus[0] === 0) {
						this._onLeave.fire();
					}
					break;
			}
		}));
	}

	get onFocusChange() {
		return mapEvent(this.list.onFocusChange, e => e.elements.map(e => e.item));
	}

	getAllVisibleSelected() {
		return !this.elements.some(element => !element.hidden && !element.selected);
	}

	getSelectedCount() {
		return this.getSelectedElements().length;
	}

	setAllVisibleSelected(select: boolean) {
		this.elements.forEach(element => {
			if (!element.hidden) {
				element.selected = select;
			}
		});
	}

	setElements(elements: IPickOpenEntry[]): void {
		this.elementDisposables = dispose(this.elementDisposables);
		this.elements = elements.map((item, index) => new SelectableElement({
			index,
			item,
			selected: !!item.selected
		}));
		this.elementDisposables.push(...this.elements.map(element => element.onSelected(() => {
			this._onAllVisibleSelectedChanged.fire(this.getAllVisibleSelected());
			this._onSelectedCountChanged.fire(this.getSelectedCount());
		})));
		this.list.splice(0, this.list.length, this.elements);
		this.list.setSelection([]);
		this.list.focusFirst();
	}

	getSelectedElements() {
		return this.elements.filter(e => e.selected)
			.map(e => e.item);
	}

	focus(what: 'Next' | 'Previous' | 'NextPage' | 'PreviousPage'): void {
		this.list['focus' + what]();
	}

	domFocus() {
		this.list.domFocus();
	}

	layout(): void {
		this.list.layout();
	}

	filter(query: string) {
		query = query.trim();

		// Reset filtering
		if (!query) {
			this.elements.forEach(element => {
				element.labelHighlights = undefined;
				element.descriptionHighlights = undefined;
				element.detailHighlights = undefined;
				element.hidden = false;
			});
		}

		// Filter by value (since we support octicons, use octicon aware fuzzy matching)
		else {
			this.elements.forEach(element => {
				const labelHighlights = matchesFuzzyOcticonAware(query, parseOcticons(element.item.label));
				const descriptionHighlights = this.matchOnDescription ? matchesFuzzyOcticonAware(query, parseOcticons(element.item.description || '')) : undefined;
				const detailHighlights = this.matchOnDetail ? matchesFuzzyOcticonAware(query, parseOcticons(element.item.detail || '')) : undefined;

				if (element.shouldAlwaysShow || labelHighlights || descriptionHighlights || detailHighlights) {
					element.labelHighlights = labelHighlights;
					element.descriptionHighlights = descriptionHighlights;
					element.detailHighlights = detailHighlights;
					element.hidden = false;
				} else {
					element.labelHighlights = undefined;
					element.descriptionHighlights = undefined;
					element.detailHighlights = undefined;
					element.hidden = true;
				}
			});
		}

		// Sort by value
		const normalizedSearchValue = query.toLowerCase();
		this.elements.sort((a, b) => {
			if (!query) {
				return a.index - b.index; // restore natural order
			}
			return compareEntries(a, b, normalizedSearchValue);
		});

		this.list.splice(0, this.list.length, this.elements.filter(element => !element.hidden));
		this.list.setSelection([]);
		this.list.focusFirst();
		this.list.layout();

		this._onAllVisibleSelectedChanged.fire(this.getAllVisibleSelected());
	}

	toggleCheckbox() {
		const elements = this.list.getFocusedElements();
		for (const element of elements) {
			element.selected = !element.selected;
		}
	}

	dispose() {
		this.elementDisposables = dispose(this.elementDisposables);
		this.disposables = dispose(this.disposables);
	}
}

function compareEntries(elementA: SelectableElement, elementB: SelectableElement, lookFor: string): number {

	const labelHighlightsA = elementA.labelHighlights || [];
	const labelHighlightsB = elementB.labelHighlights || [];
	if (labelHighlightsA.length && !labelHighlightsB.length) {
		return -1;
	}

	if (!labelHighlightsA.length && labelHighlightsB.length) {
		return 1;
	}

	return compareAnything(elementA.item.label, elementB.item.label, lookFor);
}