// @ts-nocheck
import { APIs } from "../../api/api";
import { showToast } from "../toast-stack/toast-service";
import { parsePayeeKey, payeeKey, payeeOptions, type PayeeOption } from "./payee-select-options";

const payeeSelectTemplate = () => `
  <div class="form-field vendor-form-field">
    <span class="vendor-select-label">Vendor / Account</span>
    <input class="id-input" name="payeeKey" type="hidden" />
    <dropdown-menu
      class="vendor-select-menu"
      variant="editorial"
      label="Select a vendor or account"
      icon="cart"
      searchable
      search-action
      search-action-label="Add vendor"
      search-placeholder="Search vendors or accounts"
      align-start
    ></dropdown-menu>
  </div>`;

export class PayeeSelect extends HTMLElement {
  static get observedAttributes() { return ["value"]; }
  #dropdown: any = null;
  #options: PayeeOption[] = [];
  #getVendors = () => APIs.budget.listVendors();
  #createVendor = (name: string) => APIs.budget.addVendor({ name });
  #onCreate = (vendor: any) => {
    showToast(APIs.budget.getConfig().endpoint ? `${vendor.name} was added. Syncing…` : `${vendor.name} was added.`);
  };

  get value() {
    return this.#dropdown?.selection || this.querySelector<HTMLInputElement>(".id-input")?.value || this.getAttribute("value") || "";
  }

  set value(value: string) {
    if (!this.#dropdown) this.setAttribute("value", String(value || ""));
    else this.#setValue(String(value || ""));
  }

  configureOptions({ getVendors, createVendor, onCreate } = {} as any) {
    if (typeof getVendors === "function") this.#getVendors = getVendors;
    if (typeof createVendor === "function") this.#createVendor = createVendor;
    if (typeof onCreate === "function") this.#onCreate = onCreate;
    this.#refresh(this.value);
  }

  connectedCallback() {
    const initial = this.getAttribute("value") || "";
    this.innerHTML = payeeSelectTemplate();
    this.#dropdown = this.querySelector("dropdown-menu");
    this.#dropdown.setAttribute("aria-label", "Select a vendor or account");
    this.#dropdown.addEventListener("dropdown-selection", this);
    this.#dropdown.addEventListener("search-action-pressed", this);
    window.addEventListener("budget:vendors-changed", this);
    window.addEventListener("budget:accounts-changed", this);
    this.#refresh(initial);
  }

  disconnectedCallback() {
    this.#dropdown?.removeEventListener("dropdown-selection", this);
    this.#dropdown?.removeEventListener("search-action-pressed", this);
    window.removeEventListener("budget:vendors-changed", this);
    window.removeEventListener("budget:accounts-changed", this);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "value" && oldValue !== newValue && this.#dropdown) this.#setValue(newValue || "");
  }

  handleEvent(event: any) {
    if (event.type === "dropdown-selection") this.#setValue(event.detail.value, true);
    else if (event.type === "search-action-pressed") void this.#addVendor(event.detail.input);
    else this.#refresh(this.value);
  }

  #refresh(preferred = this.value) {
    if (!this.#dropdown) return;
    this.#options = payeeOptions(this.#getVendors() || [], APIs.accounts.accounts());
    this.#dropdown.items = this.#options.map((item) => ({
      key: payeeKey(item.kind, item.id),
      title: item.name,
      group: item.group,
      isDefaultValue: payeeKey(item.kind, item.id) === preferred,
    }));
    this.#setValue(preferred);
  }

  #setValue(value: string, announce = false) {
    const selection = parsePayeeKey(value);
    const option = selection
      ? this.#options.find((item) => item.kind === selection.kind && item.id === selection.id)
      : null;
    const key = option ? payeeKey(option.kind, option.id) : "";
    const input = this.querySelector<HTMLInputElement>(".id-input");
    if (input) input.value = key;
    this.#dropdown.selection = key || null;
    if (this.getAttribute("value") !== key) key ? this.setAttribute("value", key) : this.removeAttribute("value");
    if (announce && option) {
      this.dispatchEvent(new CustomEvent("payee-selected", { bubbles: true, detail: { value: key, kind: option.kind, record: option.record } }));
    }
  }

  async #addVendor(input: string) {
    const name = String(input || "").trim().replace(/\s+/g, " ");
    if (!name) return;
    const existing = this.#options.find((item) => item.kind === "vendor" && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      this.#setValue(payeeKey("vendor", existing.id), true);
      this.#dropdown.close();
      return;
    }
    try {
      const vendor = await this.#createVendor(name);
      this.#refresh(payeeKey("vendor", vendor.id));
      this.#setValue(payeeKey("vendor", vendor.id), true);
      this.#dropdown.close();
      this.#onCreate(vendor);
    } catch (error: any) {
      const trigger = this.#dropdown?.querySelector(".dropdown-trigger");
      trigger?.setAttribute("aria-invalid", "true");
      trigger?.setAttribute("title", error?.message || "Unable to add vendor");
    }
  }
}

if (!customElements.get("payee-select")) customElements.define("payee-select", PayeeSelect);
