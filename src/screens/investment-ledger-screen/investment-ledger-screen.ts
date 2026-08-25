import type {
  AppliedFilter,
  FilterBar,
} from "../../components/filter-bar/filter-bar";
import type {
  DropdownMenu,
  DropdownMenuItem,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type { SearchBar } from "../../components/search-bar/search-bar";
import {
  Table,
  type SortDirection,
  type TableColumn,
} from "../../components/table/table";
import { router } from "../../router/router";
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import { matchesLedgerFilterGroups } from "../../utilities/entity-ledger";
import {
  investmentLedgerRows,
  type InvestmentLedgerRow,
} from "../../utilities/investment-ledger";
import { money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };
import { DateUtils } from "../../utilities/date-utilities";

const template = document.createElement("template");
template.innerHTML = templateString;

const monthItems: DropdownMenuItem[] = [
  { key: "all", title: "All months", isDefaultValue: true },
  ...Array.from({ length: 12 }, (_, index) => ({
    key: String(index + 1).padStart(2, "0"),
    title: DateUtils.monthFormatter.format(new Date(2024, index, 1)),
  })),
];

const ledgerDate = (value: string): string => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}.${match[3]}.${match[1].slice(-2)}` : value;
};

export class InvestmentLedgerScreen
  extends HTMLElement
  implements EventListenerObject
{
  #table!: Table<InvestmentLedgerRow>;
  #filter!: FilterBar<InvestmentLedgerRow>;
  #month!: DropdownMenu;
  #search!: SearchBar;
  #subtitle!: HTMLElement;
  #selectedMonth: string | null = null;
  #query = "";
  #filters: AppliedFilter<InvestmentLedgerRow>[] = [];
  #sortKey: keyof InvestmentLedgerRow | null = null;
  #sortDirection: SortDirection | null = null;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.append(template.content.cloneNode(true));
      this.#table = this.querySelector("table-list")!;
      this.#filter = this.querySelector("filter-bar")!;
      this.#month = this.querySelector("#investment-ledger-month")!;
      this.#search = this.querySelector("#investment-ledger-search")!;
      this.#subtitle = this.querySelector("#investment-ledger-subtitle")!;
      this.#month.items = monthItems;
    }
    addListener("filters-changed", this, this);
    addListener("table-sort-request", this, this);
    this.#month.addListener(this);
    this.#search.addEventListener("search-changed", this);
    this.#table.addEventListener("click", this);
    this.#table.addEventListener("keydown", this);
    window.addEventListener("budget:accounts-changed", this);
    window.addEventListener("app:route-changed", this);
    this.#configureFilters();
    this.#render();
  }

  disconnectedCallback(): void {
    removeListener("filters-changed", this, this);
    removeListener("table-sort-request", this, this);
    this.#month.removeListener(this);
    this.#search.removeEventListener("search-changed", this);
    this.#table.removeEventListener("click", this);
    this.#table.removeEventListener("keydown", this);
    window.removeEventListener("budget:accounts-changed", this);
    window.removeEventListener("app:route-changed", this);
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case "filters-changed":
        handleCustomEvent<InvestmentLedgerRow, "filters-changed">(
          "filters-changed",
          event,
          ({ filters }) => {
            this.#filters = filters;
            this.#render();
          },
        );
        break;

      case "table-sort-request":
        handleCustomEvent("table-sort-request", event, ({ key }) => {
          this.#cycleSort(key as keyof InvestmentLedgerRow);
          this.#render();
        });
        break;

      case "dropdown-selection":
        if (event.currentTarget !== this.#month) return;
        const value = (event as DropdownSelectionEvent).detail.value;
        this.#selectedMonth = value === "all" ? null : value;
        this.#render();
        break;

      case "search-changed":
        this.#query = (event as CustomEvent<{ value: string }>).detail.value
          .trim()
          .toLowerCase();
        this.#render();
        break;

      case "click":
      case "keydown":
        this.#openSelectedRow(event);
        break;

      default:
        this.#configureFilters();
        this.#render();
    }
  }

  #year(): number {
    return Number(router.currentParams().year) || new Date().getFullYear();
  }

  #columns(): TableColumn<InvestmentLedgerRow>[] {
    return [
      {
        key: "date",
        title: "Date",
        dataType: "string",
        formatter: ledgerDate,
        sizing: "narrow",
        cellClass: "transaction-date",
      },
      {
        key: "account",
        title: "Account",
        dataType: "string",
        prominence: "bold",
        sizing: 45,
        cellClass: "transaction-description",
      },
      {
        key: "type",
        title: "Type",
        dataType: "string",
        prominence: "tag",
        sizing: 25,
        cellClass: "transaction-category investment-ledger-type",
      },
      {
        key: "amount",
        title: "Amount",
        dataType: "number",
        formatter: (value) => money(Number(value)),
        textAlign: "right",
        sizing: "narrow",
        cellClass: "transaction-amount investment-ledger-amount",
      },
    ];
  }

  #filteredRows(): InvestmentLedgerRow[] {
    return investmentLedgerRows()
      .filter((row) => row.month.startsWith(String(this.#year())))
      .filter(
        (row) =>
          !this.#selectedMonth || row.date.slice(5, 7) === this.#selectedMonth,
      )
      .filter(
        (row) =>
          !this.#query ||
          `${row.type} ${row.account}`.toLowerCase().includes(this.#query),
      )
      .filter((row) =>
        matchesLedgerFilterGroups(row, this.#filters, (item, key) => item[key]),
      );
  }

  #sortedRows(): InvestmentLedgerRow[] {
    const rows = this.#filteredRows();
    if (!this.#sortKey || !this.#sortDirection) return rows;
    const key = this.#sortKey;
    const multiplier = this.#sortDirection === "ascending" ? 1 : -1;
    return [...rows].sort(
      (a, b) =>
        (typeof a[key] === "number"
          ? Number(a[key]) - Number(b[key])
          : String(a[key]).localeCompare(String(b[key]))) * multiplier,
    );
  }

  #render(): void {
    const rows = this.#sortedRows();
    const period = this.#selectedMonth
      ? DateUtils.monthFormatter
          .format(new Date(2024, Number(this.#selectedMonth) - 1, 1))
          .toLowerCase()
      : "all";
    this.#subtitle.textContent = `Showing ${period} investment activity recorded for ${this.#year()}.`;
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    this.#table.data = {
      columns: this.#columns(),
      rows,
      interactiveRows: true,
      footer: {
        cells: [null, "Total", null, money(total)],
        ariaLabel: `Investment ledger total ${money(total)}`,
      },
      sort:
        this.#sortKey && this.#sortDirection
          ? { key: this.#sortKey, direction: this.#sortDirection }
          : null,
    };
  }

  #configureFilters(): void {
    const rows = investmentLedgerRows();
    this.#filter.availableFilters = [
      {
        key: "type",
        title: "Type",
        dataType: ["Investment", "Withdrawal", "Debt payment", "New borrowing"],
      },
      {
        key: "account",
        title: "Account",
        dataType: [...new Set(rows.map((row) => row.account))].sort(),
        searchable: true,
      },
      { key: "date", title: "Date", dataType: "date" },
      { key: "amount", title: "Amount", dataType: "number" },
    ];
  }

  #cycleSort(key: keyof InvestmentLedgerRow): void {
    if (this.#sortKey !== key || !this.#sortDirection) {
      this.#sortKey = key;
      this.#sortDirection = "descending";
    } else if (this.#sortDirection === "descending")
      this.#sortDirection = "ascending";
    else {
      this.#sortKey = null;
      this.#sortDirection = null;
    }
  }

  #openSelectedRow(event: Event): void {
    if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key))
      return;
    const rowElement = (
      event.target as Element | null
    )?.closest<HTMLTableRowElement>("tbody tr");
    if (!rowElement) return;
    const row = this.#sortedRows()[rowElement.rowIndex - 1];
    if (!row) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    router.updateParams({
      drawer: "investment-ledger-entry",
      investmentLedgerId: row.id,
      investmentLedgerSource: row.source,
    });
  }
}

if (!customElements.get("investment-ledger-screen")) {
  customElements.define("investment-ledger-screen", InvestmentLedgerScreen);
}
