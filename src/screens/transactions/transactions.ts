import type { BudgetTransaction } from "../../api/budget-api";
import type { AppliedFilter } from "../../components/filter-bar/filter-bar";
import { PageControl } from "../../components/page-control/page-control";
import {
  Table,
  type SortDirection,
  type TableColumn,
  type TableData,
} from "../../components/table/table";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateRange, DateUtils } from "../../utilities/date-utilities";
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import { money } from "../../utilities/view-formatters";
import { appState } from "../../state/app-state";
import {
  budgetingYearRange,
  filterForBudgetingContext,
} from "../budgeting/budgeting-context";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

export class TransactionScreen
  extends HTMLElement
  implements EventListenerObject
{
  #table!: Table<BudgetTransaction>;
  #pagination!: PageControl;
  #resizeObserver: ResizeObserver | null = null;
  #capacityFrame = 0;

  #dateRange: DateRange = DateUtils.defaultRange;
  #filters: AppliedFilter<BudgetTransaction>[] = [];
  #sortKey: keyof BudgetTransaction | null = null;
  #sortDirection: SortDirection | null = null;
  #page = 1;
  #pageSize = 10;
  #listening = false;
  #unsubscribeBudgetingContext: (() => void) | null = null;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "transactions";
      this.append(template.content.cloneNode(true));
      this.#table = this.querySelector("table-list")!;
      this.#pagination = this.querySelector("page-control")!;
      this.#dateRange = budgetingYearRange(
        appState.get("budgetingContext").year,
      );
    }
    if (this.#listening) return;
    this.#listening = true;

    addListener("filters-changed", this, this);
    addListener("table-sort-request", this, this);
    this.addEventListener("page-change", this);
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

    this.#resizeObserver = new ResizeObserver(() =>
      this.#scheduleCapacityUpdate(),
    );
    this.#resizeObserver.observe(this.#table);
    this.#unsubscribeBudgetingContext = appState.subscribe(
      "budgetingContext",
      (context) => {
        this.#dateRange = budgetingYearRange(context.year);
        this.#page = 1;
        this.#repaint();
      },
    );
    this.#repaint();
    this.#scheduleCapacityUpdate();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    removeListener("filters-changed", this, this);
    removeListener("table-sort-request", this, this);
    this.removeEventListener("page-change", this);
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

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    cancelAnimationFrame(this.#capacityFrame);
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
            this.#page = 1;
            this.#repaint();
          },
        );
        break;

      case "table-sort-request":
        handleCustomEvent("table-sort-request", event, ({ key }) => {
          this.#cycleSort(key as keyof BudgetTransaction);
          this.#page = 1;
          this.#repaint();
        });
        break;

      case "page-change":
        this.#page = (event as CustomEvent<{ page: number }>).detail.page;
        this.#repaint();
        break;

      case "click":
      case "keydown":
        this.#openSelectedRow(event);
        break;

      default:
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
        formatter: (value: string) =>
          DateUtils.shortDateFormatter.format(DateUtils.fromDateId(value)),
      },
      { key: "category", title: "Category", dataType: "string" },
      { key: "vendor", title: "Vendor", dataType: "string" },
      {
        key: "assignment",
        title: "Assignment",
        dataType: "string",
        prominence: "background",
      },
      {
        key: "notes",
        title: "Note",
        dataType: "string",
        formatter: (value) => (value === "" ? "---" : value),
        sizing: 25,
      },
      {
        key: "amount",
        title: "Amount",
        dataType: "number",
        formatter: (value: number, row) =>
          money(row.type === "expense" ? -value : value),
        textAlign: "right",
        prominence: "bold",
        sizing: "narrow",
        color: (row) =>
          row.type === "income" ? "var(--success-dark)" : "var(--text)",
        sorter: (row) => (row.type === "expense" ? -row.amount : row.amount),
      },
    ];
  }

  #tableData(rows: readonly BudgetTransaction[]): TableData<BudgetTransaction> {
    return {
      columns: ["checkbox", ...this.#columns(), "options"],
      rows,
      sort:
        this.#sortKey && this.#sortDirection
          ? { key: this.#sortKey, direction: this.#sortDirection }
          : null,
      rowActions: [
        {
          key: "edit",
          title: "Edit transaction",
          icon: "pencil",
          selectionIcon: "none",
        },
        {
          key: "delete",
          title: "Delete transaction",
          destructive: true,
          icon: "trash",
          selectionIcon: "none",
        },
      ],
    };
  }

  #repaint(): void {
    const rows = this.#sortedRows(this.#filteredRows());
    const totalPages = Math.max(1, Math.ceil(rows.length / this.#pageSize));
    this.#page = Math.min(this.#page, totalPages);
    const start = (this.#page - 1) * this.#pageSize;

    this.#table.data = this.#tableData(rows.slice(start, start + this.#pageSize));
    this.#pagination.totalPages = totalPages;
    this.#pagination.currentPage = this.#page;
  }

  #filteredRows(): BudgetTransaction[] {
    return filterForBudgetingContext(appController.getTransactions())
      .filter((row) => DateUtils.isInRange(row.date, this.#dateRange))
      .filter((row) => this.#filters.every((filter) => this.#matches(row, filter)));
  }

  #matches(
    row: BudgetTransaction,
    filter: AppliedFilter<BudgetTransaction>,
  ): boolean {
    const rawValue = row[filter.key];
    const value =
      typeof rawValue === "string" ? rawValue.toLowerCase() : rawValue;
    const expected =
      typeof filter.value === "string"
        ? filter.value.toLowerCase()
        : filter.value;

    switch (filter.operator) {
      case "Equals":
        return value === expected;
      case "Does not equal":
        return value !== expected;
      case "Greater than":
        return Number(value) > Number(expected);
      case "Less than":
        return Number(value) < Number(expected);
      case "Contains":
        return String(value ?? "").includes(String(expected));
      case "Starts with":
        return String(value ?? "").startsWith(String(expected));
    }
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

  #scheduleCapacityUpdate(): void {
    cancelAnimationFrame(this.#capacityFrame);
    this.#capacityFrame = requestAnimationFrame(() => {
      const pageSize = this.#table.visibleRowCapacity;
      if (pageSize > 0 && pageSize !== this.#pageSize) {
        const firstVisibleIndex = (this.#page - 1) * this.#pageSize;
        this.#pageSize = pageSize;
        this.#page = Math.floor(firstVisibleIndex / pageSize) + 1;
        this.#repaint();
      }
    });
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
    const transaction = rows[(this.#page - 1) * this.#pageSize + row.rowIndex - 1];
    if (!transaction) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    router.updateParams({ drawer: "edit", transactionId: transaction.id });
  }

}

if (!customElements.get("transaction-list-screen")) {
  customElements.define("transaction-list-screen", TransactionScreen);
}
