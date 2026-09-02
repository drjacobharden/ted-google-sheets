import { APIs } from "../../api/api";
import { router } from "../../router/router";
import type { RouteChangedEventDetail } from "../../router/types";
import { InvestmentView } from "../../utilities/investment-view";
import { escapeHTML, money, netFlows } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface YearRange {
  start: string;
  end: string;
}

function rangeForYear(year: number): YearRange {
  const today = new Date();
  const endMonth =
    year === today.getFullYear()
      ? String(today.getMonth() + 1).padStart(2, "0")
      : "12";
  return { start: `${year}-01`, end: `${year}-${endMonth}` };
}

function previousRange(range: YearRange): YearRange {
  const year = Number(range.start.slice(0, 4)) - 1;
  return { start: `${year}-01`, end: `${year}-${range.end.slice(5, 7)}` };
}

function overviewMoney(value: number): string {
  return money(value, Math.abs(value) < 1);
}

function comparisonText(value: number, previous: number, year: number): string {
  const delta = value - previous;
  if (Math.abs(delta) < 0.005) return `No change vs ${year - 1}`;
  return `${delta > 0 ? "+" : "−"} ${overviewMoney(Math.abs(delta))} vs ${year - 1}`;
}

function comparisonClass(value: number, inverse = false): string {
  if (Math.abs(value) < 0.005) return "";
  return (inverse ? value < 0 : value > 0) ? "is-positive" : "is-negative";
}

function annualActivityText(value: number, year: number): string {
  return `${value < 0 ? "−" : "+"} ${overviewMoney(Math.abs(value))} in ${year}`;
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat(undefined, {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      }).format(value);
}

/** Displays the year-scoped investment overview and account totals. */
export class InvestmentOverviewScreen
  extends HTMLElement
  implements EventListenerObject
{
  #trend!: HTMLElement;
  #tableBody!: HTMLElement;
  #tableFooter!: HTMLElement;
  #empty!: HTMLElement;
  #cleanupTrend: (() => void) | null = null;
  #year = new Date().getFullYear();
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "investment-overview";
      this.append(template.content.cloneNode(true));
      this.#trend = this.querySelector("#investment-trend")!;
      this.#tableBody = this.querySelector("#investment-account-totals")!;
      this.#tableFooter = this.querySelector("#investment-account-footer")!;
      this.#empty = this.querySelector("#investment-accounts-empty")!;
    }
    if (this.#listening) return;
    this.#listening = true;
    window.addEventListener("app:route-changed", this);
    window.addEventListener("budget:accounts-changed", this);
    window.addEventListener("budget:accounts-loaded", this);
    this.addEventListener("click", this);
    this.addEventListener("keydown", this);
    this.#readYear();
    this.#render();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#cleanupTrend?.();
    this.#cleanupTrend = null;
    window.removeEventListener("app:route-changed", this);
    window.removeEventListener("budget:accounts-changed", this);
    window.removeEventListener("budget:accounts-loaded", this);
    this.removeEventListener("click", this);
    this.removeEventListener("keydown", this);
  }

  handleEvent(event: Event): void {
    if (event.type === "click" || event.type === "keydown") {
      if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
      const row = (event.target as Element | null)?.closest<HTMLElement>("[data-account-id]");
      if (row?.dataset.accountId) {
        if (event instanceof KeyboardEvent) event.preventDefault();
        router.navigate("investment-account-detail", { accountId: row.dataset.accountId, year: String(this.#year) });
      }
      return;
    }
    if (event.type === "app:route-changed") {
      const detail = (event as CustomEvent<RouteChangedEventDetail>).detail;
      if (detail.name !== "investment-overview") return;
      this.#readYear(detail.params.year);
    }
    this.#render();
  }

  #readYear(value: unknown = router.currentParams().year): void {
    const year = Number(value);
    if (Number.isInteger(year)) this.#year = year;
  }

  #setText(selector: string, value: string): void {
    const element = this.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  #setComparison(
    selector: string,
    value: number,
    previous: number,
    inverse = false,
  ): void {
    const element = this.querySelector<HTMLElement>(selector);
    if (!element) return;
    element.textContent = comparisonText(value, previous, this.#year);
    element.className = comparisonClass(value - previous, inverse);
  }

  #setAnnualActivity(selector: string, value: number, inverse = false): void {
    const element = this.querySelector<HTMLElement>(selector);
    if (!element) return;
    element.textContent = annualActivityText(value, this.#year);
    element.className = comparisonClass(value, inverse);
  }

  #render(): void {
    const range = rangeForYear(this.#year);
    const previous = InvestmentView.metrics(previousRange(range));
    const values = InvestmentView.metrics(range);
    const activeAccountIds = new Set(
      APIs.accounts.accounts()
        .filter((account) => account.type === "investment" && account.active !== false)
        .map((account) => account.id),
    );
    const lifetimeContributions = netFlows(
      APIs.accounts.investmentActivity()
        .filter(
          (item) =>
            activeAccountIds.has(item.accountId) && item.month <= range.end,
        ),
    );
    const debtRows = APIs.accounts
      .balances()
      .filter((item) => item.asOfDate <= `${range.end}-31`);
    const debt = APIs.accounts
      .accounts()
      .filter((item) => item.type === "debt" && item.active !== false)
      .reduce(
        (sum, account) =>
          sum +
          Number(
            debtRows.filter((item) => item.accountId === account.id).at(-1)
              ?.balance || 0,
          ),
        0,
      );
    const previousDebt = APIs.accounts
      .accounts()
      .filter((item) => item.type === "debt" && item.active !== false)
      .reduce(
        (sum, account) =>
          sum +
          Number(
            APIs.accounts
              .balances()
              .filter(
                (item) =>
                  item.accountId === account.id && item.month < range.start,
              )
              .at(-1)?.balance || 0,
          ),
        0,
      );
    const annualDebtChange = previousDebt - debt;

    this.#setText("#investment-liquid-net-worth", overviewMoney(values.balance - debt));
    this.#setText("#investment-total-balance", overviewMoney(values.balance));
    this.#setText(
      "#investment-total-contributions",
      overviewMoney(lifetimeContributions),
    );
    this.#setText("#investment-total-debt", overviewMoney(debt));
    this.#setAnnualActivity(
      "#investment-balance-comparison",
      values.balance - previous.balance,
    );
    this.#setAnnualActivity(
      "#investment-contributions-comparison",
      values.contributions,
    );
    this.#setAnnualActivity(
      "#investment-debt-comparison",
      annualDebtChange,
      true,
    );
    this.#cleanupTrend?.();
    this.#cleanupTrend = InvestmentView.mountTrend(this.#trend, {
      range,
      includeContributions: true,
      fullYear: this.#year,
    });
    this.#renderAccounts(range);
  }

  #renderAccounts(range: YearRange): void {
    const accounts = APIs.accounts
      .accounts()
      .filter((account) => account.type === "investment" && account.active !== false);
    const balances = InvestmentView.latestByAccount(range.end);
    const previousBalances = InvestmentView.latestByAccount(previousRange(range).end);
    const flows = APIs.accounts.investmentActivity();
    const rows = accounts.map((account) => {
      const balance = Number(balances.get(account.id)?.balance ?? 0);
      const contributions = netFlows(
        flows.filter(
          (item) =>
            item.accountId === account.id &&
            item.month >= range.start &&
            item.month <= range.end,
        ),
      );
      const previousBalance = Number(previousBalances.get(account.id)?.balance ?? 0);
      const growth = previousBalance === 0 ? null : (balance - previousBalance) / Math.abs(previousBalance);
      const roi = InvestmentView.accountPerformance(account.id, this.#year).rate;
      return { account, balance, previousBalance, contributions, growth, roi };
    });
    const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
    const totalContributions = rows.reduce(
      (sum, row) => sum + row.contributions,
      0,
    );
    const totalPreviousBalance = rows.reduce((sum, row) => sum + row.previousBalance, 0);
    const totalGrowth = totalPreviousBalance === 0 ? null : (totalBalance - totalPreviousBalance) / Math.abs(totalPreviousBalance);
    const portfolio = InvestmentView.portfolioPerformance(this.#year);
    const totalRoi = portfolio.available ? portfolio.rate : null;

    this.#empty.hidden = rows.length > 0;
    this.#tableBody.innerHTML = rows
      .map(
        ({ account, balance, contributions, growth, roi }) => `
      <tr tabindex="0" data-account-id="${account.id}"><th scope="row">${escapeHTML(account.name)}</th><td>${escapeHTML(InvestmentView.sourceLabel(account.source))}</td><td class="is-number">${overviewMoney(contributions)}</td><td class="is-number">${overviewMoney(balance)}</td><td class="is-number ${comparisonClass(growth ?? 0)}">${percent(growth)}</td><td class="is-number ${comparisonClass(roi ?? 0)}">${percent(roi)}</td></tr>`,
      )
      .join("");
    this.#tableFooter.innerHTML = rows.length
      ? `
      <tr><th scope="row" colspan="2">All accounts</th><td class="is-number">${overviewMoney(totalContributions)}</td><td class="is-number">${overviewMoney(totalBalance)}</td><td class="is-number ${comparisonClass(totalGrowth ?? 0)}">${percent(totalGrowth)}</td><td class="is-number ${comparisonClass(totalRoi ?? 0)}">${percent(totalRoi)}</td></tr>`
      : "";
  }
}

if (!customElements.get("investment-overview-screen")) {
  customElements.define("investment-overview-screen", InvestmentOverviewScreen);
}
