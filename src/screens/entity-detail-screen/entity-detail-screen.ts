import { APIs } from "../../api/api";
import type {
  BudgetEntity,
  BudgetTransaction,
  EntityKind,
} from "../../api/budget-api";
import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type {
  AppliedFilter,
  FilterBar,
} from "../../components/filter-bar/filter-bar";
import type { SearchBar } from "../../components/search-bar/search-bar";
import {
  Table,
  type SortDirection,
  type TableColumn,
  type TableData,
} from "../../components/table/table";
import { router } from "../../router/router";
import type { RouteName } from "../../router/types";
import { appController } from "../../state/app-controller";
import { appState } from "../../state/app-state";
import {
  editorialMonthItems,
  matchesLedgerFilterGroups,
  signedPercent,
  signedTransactionAmount,
} from "../../utilities/entity-ledger";
import { buildCurrencyAxisScale } from "../../utilities/currency-axis-scale";
import { money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface EntityDetailSettings {
  label: string;
  route: RouteName;
  records(): BudgetEntity[];
  field: "categoryId" | "vendorId" | "assignmentId";
}

interface SelectedEntity {
  kind: EntityKind;
  id: string;
}

const ENTITY_DETAIL_CONFIG: Record<EntityKind, EntityDetailSettings> = {
  category: {
    label: "category",
    route: "categories",
    records: () => APIs.budget.listAllCategories(),
    field: "categoryId",
  },
  vendor: {
    label: "vendor",
    route: "vendors",
    records: () => APIs.budget.listAllVendors(),
    field: "vendorId",
  },
  assignment: {
    label: "person",
    route: "people",
    records: () => APIs.budget.listAllPeople(),
    field: "assignmentId",
  },
};

const RENDER_EVENTS = [
  "budget:transaction-queued",
  "budget:transaction-saved",
  "budget:transaction-sync-changed",
  "budget:transaction-restored",
  "budget:transaction-removed",
  "budget:transactions-loaded",
  "budget:reference-data-changed",
  "budget:categories-changed",
  "budget:vendors-changed",
  "budget:people-changed",
  "budget:entity-sync-changed",
] as const;

const monthName = new Intl.DateTimeFormat("en-US", { month: "long" });
const axisMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function ledgerDate(dateId: string): string {
  const match = dateId.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}.${match[3]}.${match[1].slice(-2)}` : dateId;
}

function averageCount(count: number, periods: number, period: "month" | "week"): string {
  const average = count / periods;
  const formatted = average.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formatted} transactions per ${period}`;
}

function elapsedPeriods(year: number): { months: number; weeks: number } {
  const today = new Date();
  if (year !== today.getFullYear()) return { months: 12, weeks: 52 };

  const start = Date.UTC(year, 0, 1);
  const throughToday = Date.UTC(year, today.getMonth(), today.getDate()) - start + 86_400_000;
  return {
    months: today.getMonth() + 1,
    weeks: Math.min(52, Math.max(1, Math.ceil(throughToday / 604_800_000))),
  };
}

/** Editorial summary, monthly chart, and transaction ledger for one entity. */
export class EntityDetailScreen
  extends HTMLElement
  implements EventListenerObject
{
  #selected: SelectedEntity | null = null;
  #title!: HTMLElement;
  #subtitle!: HTMLElement;
  #total!: HTMLElement;
  #totalLabel!: HTMLElement;
  #totalSubline!: HTMLElement;
  #average!: HTMLElement;
  #averageLabel!: HTMLElement;
  #averageSubline!: HTMLElement;
  #count!: HTMLElement;
  #countLabel!: HTMLElement;
  #countSubline!: HTMLElement;
  #comparisonLabel!: HTMLElement;
  #comparison!: HTMLElement;
  #comparisonSubline!: HTMLElement;
  #chart!: HTMLElement;
  #table!: Table<BudgetTransaction>;
  #empty!: HTMLElement;
  #filterBar!: FilterBar<BudgetTransaction>;
  #monthSelector!: DropdownMenu;
  #search!: SearchBar;
  #selectedMonth: string | null = null;
  #query = "";
  #filters: AppliedFilter<BudgetTransaction>[] = [];
  #sortKey: keyof BudgetTransaction | null = null;
  #sortDirection: SortDirection | null = null;
  #visibleRows: BudgetTransaction[] = [];
  #listening = false;
  #unsubscribeBudgetingContext: (() => void) | null = null;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "entity-detail";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
      this.#monthSelector.items = editorialMonthItems;
    }

    const { kind, id } = router.currentParams();
    this.#selected = this.#isEntityKind(kind) && id ? { kind, id } : null;
    if (!this.#selected) {
      router.navigate("transactions", this.#scopeParams());
      return;
    }
    if (this.#listening) return;
    this.#listening = true;

    this.addEventListener("filters-changed", this);
    this.addEventListener("table-sort-request", this);
    this.addEventListener("search-changed", this);
    this.addEventListener("budgeting:header-action", this);
    this.#monthSelector.addListener(this);
    this.#table.addEventListener("click", this);
    this.#table.addEventListener("keydown", this);
    RENDER_EVENTS.forEach((name) => window.addEventListener(name, this));
    this.#unsubscribeBudgetingContext = appState.subscribe(
      "budgetingContext",
      () => this.#render(),
    );
    this.#render();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("filters-changed", this);
    this.removeEventListener("table-sort-request", this);
    this.removeEventListener("search-changed", this);
    this.removeEventListener("budgeting:header-action", this);
    this.#monthSelector.removeListener(this);
    this.#table.removeEventListener("click", this);
    this.#table.removeEventListener("keydown", this);
    RENDER_EVENTS.forEach((name) => window.removeEventListener(name, this));
    this.#unsubscribeBudgetingContext?.();
    this.#unsubscribeBudgetingContext = null;
  }

  handleEvent(event: Event): void {
    if (event.type === "budgeting:header-action") {
      if ((event as CustomEvent<{ action: string }>).detail.action === "edit-entity") {
        this.#handleEdit();
      }
      return;
    }

    if (event.type === "dropdown-selection") {
      const selection = event as DropdownSelectionEvent;
      if (selection.currentTarget !== this.#monthSelector) return;
      this.#selectedMonth = selection.detail.value === "all"
        ? null
        : selection.detail.value;
      this.#renderLedger();
      return;
    }

    if (event.type === "filters-changed") {
      this.#filters = (
        event as CustomEvent<{ filters: AppliedFilter<BudgetTransaction>[] }>
      ).detail.filters;
      this.#renderLedger();
      return;
    }

    if (event.type === "search-changed") {
      this.#query = (event as CustomEvent<{ value: string }>).detail.value
        .trim()
        .toLowerCase();
      this.#renderLedger();
      return;
    }

    if (event.type === "table-sort-request") {
      this.#cycleSort(
        (event as CustomEvent<{ key: keyof BudgetTransaction }>).detail.key,
      );
      this.#renderLedger();
      return;
    }

    if (event.type === "click" || event.type === "keydown") {
      this.#openSelectedRow(event);
      return;
    }

    this.#render();
  }

  #captureElements(): void {
    this.#title = this.querySelector("#entity-detail-title")!;
    this.#subtitle = this.querySelector("#entity-detail-subtitle")!;
    this.#total = this.querySelector("#entity-detail-total")!;
    this.#totalLabel = this.querySelector("#entity-detail-total-label")!;
    this.#totalSubline = this.querySelector("#entity-detail-total-subline")!;
    this.#average = this.querySelector("#entity-detail-average")!;
    this.#averageLabel = this.querySelector("#entity-detail-average-label")!;
    this.#averageSubline = this.querySelector("#entity-detail-average-subline")!;
    this.#count = this.querySelector("#entity-detail-count")!;
    this.#countLabel = this.querySelector("#entity-detail-count-label")!;
    this.#countSubline = this.querySelector("#entity-detail-count-subline")!;
    this.#comparisonLabel = this.querySelector(
      "#entity-detail-comparison-label",
    )!;
    this.#comparison = this.querySelector("#entity-detail-comparison")!;
    this.#comparisonSubline = this.querySelector(
      "#entity-detail-comparison-subline",
    )!;
    this.#chart = this.querySelector("#entity-monthly-chart")!;
    this.#table = this.querySelector("#entity-transaction-table")!;
    this.#empty = this.querySelector("#entity-transaction-empty")!;
    this.#filterBar = this.querySelector("#entity-transaction-filter")!;
    this.#monthSelector = this.querySelector(
      "#entity-transaction-month-selector",
    )!;
    this.#search = this.querySelector("#entity-transaction-search")!;
  }

  #isEntityKind(value: string | undefined): value is EntityKind {
    return value === "category" || value === "vendor" || value === "assignment";
  }

  #record(): BudgetEntity | undefined {
    if (!this.#selected) return undefined;
    return ENTITY_DETAIL_CONFIG[this.#selected.kind]
      .records()
      .find((item) => item.id === this.#selected?.id);
  }

  #allTransactions(): BudgetTransaction[] {
    return (
      appController.getTransactions() ??
      APIs.budget.getCachedTransactions() ??
      []
    );
  }

  #transactionsForYear(year: number): BudgetTransaction[] {
    if (!this.#selected) return [];
    const settings = ENTITY_DETAIL_CONFIG[this.#selected.kind];
    return this.#allTransactions()
      .filter((transaction) => transaction.date.startsWith(`${year}-`))
      .filter(
        (transaction) => transaction[settings.field] === this.#selected?.id,
      );
  }

  #value(items: readonly BudgetTransaction[]): number {
    if (this.#selected?.kind === "assignment") {
      return items.reduce(
        (sum, item) =>
          sum + (item.type === "income" ? item.amount : -item.amount),
        0,
      );
    }
    return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  #render(): void {
    if (!this.#selected) return;
    const entity = this.#record();
    if (!entity) {
      if (!appController.isReferenceDataLoaded()) {
        this.#title.textContent = "Loading details…";
        this.#subtitle.textContent = "Loading the selected entity summary.";
        return;
      }
      router.navigate(
        ENTITY_DETAIL_CONFIG[this.#selected.kind].route,
        this.#scopeParams(),
      );
      return;
    }

    const year = appState.get("budgetingContext").year;
    this.#configureFilters(year);
    const previousYear = year - 1;
    const current = this.#transactionsForYear(year);
    const previous = this.#transactionsForYear(previousYear);
    const total = this.#value(current);
    const previousTotal = this.#value(previous);
    const comparison = previousTotal === 0
      ? null
      : ((total - previousTotal) / Math.abs(previousTotal)) * 100;

    this.#title.textContent = entity.name;
    this.#subtitle.textContent = `Viewing summary for ${year}`;
    this.#renderFocusMetrics(current, total, year);
    this.#comparisonLabel.textContent = `vs ${previousYear}`;
    this.#comparison.textContent = signedPercent(comparison);
    this.#comparison.classList.toggle("is-positive", comparison !== null && comparison >= 0);
    this.#comparison.classList.toggle("is-negative", comparison !== null && comparison < 0);
    this.#renderComparisonSubline(total, previousTotal, year);

    this.#renderChart(current, year, entity.name);
    this.#renderLedger();
  }

  #renderComparisonSubline(
    total: number,
    previousTotal: number,
    year: number,
  ): void {
    if (this.#selected?.kind === "assignment") {
      this.#comparisonSubline.hidden = true;
      return;
    }

    const currentMonths = elapsedPeriods(year).months;
    const previousMonths = elapsedPeriods(year - 1).months;
    const monthlyDifference = total / currentMonths - previousTotal / previousMonths;
    const direction = monthlyDifference === 0
      ? "difference"
      : monthlyDifference > 0
        ? "more"
        : "less";
    this.#comparisonSubline.textContent = `${money(Math.abs(monthlyDifference))} ${direction} per month`;
    this.#comparisonSubline.hidden = false;
  }

  #renderFocusMetrics(
    transactions: readonly BudgetTransaction[],
    total: number,
    year: number,
  ): void {
    const isPeriodBreakdown = this.#selected?.kind !== "assignment";
    this.#totalLabel.textContent = "Total";
    this.#total.textContent = money(total);

    if (isPeriodBreakdown) {
      const periods = elapsedPeriods(year);
      const transactionLabel = transactions.length === 1 ? "transaction" : "transactions";
      this.#totalSubline.textContent = `${transactions.length.toLocaleString("en-US")} ${transactionLabel}`;
      this.#averageLabel.textContent = "Monthly average";
      this.#average.textContent = money(total / periods.months);
      this.#averageSubline.textContent = averageCount(transactions.length, periods.months, "month");
      this.#countLabel.textContent = "Weekly average";
      this.#count.textContent = money(total / periods.weeks);
      this.#countSubline.textContent = averageCount(transactions.length, periods.weeks, "week");
      this.#totalSubline.hidden = false;
      this.#averageSubline.hidden = false;
      this.#countSubline.hidden = false;
      return;
    }

    this.#averageLabel.textContent = "Average transaction";
    this.#average.textContent = money(transactions.length ? total / transactions.length : 0);
    this.#countLabel.textContent = "Transaction count";
    this.#count.textContent = transactions.length.toLocaleString("en-US");
    this.#totalSubline.hidden = true;
    this.#averageSubline.hidden = true;
    this.#countSubline.hidden = true;
  }

  #renderChart(
    transactions: readonly BudgetTransaction[],
    year: number,
    entityName: string,
  ): void {
    const values = Array.from({ length: 12 }, (_, monthIndex) =>
      this.#value(
        transactions.filter(
          (transaction) =>
            Number(transaction.date.slice(5, 7)) === monthIndex + 1,
        ),
      ),
    );
    const maximum = Math.max(0, ...values);
    const minimum = Math.min(0, ...values);
    const scale = buildCurrencyAxisScale(Math.max(maximum, Math.abs(minimum)));
    const domainMaximum = maximum > 0 ? scale.maximum : 0;
    const domainMinimum = minimum < 0 ? -scale.maximum : 0;
    const range = domainMaximum - domainMinimum || 1;
    const baseline = (domainMaximum / range) * 100;
    const ticks = [
      ...(minimum < 0 ? scale.ticks.slice(1).map((value) => -value).reverse() : []),
      0,
      ...(maximum > 0 ? scale.ticks.slice(1) : []),
    ];
    const plot = document.createElement("div");
    plot.className = "entity-monthly-chart__plot";
    plot.style.setProperty("--chart-zero", `${baseline}%`);
    plot.setAttribute(
      "aria-label",
      `Monthly summary for ${entityName} in ${year}`,
    );
    ticks.forEach((tick) => {
      const line = document.createElement("span");
      line.className = `entity-monthly-chart__gridline${tick === 0 ? " is-zero" : ""}`;
      const position = (domainMaximum - tick) / range;
      line.style.top = `calc(${position * 100}% + ${20 - 56 * position}px)`;
      line.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "entity-monthly-chart__axis-label";
      label.textContent = axisMoney.format(tick);
      line.append(label);
      plot.append(line);
    });

    values.forEach((value, index) => {
      const label = monthName.format(new Date(year, index, 1));
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "entity-monthly-chart__slot";
      slot.setAttribute("aria-label", `${label} ${year}: ${money(value)}`);

      const bar = document.createElement("i");
      bar.className = `entity-monthly-chart__bar${value < 0 ? " is-negative" : ""}${value === 0 ? " is-zero" : ""}`;
      const top = value >= 0 ? ((domainMaximum - value) / range) * 100 : baseline;
      const height = value === 0 ? 0 : (Math.abs(value) / range) * 100;
      bar.style.top = value === 0 ? `calc(${baseline}% - 1px)` : `${top}%`;
      bar.style.height = value === 0 ? "2px" : `${height}%`;
      bar.setAttribute("aria-hidden", "true");

      const monthLabel = document.createElement("span");
      monthLabel.className = "entity-monthly-chart__month";
      monthLabel.textContent = label.slice(0, 3);
      monthLabel.setAttribute("aria-hidden", "true");

      const tooltip = document.createElement("span");
      tooltip.className = "entity-monthly-chart__tooltip";
      const tooltipTitle = document.createElement("strong");
      tooltipTitle.textContent = `${label} ${year}`;
      const tooltipValue = document.createElement("span");
      tooltipValue.textContent = money(value);
      tooltip.append(tooltipTitle, tooltipValue);
      tooltip.setAttribute("aria-hidden", "true");

      slot.append(bar, monthLabel, tooltip);
      plot.append(slot);
    });

    this.#chart.replaceChildren(plot);
  }

  #columns(): TableColumn<BudgetTransaction>[] {
    const entityColumns: TableColumn<BudgetTransaction>[] =
      this.#selected?.kind === "category"
        ? [this.#assignmentColumn(), this.#vendorColumn()]
        : this.#selected?.kind === "vendor"
          ? [this.#categoryColumn(), this.#assignmentColumn()]
          : [this.#categoryColumn(), this.#vendorColumn()];

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
        subline: (row) =>
          this.#selected?.kind === "vendor"
            ? row.assignment || "Shared"
            : row.vendor || "No vendor",
        prominence: "bold",
        sizing: 35,
        cellClass: "transaction-description",
      },
      ...entityColumns,
      {
        key: "amount",
        title: "Amount",
        dataType: "number",
        formatter: (_value, row) => money(signedTransactionAmount(row)),
        textAlign: "right",
        sizing: "narrow",
        cellClass: "transaction-amount",
        sorter: signedTransactionAmount,
      },
    ];
  }

  #categoryColumn(): TableColumn<BudgetTransaction> {
    return {
      key: "category",
      title: "Category",
      dataType: "string",
      prominence: "tag",
      sizing: 20,
      cellClass: "transaction-category",
    };
  }

  #vendorColumn(): TableColumn<BudgetTransaction> {
    return {
      key: "vendor",
      title: "Vendor",
      dataType: "string",
      sizing: 25,
      cellClass: "transaction-vendor",
    };
  }

  #assignmentColumn(): TableColumn<BudgetTransaction> {
    return {
      key: "assignment",
      title: "Assignment",
      dataType: "string",
      sizing: 20,
      cellClass: "transaction-assignment",
    };
  }

  #filteredRows(): BudgetTransaction[] {
    const year = appState.get("budgetingContext").year;
    return this.#transactionsForYear(year)
      .filter(
        (row) =>
          this.#selectedMonth === null ||
          row.date.slice(5, 7) === this.#selectedMonth,
      )
      .filter((row) => {
        if (!this.#query) return true;
        return [row.notes, row.category, row.vendor, row.assignment].some(
          (value) =>
            String(value ?? "").toLowerCase().includes(this.#query),
        );
      })
      .filter((row) =>
        matchesLedgerFilterGroups(row, this.#filters, (item, key) =>
          key === "amount" ? signedTransactionAmount(item) : item[key],
        ),
      );
  }

  #filterValues(
    key: "category" | "vendor" | "assignment",
    year: number,
  ): string[] {
    const values = new Map<string, string>();
    for (const transaction of this.#transactionsForYear(year)) {
      const value = String(transaction[key] ?? "").trim();
      if (value) values.set(value.toLocaleLowerCase("en-US"), value);
    }
    return [...values.values()].sort((left, right) => left.localeCompare(right));
  }

  #configureFilters(year: number): void {
    if (!this.#selected) return;
    const filters = [] as NonNullable<FilterBar<BudgetTransaction>["availableFilters"]>;
    if (this.#selected.kind !== "category") {
      filters.push({
        key: "category",
        title: "Category",
        dataType: this.#filterValues("category", year),
        searchable: true,
      });
    }
    if (this.#selected.kind !== "vendor") {
      filters.push({
        key: "vendor",
        title: "Vendor",
        dataType: this.#filterValues("vendor", year),
        searchable: true,
      });
    }
    filters.push(
      {
        key: "assignment",
        title: "Assignment",
        dataType: this.#filterValues("assignment", year),
        searchable: true,
      },
      { key: "notes", title: "Description", dataType: "string" },
      { key: "amount", title: "Amount", dataType: "number" },
      {
        key: "type",
        title: "Transaction type",
        dataType: ["Income", "Expense"],
      },
    );
    this.#filterBar.availableFilters = filters;
    this.#filters = this.#filterBar.filters;
  }

  #sortedRows(rows: BudgetTransaction[]): BudgetTransaction[] {
    if (!this.#sortKey || !this.#sortDirection) {
      return [...rows].sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.createdAt.localeCompare(left.createdAt),
      );
    }
    const key = this.#sortKey;
    const column = this.#columns().find((item) => item.key === key);
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

  #renderLedger(): void {
    if (!this.#selected) return;
    const rows = this.#sortedRows(this.#filteredRows());
    this.#visibleRows = rows;
    const visibleTotal = rows.reduce(
      (sum, row) => sum + signedTransactionAmount(row),
      0,
    );
    const data: TableData<BudgetTransaction> = {
      columns: this.#columns(),
      rows,
      interactiveRows: true,
      sort:
        this.#sortKey && this.#sortDirection
          ? { key: this.#sortKey, direction: this.#sortDirection }
          : null,
      footer: {
        cells: [null, "Visible total", null, null, money(visibleTotal)],
        ariaLabel: `Visible transaction total ${money(visibleTotal)}`,
      },
    };
    this.#table.data = data;
    this.#empty.hidden = rows.length > 0;
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
    if (
      event instanceof KeyboardEvent &&
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }
    const row = (event.target as Element | null)?.closest<HTMLTableRowElement>(
      "tbody tr",
    );
    if (!row) return;
    const transaction = this.#visibleRows[row.rowIndex - 1];
    if (!transaction) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    router.updateParams({ drawer: "edit", transactionId: transaction.id });
  }

  #handleEdit(): void {
    if (!this.#selected) return;
    router.updateParams({
      drawer: "entity-edit",
      entityKind: this.#selected.kind,
      entityId: this.#selected.id,
    });
  }

  #scopeParams(): import("../../router/types").RouteParams {
    return { year: String(appState.get("budgetingContext").year) };
  }
}

if (!customElements.get("entity-detail-screen")) {
  customElements.define("entity-detail-screen", EntityDetailScreen);
}
