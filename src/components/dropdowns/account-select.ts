import { AccountType } from "../../api/account-api";
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import { CustomButton } from "../button/button";
import { DropdownMenu } from "../dropdown-menu/dropdown-menu";
import {
  accountSelectGroup,
  accountsForSelect,
  type AccountSelectScope,
} from "./account-select-options";

export class AccountSelect extends HTMLElement {
  #dropdown!: DropdownMenu;
  #trigger!: CustomButton;
  #accountCreateRequestId = "";

  static get observedAttributes() {
    return ["value", "account-type", "label"];
  }

  get accountType(): AccountSelectScope {
    const type = this.getAttribute("account-type");
    return type === "debt" || type === "all" ? type : "investment";
  }

  get value() {
    return this.#dropdown?.selection || this.getAttribute("value") || "";
  }

  get isOpen() {
    return this.#dropdown?.hasAttribute("is-open") || false;
  }

  set value(value) {
    if (this.#dropdown) this.#setValue(value);
    else this.setAttribute("value", String(value || ""));
  }

  set accountType(type: AccountType | "all") {
    this.setAttribute("account-type", type);
  }

  reportSelectionError(message: string) {
    const trigger: CustomButton =
      this.#dropdown?.querySelector(".dropdown-trigger")!;
    trigger?.setAttribute("aria-invalid", "true");
    trigger?.setAttribute("title", message);
    trigger?.focus();
  }

  closePopup({ focusTrigger = false } = {}) {
    this.#dropdown?.close();
    if (focusTrigger) this.#trigger?.focus();
  }

  connectedCallback() {
    const label = this.getAttribute("label") || "Account";
    this.innerHTML = `
      <div class="form-field account-select-field">
        <span class="account-select-label">${label}</span>
        <dropdown-menu 
          variant="editorial" 
          label="Choose an account" 
          icon="box" 
          align-center
          searchable 
          search-action 
          search-action-label="Add" 
          search-placeholder="Search or add account">
        </dropdown-menu>
      </div>`;

    this.#dropdown = this.querySelector("dropdown-menu")!;
    this.#trigger = this.#dropdown?.querySelector(".dropdown-trigger")!;

    this.#dropdown.addListener(this);
    this.#dropdown.addSearchActionListener(this);
    addListener("budget:account-created", window, this);
    window.addEventListener("budget:accounts-changed", this);
    this.#refresh();
  }

  disconnectedCallback() {
    this.#dropdown.removeListener(this);
    this.#dropdown.removeSearchActionListener(this);
    removeListener("budget:account-created", window, this);
    window.removeEventListener("budget:accounts-changed", this);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "dropdown-selection":
        this.#dropdown.handleSelection(event, ({ value }) => {
          this.#setValue(value, true);
        });
        break;

      case "search-action-pressed":
        this.#dropdown.handleSearchActionPressed(event, ({ input }) => {
          this.#create(input);
        });
        break;

      case "budget:accounts-changed":
        this.#refresh();
        break;

      case "budget:account-created": {
        handleCustomEvent(
          "budget:account-created",
          event,
          ({ account, requestId }) => {
            const matchesType =
              account?.type === this.accountType || this.accountType === "all";
            const didNotRequest = requestId !== this.#accountCreateRequestId;

            if (!account || !matchesType || didNotRequest) return;
            this.#accountCreateRequestId = "";
            this.#refresh();
            this.#setValue(account.id, true);
            this.#trigger.label = account.name;
          },
        );
        break;
      }

      case "reset":
        setTimeout(() => {
          this.#dropdown.selection = null;
          this.value = "";
          this.#dropdown.close();
        }, 0);

      default:
        break;
    }
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue && this.#dropdown) {
      if (name === "account-type") this.removeAttribute("value");
      this.#refresh();
    }
  }

  #items() {
    return accountsForSelect(APIs.accounts.accounts(), this.accountType);
  }

  #refresh() {
    if (!this.#dropdown) return;
    const value = this.value;
    this.#dropdown.items = this.#items().map((item) => ({
      key: item.id,
      title: item.name,
      group: accountSelectGroup(item.type),
      isDefaultValue: item.id === value,
    }));
    this.#setValue(value);
  }

  #setValue(value: string, announce = false) {
    const account = this.#items().find((item) => item.id === String(value));
    this.#dropdown.selection = account?.id || null;
    if (account) this.setAttribute("value", account.id);
    else this.removeAttribute("value");
    if (announce && account)
      this.dispatchEvent(
        new CustomEvent("account-selected", {
          bubbles: true,
          detail: { account },
        }),
      );
  }

  #create(value: string) {
    const name = String(value || "").trim();

    this.closePopup();
    this.#accountCreateRequestId =
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    router.updateParams({
      drawer: "investment-account",
      investmentAccountId: null,
      investmentLedgerSource: "investment",
      accountDraftName: name,
      accountCreateRequestId: this.#accountCreateRequestId,
    });
    return;
  }
}

if (!customElements.get("account-select")) {
  customElements.define("account-select", AccountSelect);
}
