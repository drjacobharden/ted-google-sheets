// @ts-nocheck
import { APIs } from "../../api/api";
import { showToast } from "../toast-stack/toast-service";

let nextId = 0;
class AccountSelect extends HTMLElement {
  #dropdown = null;
  static get observedAttributes() { return ["value", "account-type", "label"]; }
  get accountType() { return this.getAttribute("account-type") === "debt" ? "debt" : "investment"; }
  get value() { return this.#dropdown?.selection || this.getAttribute("value") || ""; }
  set value(value) { if (this.#dropdown) this.#setValue(value); else this.setAttribute("value", String(value || "")); }
  connectedCallback() {
    const id = `account-select-${++nextId}`;
    const label = this.getAttribute("label") || "Account";
    this.innerHTML = `<div class="form-field account-select-field"><span class="account-select-label" id="${id}-label">${label}</span><dropdown-menu variant="editorial" label="Choose an account" icon="box" searchable search-action search-action-label="Add" search-placeholder="Search or add account" aria-labelledby="${id}-label"></dropdown-menu></div>`;
    this.#dropdown = this.querySelector("dropdown-menu");
    this.#dropdown.addEventListener("dropdown-selection", (event) => this.#setValue(event.detail.value, true));
    this.#dropdown.addEventListener("search-action-pressed", (event) => this.#create(event.detail.input));
    window.addEventListener("budget:accounts-changed", () => this.#refresh());
    this.#refresh();
  }
  attributeChangedCallback(name, oldValue, newValue) { if (oldValue !== newValue && this.#dropdown) { if (name === "account-type") this.removeAttribute("value"); this.#refresh(); } }
  #items() { return APIs.accounts.accounts().filter((item) => item.type === this.accountType && item.active !== false); }
  #refresh() { if (!this.#dropdown) return; const value = this.value; this.#dropdown.items = this.#items().map((item) => ({ key: item.id, title: item.name, isDefaultValue: item.id === value })); this.#setValue(value); }
  #setValue(value, announce = false) { const account = this.#items().find((item) => item.id === String(value)); this.#dropdown.selection = account?.id || null; if (account) this.setAttribute("value", account.id); else this.removeAttribute("value"); if (announce && account) this.dispatchEvent(new CustomEvent("account-selected", { bubbles: true, detail: { account } })); }
  async #create(value) { const name = String(value || "").trim(); if (!name) return; try { const account = await APIs.accounts.saveAccount({ name, type: this.accountType, ...(this.accountType === "investment" ? { source: "manual" } : {}) }); this.#refresh(); this.#setValue(account.id, true); showToast(`${account.name} was added.`); } catch (error) { showToast(error?.message || "Unable to add account."); } }
}
if (!customElements.get("account-select")) customElements.define("account-select", AccountSelect);
