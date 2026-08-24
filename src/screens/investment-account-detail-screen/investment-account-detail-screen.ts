import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { InvestmentView } from "../../utilities/investment-view";
import { escapeHTML, money, netFlows } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

export class InvestmentAccountDetailScreen extends HTMLElement implements EventListenerObject {
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
      window.addEventListener("budget:investments-changed", this);
      window.addEventListener("budget:investments-loaded", this);
    }
    this.#render();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("click", this);
    this.removeEventListener("keydown", this);
    window.removeEventListener("budget:investments-changed", this);
    window.removeEventListener("budget:investments-loaded", this);
  }

  handleEvent(event: Event): void {
    if (event.type.startsWith("budget:")) return this.#render();
    if ((event.target as Element | null)?.closest("#edit-investment-account")) {
      router.updateParams({ drawer: "investment-account", investmentAccountId: this.#accountId, investmentLedgerSource: "investment" });
      return;
    }
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    const row = (event.target as Element | null)?.closest<HTMLElement>("[data-month]");
    if (!row) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    router.updateParams({ drawer: "investment-month", investmentAccountId: this.#accountId, investmentMonth: row.dataset.month, investmentLedgerSource: "investment" });
  }

  #render(): void {
    const account = APIs.investment.accounts().find((item) => item.id === this.#accountId && item.active !== false);
    if (!account) {
      if (APIs.investment.isLoaded()) router.navigate("investment-accounts", { year: String(this.#year) });
      return;
    }
    this.querySelector<HTMLElement>("#investment-detail-title")!.textContent = account.name;
    this.querySelector<HTMLElement>("#investment-detail-subtitle")!.textContent = `Viewing summary for ${this.#year}`;
    const rows = APIs.investment.balances().filter((item) => item.accountId === this.#accountId && item.month.startsWith(`${this.#year}-`)).sort((a, b) => b.month.localeCompare(a.month));
    const flows = APIs.investment.contributions();
    let total = 0;
    this.querySelector<HTMLTableSectionElement>("#investment-account-history-body")!.innerHTML = rows.map((balance) => {
      const contribution = netFlows(flows.filter((item) => item.accountId === this.#accountId && item.month === balance.month));
      total += contribution;
      return `<tr tabindex="0" role="button" data-month="${balance.month}"><th scope="row">${escapeHTML(InvestmentView.formatMonth(balance.month))}</th><td class="is-number">${money(contribution)}</td><td class="is-number is-total">${money(balance.balance)}</td></tr>`;
    }).join("");
    this.querySelector<HTMLTableSectionElement>("#investment-account-history-footer")!.innerHTML = rows.length ? `<tr><th scope="row">Year total</th><td class="is-number">${money(total)}</td><td class="is-number">${money(rows[0].balance)}</td></tr>` : "";
    this.querySelector<HTMLElement>("#investment-account-history-wrap")!.hidden = rows.length === 0;
    this.querySelector<HTMLElement>("#investment-account-history-empty")!.hidden = rows.length > 0;
  }
}

if (!customElements.get("investment-account-detail-screen")) customElements.define("investment-account-detail-screen", InvestmentAccountDetailScreen);
