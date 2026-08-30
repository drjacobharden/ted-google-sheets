import { APIs } from "../../api/api";
import type {
  DataChart,
  DataChartData,
} from "../../components/data-chart/data-chart";
import type {
  DataTable,
  DataTableColumn,
  DataTableData,
} from "../../components/data-table/data-table";
import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type {
  AppliedFilter,
  FilterBar,
} from "../../components/filter-bar/filter-bar";
import type { SearchBar } from "../../components/search-bar/search-bar";
import type { OverlayManager } from "../../elements/overlay-manager/overlay-manager";
import { router } from "../../router/router";
import {
  matchesLedgerFilterGroups,
  signedPercent,
} from "../../utilities/entity-ledger";
import { InvestmentView } from "../../utilities/investment-view";
import { escapeHTML, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface MonthlyDebtRow {
  id: string;
  month: string;
  payments: number;
  balance: number;
  change: number | null;
}

type ChartDisplay = "balance" | "payments";

const chartDisplayByAccount = new Map<string, ChartDisplay>();

function percentageChange(current: number, previous: number): number | null {
  return previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}

function matchesDebtHistorySearch(
  row: MonthlyDebtRow,
  query: string,
): boolean {
  if (!query) return true;
  if (InvestmentView.formatMonth(row.month).toLowerCase().includes(query)) {
    return true;
  }
  return [row.payments, row.balance, row.change].some(
    (value) => value !== null && String(value).startsWith(query),
  );
}

export class InvestmentDebtDetailScreen
  extends HTMLElement
  implements EventListenerObject
{
  #accountId = "";
  #year = new Date().getFullYear();
  #table!: DataTable<MonthlyDebtRow>;
  #search!: SearchBar;
  #filterBar!: FilterBar<MonthlyDebtRow>;
  #empty!: HTMLElement;
  #summary!: HTMLElement;
  #overlayManager!: OverlayManager;
  #chart!: DataChart;
  #chartMode!: DropdownMenu;
  #chartDisplay: ChartDisplay = "balance";
  #query = "";
  #filters: AppliedFilter<MonthlyDebtRow>[] = [];
  #rows: MonthlyDebtRow[] = [];
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.append(template.content.cloneNode(true));
      this.#table = this.querySelector("#debt-history-table")!;
      this.#search = this.querySelector("#debt-detail-search")!;
      this.#filterBar = this.querySelector("#debt-detail-filter")!;
      this.#empty = this.querySelector("#debt-history-empty")!;
      this.#summary = this.querySelector(
        ".investment-account-detail__summary",
      )!;
      this.#overlayManager =
        document.querySelector<OverlayManager>("overlay-manager")!;
      this.#chart = this.querySelector("#debt-detail-chart")!;
      this.#chartMode = this.querySelector("#debt-detail-chart-mode")!;
      this.#chartMode.items = [
        { key: "balance", title: "Balance", isDefaultValue: true },
        { key: "payments", title: "Payments" },
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
      if (value === "balance" || value === "payments") {
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
        payments:
          "How much the person paid toward this debt during the selected year.",
        balance: "The current amount owed on this debt.",
        change:
          "How much the debt has grown or shrunk since the previous year.",
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
          investmentLedgerSource: "debt",
        });
      }
      return;
    }
    if (event.type === "filters-changed") {
      this.#filters = (
        event as CustomEvent<{ filters: AppliedFilter<MonthlyDebtRow>[] }>
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

  #allRows(): MonthlyDebtRow[] {
    const balances = APIs.accounts
      .balances()
      .filter((item) => item.accountId === this.#accountId)
      .sort((left, right) => left.month.localeCompare(right.month));
    const payments = APIs.accounts
      .activityForAccount(this.#accountId)
      .filter(
        (item) =>
          item.activityType === "payment",
      );

    return balances
      .filter((item) => item.month.startsWith(`${this.#year}-`))
      .map((balance) => {
        const previous = balances
          .filter((item) => item.month < balance.month)
          .at(-1);
        const currentBalance = Number(balance.balance || 0);
        const previousBalance = Number(previous?.balance ?? 0);
        return {
          id: balance.month,
          month: balance.month,
          payments: payments
            .filter((item) => item.month === balance.month)
            .reduce(
              (total, item) => total + Math.abs(Number(item.amount || 0)),
              0,
            ),
          balance: currentBalance,
          change: previous
            ? percentageChange(currentBalance, previousBalance)
            : null,
        };
      })
      .sort((left, right) => left.month.localeCompare(right.month));
  }

  #columns(): DataTableColumn<MonthlyDebtRow>[] {
    return [
      {
        key: "month",
        title: "Month",
        formatter: (value) =>
          escapeHTML(InvestmentView.formatMonth(String(value ?? ""))),
        sizing: 34,
        cellClass: ["detail"],
      },
      {
        key: "payments",
        title: "Payments",
        formatter: (value) => money(value),
        sizing: 22,
        cellClass: ["numeric", "align-right"],
        headerClass: "align-right",
        sorter: (row) => row.payments,
      },
      {
        key: "balance",
        title: "Balance",
        formatter: (value) => money(value),
        sizing: 22,
        cellClass: ["strong", "align-right"],
        headerClass: "align-right",
        sorter: (row) => row.balance,
      },
      {
        key: "change",
        title: "Monthly change",
        formatter: (value) => signedPercent(value as number | null),
        sizing: 22,
        cellClass: [
          "comparison",
          "align-right",
          (row) =>
            row.change === null
              ? "is-muted"
              : row.change <= 0
                ? "is-positive"
                : "is-negative",
        ],
        headerClass: "align-right",
        sorter: (row) => row.change ?? Number.NEGATIVE_INFINITY,
      },
    ];
  }

  #renderChart(rows: readonly MonthlyDebtRow[]): void {
    const isBalance = this.#chartDisplay === "balance";
    const data: DataChartData = {
      year: this.#year,
      format: "monthly",
      ariaLabel: `${isBalance ? "Monthly debt balance" : "Monthly debt payments"} for ${this.#year}`,
      series: [
        {
          type: isBalance ? "line" : "bar",
          variant: "primary",
          label: isBalance ? "Balance" : "Payments",
          points: rows.map((row) => ({
            date: row.month,
            value: isBalance ? row.balance : row.payments,
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
          item.type === "debt" &&
          item.active !== false,
      );
    if (!account) {
      router.navigate("investment-debts", { year: String(this.#year) });
      return;
    }

    this.querySelector<HTMLElement>("#debt-detail-title")!.textContent =
      account.name;
    this.querySelector<HTMLElement>("#debt-detail-subtitle")!.textContent =
      `Viewing summary for ${this.#year}`;

    const allRows = this.#allRows();
    this.#renderChart(allRows);
    this.#filterBar.availableFilters = [
      { key: "payments", title: "Payments", dataType: "number" },
      { key: "balance", title: "Balance", dataType: "number" },
      { key: "change", title: "Monthly change", dataType: "number" },
    ];
    const rows = allRows.filter(
      (row) =>
        matchesDebtHistorySearch(row, this.#query) &&
        matchesLedgerFilterGroups(row, this.#filters),
    );
    this.#rows = rows;
    this.#empty.hidden = rows.length > 0;

    const totalPayments = allRows.reduce(
      (total, row) => total + row.payments,
      0,
    );
    const latestRow = allRows.at(-1);
    const latestBalance = latestRow?.balance ?? 0;
    const priorYearMonth = latestRow
      ? `${this.#year - 1}-${latestRow.month.slice(5, 7)}`
      : "";
    const priorYearBalance = APIs.accounts
      .balances()
      .find(
        (item) =>
          item.accountId === this.#accountId &&
          item.month === priorYearMonth,
      );
    const annualChange = priorYearBalance
      ? percentageChange(latestBalance, Number(priorYearBalance.balance || 0))
      : null;
    const hasFullYear = new Set(allRows.map((row) => row.month)).size === 12;

    this.querySelector<HTMLElement>(
      "#debt-detail-summary-payments",
    )!.textContent = money(totalPayments);
    this.querySelector<HTMLElement>(
      "#debt-detail-summary-balance",
    )!.textContent = money(latestBalance);
    this.querySelector<HTMLElement>(
      "#debt-detail-summary-change",
    )!.textContent = signedPercent(annualChange);

    const periodLabel = hasFullYear ? "Annual change" : "YTD change";
    const data: DataTableData<MonthlyDebtRow> = {
      columns: this.#columns(),
      rows,
      interactiveRows: true,
      rowKey: (row) => row.id,
      footer: {
        cells: [
          periodLabel,
          money(totalPayments),
          money(latestBalance),
          signedPercent(annualChange),
        ],
        ariaLabel: `${periodLabel} ${signedPercent(annualChange)}`,
      },
    };
    this.#table.data = data;
  }
}

if (!customElements.get("investment-debt-detail-screen")) {
  customElements.define(
    "investment-debt-detail-screen",
    InvestmentDebtDetailScreen,
  );
}
