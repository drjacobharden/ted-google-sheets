import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { InvestmentView } from "../../utilities/investment-view";
import { createTransactionRow } from "../../utilities/transaction-row";
import { dateRangeDetail, eventTargetElement, isInvestmentSource, type DateRangePickerElement, type DateRangeValue } from "../../utilities/ui-utilities";
import type { BudgetTransaction } from "../../api/budget-api";
import { escapeHTML, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template"); template.innerHTML = templateString;
const PAGE_SIZE = 250;

export class TransactionScreen extends HTMLElement implements EventListenerObject {
  #query = ""; #type = "all"; #range: DateRangeValue = { start: "", end: "", preset: "month" }; #limit = PAGE_SIZE;
  #list!: HTMLElement; #search!: HTMLInputElement; #typeFilter!: HTMLSelectElement;
  #balance!: HTMLElement; #income!: HTMLElement; #expenses!: HTMLElement;
  #table!: HTMLElement; #message!: HTMLElement; #count!: HTMLElement; #pagination!: HTMLElement; #loadMore!: HTMLButtonElement;
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true"; this.classList.add("screen"); this.dataset.screen = "transactions";
      this.append(template.content.cloneNode(true)); this.#capture();
      const picker = this.querySelector<HTMLElement & { value?: DateRangeValue }>("date-range-picker");
      if (picker?.value) this.#range = picker.value;
    }
    if (this.#listening) return; this.#listening = true;
    this.#list.addEventListener("click", this); this.#list.addEventListener("keydown", this);
    this.#search.addEventListener("input", this); this.#typeFilter.addEventListener("change", this); this.#loadMore.addEventListener("click", this);
    this.addEventListener("date-range-changed", this);
    ["budget:transaction-sync-changed", "budget:transaction-saved", "budget:transactions-loaded", "budget:transaction-removed", "budget:transaction-restored", "budget:transaction-queued"].forEach(name => window.addEventListener(name, this));
    window.addEventListener("budget:transactions-load-error", this);
    appController.areTransactionsLoaded() ? this.#render() : this.#loading();
  }
  disconnectedCallback(): void {
    if (!this.#listening) return; this.#listening = false;
    this.#list.removeEventListener("click", this); this.#list.removeEventListener("keydown", this);
    this.#search.removeEventListener("input", this); this.#typeFilter.removeEventListener("change", this); this.#loadMore.removeEventListener("click", this);
    this.removeEventListener("date-range-changed", this);
    ["budget:transaction-sync-changed", "budget:transaction-saved", "budget:transactions-loaded", "budget:transaction-removed", "budget:transaction-restored", "budget:transaction-queued", "budget:transactions-load-error"].forEach(name => window.removeEventListener(name, this));
  }
  handleEvent(event: Event): void {
    if (event.type === "input") { this.#query = this.#search.value.trim().toLowerCase(); this.#limit = PAGE_SIZE; }
    else if (event.type === "change" && event.currentTarget === this.#typeFilter) { this.#type = this.#typeFilter.value; this.#limit = PAGE_SIZE; }
    else if (event.type === "date-range-changed" && event instanceof CustomEvent) { this.#range = event.detail; this.#limit = PAGE_SIZE; }
    else if (event.type === "click" && event.currentTarget === this.#loadMore) this.#limit += PAGE_SIZE;
    else if (event.type === "click" || event.type === "keydown") {
      const keyboard = event instanceof KeyboardEvent;
      if (keyboard && event.key !== "Enter" && event.key !== " ") return;
      const row = (event.target as Element | null)?.closest<HTMLElement>("tr[data-transaction-id]");
      if (row?.dataset.transactionId) { if (keyboard) event.preventDefault(); router.updateParams({ drawer: "edit", transactionId: row.dataset.transactionId }); }
      return;
    } else if (event.type === "budget:transactions-load-error") { this.#loadError(event as CustomEvent); return; }
    this.#render();
  }
  #capture(): void {
    this.#list = this.querySelector("#transaction-list")!; this.#search = this.querySelector("#transaction-search")!; this.#typeFilter = this.querySelector("#type-filter")!;
    this.#balance = this.querySelector("#summary-balance")!; this.#income = this.querySelector("#summary-income")!; this.#expenses = this.querySelector("#summary-expenses")!;
    this.#table = this.querySelector("#transaction-table-wrap")!; this.#message = this.querySelector("#transaction-state")!; this.#count = this.querySelector("#transaction-count")!;
    this.#pagination = this.querySelector("#transaction-pagination")!; this.#loadMore = this.querySelector("#load-more-transactions")!;
  }
  #ranged(): BudgetTransaction[] { return appController.getTransactions().filter(item => (!this.#range.start || item.date >= this.#range.start) && (!this.#range.end || item.date <= this.#range.end)); }
  #items(): BudgetTransaction[] {
    return this.#ranged().filter(item => this.#type === "all" || item.type === this.#type).filter(item => !this.#query || [item.category, item.vendor, item.assignment || "Shared", item.notes].some(value => String(value || "").toLowerCase().includes(this.#query))).sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }
  #render(): void {
    const ranged = this.#ranged(); const income = ranged.filter(x => x.type === "income").reduce((s,x)=>s+Number(x.amount||0),0); const expenses = ranged.filter(x => x.type !== "income").reduce((s,x)=>s+Number(x.amount||0),0);
    this.#income.textContent = money(income); this.#expenses.textContent = money(expenses); this.#balance.textContent = money(income-expenses);
    const items = this.#items(); const visible = items.slice(0, this.#limit);
    this.#count.textContent = visible.length < items.length ? `Showing ${visible.length} of ${items.length} transactions` : `${items.length} ${items.length === 1 ? "transaction" : "transactions"}`;
    if (!items.length) { this.#table.hidden = true; this.#pagination.hidden = true; this.#message.hidden = false; const filtered = Boolean(this.#query || this.#type !== "all" || this.#range.preset !== "all"); this.#message.innerHTML = `<div class="empty-symbol" aria-hidden="true">${filtered ? "?" : "$"}</div><h3>${filtered ? "No matches found" : "Your ledger is ready"}</h3><p>${filtered ? "Try changing your search or filter." : "Add your first transaction and it will appear here."}</p>`; return; }
    this.#list.replaceChildren(...visible.map(createTransactionRow)); this.#message.hidden = true; this.#table.hidden = false; this.#pagination.hidden = visible.length >= items.length;
  }
  #loading(): void { this.#table.hidden = true; this.#message.hidden = false; this.#message.innerHTML = '<div class="spinner" aria-hidden="true"></div><p>Loading your transactions…</p>'; }
  #loadError(event: CustomEvent): void { this.#table.hidden = true; this.#message.hidden = false; this.#message.innerHTML = `<div class="empty-symbol" aria-hidden="true">!</div><h3>We couldn’t load your sheet</h3><p>${escapeHTML(event.detail?.error?.message)} Check the URL and deployment access in Settings.</p>`; }
}
if (!customElements.get("transaction-list-screen")) customElements.define("transaction-list-screen", TransactionScreen);
