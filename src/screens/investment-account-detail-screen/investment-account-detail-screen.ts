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
import { escapeHTML, money, netFlows } from "../../utilities/view-formatters";
import type { OverlayManager } from "../../elements/overlay-manager/overlay-manager";
import type { DataChart, DataChartData } from "../../components/data-chart/data-chart";
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

type ChartDisplay = "balance" | "contributions";

const chartDisplayByAccount = new Map<string, ChartDisplay>();

function validDate(value: unknown, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))
    ? String(value)
    : fallback;
}

function matchesAccountHistorySearch(
  row: MonthlyHistoryRow,
  query: string,
): boolean {
  if (!query) return true;
  const textQuery = query.toLowerCase();
  const textValues = [InvestmentView.formatMonth(row.month)];
  if (textValues.some((value) => value.toLowerCase().includes(textQuery))) {
    return true;
  }

  const numericValues = [row.contributions, row.balance, row.roi, row.growth];
  return numericValues.some(
    (value) => value !== null && String(value).startsWith(query),
  );
}

export class InvestmentAccountDetailScreen
  extends HTMLElement
  implements EventListenerObject
{
  #accountId = "";
  #year = new Date().getFullYear();
  #table!: DataTable<MonthlyHistoryRow>;
  #search!: SearchBar;
  #filterBar!: FilterBar<MonthlyHistoryRow>;
  #empty!: HTMLElement;
  #summary!: HTMLElement;
  #overlayManager!: OverlayManager;
  #chart!: DataChart;
  #chartMode!: DropdownMenu;
  #chartDisplay: ChartDisplay = "balance";
  #query = "";
  #filters: AppliedFilter<MonthlyHistoryRow>[] = [];
  #rows: MonthlyHistoryRow[] = [];
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.append(template.content.cloneNode(true));
      this.#table = this.querySelector("data-table")!;
      this.#search = this.querySelector("#investment-detail-search")!;
      this.#filterBar = this.querySelector("#investment-detail-filter")!;
      this.#empty = this.querySelector("#investment-account-history-empty")!;
      this.#summary = this.querySelector(
        ".investment-account-detail__summary",
      )!;
      this.#overlayManager =
        document.querySelector<OverlayManager>("overlay-manager")!;
      this.#chart = this.querySelector("#investment-detail-chart")!;
      this.#chartMode = this.querySelector("#investment-detail-chart-mode")!;
      this.#chartMode.items = [
        { key: "balance", title: "Balance", isDefaultValue: true },
        { key: "contributions", title: "Contributions" },
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
    this.addEventListener("filters-changed", this);
    this.addEventListener("search-changed", this);
    this.#table.rowSelection.addListener(this);
    this.#chartMode.addEventListener("dropdown-selection", this);
    this.addEventListener("click", this);
    this.#summary.addEventListener("pointerover", this);
    this.#summary.addEventListener("pointerout", this);
    this.#summary.addEventListener("focusin", this);
    this.#summary.addEventListener("focusout", this);
    window.addEventListener("budget:accounts-changed", this);
    window.addEventListener("budget:accounts-loaded", this);
    this.#render();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("filters-changed", this);
    this.removeEventListener("search-changed", this);
    this.#table.rowSelection.removeListener(this);
    this.#chartMode.removeEventListener("dropdown-selection", this);
    this.removeEventListener("click", this);
    this.#summary.removeEventListener("pointerover", this);
    this.#summary.removeEventListener("pointerout", this);
    this.#summary.removeEventListener("focusin", this);
    this.#summary.removeEventListener("focusout", this);
    this.#overlayManager.hideTooltip();
    window.removeEventListener("budget:accounts-changed", this);
    window.removeEventListener("budget:accounts-loaded", this);
  }

  handleEvent(event: Event): void {
    if (
      event.type === "dropdown-selection" &&
      event.currentTarget === this.#chartMode
    ) {
      const value = (event as DropdownSelectionEvent).detail.value;
      if (value === "balance" || value === "contributions") {
        this.#chartDisplay = value;
        chartDisplayByAccount.set(this.#accountId, value);
        this.#renderChart(this.#allRows());
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
    if (event.type === "table-row-selected") {
      const id = (event as CustomEvent<{ id: string }>).detail.id;
      const row = this.#rows.find((item) => item.id === id);
      if (row) {
        router.updateParams({
          drawer: "investment-month",
          investmentAccountId: this.#accountId,
          investmentMonth: row.month,
          investmentLedgerSource: "investment",
        });
      }
      return;
    }
    if (event.type === "filters-changed") {
      this.#filters = (
        event as CustomEvent<{ filters: AppliedFilter<MonthlyHistoryRow>[] }>
      ).detail.filters;
      this.#render();
      return;
    }
    if (event.type === "search-changed") {
      this.#query = (event as CustomEvent<{ value: string }>).detail.value
        .trim()
        .toLowerCase();
      this.#render();
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
          id: balance.month,
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
        formatter: (value) => money(value),
        sizing: 20,
        cellClass: ["numeric", "align-right"],
        headerClass: "align-right",
        sorter: (row) => row.contributions,
      },
      {
        key: "balance",
        title: "Balance",
        formatter: (value) => money(value),
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

  #renderChart(rows: readonly MonthlyHistoryRow[]): void {
    const isBalance = this.#chartDisplay === "balance";
    const data: DataChartData = {
      year: this.#year,
      format: "monthly",
      ariaLabel: `${isBalance ? "Monthly balance" : "Monthly contributions"} for ${this.#year}`,
      series: [
        {
          type: isBalance ? "line" : "bar",
          variant: "primary",
          label: isBalance ? "Balance" : "Contributions",
          points: rows.map((row) => ({
            date: row.month,
            value: isBalance ? row.balance : row.contributions,
          })),
        },
      ],
    };
    this.#chart.data = data;
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
    this.#renderChart(allRows);
    this.#filterBar.availableFilters = [
      { key: "contributions", title: "Contributions", dataType: "number" },
      { key: "balance", title: "Balance", dataType: "number" },
    ];
    const rows = allRows.filter(
      (row) =>
        matchesAccountHistorySearch(row, this.#query) &&
        matchesLedgerFilterGroups(row, this.#filters),
    );
    this.#rows = rows;
    this.#empty.hidden = rows.length > 0;
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
    )!.textContent = money(latestBalance);
    this.querySelector<HTMLElement>(
      "#investment-detail-summary-contributions",
    )!.textContent = money(totalContributions);
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
          money(totalContributions),
          money(latestBalance),
          signedPercent(annualReturn),
          signedPercent(priorYearGrowth),
        ],
        ariaLabel: `${hasFullYear ? "Annual" : "Year to date"} return ${signedPercent(annualReturn)}`,
      },
    };
    this.#table.data = data;
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
