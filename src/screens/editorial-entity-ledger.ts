import type { DropdownMenu, DropdownSelectionEvent } from "../components/dropdown-menu/dropdown-menu";
import type { AppliedFilter, AvailableFilter, FilterBar } from "../components/filter-bar/filter-bar";
import type { SearchBar } from "../components/search-bar/search-bar";
import type {
  DataTable,
  DataTableColumn,
  DataTableData,
} from "../components/data-table/data-table";
import { appState } from "../state/app-state";
import {
  editorialMonthItems,
  matchesLedgerFilterGroups,
} from "../utilities/entity-ledger";

export abstract class EditorialEntityLedgerScreen<Row extends { id: string; name: string }>
  extends HTMLElement implements EventListenerObject {
  protected selectedMonth: string | null = null;
  protected filters: AppliedFilter<Row>[] = [];

  #table!: DataTable<Row>;
  #filterBar!: FilterBar<Row>;
  #monthSelector: DropdownMenu | null = null;
  #search!: SearchBar;
  #subtitle!: HTMLElement;
  #query = "";
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
  protected abstract columns(year: number): DataTableColumn<Row>[];
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
      this.#table = this.querySelector("data-table")!;
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
    this.addEventListener("search-changed", this);
    this.#monthSelector?.addListener(this);
    this.#table.rowSelection.addListener(this);
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
    this.removeEventListener("search-changed", this);
    this.#monthSelector?.removeListener(this);
    this.#table.rowSelection.removeListener(this);
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
    if (event.type === "table-row-selected") {
      const id = (event as CustomEvent<{ id: string }>).detail.id;
      const row = this.#visibleRows.find((item) => item.id === id);
      if (row) this.openRow(row, this.currentYear());
      return;
    }
    this.repaint();
  }

  #matchesSearch(row: Row, year: number): boolean {
    if (!this.#query) return true;
    return this.columns(year).some((column) => {
      const value = row[column.key];
      if (typeof value === "number") return String(value).startsWith(this.#query);
      return String(value ?? "").toLowerCase().includes(this.#query);
    });
  }

  protected repaint(): void {
    const year = this.currentYear();
    this.#filterBar.availableFilters = this.availableFilters(year);
    this.#subtitle.textContent = this.subtitle(year);
    let rows = this.sourceRows(year)
      .filter((row) => this.#matchesSearch(row, year))
      .filter((row) => matchesLedgerFilterGroups(row, this.filters));
    this.#visibleRows = rows;
    const data: DataTableData<Row> = {
      columns: this.columns(year),
      rows,
      interactiveRows: true,
      rowKey: (row) => row.id,
    };
    this.#table.data = data;
  }
}
