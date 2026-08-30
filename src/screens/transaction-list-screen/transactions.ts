import type { BudgetTransaction } from "../../api/budget-api";
import type {
  DropdownMenu,
  DropdownMenuItem,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type { AppliedFilter } from "../../components/filter-bar/filter-bar";
import type { FilterBar } from "../../components/filter-bar/filter-bar";
import type { SearchBar } from "../../components/search-bar/search-bar";
import type {
  DataTable,
  DataTableColumn,
  DataTableData,
} from "../../components/data-table/data-table";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import { escapeHTML, money } from "../../utilities/view-formatters";
import { appState } from "../../state/app-state";
import { filterForBudgetingContext } from "../budgeting/budgeting-context";
import {
  editorialPeriod,
  matchesLedgerFilterGroups,
} from "../../utilities/entity-ledger";
import templateString from "./template.html" with { type: "text" };
import { budgetingActivities, activityEffects } from "../../utilities/activity-effects";
import { APIs } from "../../api/api";

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
const rowAmount=(row:BudgetTransaction)=>{const effect=activityEffects(row,APIs.accounts.accounts());return effect.expense?-effect.expense:effect.income||effect.investmentFlow||Number(row.amount);};
const netBudgetAmount=(row:BudgetTransaction)=>{const effect=activityEffects(row,APIs.accounts.accounts());return effect.income-effect.expense;};

export class TransactionScreen
  extends HTMLElement
  implements EventListenerObject
{
  #table!: DataTable<BudgetTransaction>;
  #filterBar!: FilterBar<BudgetTransaction>;
  #monthSelector!: DropdownMenu;
  #search!: SearchBar;
  #subtitle!: HTMLElement;

  #selectedMonth: string | null = null;
  #query = "";
  #filters: AppliedFilter<BudgetTransaction>[] = [];
  #listening = false;
  #unsubscribeBudgetingContext: (() => void) | null = null;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "transactions";
      this.append(template.content.cloneNode(true));
      this.#table = this.querySelector("data-table")!;
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
    this.#table.rowSelection.addListener(this);

    this.#monthSelector.addListener(this);
    this.#search.addEventListener("search-changed", this);

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
    this.#monthSelector.removeListener(this);
    this.#search.removeEventListener("search-changed", this);
    this.#table.rowSelection.removeListener(this);

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

      case "dropdown-selection": {
        const selection = event as DropdownSelectionEvent;
        if (selection.currentTarget !== this.#monthSelector) break;
        this.#selectedMonth =
          selection.detail.value === "all" ? null : selection.detail.value;
        this.#repaint();
        break;
      }

      case "search-changed":
        this.#query = (event as CustomEvent<{ value: string }>).detail.value
          .trim()
          .toLowerCase();
        this.#repaint();
        break;

      case "table-row-selected":
        this.#openSelectedRow(event);
        break;

      default:
        this.#configureFilters();
        this.#repaint();
        break;
    }
  }

  #columns(): DataTableColumn<BudgetTransaction>[] {
    return [
      {
        key: "date",
        title: "Date",
        formatter: (value) => ledgerDate(String(value ?? "")),
        sizing: "narrow",
        cellClass: ["date"],
      },
      {
        key: "notes",
        title: "Description",
        formatter: (value, row) =>
          escapeHTML(
            String(value ?? "").trim() || row.category || "Uncategorized",
          ),
        subline: (row) => escapeHTML(row.source === "deduction" ? `${row.account || row.vendor || "Payroll"} · Deduction (+${money(activityEffects(row,APIs.accounts.accounts()).income)} gross income)` : row.account || row.vendor || "No vendor"),
        sizing: 35,
        cellClass: ["primary"],
      },
      {
        key: "category",
        title: "Category",
        sizing: 20,
        cellClass: ["tag"],
        formatter: (value) => escapeHTML(value),
      },
      {
        key: "vendor",
        title: "Vendor",
        sizing: 25,
        cellClass: ["detail"],
        formatter: (value) => escapeHTML(value),
      },
      {
        key: "amount",
        title: "Amount",
        formatter: (_value: unknown, row) =>
          money(rowAmount(row)),
        sizing: "narrow",
        cellClass: ["numeric", "align-right"],
        headerClass: "align-right",
        sorter: rowAmount,
      },
    ];
  }

  #tableData(
    rows: readonly BudgetTransaction[],
  ): DataTableData<BudgetTransaction> {
    const visibleTotal = rows.reduce(
      (total, row) => total + netBudgetAmount(row),
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
      rowKey: (row) => row.id,
    };
  }

  #repaint(): void {
    const year = appState.get("budgetingContext").year;
    this.#subtitle.textContent = `Showing all transactions recorded for ${editorialPeriod(year, this.#selectedMonth)}`;
    const rows = this.#filteredRows();
    this.#table.data = this.#tableData(rows);
  }

  #matchesSearch(row: BudgetTransaction): boolean {
    if (!this.#query) return true;
    return this.#columns().some((column) => {
      const rawValue = row[column.key];
      const value = column.sorter?.(row) ?? rawValue;
      if (typeof value === "number") return String(value).startsWith(this.#query);
      const text = column.formatter?.(rawValue, row) ?? String(value ?? "");
      return text.toLowerCase().includes(this.#query);
    });
  }

  #filteredRows(): BudgetTransaction[] {
    return filterForBudgetingContext(budgetingActivities(appController.getTransactions(), APIs.accounts.accounts(), APIs.budget.listAllCategories(), APIs.budget.listAllPeople()))
      .filter(
        (row) =>
          this.#selectedMonth === null ||
          row.date.slice(5, 7) === this.#selectedMonth,
      )
      .filter((row) => this.#matchesSearch(row))
      .filter((row) =>
        matchesLedgerFilterGroups(row, this.#filters, (item, key) =>
          key === "amount" ? rowAmount(item) : item[key],
        ),
      );
  }

  #filterValues(key: "category" | "vendor" | "assignment"): string[] {
    const values = new Map<string, string>();
    for (const transaction of budgetingActivities(appController.getTransactions(), APIs.accounts.accounts(), APIs.budget.listAllCategories(), APIs.budget.listAllPeople())) {
      const value = String(transaction[key] ?? "").trim();
      if (value) values.set(value.toLocaleLowerCase("en-US"), value);
    }
    return [...values.values()].sort((left, right) =>
      left.localeCompare(right),
    );
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

  #openSelectedRow(event: Event): void {
    this.#table.rowSelection.handleEvent(event, ({ id }) => {
      const transaction = appController
        .getTransactions()
        .find((item) => item.id === id);
      if (!transaction) return;
      if (event instanceof KeyboardEvent) event.preventDefault();
      if (transaction.accountId) {
        const effect = activityEffects(transaction, APIs.accounts.accounts());
        router.updateParams({ drawer: "investment-ledger-entry", investmentLedgerId: transaction.id, investmentLedgerSource: effect.account?.type || "investment" });
        return;
      }
      router.updateParams({ drawer: "edit", transactionId: transaction.id });
    });
  }
}

if (!customElements.get("transaction-list-screen")) {
  customElements.define("transaction-list-screen", TransactionScreen);
}
