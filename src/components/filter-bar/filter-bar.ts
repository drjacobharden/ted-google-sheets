import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownSelectionEvent,
} from "../dropdown-menu/dropdown-menu";
import { Popover } from "../popover-menu/popover-menu";
import { CustomButton } from "../button/button";
import { uuid } from "../../utilities/data-utilities";
import { createEventHandler } from "../../utilities/event-utilities";
import { filterBarTemplate } from "./template";

export type FilterDataType = string | number | string[];
export type FilterOperator =
  | "Contains"
  | "Starts with"
  | "Equals"
  | "Greater than"
  | "Less than"
  | "Does not equal";

export interface AvailableFilter<T> {
  key: keyof T;
  title: string;
  dataType: FilterDataType;
}

export interface AppliedFilter<T> {
  key: keyof T;
  operator: FilterOperator;
  value: string | number;
}

interface FilterDraft<T> {
  id: string;
  key: keyof T | null;
  operator: FilterOperator;
  value: string;
}

type DropdownRole = "field" | "operator" | "value";

const STRING_OPERATORS: FilterOperator[] = [
  "Equals",
  "Does not equal",
  "Contains",
  "Starts with",
];
const NUMBER_OPERATORS: FilterOperator[] = [
  "Equals",
  "Does not equal",
  "Greater than",
  "Less than",
];
const ENUM_OPERATORS: FilterOperator[] = ["Equals", "Does not equal"];

const template = document.createElement("template");
template.innerHTML = filterBarTemplate;

export class FilterBar<T> extends HTMLElement {
  #availableFilters: AvailableFilter<T>[] = [];
  #appliedFilters: AppliedFilter<T>[] = [];
  #drafts: FilterDraft<T>[] = [];
  #trigger!: CustomButton;
  #popover!: Popover;
  #applyButton: CustomButton | null = null;
  #dropdowns: DropdownMenu[] = [];
  #listening = false;
  #open = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.append(template.content.cloneNode(true));
      this.#trigger = this.querySelector(".filter-bar__trigger")!;
      this.#popover = this.querySelector(".filter-bar__popover")!;
      this.#render();
    }

    if (this.#listening) return;
    this.#listening = true;
    this.addEventListener("click", this);
    this.addEventListener("input", this);
    this.#popover.addEventListener("popover-dismiss", this);
    document.addEventListener("pointerdown", this, true);
    document.addEventListener("keydown", this, true);
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("click", this);
    this.removeEventListener("input", this);
    this.#popover.removeEventListener("popover-dismiss", this);
    document.removeEventListener("pointerdown", this, true);
    document.removeEventListener("keydown", this, true);
    this.#disconnectDropdowns();
    this.close();
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;
      case "input":
        this.#handleInput(event);
        break;
      case "dropdown-selection":
        this.#handleDropdownSelection(event as DropdownSelectionEvent);
        break;
      case "pointerdown":
        if (this.#open && !event.composedPath().includes(this)) this.close();
        break;
      case "keydown":
        if (this.#open && (event as KeyboardEvent).key === "Escape") {
          this.close();
        }
        break;
      case "popover-dismiss":
        this.close();
        break;
      default:
        break;
    }
  }

  set availableFilters(filters: AvailableFilter<T>[]) {
    this.#availableFilters = filters.map((filter) => ({
      ...filter,
      dataType: Array.isArray(filter.dataType)
        ? [...filter.dataType]
        : filter.dataType,
    }));

    const availableKeys = new Set(this.#availableFilters.map(({ key }) => key));
    this.#drafts = this.#drafts.filter(
      ({ key }) => key === null || availableKeys.has(key),
    );
    this.#appliedFilters = this.#appliedFilters.filter(({ key }) =>
      availableKeys.has(key),
    );
    if (this.dataset.initialized) this.#render();
  }

  get availableFilters(): AvailableFilter<T>[] {
    return this.#availableFilters.map((filter) => ({
      ...filter,
      dataType: Array.isArray(filter.dataType)
        ? [...filter.dataType]
        : filter.dataType,
    }));
  }

  set filters(filters: AppliedFilter<T>[]) {
    this.#appliedFilters = filters.flatMap((filter) => {
      const available = this.#findAvailableFilter(filter.key);
      if (!available) return [];

      const operator = this.#operatorsFor(available).includes(filter.operator)
        ? filter.operator
        : this.#defaultOperator(available);

      return [
        {
          key: filter.key,
          operator,
          value:
            this.#dataTypeKind(available) === "number"
              ? Number(filter.value)
              : String(filter.value),
        },
      ];
    });
    this.#drafts = this.#appliedFilters.map((filter) => ({
      id: uuid(),
      key: filter.key,
      operator: filter.operator,
      value: String(filter.value),
    }));
    if (this.dataset.initialized) this.#render();
  }

  get filters(): AppliedFilter<T>[] {
    return this.#appliedFilters.map((filter) => ({ ...filter }));
  }

  #completedDrafts(): AppliedFilter<T>[] {
    return this.#drafts.flatMap((draft) => {
      const available = this.#findAvailableFilter(draft.key);
      if (!available || !this.#isComplete(draft, available)) return [];

      return [
        {
          key: available.key,
          operator: draft.operator,
          value:
            this.#dataTypeKind(available) === "number"
              ? Number(draft.value)
              : draft.value.trim(),
        },
      ];
    });
  }

  open(): void {
    this.#open = true;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.toggleAttribute("is-open", true);
    this.#popover.show(this.#trigger, { side: "bottom", align: "end" });
  }

  close(): void {
    if (!this.#popover) return;
    this.#open = false;
    for (const dropdown of this.#dropdowns) dropdown.close();
    this.#trigger.setAttribute("aria-expanded", "false");
    this.toggleAttribute("is-open", false);
    this.#popover.hide();
  }

  #handleClick(event: Event): void {
    const target = event.target as HTMLElement;
    const action = target.closest<HTMLElement>("[data-filter-action]")?.dataset
      .filterAction;

    switch (action) {
      case "toggle":
        this.#open ? this.close() : this.open();
        break;
      case "add":
        this.#drafts.push({
          id: uuid(),
          key: null,
          operator: "Equals",
          value: "",
        });
        this.#render();
        break;
      case "remove": {
        const row = target.closest<HTMLElement>("[data-filter-id]");
        this.#drafts = this.#drafts.filter(
          ({ id }) => id !== row?.dataset.filterId,
        );
        this.#render();
        break;
      }
      case "clear":
        this.#drafts = [];
        this.#appliedFilters = [];
        this.#filtersChanged.dispatch(
          { filters: this.filters },
          { bubbles: true },
        );
        this.#render();
        break;
      case "apply":
        if (!this.#applyButton?.hasAttribute("disabled")) {
          this.#appliedFilters = this.#completedDrafts();
          this.#updateControls();
          this.#filtersChanged.dispatch(
            { filters: this.filters },
            { bubbles: true },
          );
          this.close();
        }
        break;
      default:
        break;
    }
  }

  #handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.matches(".filter-bar__value-input")) return;

    const draft = this.#findDraft(input.dataset.filterId);
    if (!draft) return;
    draft.value = input.value;
    this.#updateControls();
  }

  #handleDropdownSelection(event: DropdownSelectionEvent): void {
    const dropdown = event.currentTarget as DropdownMenu;
    const draft = this.#findDraft(dropdown.dataset.filterId);
    const role = dropdown.dataset.filterRole as DropdownRole;
    if (!draft) return;

    if (role === "field") {
      const available = this.#findAvailableFilter(
        event.detail.value as keyof T,
      );
      if (!available) return;
      draft.key = available.key;
      draft.operator = this.#defaultOperator(available);
      draft.value = "";
      this.#render();
      return;
    }

    if (role === "operator") {
      const available = this.#findAvailableFilter(draft.key);
      const operator = event.detail.value as FilterOperator;
      if (available && this.#operatorsFor(available).includes(operator)) {
        draft.operator = operator;
        dropdown.label = event.detail.title;
      }
    }

    if (role === "value") {
      draft.value = event.detail.value;
      dropdown.label = event.detail.title;
    }

    this.#updateControls();
  }

  #render(): void {
    this.#disconnectDropdowns();

    const body = document.createElement("div");
    body.classList.add("filter-bar__body");

    if (this.#drafts.length === 0) {
      const empty = document.createElement("div");
      empty.classList.add("filter-bar__empty");

      const title = document.createElement("strong");
      title.textContent = "No filters applied";
      const description = document.createElement("p");
      description.textContent = "Add filters to narrow down results.";
      empty.append(title, description);
      body.append(empty, this.#createActionButton("Add filter", "add", "plus"));
    } else {
      const rows = document.createElement("div");
      rows.classList.add("filter-bar__rows");
      this.#drafts.forEach((draft, index) =>
        rows.append(this.#createRow(draft, index)),
      );
      body.append(rows, this.#createActionButton("Add filter", "add", "plus"));
    }

    const footer = document.createElement("div");
    footer.classList.add("filter-bar__footer");
    footer.append(
      this.#createActionButton("Clear all", "clear"),
      this.#createActionButton("Apply filters", "apply", undefined, true),
    );

    this.#popover.replaceChildren(body, footer);
    this.#applyButton = this.#popover.querySelector(
      '[data-filter-action="apply"]',
    );
    this.#connectDropdowns();
    this.#updateControls();
    if (this.#open) this.open();
  }

  #createRow(draft: FilterDraft<T>, index: number): HTMLElement {
    const row = document.createElement("div");
    row.classList.add("filter-bar__row");
    row.dataset.filterId = draft.id;
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", `Filter ${index + 1}`);

    const available = this.#findAvailableFilter(draft.key);
    row.append(
      this.#createDropdown(draft, "field", available?.title ?? "Select filter"),
      this.#createDropdown(draft, "operator", draft.operator),
      this.#createValueControl(draft, available),
      this.#createRemoveButton(draft.id),
    );
    return row;
  }

  #createDropdown(
    draft: FilterDraft<T>,
    role: DropdownRole,
    label: string,
  ): DropdownMenu {
    const dropdown = document.createElement("dropdown-menu") as DropdownMenu;
    dropdown.id = `filter-${role}-${draft.id}`;
    dropdown.dataset.filterId = draft.id;
    dropdown.dataset.filterRole = role;
    dropdown.setAttribute("label", label);
    return dropdown;
  }

  #createValueControl(
    draft: FilterDraft<T>,
    available: AvailableFilter<T> | null,
  ): HTMLElement {
    if (available && this.#dataTypeKind(available) === "enum") {
      return this.#createDropdown(
        draft,
        "value",
        draft.value || "Select value",
      );
    }

    const input = document.createElement("input");
    input.classList.add("filter-bar__value-input");
    input.dataset.filterId = draft.id;
    input.type =
      available && this.#dataTypeKind(available) === "number"
        ? "number"
        : "text";
    if (input.type === "number") input.step = "any";
    input.value = draft.value;
    input.placeholder = "Enter a value";
    input.setAttribute("aria-label", `${available?.title ?? "Filter"} value`);
    return input;
  }

  #createRemoveButton(id: string): CustomButton {
    const button = document.createElement("custom-button") as CustomButton;
    button.classList.add("ghost-button", "square", "filter-bar__remove");
    button.dataset.filterAction = "remove";
    button.dataset.filterId = id;
    button.setAttribute("leading-icon", "close");
    button.setAttribute("aria-label", "Remove filter");
    return button;
  }

  #createActionButton(
    label: string,
    action: string,
    icon?: "plus",
    primary = false,
  ): CustomButton {
    const button = document.createElement("custom-button") as CustomButton;
    button.classList.add(primary ? "primary-button" : "secondary-button");
    button.dataset.filterAction = action;
    button.setAttribute("label", label);
    if (icon) button.setAttribute("leading-icon", icon);
    return button;
  }

  #connectDropdowns(): void {
    this.#dropdowns = Array.from(
      this.#popover.querySelectorAll<DropdownMenu>("dropdown-menu"),
    );

    for (const dropdown of this.#dropdowns) {
      const draft = this.#findDraft(dropdown.dataset.filterId);
      if (!draft) continue;
      dropdown.items = this.#itemsForDropdown(
        dropdown.dataset.filterRole as DropdownRole,
        draft,
      );
      dropdown.addListener(this);
    }
  }

  #disconnectDropdowns(): void {
    for (const dropdown of this.#dropdowns) dropdown.removeListener(this);
    this.#dropdowns = [];
  }

  #itemsForDropdown(
    role: DropdownRole,
    draft: FilterDraft<T>,
  ): DropdownMenuItem[] {
    if (role === "field") {
      return this.#availableFilters.map(({ key, title }) => ({
        key: key as string,
        title,
        defaultValue: key === draft.key,
      }));
    }

    const available = this.#findAvailableFilter(draft.key);
    if (role === "operator") {
      return (available ? this.#operatorsFor(available) : ENUM_OPERATORS).map(
        (operator) => ({
          key: operator,
          title: operator,
          defaultValue: operator === draft.operator,
        }),
      );
    }

    const values =
      available && Array.isArray(available.dataType) ? available.dataType : [];
    return values.map((value) => ({
      key: value,
      title: value,
      defaultValue: value === draft.value,
    }));
  }

  #updateControls(): void {
    const incomplete = this.#drafts.some((draft) => {
      const available = this.#findAvailableFilter(draft.key);
      return !available || !this.#isComplete(draft, available);
    });
    this.#applyButton?.toggleAttribute("disabled", incomplete);

    const count = this.#appliedFilters.length;
    const label = this.getAttribute("label") ?? "Filters";
    this.#trigger.label = count > 0 ? `${label} (${count})` : label;
  }

  #isComplete(draft: FilterDraft<T>, available: AvailableFilter<T>): boolean {
    const value = draft.value.trim();
    if (value.length === 0) return false;

    const kind = this.#dataTypeKind(available);
    if (kind === "number") return Number.isFinite(Number(value));
    if (kind === "enum" && Array.isArray(available.dataType)) {
      return available.dataType.includes(value);
    }
    return true;
  }

  #operatorsFor(filter: AvailableFilter<T>): FilterOperator[] {
    switch (this.#dataTypeKind(filter)) {
      case "number":
        return NUMBER_OPERATORS;
      case "enum":
        return ENUM_OPERATORS;
      case "string":
        return STRING_OPERATORS;
    }
  }

  #defaultOperator(filter: AvailableFilter<T>): FilterOperator {
    return this.#dataTypeKind(filter) === "string" ? "Contains" : "Equals";
  }

  #dataTypeKind(filter: AvailableFilter<T>): "string" | "number" | "enum" {
    if (Array.isArray(filter.dataType)) return "enum";
    return typeof filter.dataType === "number" || filter.dataType === "number"
      ? "number"
      : "string";
  }

  #findAvailableFilter(key: keyof T | null): AvailableFilter<T> | null {
    return this.#availableFilters.find((filter) => filter.key === key) ?? null;
  }

  #findDraft(id: string | undefined): FilterDraft<T> | null {
    return this.#drafts.find((draft) => draft.id === id) ?? null;
  }

  #filtersChanged = createEventHandler("filters-changed", this);

  addListener = this.#filtersChanged.addListener;
  removeListener = this.#filtersChanged.removeListener;
  handleFiltersChanged = this.#filtersChanged.handleEvent;
}

customElements.define("filter-bar", FilterBar);
