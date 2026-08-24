// @ts-nocheck
import { APIs } from "../../api/api";
import { showToast } from "../toast-stack/toast-service";

const template = () => `
  <div class="form-field investment-account-select-field">
    <span class="investment-account-select-label">Investment account</span>
    <input class="id-input" type="hidden" />
    <dropdown-menu class="investment-account-menu" variant="editorial"
      label="Choose an account" icon="box" searchable search-action
      search-action-label="Add" search-placeholder="Search or add investment account" align-center>
    </dropdown-menu>
  </div>
`;

(function () {
  let nextId = 0;
  class InvestmentAccountSelect extends HTMLElement {
    static get observedAttributes() {
      return ["value"];
    }
    #dropdown = null;
    #options = [];
    #fallbackSelection = null;
    #getOptions = () =>
      APIs.investment.accounts().filter((item) => item.active !== false);
    #createOption = (name) =>
      APIs.investment.addAccount({ name, source: "manual" });
    #onCreate = (account) => {
      this.dispatchEvent(
        new CustomEvent("investment-account-created", {
          bubbles: true,
          detail: { account },
        }),
      );
      showToast(
        APIs.budget.getConfig().endpoint
          ? `${account.name} was added. Syncing…`
          : `${account.name} was added.`,
      );
    };

    get value() {
      return (
        this.#dropdown?.selection ||
        this.querySelector(".id-input")?.value ||
        this.getAttribute("value") ||
        ""
      );
    }
    set value(value) {
      const id = String(value || "");
      if (!this.#dropdown) {
        if (id) this.setAttribute("value", id);
        else this.removeAttribute("value");
        return;
      }
      this.#setValue(id);
    }
    get isOpen() {
      return this.#dropdown?.hasAttribute("is-open") || false;
    }
    setFallbackSelection(selection) {
      const id = String(selection?.id || "");
      this.#fallbackSelection = id
        ? {
            id,
            name: String(selection?.name || "Archived account"),
            archived: true,
          }
        : null;
      this.#refresh(this.value);
    }
    clearFallbackSelection() {
      this.#fallbackSelection = null;
      this.#refresh(this.value);
    }
    reportSelectionError(message) {
      const trigger = this.#dropdown?.querySelector(".dropdown-trigger");
      trigger?.setAttribute("aria-invalid", "true");
      trigger?.setAttribute("title", message);
      trigger?.focus();
    }
    closePopup({ focusTrigger = false } = {}) {
      this.#dropdown?.close();
      if (focusTrigger)
        this.#dropdown?.querySelector(".dropdown-trigger")?.focus();
    }

    connectedCallback() {
      const initialValue = Object.prototype.hasOwnProperty.call(this, "value")
        ? String(this.value || "")
        : this.getAttribute("value") || "";
      if (Object.prototype.hasOwnProperty.call(this, "value"))
        delete this.value;
      this.innerHTML = template();
      this.#dropdown = this.querySelector("dropdown-menu");
      const id = `investment-account-select-${++nextId}`;
      this.#dropdown.id = id;
      this.#dropdown.setAttribute("aria-label", "Choose an investment account");
      this.querySelector(".investment-account-select-label").id = `${id}-label`;
      this.#dropdown.setAttribute("aria-labelledby", `${id}-label ${id}`);
      this.#dropdown.addEventListener("dropdown-selection", this);
      this.#dropdown.addEventListener("search-action-pressed", this);
      this.#refresh(initialValue);
    }
    disconnectedCallback() {
      this.#dropdown?.removeEventListener("dropdown-selection", this);
      this.#dropdown?.removeEventListener("search-action-pressed", this);
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (name === "value" && oldValue !== newValue && this.#dropdown)
        this.#setValue(newValue || "");
    }
    handleEvent(event) {
      if (event.type === "dropdown-selection")
        this.#setValue(event.detail.value, true);
      else if (event.type === "search-action-pressed")
        this.#addAccount(event.detail.input);
      else if (event.type === "budget:investments-changed")
        this.#refresh(this.value);
    }
    #refresh(preferredValue = this.value) {
      if (!this.#dropdown) return;
      this.#options = this.#getOptions() || [];
      const options = [...this.#options];
      if (
        this.#fallbackSelection &&
        !options.some((item) => String(item.id) === this.#fallbackSelection.id)
      )
        options.push(this.#fallbackSelection);
      this.#dropdown.items = options.map((item) => ({
        key: String(item.id),
        title: `${item.name}${item.archived ? " (archived)" : ""}`,
        isDefaultValue: String(item.id) === String(preferredValue || ""),
      }));
      this.#setValue(preferredValue);
    }
    #setValue(id, announce = false) {
      const value = String(id || "");
      const item =
        this.#options.find((option) => String(option.id) === value) ||
        (this.#fallbackSelection?.id === value
          ? this.#fallbackSelection
          : null);
      this.querySelector(".id-input").value = item ? value : "";
      this.#dropdown.selection = item ? value : null;
      if (this.getAttribute("value") !== (item ? value : ""))
        item
          ? this.setAttribute("value", value)
          : this.removeAttribute("value");
      if (announce && item)
        this.dispatchEvent(
          new CustomEvent("investment-account-selected", {
            bubbles: true,
            detail: { account: item },
          }),
        );
    }
    async #addAccount(input) {
      const name = String(input || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!name) return;
      const existing = this.#options.find(
        (item) =>
          item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      if (existing) {
        this.#setValue(existing.id, true);
        this.closePopup({ focusTrigger: true });
        return;
      }
      try {
        const account = await this.#createOption(name);
        this.#refresh(account?.id || this.value);
        this.#setValue(account?.id, true);
        this.closePopup({ focusTrigger: true });
        this.#onCreate(account);
      } catch (error) {
        this.reportSelectionError(
          error?.message || "Unable to add investment account",
        );
      }
    }
  }
  customElements.define("investment-account-select", InvestmentAccountSelect);
})();
