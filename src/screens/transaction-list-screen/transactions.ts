import type { BudgetTransaction } from "../../api/budget-api";
import type {
  DropdownMenu,
  DropdownMenuItem,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type { AppliedFilter } from "../../components/filter-bar/filter-bar";
import type { FilterBar } from "../../components/filter-bar/filter-bar";
import type { SearchBar } from "../../components/search-bar/search-bar";
import {
  Table,
  type SortDirection,
  type TableColumn,
  type TableData,
} from "../../components/table/table";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import { money } from "../../utilities/view-formatters";
import { appState } from "../../state/app-state";
import { filterForBudgetingContext } from "../budgeting/budgeting-context";
import {
  editorialPeriod,
  matchesLedgerFilterGroups,
  signedTransactionAmount,
} from "../../utilities/entity-ledger";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

function ledgerDate(dateId: string): string {
  const match = dateId.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}.${match[3]}.${match[1].slice(-2)}` : dateId;
}

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });
const monthItems: DropdownMenuItem[] = [
  { key: "all", title: "All months", isDefaultValue: true },
  ...Array.from({ length: 12 }, (_, index) => ({
    key: String(index + 1).padStart(2, "0"),
    title: monthFormatter.format(new Date(2024, index, 1)),
  })),
];

export class TransactionScreen
  extends HTMLElement
  implements EventListenerObject
{
  #table!: Table<BudgetTransaction>;
  #filterBar!: FilterBar<BudgetTransaction>;
  #monthSelector!: DropdownMenu;
  #search!: SearchBar;
  #subtitle!: HTMLElement;

  #selectedMonth: string | null = null;
  #query = "";
  #filters: AppliedFilter<BudgetTransaction>[] = [];
  #sortKey: keyof BudgetTransaction | null = null;
  #sortDirection: SortDirection | null = null;
  #listening = false;
  #unsubscribeBudgetingContext: (() => void) | null = null;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "transactions";
      this.append(template.content.cloneNode(true));
      this.#table = this.querySelector("table-list")!;
      this.#filterBar = this.querySelector("filter-bar")!;
      this.#monthSelector = this.querySelector("#transaction-month-selector")!;
      this.#search = this.querySelector("#transaction-search")!;
      this.#subtitle = this.querySelector("#transaction-ledger-subtitle")!;
      this.#monthSelector.items = monthItems;
      this.#configureFilters();
    }
    if (this.#listening) return;
    this.#listening = true;

    addListener("filters-changed", this, this);
    addListener("table-sort-request", this, this);
    this.#monthSelector.addListener(this);
    this.#search.addEventListener("search-changed", this);
    this.#table.addEventListener("click", this);
    this.#table.addEventListener("keydown", this);

    for (const eventName of [
      "budget:transaction-sync-changed",
      "budget:transaction-saved",
      "budget:transactions-loaded",
      "budget:transaction-removed",
      "budget:transaction-restored",
      "budget:transaction-queued",
    ]) {
      window.addEventListener(eventName, this);
    }

    this.#unsubscribeBudgetingContext = appState.subscribe(
      "budgetingContext",
      () => this.#repaint(),
    );
    this.#repaint();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    removeListener("filters-changed", this, this);
    removeListener("table-sort-request", this, this);
    this.#monthSelector.removeListener(this);
    this.#search.removeEventListener("search-changed", this);
    this.#table.removeEventListener("click", this);
    this.#table.removeEventListener("keydown", this);

    for (const eventName of [
      "budget:transaction-sync-changed",
      "budget:transaction-saved",
      "budget:transactions-loaded",
      "budget:transaction-removed",
      "budget:transaction-restored",
      "budget:transaction-queued",
    ]) {
      window.removeEventListener(eventName, this);
    }

    this.#unsubscribeBudgetingContext?.();
    this.#unsubscribeBudgetingContext = null;
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case "filters-changed":
        handleCustomEvent<BudgetTransaction, "filters-changed">(
          "filters-changed",
          event,
          ({ filters }) => {
            this.#filters = filters;
            this.#repaint();
          },
        );
        break;

      case "table-sort-request":
        handleCustomEvent("table-sort-request", event, ({ key }) => {
          this.#cycleSort(key as keyof BudgetTransaction);
          this.#repaint();
        });
        break;

      case "dropdown-selection": {
        const selection = event as DropdownSelectionEvent;
        if (selection.currentTarget !== this.#monthSelector) break;
        this.#selectedMonth = selection.detail.value === "all"
          ? null
          : selection.detail.value;
        this.#repaint();
        break;
      }

      case "search-changed":
        this.#query = (event as CustomEvent<{ value: string }>).detail.value
          .trim()
          .toLowerCase();
        this.#repaint();
        break;

      case "click":
      case "keydown":
        this.#openSelectedRow(event);
        break;

      default:
        this.#configureFilters();
        this.#repaint();
        break;
    }
  }

  #columns(): TableColumn<BudgetTransaction>[] {
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
        key: "notes",
        title: "Description",
        dataType: "string",
        formatter: (value, row) =>
          String(value ?? "").trim() || row.category || "Uncategorized",
        subline: (row) => row.vendor || "No vendor",
        prominence: "bold",
        sizing: 35,
        cellClass: "transaction-description",
      },
      {
        key: "category",
        title: "Category",
        dataType: "string",
        prominence: "tag",
        sizing: 20,
        cellClass: "transaction-category",
      },
      {
        key: "vendor",
        title: "Vendor",
        dataType: "string",
        sizing: 25,
        cellClass: "transaction-vendor",
      },
      {
        key: "amount",
        title: "Amount",
        dataType: "number",
        formatter: (_value: number, row) => money(signedTransactionAmount(row)),
        textAlign: "right",
        sizing: "narrow",
        cellClass: "transaction-amount",
        sorter: signedTransactionAmount,
      },
    ];
  }

  #tableData(rows: readonly BudgetTransaction[]): TableData<BudgetTransaction> {
    const visibleTotal = rows.reduce(
      (total, row) => total + signedTransactionAmount(row),
      0,
    );

    return {
      columns: this.#columns(),
      rows,
      footer: {
        cells: [null, "Total", null, null, money(visibleTotal)],
        ariaLabel: `Transaction total ${money(visibleTotal)}`,
      },
      interactiveRows: true,
      sort:
        this.#sortKey && this.#sortDirection
          ? { key: this.#sortKey, direction: this.#sortDirection }
          : null,
    };
  }

  #repaint(): void {
    const year = appState.get("budgetingContext").year;
    this.#subtitle.textContent = `Showing all transactions recorded for ${editorialPeriod(year, this.#selectedMonth)}`;
    const rows = this.#sortedRows(this.#filteredRows());
    this.#table.data = this.#tableData(rows);
  }

  #filteredRows(): BudgetTransaction[] {
    return filterForBudgetingContext(appController.getTransactions())
      .filter(
        (row) => this.#selectedMonth === null || row.date.slice(5, 7) === this.#selectedMonth,
      )
      .filter((row) => {
        if (!this.#query) return true;
        return [row.notes, row.category, row.vendor, row.assignment]
          .some((value) => String(value ?? "").toLowerCase().includes(this.#query));
      })
      .filter((row) =>
        matchesLedgerFilterGroups(row, this.#filters, (item, key) =>
          key === "amount" ? signedTransactionAmount(item) : item[key],
        ),
      );
  }

  #filterValues(key: "category" | "vendor" | "assignment"): string[] {
    const values = new Map<string, string>();
    for (const transaction of appController.getTransactions()) {
      const value = String(transaction[key] ?? "").trim();
      if (value) values.set(value.toLocaleLowerCase("en-US"), value);
    }
    return [...values.values()].sort((left, right) => left.localeCompare(right));
  }

  #configureFilters(): void {
    this.#filterBar.availableFilters = [
      {
        key: "category",
        title: "Category",
        dataType: this.#filterValues("category"),
        searchable: true,
      },
      {
        key: "vendor",
        title: "Vendor",
        dataType: this.#filterValues("vendor"),
        searchable: true,
      },
      {
        key: "assignment",
        title: "Assignment",
        dataType: this.#filterValues("assignment"),
        searchable: true,
      },
      { key: "notes", title: "Description", dataType: "string" },
      { key: "amount", title: "Amount", dataType: "number" },
      {
        key: "type",
        title: "Transaction type",
        dataType: ["Income", "Expense"],
      },
    ];
  }

  #sortedRows(rows: BudgetTransaction[]): BudgetTransaction[] {
    if (!this.#sortKey || !this.#sortDirection) return rows;
    const key = this.#sortKey;
    const column = this.#columns().find((item) => item.key === key);
    const multiplier = this.#sortDirection === "ascending" ? 1 : -1;

    return [...rows].sort((previousRow, nextRow) => {
      const previous = previousRow[key];
      const next = nextRow[key];
      if (typeof previous === "number" && typeof next === "number") {
        return (
          ((column?.sorter?.(previousRow) ?? previous) -
            (column?.sorter?.(nextRow) ?? next)) *
          multiplier
        );
      }
      return String(previous ?? "").localeCompare(String(next ?? "")) * multiplier;
    });
  }

  #cycleSort(key: keyof BudgetTransaction): void {
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

  #openSelectedRow(event: Event): void {
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const row = (event.target as Element | null)?.closest<HTMLTableRowElement>(
      "tbody tr",
    );
    if (!row) return;
    const rows = this.#sortedRows(this.#filteredRows());
    const transaction = rows[row.rowIndex - 1];
    if (!transaction) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    router.updateParams({ drawer: "edit", transactionId: transaction.id });
  }

}

if (!customElements.get("transaction-list-screen")) {
  customElements.define("transaction-list-screen", TransactionScreen);
}
