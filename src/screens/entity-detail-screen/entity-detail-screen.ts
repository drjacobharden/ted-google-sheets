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
import type {
  DataTable,
  DataTableColumn,
  DataTableData,
} from "../../components/data-table/data-table";
import type { DataChart } from "../../components/data-chart/data-chart";
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
import {
  activityEffects,
  budgetingActivities,
  ledgerVendorLabel,
} from "../../utilities/activity-effects";
import {
  buildEntityChartMonths,
  entityChartData,
  type EntityChartDisplay,
} from "../../utilities/entity-detail-chart";
import { escapeHTML, money } from "../../utilities/view-formatters";
import { TRANSACTION_DATA_EVENTS } from "../../utilities/transaction-events";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

const selectedEntityCharts = new Map<string, EntityChartDisplay>();

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
  ...TRANSACTION_DATA_EVENTS,
  "budget:reference-data-changed",
  "budget:categories-changed",
  "budget:vendors-changed",
  "budget:people-changed",
  "budget:entity-sync-changed",
] as const;

function ledgerDate(dateId: string): string {
  const match = dateId.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}.${match[3]}.${match[1].slice(-2)}` : dateId;
}

function averageCount(
  count: number,
  periods: number,
  period: "month" | "week",
): string {
  const average = count / periods;
  const formatted = average.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formatted} transactions per ${period}`;
}

function summaryMoney(value: number): string {
  return money(value, Math.abs(value) < 1);
}

function preciseSummaryMoney(element: HTMLElement, value: number): void {
  const formatted = summaryMoney(value);
  if (Math.abs(value) >= 1) {
    element.textContent = formatted;
    element.removeAttribute("aria-label");
    return;
  }

  const cents = formatted.slice(-2);
  const dollars = formatted.slice(0, -3);

  const primary = document.createElement("span");
  primary.className = "entity-detail__focus-primary";
  primary.textContent = dollars;

  const fractional = document.createElement("span");
  fractional.className = "entity-detail__focus-cents";
  fractional.textContent = `.${cents}`;

  element.replaceChildren(primary, fractional);
  element.setAttribute("aria-label", formatted);
}

function elapsedPeriods(year: number): { months: number; weeks: number } {
  const today = new Date();
  if (year !== today.getFullYear()) return { months: 12, weeks: 52 };

  const start = Date.UTC(year, 0, 1);
  const throughToday =
    Date.UTC(year, today.getMonth(), today.getDate()) - start + 86_400_000;
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
  #chart!: DataChart;
  #chartMode!: DropdownMenu;
  #chartDisplay: EntityChartDisplay = "cumulative-spend";
  #table!: DataTable<BudgetTransaction>;
  #filterBar!: FilterBar<BudgetTransaction>;
  #monthSelector!: DropdownMenu;
  #search!: SearchBar;
  #selectedMonth: string | null = null;
  #query = "";
  #filters: AppliedFilter<BudgetTransaction>[] = [];
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
    this.#chartDisplay =
      selectedEntityCharts.get(`${this.#selected.kind}:${this.#selected.id}`) ??
      "cumulative-spend";
    if (this.#listening) return;
    this.#listening = true;

    this.addEventListener("filters-changed", this);
    this.addEventListener("search-changed", this);
    this.addEventListener("budgeting:header-action", this);
    this.#monthSelector.addListener(this);
    this.#chartMode.addListener(this);
    this.#table.rowSelection.addListener(this);
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
    this.removeEventListener("search-changed", this);
    this.removeEventListener("budgeting:header-action", this);
    this.#monthSelector.removeListener(this);
    this.#chartMode.removeListener(this);
    this.#table.rowSelection.removeListener(this);
    RENDER_EVENTS.forEach((name) => window.removeEventListener(name, this));
    this.#unsubscribeBudgetingContext?.();
    this.#unsubscribeBudgetingContext = null;
  }

  handleEvent(event: Event): void {
    if (event.type === "budgeting:header-action") {
      if (
        (event as CustomEvent<{ action: string }>).detail.action ===
        "edit-entity"
      ) {
        this.#handleEdit();
      }
      return;
    }

    if (event.type === "dropdown-selection") {
      const selection = event as DropdownSelectionEvent;
      if (selection.currentTarget === this.#chartMode) {
        this.#chartDisplay = selection.detail.value as EntityChartDisplay;
        selectedEntityCharts.set(
          `${this.#selected?.kind}:${this.#selected?.id}`,
          this.#chartDisplay,
        );
        this.#renderChart();
        return;
      }
      if (selection.currentTarget !== this.#monthSelector) return;
      this.#selectedMonth =
        selection.detail.value === "all" ? null : selection.detail.value;
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

    if (event.type === "table-row-selected") {
      const id = (event as CustomEvent<{ id: string }>).detail.id;
      const transaction = this.#visibleRows.find((row) => row.id === id);
      if (transaction) {
        router.updateParams({ drawer: "edit", transactionId: transaction.id });
      }
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
    this.#averageSubline = this.querySelector(
      "#entity-detail-average-subline",
    )!;
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
    this.#filterBar = this.querySelector("#entity-transaction-filter")!;
    this.#monthSelector = this.querySelector(
      "#entity-transaction-month-selector",
    )!;
    this.#chartMode = this.querySelector("#entity-chart-mode")!;
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

  #transactionsForYear(year: number, throughDate?: string): BudgetTransaction[] {
    if (!this.#selected) return [];
    const settings = ENTITY_DETAIL_CONFIG[this.#selected.kind];
    return budgetingActivities(
      this.#allTransactions(),
      APIs.accounts.accounts(),
      APIs.budget.listAllCategories(),
      APIs.budget.listAllPeople(),
    )
      .filter((transaction) => transaction.date.startsWith(`${year}-`))
      .filter((transaction) => !throughDate || transaction.date <= throughDate)
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
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const latestCurrentDate =
      year === today.getFullYear()
        ? current
            .map((transaction) => transaction.date)
            .filter((date) => date <= todayIso)
            .sort()
            .at(-1)
        : undefined;
    const previousThroughDate = latestCurrentDate
      ? `${previousYear}${latestCurrentDate.slice(4)}`
      : undefined;
    const previous = this.#transactionsForYear(
      previousYear,
      previousThroughDate,
    );
    const comparisonMonths = latestCurrentDate
      ? Number(latestCurrentDate.slice(5, 7))
      : elapsedPeriods(previousYear).months;
    const total = this.#value(current);
    const previousTotal = this.#value(previous);
    const comparison =
      previousTotal === 0
        ? null
        : ((total - previousTotal) / Math.abs(previousTotal)) * 100;

    this.#title.textContent = entity.name;
    this.#subtitle.textContent = `Viewing summary for ${year}`;
    this.#renderFocusMetrics(current, total, year, previous, comparisonMonths);
    if (this.#selected.kind !== "assignment") {
      this.#comparisonLabel.textContent = `vs ${previousYear}`;
      this.#comparison.textContent = signedPercent(comparison);
      this.#comparison.classList.toggle(
        "is-positive",
        comparison !== null && comparison >= 0,
      );
      this.#comparison.classList.toggle(
        "is-negative",
        comparison !== null && comparison < 0,
      );
      this.#renderComparisonSubline(
        total,
        previousTotal,
        year,
        comparisonMonths,
      );
    }

    this.#configureChartMode(entity, year);
    this.#renderChart();
    this.#renderLedger();
  }

  #renderComparisonSubline(
    total: number,
    previousTotal: number,
    year: number,
    comparisonMonths: number,
  ): void {
    if (this.#selected?.kind === "assignment") {
      this.#comparisonSubline.hidden = true;
      return;
    }

    const monthlyDifference =
      total / comparisonMonths - previousTotal / comparisonMonths;
    const direction =
      monthlyDifference === 0
        ? "difference"
        : monthlyDifference > 0
          ? "more"
          : "less";
    this.#comparisonSubline.textContent = `${summaryMoney(Math.abs(monthlyDifference))} ${direction} per month`;
    this.#comparisonSubline.hidden = false;
  }

  #renderFocusMetrics(
    transactions: readonly BudgetTransaction[],
    total: number,
    year: number,
    previousTransactions: readonly BudgetTransaction[] = [],
    comparisonMonths = elapsedPeriods(year - 1).months,
  ): void {
    const isPeriodBreakdown = this.#selected?.kind !== "assignment";
    if (!isPeriodBreakdown) {
      const currentMetrics = this.#assignmentMetrics(transactions);
      const previousMetrics = this.#assignmentMetrics(previousTransactions);
      this.#totalLabel.textContent = "Income";
      preciseSummaryMoney(this.#total, currentMetrics.income);
      this.#averageLabel.textContent = "Spend";
      preciseSummaryMoney(this.#average, currentMetrics.spend);
      this.#countLabel.textContent = "Savings";
      preciseSummaryMoney(
        this.#count,
        currentMetrics.income - currentMetrics.spend,
      );
      const currentSavings = currentMetrics.income - currentMetrics.spend;
      const previousSavings = previousMetrics.income - previousMetrics.spend;
      const currentBalance = currentSavings;
      const previousBalance = previousSavings;
      this.#comparisonLabel.textContent = `vs ${year - 1}`;
      this.#setMetricComparison(
        this.#comparison,
        currentBalance,
        previousBalance,
      );
      this.#setMetricMonthlyValue(
        this.#totalSubline,
        currentMetrics.income,
        year,
      );
      this.#setMetricMonthlyValue(
        this.#averageSubline,
        currentMetrics.spend,
        year,
      );
      this.#setMetricMonthlyValue(this.#countSubline, currentSavings, year);
      this.#setMetricMonthlyDifference(
        this.#comparisonSubline,
        currentBalance,
        previousBalance,
        year,
        "saved",
        comparisonMonths,
      );
      return;
    }
    this.#totalLabel.textContent = "Total";
    this.#total.textContent = summaryMoney(total);
    this.#total.removeAttribute("aria-label");

    if (isPeriodBreakdown) {
      const periods = elapsedPeriods(year);
      const transactionLabel =
        transactions.length === 1 ? "transaction" : "transactions";
      this.#totalSubline.textContent = `${transactions.length.toLocaleString("en-US")} ${transactionLabel}`;
      this.#averageLabel.textContent = "Monthly average";
      this.#average.textContent = summaryMoney(total / periods.months);
      this.#average.removeAttribute("aria-label");
      this.#averageSubline.textContent = averageCount(
        transactions.length,
        periods.months,
        "month",
      );
      this.#countLabel.textContent = "Weekly average";
      this.#count.textContent = summaryMoney(total / periods.weeks);
      this.#count.removeAttribute("aria-label");
      this.#countSubline.textContent = averageCount(
        transactions.length,
        periods.weeks,
        "week",
      );
      this.#totalSubline.hidden = false;
      this.#averageSubline.hidden = false;
      this.#countSubline.hidden = false;
      return;
    }
  }

  #assignmentMetrics(transactions: readonly BudgetTransaction[]): {
    income: number;
    spend: number;
    count: number;
  } {
    return transactions.reduce(
      (totals, transaction) => {
        const effects = activityEffects(transaction, APIs.accounts.accounts());
        totals.income += effects.income;
        totals.spend += effects.expense;
        totals.count += 1;
        return totals;
      },
      { income: 0, spend: 0, count: 0 },
    );
  }

  #setMetricComparison(
    element: HTMLElement,
    current: number,
    previous: number,
  ): void {
    const comparison =
      previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
    element.textContent = comparison === null ? "" : signedPercent(comparison);
    element.hidden = comparison === null;
  }

  #setMetricMonthlyDifference(
    element: HTMLElement,
    current: number,
    previous: number,
    year: number,
    subject = "",
    comparisonMonths = elapsedPeriods(year - 1).months,
  ): void {
    if (previous === 0) {
      element.textContent = "";
      element.hidden = true;
      return;
    }

    const monthlyDifference =
      current / comparisonMonths - previous / comparisonMonths;
    const direction =
      monthlyDifference === 0
        ? "difference"
        : monthlyDifference > 0
          ? "more"
          : "less";
    element.textContent = `${summaryMoney(Math.abs(monthlyDifference))} ${direction}${subject ? ` ${subject}` : ""} per month`;
    element.hidden = false;
  }

  #setMetricMonthlyValue(
    element: HTMLElement,
    value: number,
    year: number,
  ): void {
    element.textContent = `${summaryMoney(value / elapsedPeriods(year).months)} per month`;
    element.hidden = false;
  }

  #configureChartMode(entity: BudgetEntity, year: number): void {
    if (!this.#selected) return;
    const chartRows = buildEntityChartMonths(
      this.#allTransactions(),
      APIs.accounts.accounts(),
      this.#selected.kind,
      this.#selected.id,
      year,
    );
    let direction: "income" | "spend" = "spend";
    if (this.#selected.kind === "assignment") direction = "income";
    else if (this.#selected.kind === "category")
      direction = entity.type === "income" ? "income" : "spend";
    else {
      const income = chartRows.reduce((sum, row) => sum + row.income, 0);
      const spend = chartRows.reduce((sum, row) => sum + row.spend, 0);
      direction = income >= spend ? "income" : "spend";
    }
    const items =
      this.#selected.kind === "assignment"
        ? [
            {
              key: "cumulative-savings",
              title: "Savings",
              selectionLabel: "Cumulative savings",
              group: "Cumulative",
              isDefaultValue: true,
            },
            {
              key: "cumulative-income",
              title: "Income",
              selectionLabel: "Cumulative income",
              group: "Cumulative",
            },
            {
              key: "cumulative-spend",
              title: "Spend",
              selectionLabel: "Cumulative spend",
              group: "Cumulative",
            },
            {
              key: "cumulative-income-vs-spend",
              title: "Income vs Spend",
              selectionLabel: "Cumulative Income vs Spend",
              group: "Cumulative",
            },
            {
              key: "cumulative-savings-rate",
              title: "Savings rate",
              selectionLabel: "Cumulative savings rate",
              group: "Cumulative",
            },
            {
              key: "total-savings",
              title: "Savings",
              selectionLabel: "Monthly savings",
              group: "Monthly",
            },
            {
              key: "monthly-income",
              title: "Income",
              selectionLabel: "Monthly income",
              group: "Monthly",
            },
            {
              key: "monthly-spend",
              title: "Spend",
              selectionLabel: "Monthly spend",
              group: "Monthly",
            },
            {
              key: "monthly-savings-rate",
              title: "Savings rate",
              selectionLabel: "Monthly savings rate",
              group: "Monthly",
            },
            {
              key: "income-vs-expense",
              title: "Income vs Spend",
              selectionLabel: "Monthly Income vs Spend",
              group: "Monthly",
            },
          ]
        : direction === "income"
          ? [
              {
                key: "cumulative-income",
                title: "Income",
                selectionLabel: "Cumulative income",
                group: "Cumulative",
                isDefaultValue: true,
              },
              {
                key: "monthly-income",
                title: "Income",
                selectionLabel: "Monthly income",
                group: "Monthly",
              },
            ]
          : [
              {
                key: "cumulative-spend",
                title: "Spend",
                selectionLabel: "Cumulative spend",
                group: "Cumulative",
                isDefaultValue: true,
              },
              {
                key: "monthly-spend",
                title: "Spend",
                selectionLabel: "Monthly spend",
                group: "Monthly",
              },
            ];
    const selected = items.some((item) => item.key === this.#chartDisplay)
      ? this.#chartDisplay
      : (items[0].key as EntityChartDisplay);
    this.#chartMode.items = items;
    this.#chartMode.selection = selected;
    this.#chartDisplay = selected;
  }

  #renderChart(): void {
    if (!this.#selected) return;
    const year = appState.get("budgetingContext").year;
    const accounts = APIs.accounts.accounts();
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const latestCurrentDate =
      year === today.getFullYear()
        ? this.#transactionsForYear(year)
            .map((transaction) => transaction.date)
            .filter((date) => date <= todayIso)
            .sort()
            .at(-1)
        : undefined;
    const previousThroughDate = latestCurrentDate
      ? `${year - 1}${latestCurrentDate.slice(4)}`
      : undefined;
    const currentRows = buildEntityChartMonths(
      this.#allTransactions(),
      accounts,
      this.#selected.kind,
      this.#selected.id,
      year,
    );
    const previousRows = buildEntityChartMonths(
      this.#allTransactions(),
      accounts,
      this.#selected.kind,
      this.#selected.id,
      year - 1,
      new Date(year - 1, 11, 31),
    );
    this.#chart.data = entityChartData(
      currentRows,
      this.#chartDisplay,
      year,
      previousRows,
    );
  }

  #columns(): DataTableColumn<BudgetTransaction>[] {
    const entityColumns: DataTableColumn<BudgetTransaction>[] =
      this.#selected?.kind === "category"
        ? [this.#assignmentColumn(), this.#vendorColumn()]
        : this.#selected?.kind === "vendor"
          ? [this.#categoryColumn(), this.#assignmentColumn()]
          : [this.#categoryColumn(), this.#vendorColumn()];

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
        subline: (row) =>
          escapeHTML(
            this.#selected?.kind === "vendor"
              ? row.assignment || "Shared"
              : row.vendor || "No vendor",
          ),
        sizing: 35,
        cellClass: ["primary"],
      },
      ...entityColumns,
      {
        key: "amount",
        title: "Amount",
        formatter: (_value, row) => money(signedTransactionAmount(row)),
        sizing: "narrow",
        cellClass: ["numeric", "align-right"],
        headerClass: "align-right",
        sorter: signedTransactionAmount,
      },
    ];
  }

  #categoryColumn(): DataTableColumn<BudgetTransaction> {
    return {
      key: "category",
      title: "Category",
      sizing: 20,
      cellClass: ["tag"],
      formatter: (value) => escapeHTML(value),
    };
  }

  #vendorColumn(): DataTableColumn<BudgetTransaction> {
    return {
      key: "vendor",
      title: "Vendor",
      sizing: 25,
      cellClass: ["detail"],
      formatter: (_value, row) => escapeHTML(ledgerVendorLabel(row)),
    };
  }

  #assignmentColumn(): DataTableColumn<BudgetTransaction> {
    return {
      key: "assignment",
      title: "Assignment",
      sizing: 20,
      cellClass: ["detail"],
      formatter: (value) => escapeHTML(value),
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
      .filter((row) => this.#matchesSearch(row))
      .filter((row) =>
        matchesLedgerFilterGroups(row, this.#filters, (item, key) =>
          key === "amount" ? signedTransactionAmount(item) : item[key],
        ),
      );
  }

  #matchesSearch(row: BudgetTransaction): boolean {
    if (!this.#query) return true;
    return this.#columns().some((column) => {
      const rawValue = row[column.key];
      const value = column.sorter?.(row) ?? rawValue;
      if (typeof value === "number")
        return String(value).startsWith(this.#query);
      const text = column.formatter?.(rawValue, row) ?? String(value ?? "");
      return text.toLowerCase().includes(this.#query);
    });
  }

  #filterValues(
    key: "category" | "vendor" | "assignment",
    year: number,
  ): string[] {
    const values = new Map<string, string>();
    for (const transaction of this.#transactionsForYear(year)) {
      const value =
        key === "vendor"
          ? ledgerVendorLabel(transaction)
          : String(transaction[key] ?? "").trim();
      if (value) values.set(value.toLocaleLowerCase("en-US"), value);
    }
    return [...values.values()].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  #configureFilters(year: number): void {
    if (!this.#selected) return;
    const filters = [] as NonNullable<
      FilterBar<BudgetTransaction>["availableFilters"]
    >;
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

  #renderLedger(): void {
    if (!this.#selected) return;
    const rows = [...this.#filteredRows()].sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.createdAt.localeCompare(left.createdAt),
    );
    this.#visibleRows = rows;
    const visibleTotal = rows.reduce(
      (sum, row) => sum + signedTransactionAmount(row),
      0,
    );
    const data: DataTableData<BudgetTransaction> = {
      columns: this.#columns(),
      rows,
      interactiveRows: true,
      rowKey: (row) => row.id,
      footer: {
        cells: [null, "Total", null, null, money(visibleTotal)],
        ariaLabel: `Visible transaction total ${money(visibleTotal)}`,
      },
    };
    this.#table.data = data;
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
