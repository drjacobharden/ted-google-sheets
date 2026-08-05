import { APIs } from "../../api/api";
import type { InvestmentAccount } from "../../api/investment-api";
import { appRouter, eventTargetElement, investmentView, isInvestmentSource } from "../../utilities/legacy-runtime";
import { registerLegacyRouteAdapter } from "../../utilities/legacy-route-adapter";
import { escapeHTML, messageFromError, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays investment accounts and the account creation form. */
export class InvestmentAccountsScreen extends HTMLElement implements EventListenerObject {
  #form!: HTMLFormElement;
  #message!: HTMLElement;
  #list!: HTMLElement;
  #count!: HTMLElement;
  #includeArchived = false;
  #listening = false;

  /** Initializes the screen and subscribes to investment data events. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "investment-accounts";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#form.addEventListener("submit", this);
    this.#list.addEventListener("click", this);
    this.#list.addEventListener("keydown", this);
    window.addEventListener("budget:investments-changed", this);
    window.addEventListener("budget:investments-loaded", this);
    this.#render();
  }

  /** Removes the listeners owned by this route screen. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#form.removeEventListener("submit", this);
    this.#list.removeEventListener("click", this);
    this.#list.removeEventListener("keydown", this);
    window.removeEventListener("budget:investments-changed", this);
    window.removeEventListener("budget:investments-loaded", this);
  }

  /** Routes form, row, and application events to the corresponding behavior. */
  handleEvent(event: Event): void {
    if (event.type === "submit") this.#handleSubmit(event);
    else if (event.type === "click") this.#handleListClick(event);
    else if (event.type === "keydown") this.#handleListKeydown(event);
    else this.#render();
  }

  /** Captures the typed elements cloned from the screen template. */
  #captureElements(): void {
    this.#form = this.querySelector<HTMLFormElement>("#investment-account-form")!;
    this.#message = this.querySelector<HTMLElement>(".investment-accounts-screen__message")!;
    this.#list = this.querySelector<HTMLElement>("#investment-account-list")!;
    this.#count = this.querySelector<HTMLElement>("#investment-account-count")!;
  }

  /** Renders all active investment accounts and their latest balances. */
  #render(): void {
    const accounts = APIs.investment
      .accounts()
      .filter((account) => this.#includeArchived || account.active !== false);
    const latest = investmentView().latestByAccount();
    this.#count.textContent = `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`;
    if (!accounts.length) {
      this.#list.innerHTML = '<div class="investment-accounts-screen__empty">Add your first investment account.</div>';
      return;
    }
    this.#list.replaceChildren(...accounts.map((account) => this.#createAccountRow(account, Number(latest.get(account.id)?.balance ?? 0))));
  }

  /** Creates an accessible row for an investment account. */
  #createAccountRow(account: InvestmentAccount, balance: number): HTMLElement {
    const row = document.createElement("article");
    row.className = "investment-accounts-screen__item";
    row.dataset.investmentAccount = account.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `View ${account.name} balance history`);
    row.innerHTML = `<span class="investment-accounts-screen__avatar" aria-hidden="true">${escapeHTML(account.name.charAt(0).toUpperCase())}</span><div class="investment-accounts-screen__details"><strong>${escapeHTML(account.name)}</strong><p>${investmentView().sourceLabel(account.source)}</p></div><strong class="investment-accounts-screen__balance">${money(balance)}</strong>`;
    return row;
  }

  /** Navigates to an investment account selected by mouse or keyboard. */
  #openAccount(row: HTMLElement | null): void {
    const accountId = row?.dataset.investmentAccount;
    if (accountId) appRouter().navigate("investment-account-detail", { accountId });
  }

  /** Handles pointer activation inside the account list. */
  #handleListClick(event: Event): void {
    this.#openAccount(eventTargetElement(event)?.closest<HTMLElement>("[data-investment-account]") ?? null);
  }

  /** Handles keyboard activation inside the account list. */
  #handleListKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " ")) return;
    const row = eventTargetElement(event)?.closest<HTMLElement>("[data-investment-account]") ?? null;
    if (!row) return;
    event.preventDefault();
    this.#openAccount(row);
  }

  /** Creates a new investment account from validated form values. */
  #handleSubmit(event: Event): void {
    event.preventDefault();
    this.#message.textContent = "";
    if (!this.#form.checkValidity()) {
      this.#form.reportValidity();
      return;
    }
    const data = new FormData(this.#form);
    const name = data.get("name");
    const source = data.get("source");
    if (typeof name !== "string" || !isInvestmentSource(source)) return;
    try {
      const account = APIs.investment.addAccount({ name, source });
      this.#form.reset();
      const nameInput = this.#form.elements.namedItem("name");
      if (nameInput instanceof HTMLInputElement) nameInput.focus();
      this.#setMessage(`${account.name} added. Syncing…`, "success");
      this.#render();
    } catch (error: unknown) {
      this.#setMessage(messageFromError(error), "error");
    }
  }

  /** Updates the accessible form message and visual state. */
  #setMessage(message: string, state: "success" | "error"): void {
    this.#message.className = `investment-accounts-screen__message ${state}`;
    this.#message.textContent = message;
  }
}

if (!customElements.get("investment-accounts-screen")) customElements.define("investment-accounts-screen", InvestmentAccountsScreen);
registerLegacyRouteAdapter("InvestmentAccountsRoute");
