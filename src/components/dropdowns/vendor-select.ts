// @ts-nocheck
import { APIs } from "../../api/api";
import { showToast } from "../toast-stack/toast-service";

const vendorSelectTemplate = () => `
  <div class="form-field vendor-form-field">
    <span class="vendor-select-label">Vendor</span>
    <input class="id-input" name="vendorId" type="hidden" />
    <dropdown-menu 
      class="vendor-select-menu" 
      variant="editorial"
      label="Select a vendor" icon="cart" 
      searchable 
      search-action
      search-action-label="Add" 
      search-placeholder="Search or add vendor"
      align-center 
    ></dropdown-menu>
  </div>
`;

export class VendorSelect extends HTMLElement {
  static get observedAttributes() {
    return ["value"];
  }
  #dropdown = null;
  #form = null;
  #options = [];
  #fallbackSelection = null;
  #getOptions = () => APIs.budget.listVendors();
  #createOption = (name) => APIs.budget.addVendor({ name });
  #onCreate = (vendor) => {
    this.dispatchEvent(
      new CustomEvent("vendor-created", {
        bubbles: true,
        detail: { vendor },
      }),
    );
    showToast(
      APIs.budget.getConfig().endpoint
        ? `${vendor.name} was added. Syncing…`
        : `${vendor.name} was added.`,
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

  set value(vendorId) {
    const id = String(vendorId || "");
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
          name: String(selection?.name || "Archived vendor"),
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

  configureOptions({ getOptions, createOption, onCreate } = {}) {
    if (typeof getOptions === "function") this.#getOptions = getOptions;
    if (typeof createOption === "function") this.#createOption = createOption;
    if (typeof onCreate === "function") this.#onCreate = onCreate;
    this.#refresh(this.value);
  }

  connectedCallback() {
    const initialValue = Object.prototype.hasOwnProperty.call(this, "value")
      ? String(this.value || "")
      : this.getAttribute("value") || "";
    if (Object.prototype.hasOwnProperty.call(this, "value")) delete this.value;

    this.innerHTML = vendorSelectTemplate();
    this.#form = this.closest("form");
    this.#dropdown = this.querySelector("dropdown-menu");
    this.#dropdown.setAttribute("aria-label", "Select a vendor");
    this.#dropdown.addEventListener("dropdown-selection", this);
    this.#dropdown.addEventListener("search-action-pressed", this);
    this.#refresh(initialValue);
    this.#form?.addEventListener("reset", this);
    window.addEventListener("budget:vendors-changed", this);
    this.#syncOptionalLabel();
  }

  disconnectedCallback() {
    this.#dropdown?.removeEventListener("dropdown-selection", this);
    this.#dropdown?.removeEventListener("search-action-pressed", this);
    this.#form?.removeEventListener("reset", this);
    window.removeEventListener("budget:vendors-changed", this);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "value" && oldValue !== newValue && this.#dropdown) {
      this.#setValue(newValue || "");
    }
    if (name === "optional" && oldValue !== newValue) {
      this.#syncOptionalLabel();
    }
  }

  #syncOptionalLabel() {
    const label = this.querySelector(".vendor-select-label");
    if (!label) return;
    label.querySelector("small")?.remove();
    if (this.hasAttribute("optional"))
      label.insertAdjacentHTML("beforeend", "<small>(optional)</small>");
  }

  handleEvent(event) {
    if (event.type === "dropdown-selection") {
      this.#setValue(event.detail.value, true);
    } else if (event.type === "search-action-pressed") {
      this.#addVendor(event.detail.input);
    } else if (event.type === "reset") {
      setTimeout(() => this.#refresh("", true), 0);
    } else if (event.type === "budget:vendors-changed") {
      this.#refresh(this.value);
    }
  }

  #refresh(preferredValue = this.value, resetSearch = false) {
    if (!this.#dropdown) return;
    this.#options = this.#getOptions() || [];
    const options = [...this.#options];
    if (
      this.#fallbackSelection &&
      !options.some((item) => String(item.id) === this.#fallbackSelection.id)
    ) {
      options.push(this.#fallbackSelection);
    }
    this.#dropdown.items = options.map((item) => ({
      key: String(item.id),
      title: `${item.name}${item.archived ? " (archived)" : ""}`,
      isDefaultValue: String(item.id) === String(preferredValue || ""),
    }));
    this.#setValue(preferredValue);
    if (resetSearch) this.#dropdown.close();
  }

  #setValue(id, announce = false) {
    const value = String(id || "");
    const item =
      this.#options.find((option) => String(option.id) === value) ||
      (this.#fallbackSelection?.id === value ? this.#fallbackSelection : null);
    this.querySelector(".id-input").value = item ? value : "";
    this.#dropdown.selection = item ? value : null;
    if (this.getAttribute("value") !== (item ? value : "")) {
      if (item) this.setAttribute("value", value);
      else this.removeAttribute("value");
    }
    if (announce && item) {
      this.dispatchEvent(
        new CustomEvent("vendor-selected", {
          bubbles: true,
          detail: { vendor: item },
        }),
      );
    }
  }

  async #addVendor(input) {
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
      const vendor = await this.#createOption(name);
      this.#refresh(vendor?.id || this.value);
      this.#setValue(vendor?.id, true);
      this.closePopup({ focusTrigger: true });
      this.#onCreate(vendor);
    } catch (error) {
      this.reportSelectionError(error?.message || "Unable to add vendor");
    }
  }
}

customElements.define("vendor-select", VendorSelect);
