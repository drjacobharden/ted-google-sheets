import type { AccountType } from "../../api/account-api";
import { DropdownMenu } from "../dropdown-menu/dropdown-menu";
import {
  amountForPaymentType,
  paymentTypeKeyForAmount,
  paymentTypeOptions,
  type PaymentKind,
  type PaymentTypeKey,
} from "./payment-type";

export class PaymentTypeSelect extends HTMLElement {
  static get observedAttributes() {
    return ["kind", "account-type", "value"];
  }

  #dropdown!: DropdownMenu;
  #kind: PaymentKind = "expense";
  #accountType: AccountType | null = null;
  #value: PaymentTypeKey = "positive";

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.innerHTML = `
        <dropdown-menu
          class="payment-type-menu"
          variant="editorial"
          label="Select a payment type"
        ></dropdown-menu>
      `;
      this.#dropdown = this.querySelector("dropdown-menu")!;
    }

    this.#dropdown ??= this.querySelector("dropdown-menu")!;
    this.#dropdown.addEventListener("dropdown-selection", this);

    this.#kind = this.#normalizeKind(this.getAttribute("kind"));
    this.#accountType = this.#normalizeAccountType(
      this.getAttribute("account-type"),
    );
    this.#value = this.#normalizeValue(this.getAttribute("value"));
    this.#render();
  }

  disconnectedCallback(): void {
    this.#dropdown?.removeEventListener("dropdown-selection", this);
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue || !this.#dropdown) return;
    if (name === "kind") this.#kind = this.#normalizeKind(newValue);
    if (name === "account-type") {
      this.#accountType = this.#normalizeAccountType(newValue);
    }
    if (name === "value") this.#value = this.#normalizeValue(newValue);
    this.#render();
  }

  handleEvent(event: Event): void {
    if (event.type !== "dropdown-selection") return;
    const value = (event as CustomEvent).detail?.value;
    this.#setValue(this.#normalizeValue(value), true);
  }

  get kind(): PaymentKind {
    return this.#kind;
  }

  set kind(value: PaymentKind | string) {
    this.setAttribute("kind", this.#normalizeKind(value));
  }

  get accountType(): AccountType | null {
    return this.#accountType;
  }

  set accountType(value: AccountType | string | null) {
    const normalized = this.#normalizeAccountType(value);
    if (normalized) this.setAttribute("account-type", normalized);
    else this.removeAttribute("account-type");
  }

  get value(): PaymentTypeKey {
    return this.#value;
  }

  set value(value: PaymentTypeKey | string) {
    this.#setValue(this.#normalizeValue(value), false);
  }

  setFromSignedAmount(amount: number | string): void {
    this.value = paymentTypeKeyForAmount(amount);
  }

  signedAmount(amount: number | string): number {
    return amountForPaymentType(amount, this.#value);
  }

  #setValue(value: PaymentTypeKey, emit: boolean): void {
    this.#value = value;
    if (this.getAttribute("value") !== value) {
      this.setAttribute("value", value);
    } else {
      this.#render();
    }

    if (!emit) return;
    const options = paymentTypeOptions(this.#kind, this.#accountType);
    this.dispatchEvent(
      new CustomEvent("payment-type-change", {
        bubbles: true,
        detail: {
          value,
          title: options[
            value === "negative" ? 1 : value === "balance" ? 2 : 0
          ],
        },
      }),
    );
  }

  #render(): void {
    if (!this.#dropdown) return;
    const options = paymentTypeOptions(this.#kind, this.#accountType);
    this.#dropdown.items = options.map((title, index) => {
      const key = index === 0 ? "positive" : index === 1 ? "negative" : "balance";
      return { key, title, isDefaultValue: this.#value === key };
    });
    this.#dropdown.selection = this.#value;
  }

  #normalizeKind(value: string | null): PaymentKind {
    return value === "income" || value === "account" ? value : "expense";
  }

  #normalizeAccountType(value: string | null): AccountType | null {
    return value === "investment" || value === "debt" ? value : null;
  }

  #normalizeValue(value: string | null): PaymentTypeKey {
    if (value === "balance" && this.#kind === "account") return "balance";
    return value === "negative" ? "negative" : "positive";
  }
}

if (!customElements.get("payment-type-select")) {
  customElements.define("payment-type-select", PaymentTypeSelect);
}
