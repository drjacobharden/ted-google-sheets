import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { InvestmentView } from "../../utilities/investment-view";
import { createTransactionRow } from "../../utilities/transaction-row";
import { dateRangeDetail, eventTargetElement, isInvestmentSource, type DateRangePickerElement, type DateRangeValue } from "../../utilities/ui-utilities";
import { APIs } from "../../api/api";
import { money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays household savings and investment summary metrics. */
export class DashboardScreen extends HTMLElement implements EventListenerObject {
  #rangePicker!: DateRangePickerElement;
  #summary!: HTMLElement;
  #trend!: HTMLElement;
  #breakdown!: HTMLElement;
  #range: DateRangeValue = { start: "", end: "" };
  #cleanupTrend: (() => void) | null = null;
  #listening = false;

  /** Initializes the dashboard and subscribes to investment and transaction events. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "dashboard";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#range = this.#rangePicker.value;
    this.addEventListener("date-range-changed", this);
    window.addEventListener("budget:investments-changed", this);
    window.addEventListener("budget:investments-loaded", this);
    window.addEventListener("budget:transaction-saved", this);
    window.addEventListener("budget:transaction-queued", this);
    this.#render();
  }

  /** Removes dashboard listeners and chart interactions when disconnected. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#cleanupTrend?.();
    this.#cleanupTrend = null;
    this.removeEventListener("date-range-changed", this);
    window.removeEventListener("budget:investments-changed", this);
    window.removeEventListener("budget:investments-loaded", this);
    window.removeEventListener("budget:transaction-saved", this);
    window.removeEventListener("budget:transaction-queued", this);
  }

  /** Updates the selected range or rerenders when application data changes. */
  handleEvent(event: Event): void {
    if (event.type === "date-range-changed") {
      if (event.target !== this.#rangePicker) return;
      const range = dateRangeDetail(event);
      if (range) this.#range = range;
    }
    this.#render();
  }

  /** Captures the typed elements cloned from the dashboard template. */
  #captureElements(): void {
    this.#rangePicker = this.querySelector<DateRangePickerElement>("date-range-picker")!;
    this.#summary = this.querySelector<HTMLElement>("#dashboard-summary")!;
    this.#trend = this.querySelector<HTMLElement>("#dashboard-trend")!;
    this.#breakdown = this.querySelector<HTMLElement>("#dashboard-breakdown")!;
  }

  /** Renders summary cards, investment trend, and savings breakdown. */
  #render(): void {
    const view = InvestmentView;
    const transactions = appController.getTransactions() ?? APIs.budget.getCachedTransactions() ?? [];
    const totals = APIs.investment.calculate(transactions, this.#range);
    const monthRange = view.monthRangeFromDates(this.#range);
    const metrics = view.metrics(monthRange);
    this.#summary.innerHTML =
      view.card("Total savings", money(totals.totalSavings)) +
      view.card("Budget surplus", money(totals.budgetSurplus)) +
      view.card("Paycheck investing", money(totals.paycheckContributions), "Counted in savings") +
      view.card("Income", money(totals.income)) +
      view.card("Spending", money(totals.spending)) +
      view.card("Investment balance", money(metrics.balance));
    this.#cleanupTrend?.();
    this.#cleanupTrend = view.mountTrend(this.#trend, { range: monthRange, includeContributions: false });
    this.#breakdown.innerHTML = [
      ["Budget surplus", totals.budgetSurplus],
      ["Paycheck net flows", totals.paycheckContributions],
      ["Manual net flows", totals.manualContributions],
    ].map(([label, value]) => `<div><span>${label}</span><strong>${money(value)}</strong></div>`).join("") +
      '<p class="transfer-note">Paycheck contributions are added to Total savings and withdrawals reduce them. Manual transfers are excluded because they allocate savings already counted in income minus spending.</p>';
  }
}

if (!customElements.get("dashboard-screen")) customElements.define("dashboard-screen", DashboardScreen);
