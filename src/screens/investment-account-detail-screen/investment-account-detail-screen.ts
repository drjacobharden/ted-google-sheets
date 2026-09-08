import { APIs } from "../../api/api";
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
import { router } from "../../router/router";
import { matchesLedgerFilterGroups } from "../../utilities/entity-ledger";
import { InvestmentView } from "../../utilities/investment-view";
import { modifiedDietz, monthEnd } from "../../utilities/investment-returns";
import { escapeHTML, money, netFlows, summaryMoney } from "../../utilities/view-formatters";
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import {
  investmentLedgerRows,
  type InvestmentLedgerType,
} from "../../utilities/investment-ledger";
import {
  buildInvestmentOverviewChartMonths,
  investmentOverviewChartData,
  type InvestmentOverviewChartDisplay,
} from "../../utilities/investment-overview-chart";
import type { OverlayManager } from "../../elements/overlay-manager/overlay-manager";
import { TRANSACTION_DATA_EVENTS } from "../../utilities/transaction-events";
import type { DataChart } from "../../components/data-chart/data-chart";
import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface MonthlyHistoryRow {
  id: string;
  month: string;
  contributions: number;
  balance: number;
  roi: number | null;
  growth: number | null;
}

interface AccountActivityRow {
  id: string;
  date: string;
  month: string;
  type: InvestmentLedgerType;
  amount: number;
}

const chartDisplayByAccount = new Map<string, InvestmentOverviewChartDisplay>();

function validDate(value: unknown, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))
    ? String(value)
    : fallback;
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});
const monthItems = [
  { key: "all", title: "All months", isDefaultValue: true },
  ...Array.from({ length: 12 }, (_, index) => ({
    key: String(index + 1).padStart(2, "0"),
    title: monthFormatter.format(new Date(2024, index, 1)),
  })),
];

const activityDate = (value: string): string => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}.${match[3]}.${match[1].slice(-2)}` : value;
};

export class InvestmentAccountDetailScreen
  extends HTMLElement
  implements EventListenerObject
{
  #accountId = "";
  #year = new Date().getFullYear();
  #table!: DataTable<MonthlyHistoryRow>;
  #summary!: HTMLElement;
  #overlayManager!: OverlayManager;
  #chart!: DataChart;
  #chartMode!: DropdownMenu;
  #chartDisplay: InvestmentOverviewChartDisplay = "balance";
  #rows: MonthlyHistoryRow[] = [];
  #activityTable!: DataTable<AccountActivityRow>;
  #activityMonth!: DropdownMenu;
  #activitySearch!: SearchBar;
  #activityFilterBar!: FilterBar<AccountActivityRow>;
  #activityRows: AccountActivityRow[] = [];
  #activityMonthValue: string | null = null;
  #activityQuery = "";
  #activityFilters: AppliedFilter<AccountActivityRow>[] = [];
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.append(template.content.cloneNode(true));
      this.#table = this.querySelector("data-table")!;
      this.#activityTable = this.querySelector("#investment-account-activity-table")!;
      this.#activityMonth = this.querySelector("#investment-account-activity-month")!;
      this.#activitySearch = this.querySelector("#investment-account-activity-search")!;
      this.#activityFilterBar = this.querySelector("#investment-account-activity-filter")!;
      this.#activityMonth.items = monthItems;
      this.#summary = this.querySelector(
        ".investment-account-detail__summary",
      )!;
      this.#overlayManager =
        document.querySelector<OverlayManager>("overlay-manager")!;
      this.#chart = this.querySelector("#investment-detail-chart")!;
      this.#chartMode = this.querySelector("#investment-detail-chart-mode")!;
      this.#chartMode.items = [
        { key: "balance", title: "Balance", isDefaultValue: true },
        { key: "total-contributions", title: "Total contributions" },
        { key: "yearly-contributions", title: "Yearly contributions" },
        { key: "monthly-contributions", title: "Monthly contributions" },
      ];
    }

    const params = router.currentParams();
    this.#accountId = params.accountId ?? "";
    this.#year = Number(params.year) || new Date().getFullYear();
    this.#chartDisplay =
      chartDisplayByAccount.get(this.#accountId) ?? "balance";
    this.#chartMode.selection = this.#chartDisplay;
    if (this.#listening) return;
    this.#listening = true;
    addListener("filters-changed", this, this);
    addListener("search-changed", this, this);
    this.#table.rowSelection.addListener(this);
    this.#activityTable.rowSelection.addListener(this);
    this.#activityMonth.addListener(this);
    this.#chartMode.addEventListener("dropdown-selection", this);
    this.addEventListener("click", this);
    this.#summary.addEventListener("pointerover", this);
    this.#summary.addEventListener("pointerout", this);
    this.#summary.addEventListener("focusin", this);
    this.#summary.addEventListener("focusout", this);
    window.addEventListener("budget:accounts-changed", this);
    window.addEventListener("budget:accounts-loaded", this);
    TRANSACTION_DATA_EVENTS.forEach((name) => window.addEventListener(name, this));
    this.#render();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    removeListener("filters-changed", this, this);
    removeListener("search-changed", this, this);
    this.#table.rowSelection.removeListener(this);
    this.#activityTable.rowSelection.removeListener(this);
    this.#activityMonth.removeListener(this);
    this.#chartMode.removeEventListener("dropdown-selection", this);
    this.removeEventListener("click", this);
    this.#summary.removeEventListener("pointerover", this);
    this.#summary.removeEventListener("pointerout", this);
    this.#summary.removeEventListener("focusin", this);
    this.#summary.removeEventListener("focusout", this);
    this.#overlayManager.hideTooltip();
    window.removeEventListener("budget:accounts-changed", this);
    window.removeEventListener("budget:accounts-loaded", this);
    TRANSACTION_DATA_EVENTS.forEach((name) => window.removeEventListener(name, this));
  }

  handleEvent(event: Event): void {
    if (
      event.type === "dropdown-selection" &&
      event.currentTarget === this.#chartMode
    ) {
      const value = (event as DropdownSelectionEvent).detail.value;
      if (
        value === "balance" ||
        value === "total-contributions" ||
        value === "yearly-contributions" ||
        value === "monthly-contributions"
      ) {
        this.#chartDisplay = value;
        chartDisplayByAccount.set(this.#accountId, value);
        this.#renderChart();
      }
      return;
    }
    if (event.type.startsWith("budget:")) {
      this.#render();
      return;
    }
    if (
      event.currentTarget === this.#summary &&
      (event.type === "pointerover" || event.type === "focusin")
    ) {
      const anchor = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-summary-help]",
      );
      if (!anchor || !this.#summary.contains(anchor)) return;
      const messages: Record<string, string> = {
        balance:
          "The latest total amount in the account for the selected year.",
        contributions:
          "How much you added or withdrew from the account during the selected year.",
        growth:
          "How much larger or smaller the account balance is versus the previous year.",
        roi: "A measure of how much your money grew on its own, without contributions.",
      };
      this.#overlayManager.showTooltip(
        anchor,
        messages[anchor.dataset.summaryHelp ?? ""] ?? "",
        { side: "top", align: "end", gap: 8 },
      );
      return;
    }
    if (
      event.currentTarget === this.#summary &&
      (event.type === "pointerout" || event.type === "focusout")
    ) {
      const leaving = (event.target as Element | null)?.closest(
        "[data-summary-help]",
      );
      const entering = (event as MouseEvent | FocusEvent).relatedTarget;
      const next =
        entering instanceof Element
          ? entering.closest("[data-summary-help]")
          : null;
      if (leaving && !next) this.#overlayManager.hideTooltip();
      return;
    }
    if (event.type === "dropdown-selection" && event.currentTarget === this.#activityMonth) {
      const value = (event as DropdownSelectionEvent).detail.value;
      this.#activityMonthValue = value === "all" ? null : value;
      this.#renderActivity();
      return;
    }
    if (event.type === "table-row-selected") {
      const id = (event as CustomEvent<{ id: string }>).detail.id;
      const rows = event.currentTarget === this.#activityTable ? this.#activityRows : this.#rows;
      const row = rows.find((item) => item.id === id);
      if (row) {
        router.updateParams({
          drawer: "edit",
          transactionId: row.id,
        });
      }
      return;
    }
    if (event.type === "filters-changed") {
      handleCustomEvent("filters-changed", event, ({ filters }) => {
        this.#activityFilters = filters as AppliedFilter<AccountActivityRow>[];
        this.#renderActivity();
      });
      return;
    }
    if (event.type === "search-changed") {
      const value = (event as CustomEvent<{ value: string }>).detail.value.trim().toLowerCase();
      this.#activityQuery = value;
      this.#renderActivity();
    }
  }

  #allRows(): MonthlyHistoryRow[] {
    const balances = APIs.accounts
      .balances()
      .filter((item) => item.accountId === this.#accountId)
      .sort((left, right) => left.month.localeCompare(right.month));
    const flows = APIs.accounts
      .activityForAccount(this.#accountId)
      .filter(
        (item) =>
          item.activityType === "contribution",
      );

    return balances
      .filter((item) => item.month.startsWith(`${this.#year}-`))
      .map((balance) => {
        const previous = balances
          .filter((item) => item.month < balance.month)
          .at(-1);
        const monthFlows = flows
          .filter((item) => item.month === balance.month)
          .map((item) => ({
            amount: Number(item.amount || 0),
            date: validDate(item.date, `${item.month}-15`),
          }));
        const beginning = Number(previous?.balance ?? 0);
        const ending = Number(balance.balance || 0);
        const startDate = previous
          ? monthEnd(previous.month)
          : `${balance.month}-01`;
        const endDate = monthEnd(balance.month);
        const monthlyReturn = previous
          ? modifiedDietz(
              { date: startDate, value: beginning },
              { date: endDate, value: ending },
              monthFlows,
            )
          : null;
        return {
          id: balance.id,
          month: balance.month,
          contributions: netFlows(
            flows.filter((item) => item.month === balance.month),
          ),
          balance: ending,
          roi: monthlyReturn === null ? null : monthlyReturn * 100,
          growth:
            previous && Number(previous.balance) !== 0
              ? ((ending - beginning) / beginning) * 100
              : null,
        };
      })
      .sort((left, right) => left.month.localeCompare(right.month));
  }

  #columns(): DataTableColumn<MonthlyHistoryRow>[] {
    return [
      {
        key: "month",
        title: "Month",
        formatter: (value) =>
          escapeHTML(InvestmentView.formatMonth(String(value ?? ""))),
        sizing: 30,
        cellClass: ["detail"],
      },
      {
        key: "contributions",
        title: "Contributions",
        formatter: (value) => summaryMoney(value),
        sizing: 20,
        cellClass: ["numeric", "align-right"],
        headerClass: "align-right",
        sorter: (row) => row.contributions,
      },
      {
        key: "balance",
        title: "Balance",
        formatter: (value) => summaryMoney(value),
        sizing: 20,
        cellClass: ["strong", "align-right"],
        headerClass: "align-right",
        sorter: (row) => row.balance,
      },
      {
        key: "roi",
        title: "ROI",
        formatter: (value) => signedPercent(value as number | null),
        sizing: 15,
        cellClass: [
          "comparison",
          "align-right",
          (row) =>
            row.roi === null
              ? "is-muted"
              : row.roi >= 0
                ? "is-positive"
                : "is-negative",
        ],
        headerClass: "align-right",
        sorter: (row) => row.roi ?? Number.NEGATIVE_INFINITY,
      },
      {
        key: "growth",
        title: "Growth",
        formatter: (value) => signedPercent(value as number | null),
        sizing: 15,
        cellClass: [
          "comparison",
          "align-right",
          (row) =>
            row.growth === null
              ? "is-muted"
              : row.growth >= 0
                ? "is-positive"
                : "is-negative",
        ],
        headerClass: "align-right",
        sorter: (row) => row.growth ?? Number.NEGATIVE_INFINITY,
      },
    ];
  }

  #renderChart(): void {
    const accounts = APIs.accounts
      .accounts()
      .filter((account) => account.id === this.#accountId);
    const balances = APIs.accounts
      .balances()
      .filter((item) => item.accountId === this.#accountId);
    const activities = APIs.accounts
      .investmentActivity()
      .filter((item) => item.accountId === this.#accountId);
    const today = new Date();
    const endMonth =
      this.#year === today.getFullYear() ? today.getMonth() + 1 : 12;
    const rows = buildInvestmentOverviewChartMonths(
      balances,
      activities,
      accounts,
      this.#year,
      endMonth,
    );
    const previousRows = buildInvestmentOverviewChartMonths(
      balances,
      activities,
      accounts,
      this.#year - 1,
      12,
    );
    this.#chart.data = investmentOverviewChartData(
      rows,
      this.#chartDisplay,
      this.#year,
      previousRows,
    );
  }

  #render(): void {
    const account = APIs.accounts
      .accounts()
      .find(
        (item) =>
          item.id === this.#accountId &&
          item.type === "investment" &&
          item.active !== false,
      );
    if (!account) {
      router.navigate("investment-accounts", { year: String(this.#year) });
      return;
    }

    this.querySelector<HTMLElement>("#investment-detail-title")!.textContent =
      account.name;
    this.querySelector<HTMLElement>(
      "#investment-detail-subtitle",
    )!.textContent = `Viewing summary for ${this.#year}`;
    const allRows = this.#allRows();
    this.#renderChart();
    const rows = allRows;
    this.#rows = rows;
    const totalContributions = allRows.reduce(
      (sum, row) => sum + row.contributions,
      0,
    );
    const latestVisibleRow = allRows.reduce(
      (latest, row) => (row.month > latest.month ? row : latest),
      allRows[0],
    );
    const latestBalance = latestVisibleRow?.balance ?? 0;
    const allBalances = APIs.accounts
      .balances()
      .filter((item) => item.accountId === this.#accountId)
      .sort((left, right) => left.month.localeCompare(right.month));
    const performance = InvestmentView.accountPerformance(
      this.#accountId,
      this.#year,
    );
    const annualReturn =
      performance.rate === null ? null : performance.rate * 100;
    const hasFullYear = new Set(allRows.map((row) => row.month)).size === 12;
    const latestRow = allRows.at(-1);
    const priorYearMonth = latestRow
      ? `${this.#year - 1}-${latestRow.month.slice(5, 7)}`
      : "";
    const priorYearBalance = allBalances.find(
      (item) => item.month === priorYearMonth,
    );
    const priorYearGrowth =
      latestRow && priorYearBalance && Number(priorYearBalance.balance) !== 0
        ? ((latestRow.balance - Number(priorYearBalance.balance)) /
            Number(priorYearBalance.balance)) *
          100
        : null;
    this.querySelector<HTMLElement>(
      "#investment-detail-summary-balance",
    )!.textContent = summaryMoney(latestBalance);
    this.querySelector<HTMLElement>(
      "#investment-detail-summary-contributions",
    )!.textContent = summaryMoney(totalContributions);
    this.querySelector<HTMLElement>(
      "#investment-detail-summary-growth",
    )!.textContent = signedPercent(priorYearGrowth);
    this.querySelector<HTMLElement>(
      "#investment-detail-summary-roi",
    )!.textContent = signedPercent(annualReturn);
    const data: DataTableData<MonthlyHistoryRow> = {
      columns: this.#columns(),
      rows,
      interactiveRows: true,
      rowKey: (row) => row.id,
      footer: {
        cells: [
          hasFullYear ? "Annual return" : "YTD return",
          summaryMoney(totalContributions),
          summaryMoney(latestBalance),
          signedPercent(annualReturn),
          signedPercent(priorYearGrowth),
        ],
        ariaLabel: `${hasFullYear ? "Annual" : "Year to date"} return ${signedPercent(annualReturn)}`,
      },
    };
    this.#table.data = data;
    this.#renderActivity();
  }

  #allActivityRows(): AccountActivityRow[] {
    return investmentLedgerRows()
      .filter((row) => row.accountId === this.#accountId)
      .map(({ id, date, month, type, amount }) => ({ id, date, month, type, amount }));
  }

  #activityColumns(): DataTableColumn<AccountActivityRow>[] {
    return [
      {
        key: "date",
        title: "Date",
        formatter: (value) => activityDate(String(value ?? "")),
        sizing: "narrow",
        cellClass: ["date"],
      },
      {
        key: "type",
        title: "Type",
        formatter: (value) => escapeHTML(String(value ?? "")),
        sizing: 55,
        cellClass: ["tag"],
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

  #renderActivity(): void {
    const allRows = this.#allActivityRows();
    this.#activityFilterBar.availableFilters = [
      { key: "type", title: "Type", dataType: ["Investment", "Withdrawal", "Debt payment", "New borrowing"] },
      { key: "date", title: "Date", dataType: "date" },
      { key: "amount", title: "Amount", dataType: "number" },
    ];
    const columns = this.#activityColumns();
    const rows = allRows
      .filter((row) => row.month.startsWith(`${this.#year}-`))
      .filter((row) => !this.#activityMonthValue || row.month.slice(5, 7) === this.#activityMonthValue)
      .filter((row) => {
        if (!this.#activityQuery) return true;
        return columns.some((column) => {
          const rawValue = row[column.key];
          const value = column.formatter?.(rawValue, row) ?? String(rawValue ?? "");
          return value.toLowerCase().includes(this.#activityQuery);
        });
      })
      .filter((row) => matchesLedgerFilterGroups(row, this.#activityFilters, (item, key) => item[key]));
    this.#activityRows = rows;
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    this.#activityTable.data = {
      columns,
      rows,
      interactiveRows: true,
      rowKey: (row) => row.id,
      footer: {
        cells: [null, "Total", money(total)],
        ariaLabel: `Account activity total ${money(total)}`,
      },
    };
  }
}

function signedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

if (!customElements.get("investment-account-detail-screen")) {
  customElements.define(
    "investment-account-detail-screen",
    InvestmentAccountDetailScreen,
  );
}
