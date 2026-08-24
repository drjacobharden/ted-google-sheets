import type { DropdownMenu, DropdownSelectionEvent } from "../components/dropdown-menu/dropdown-menu";
import type { AppliedFilter, AvailableFilter, FilterBar } from "../components/filter-bar/filter-bar";
import type { SearchBar } from "../components/search-bar/search-bar";
import { Table, type SortDirection, type TableColumn, type TableData } from "../components/table/table";
import { appState } from "../state/app-state";
import {
  editorialMonthItems,
  matchesLedgerFilterGroups,
} from "../utilities/entity-ledger";

export abstract class EditorialEntityLedgerScreen<Row extends { id: string; name: string }>
  extends HTMLElement implements EventListenerObject {
  protected selectedMonth: string | null = null;
  protected filters: AppliedFilter<Row>[] = [];

  #table!: Table<Row>;
  #filterBar!: FilterBar<Row>;
  #monthSelector: DropdownMenu | null = null;
  #search!: SearchBar;
  #subtitle!: HTMLElement;
  #query = "";
  #sortKey: keyof Row | null = null;
  #sortDirection: SortDirection | null = null;
  #visibleRows: Row[] = [];
  #listening = false;
  #unsubscribe: (() => void) | null = null;

  protected abstract get screenName(): string;
  protected abstract get screenTemplate(): HTMLTemplateElement;
  protected abstract get monthSelectorId(): string | null;
  protected abstract get searchId(): string;
  protected abstract get filterId(): string;
  protected abstract get subtitleId(): string;
  protected abstract availableFilters(year: number): AvailableFilter<Row>[];
  protected abstract columns(year: number): TableColumn<Row>[];
  protected abstract sourceRows(year: number): Row[];
  protected abstract subtitle(year: number): string;
  protected abstract openRow(row: Row, year: number): void;

  protected currentYear(): number {
    return appState.get("budgetingContext").year;
  }

  protected dataEventNames(): string[] {
    return [
      "budget:categories-changed",
      "budget:vendors-changed",
      "budget:people-changed",
      "budget:entity-sync-changed",
      "budget:transaction-sync-changed",
      "budget:transaction-saved",
      "budget:transactions-loaded",
      "budget:transaction-removed",
      "budget:transaction-restored",
    ];
  }

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = this.screenName;
      this.append(this.screenTemplate.content.cloneNode(true));
      this.#table = this.querySelector("table-list")!;
      this.#filterBar = this.querySelector(this.filterId)!;
      this.#monthSelector = this.monthSelectorId
        ? this.querySelector<DropdownMenu>(this.monthSelectorId)
        : null;
      this.#search = this.querySelector(this.searchId)!;
      this.#subtitle = this.querySelector(this.subtitleId)!;
      if (this.#monthSelector) this.#monthSelector.items = editorialMonthItems;
    }
    if (this.#listening) return;
    this.#listening = true;
    this.addEventListener("filters-changed", this);
    this.addEventListener("table-sort-request", this);
    this.addEventListener("search-changed", this);
    this.#monthSelector?.addListener(this);
    this.#table.addEventListener("click", this);
    this.#table.addEventListener("keydown", this);
    for (const eventName of this.dataEventNames()) {
      window.addEventListener(eventName, this);
    }
    this.#unsubscribe = appState.subscribe("budgetingContext", () => this.repaint());
    this.repaint();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("filters-changed", this);
    this.removeEventListener("table-sort-request", this);
    this.removeEventListener("search-changed", this);
    this.#monthSelector?.removeListener(this);
    this.#table.removeEventListener("click", this);
    this.#table.removeEventListener("keydown", this);
    for (const eventName of this.dataEventNames()) {
      window.removeEventListener(eventName, this);
    }
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  handleEvent(event: Event): void {
    if (event.type === "dropdown-selection" && event.currentTarget === this.#monthSelector) {
      const value = (event as DropdownSelectionEvent).detail.value;
      this.selectedMonth = value === "all" ? null : value;
      this.repaint();
      return;
    }
    if (event.type === "filters-changed") {
      this.filters = (event as CustomEvent<{ filters: AppliedFilter<Row>[] }>).detail.filters;
      this.repaint();
      return;
    }
    if (event.type === "search-changed") {
      this.#query = (event as CustomEvent<{ value: string }>).detail.value.trim().toLowerCase();
      this.repaint();
      return;
    }
    if (event.type === "table-sort-request") {
      this.#cycleSort((event as CustomEvent<{ key: keyof Row }>).detail.key);
      this.repaint();
      return;
    }
    if (event.type === "click" || event.type === "keydown") {
      this.#activateRow(event);
      return;
    }
    this.repaint();
  }

  protected repaint(): void {
    const year = this.currentYear();
    this.#filterBar.availableFilters = this.availableFilters(year);
    this.#subtitle.textContent = this.subtitle(year);
    let rows = this.sourceRows(year)
      .filter((row) => !this.#query || row.name.toLowerCase().includes(this.#query))
      .filter((row) => matchesLedgerFilterGroups(row, this.filters));
    rows = this.#sortedRows(rows, year);
    this.#visibleRows = rows;
    const data: TableData<Row> = {
      columns: this.columns(year),
      rows,
      interactiveRows: true,
      sort: this.#sortKey && this.#sortDirection
        ? { key: this.#sortKey, direction: this.#sortDirection }
        : null,
    };
    this.#table.data = data;
  }

  #sortedRows(rows: Row[], year: number): Row[] {
    if (!this.#sortKey || !this.#sortDirection) return rows;
    const key = this.#sortKey;
    const column = this.columns(year).find((item) => item.key === key);
    const multiplier = this.#sortDirection === "ascending" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const leftValue = column?.sorter?.(left) ?? left[key];
      const rightValue = column?.sorter?.(right) ?? right[key];
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * multiplier;
      }
      return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * multiplier;
    });
  }

  #cycleSort(key: keyof Row): void {
    if (this.#sortKey !== key || this.#sortDirection === null) {
      this.#sortKey = key;
      this.#sortDirection = "descending";
    } else if (this.#sortDirection === "descending") {
      this.#sortDirection = "ascending";
    } else {
      this.#sortKey = null;
      this.#sortDirection = null;
    }
  }

  #activateRow(event: Event): void {
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    const tableRow = (event.target as Element | null)?.closest<HTMLTableRowElement>("tbody tr");
    if (!tableRow) return;
    const row = this.#visibleRows[tableRow.rowIndex - 1];
    if (!row) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    this.openRow(row, this.currentYear());
  }
}
