import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { InvestmentView } from "../../utilities/investment-view";
import { createTransactionRow } from "../../utilities/transaction-row";
import { dateRangeDetail, eventTargetElement, isInvestmentSource, type DateRangePickerElement, type DateRangeValue } from "../../utilities/ui-utilities";
import { APIs } from "../../api/api";
import { escapeHTML, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays aggregate investment balances, growth, trend, and allocation. */
export class InvestmentOverviewScreen extends HTMLElement implements EventListenerObject {
  #rangePicker!: DateRangePickerElement;
  #summary!: HTMLElement;
  #trend!: HTMLElement;
  #coverage!: HTMLElement;
  #allocation!: HTMLElement;
  #dateRange: DateRangeValue = { start: "", end: "" };
  #cleanupTrend: (() => void) | null = null;
  #listening = false;

  /** Initializes the overview and subscribes to investment data events. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "investment-overview";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#dateRange = this.#rangePicker.value;
    this.addEventListener("date-range-changed", this);
    window.addEventListener("budget:investments-changed", this);
    window.addEventListener("budget:investments-loaded", this);
    this.#render();
  }

  /** Removes overview listeners and chart interactions when disconnected. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#cleanupTrend?.();
    this.#cleanupTrend = null;
    this.removeEventListener("date-range-changed", this);
    window.removeEventListener("budget:investments-changed", this);
    window.removeEventListener("budget:investments-loaded", this);
  }

  /** Updates the selected range or rerenders when investment data changes. */
  handleEvent(event: Event): void {
    if (event.type === "date-range-changed") {
      if (event.target !== this.#rangePicker) return;
      const range = dateRangeDetail(event);
      if (range) this.#dateRange = range;
    }
    this.#render();
  }

  /** Captures the typed elements cloned from the overview template. */
  #captureElements(): void {
    this.#rangePicker = this.querySelector<DateRangePickerElement>("date-range-picker")!;
    this.#summary = this.querySelector<HTMLElement>("#investment-summary")!;
    this.#trend = this.querySelector<HTMLElement>("#investment-trend")!;
    this.#coverage = this.querySelector<HTMLElement>("#investment-coverage")!;
    this.#allocation = this.querySelector<HTMLElement>("#investment-allocation")!;
  }

  /** Renders investment summary cards, trend coverage, and account allocation. */
  #render(): void {
    const view = InvestmentView;
    const range = view.monthRangeFromDates(this.#dateRange);
    const values = view.metrics(range);
    this.#summary.innerHTML =
      view.card("Current balance", money(values.balance)) +
      view.card("Net contributions", money(values.contributions)) +
      view.card("Investment growth", values.covered ? money(values.growth) : "Not available", values.covered ? `${values.covered} of ${values.total} accounts covered` : "Needs a prior snapshot");
    this.#cleanupTrend?.();
    this.#cleanupTrend = view.mountTrend(this.#trend, { range, includeContributions: true });
    this.#coverage.textContent = values.total
      ? `Growth coverage: ${values.covered} of ${values.total} active accounts${values.stale ? ` · ${values.stale} carried forward from an earlier month` : ""}.`
      : "Add an account to begin.";
    const latest = view.latestByAccount(range.end || "9999-12");
    const accounts = APIs.investment.accounts()
      .filter((account) => account.active !== false)
      .map((account) => ({ account, balance: Number(latest.get(account.id)?.balance ?? 0) }))
      .filter((item) => item.balance > 0)
      .sort((left, right) => right.balance - left.balance);
    const total = accounts.reduce((sum, item) => sum + item.balance, 0);
    this.#allocation.innerHTML = accounts.length
      ? `<h3>Allocation</h3>${accounts.map((item) => `<div class="investment-overview-screen__allocation-row"><div><span>${escapeHTML(item.account.name)}</span><strong>${Math.round((item.balance / total) * 100)}%</strong></div><div class="investment-overview-screen__allocation-track"><span style="width:${(item.balance / total) * 100}%"></span></div><small>${view.sourceLabel(item.account.source)} · ${money(item.balance)}</small></div>`).join("")}`
      : "";
  }
}

if (!customElements.get("investment-overview-screen")) customElements.define("investment-overview-screen", InvestmentOverviewScreen);
