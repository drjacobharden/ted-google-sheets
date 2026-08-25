import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { InvestmentView } from "../../utilities/investment-view";
import { escapeHTML, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

export class InvestmentDebtDetailScreen extends HTMLElement implements EventListenerObject {
  #accountId = "";
  #year = new Date().getFullYear();
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.append(template.content.cloneNode(true));
    }
    const params = router.currentParams();
    this.#accountId = params.accountId ?? "";
    this.#year = Number(params.year) || new Date().getFullYear();
    if (!this.#listening) {
      this.#listening = true;
      this.addEventListener("click", this);
      this.addEventListener("keydown", this);
      window.addEventListener("budget:debts-changed", this);
    }
    this.#render();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("click", this);
    this.removeEventListener("keydown", this);
    window.removeEventListener("budget:debts-changed", this);
  }

  handleEvent(event: Event): void {
    if (event.type === "budget:debts-changed") return this.#render();
    if ((event.target as Element | null)?.closest("#edit-debt-account")) {
      router.updateParams({ drawer: "investment-account", investmentAccountId: this.#accountId, investmentLedgerSource: "debt-account" });
      return;
    }
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    const row = (event.target as Element | null)?.closest<HTMLElement>("[data-month]");
    if (!row) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    router.updateParams({ drawer: "investment-month", investmentAccountId: this.#accountId, investmentMonth: row.dataset.month, investmentLedgerSource: "debt" });
  }

  #render(): void {
    const account = APIs.accounts.accounts().find((item) => item.id === this.#accountId && item.type === "debt" && item.active !== false);
    if (!account) {
      router.navigate("investment-debts", { year: String(this.#year) });
      return;
    }
    this.querySelector<HTMLElement>("#debt-detail-title")!.textContent = account.name;
    this.querySelector<HTMLElement>("#debt-detail-subtitle")!.textContent = `Viewing summary for ${this.#year}`;
    const rows = APIs.accounts.balances().filter((item) => item.accountId === this.#accountId && item.month.startsWith(`${this.#year}-`)).sort((a, b) => b.month.localeCompare(a.month));
    const payments = APIs.accounts.activity();
    let paid = 0;
    let borrowed = 0;
    this.querySelector<HTMLTableSectionElement>("#debt-history-body")!.innerHTML = rows.map((balance) => {
      const monthFlows = payments.filter((item) => item.accountId === this.#accountId && item.month === balance.month);
      const monthPaid = monthFlows.filter((item) => item.activityType === "payment").reduce((sum, item) => sum + item.amount, 0);
      const monthBorrowed = monthFlows.filter((item) => item.activityType === "borrowing").reduce((sum, item) => sum + item.amount, 0);
      paid += monthPaid;
      borrowed += monthBorrowed;
      return `<tr tabindex="0" role="button" data-month="${balance.month}"><th scope="row">${escapeHTML(InvestmentView.formatMonth(balance.month))}</th><td class="is-number">${money(monthPaid)}</td><td class="is-number">${money(monthBorrowed)}</td><td class="is-number is-total">${money(balance.balance)}</td></tr>`;
    }).join("");
    this.querySelector<HTMLTableSectionElement>("#debt-history-footer")!.innerHTML = rows.length ? `<tr><th scope="row">Year total</th><td class="is-number">${money(paid)}</td><td class="is-number">${money(borrowed)}</td><td class="is-number">${money(rows[0].balance)}</td></tr>` : "";
    this.querySelector<HTMLElement>("#debt-history-wrap")!.hidden = rows.length === 0;
    this.querySelector<HTMLElement>("#debt-history-empty")!.hidden = rows.length > 0;
  }
}

if (!customElements.get("investment-debt-detail-screen")) customElements.define("investment-debt-detail-screen", InvestmentDebtDetailScreen);
