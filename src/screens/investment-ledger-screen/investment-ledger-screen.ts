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
import type {
  DataTable,
  DataTableColumn,
  DataTableData,
} from "../../components/data-table/data-table";
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
import { escapeHTML, money } from "../../utilities/view-formatters";
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
  #table!: DataTable<InvestmentLedgerRow>;
  #filter!: FilterBar<InvestmentLedgerRow>;
  #month!: DropdownMenu;
  #search!: SearchBar;
  #subtitle!: HTMLElement;
  #selectedMonth: string | null = null;
  #query = "";
  #filters: AppliedFilter<InvestmentLedgerRow>[] = [];
  #sourceRows: InvestmentLedgerRow[] = [];
  #visibleRows: InvestmentLedgerRow[] = [];

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.append(template.content.cloneNode(true));
      this.#table = this.querySelector("data-table")!;
      this.#filter = this.querySelector("filter-bar")!;
      this.#month = this.querySelector("#investment-ledger-month")!;
      this.#search = this.querySelector("#investment-ledger-search")!;
      this.#subtitle = this.querySelector("#investment-ledger-subtitle")!;
      this.#month.items = monthItems;
    }
    addListener("filters-changed", this, this);
    this.#month.addListener(this);
    this.#search.addEventListener("search-changed", this);
    this.#table.rowSelection.addListener(this);
    window.addEventListener("budget:accounts-changed", this);
    window.addEventListener("app:route-changed", this);
    this.#refreshSourceRows();
    this.#configureFilters();
    this.#render();
  }

  disconnectedCallback(): void {
    removeListener("filters-changed", this, this);
    this.#month.removeListener(this);
    this.#search.removeEventListener("search-changed", this);
    this.#table.rowSelection.removeListener(this);
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

      case "table-row-selected":
        handleCustomEvent("table-row-selected", event, ({ id }) => {
          const row = this.#visibleRows.find((item) => item.id === id);
          if (!row) return;
          router.updateParams({
            drawer: "investment-ledger-entry",
            investmentLedgerId: row.id,
            investmentLedgerSource: row.source,
          });
        });
        break;

      default:
        this.#refreshSourceRows();
        this.#configureFilters();
        this.#render();
    }
  }

  #year(): number {
    return Number(router.currentParams().year) || new Date().getFullYear();
  }

  #columns(): DataTableColumn<InvestmentLedgerRow>[] {
    return [
      {
        key: "date",
        title: "Date",
        formatter: (value) => ledgerDate(String(value ?? "")),
        sizing: "narrow",
        cellClass: ["date"],
      },
      {
        key: "account",
        title: "Account",
        sizing: 45,
        cellClass: ["primary"],
        formatter: (value) => escapeHTML(value),
      },
      {
        key: "type",
        title: "Type",
        sizing: 25,
        cellClass: ["tag"],
        formatter: (value) => escapeHTML(value),
      },
      {
        key: "amount",
        title: "Amount",
        formatter: (value) => money(Number(value)),
        sizing: "narrow",
        cellClass: ["numeric", "align-right"],
        headerClass: "align-right",
      },
    ];
  }

  #filteredRows(): InvestmentLedgerRow[] {
    return this.#sourceRows
      .filter((row) => row.month.startsWith(String(this.#year())))
      .filter(
        (row) =>
          !this.#selectedMonth || row.month.slice(5, 7) === this.#selectedMonth,
      )
      .filter((row) => this.#matchesSearch(row))
      .filter((row) =>
        matchesLedgerFilterGroups(row, this.#filters, (item, key) => item[key]),
      );
  }

  #matchesSearch(row: InvestmentLedgerRow): boolean {
    if (!this.#query) return true;
    return this.#columns().some((column) => {
      const rawValue = row[column.key];
      const value = column.sorter?.(row) ?? rawValue;
      if (typeof value === "number") return String(value).startsWith(this.#query);
      const text = column.formatter?.(rawValue, row) ?? String(value ?? "");
      return text.toLowerCase().includes(this.#query);
    });
  }

  #render(): void {
    const rows = this.#filteredRows();
    this.#visibleRows = rows;
    const period = this.#selectedMonth
      ? DateUtils.monthFormatter
          .format(new Date(2024, Number(this.#selectedMonth) - 1, 1))
          .toLowerCase()
      : "all";
    this.#subtitle.textContent = `Showing ${period} investment activity recorded for ${this.#year()}.`;
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const data: DataTableData<InvestmentLedgerRow> = {
      columns: this.#columns(),
      rows,
      interactiveRows: true,
      rowKey: (row) => row.id,
      footer: {
        cells: [null, "Total", null, money(total)],
        ariaLabel: `Investment ledger total ${money(total)}`,
      },
    };
    this.#table.data = data;
  }

  #configureFilters(): void {
    this.#filter.availableFilters = [
      {
        key: "type",
        title: "Type",
        dataType: ["Investment", "Withdrawal", "Debt payment", "New borrowing"],
      },
      {
        key: "account",
        title: "Account",
        dataType: [...new Set(this.#sourceRows.map((row) => row.account))].sort(),
        searchable: true,
      },
      { key: "date", title: "Date", dataType: "date" },
      { key: "amount", title: "Amount", dataType: "number" },
    ];
  }

  #refreshSourceRows(): void {
    this.#sourceRows = investmentLedgerRows();
  }

}

if (!customElements.get("investment-ledger-screen")) {
  customElements.define("investment-ledger-screen", InvestmentLedgerScreen);
}
