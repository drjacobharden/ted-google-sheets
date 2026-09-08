import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { DateUtils } from "../../utilities/date-utilities";
import { showToast } from "../../components/toast-stack/toast-service";
import { TransactionFormController } from "../transaction-form-controller";
import templateString from "./template.html" with { type: "text" };
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import { SegmentedControl } from "../../components/segmented-control/segmented-control";
import { CategorySelect } from "../../components/dropdowns/category-select";
import { VendorSelect } from "../../components/dropdowns/vendor-select";
import { PeopleSelect } from "../../components/dropdowns/people-select";
import { AccountSelect } from "../../components/dropdowns/account-select";
import { SourceSelect } from "../../components/dropdowns/source-select";
import { PaymentTypeSelect } from "../../components/dropdowns/payment-type-select";
import type { AccountType } from "../../api/account-api";

const KIND_OPTIONS = [
  { key: "expense", title: "Expense", isDefaultValue: true },
  { key: "income", title: "Income" },
  { key: "account", title: "Accounts" },
];

export class NewTransactionScreen extends HTMLElement {
  #formController = new TransactionFormController();
  #form!: HTMLFormElement;
  #kindControl!: SegmentedControl;
  #inlineDatePicker: any;
  #compactDatePicker: any;
  #amountInput!: HTMLElement & {
    value: string;
    helper: string;
    min: string | null;
    focus(options?: FocusOptions): void;
  };
  #noteInput!: HTMLInputElement;
  #categorySelect!: CategorySelect;
  #vendorSelect!: VendorSelect;
  #peopleSelect!: PeopleSelect;
  #accountSelect!: AccountSelect;
  #sourceSelect!: SourceSelect;
  #paymentType!: PaymentTypeSelect;
  #message!: HTMLElement;
  #initialState = "";
  #accountRequestId = "";
  #expenseDraft = { categoryId: "", vendorId: "" };
  #incomeDraft = { categoryId: "", vendorId: "" };
  #selectedCategoryId: string | null = null;
  #selectedVendorId: string | null = null;
  #selectedAccountType: AccountType | null = null;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.innerHTML = templateString;
      this.#captureElements();
      this.#kindControl.items = KIND_OPTIONS;
      this.#bindEvents();
      this.#reset(DateUtils.toISODate(new Date()), false);
      if (router.currentParams().transactionKind === "account") {
        this.#setKind("account");
      }
    }
  }

  disconnectedCallback(): void {
    router.setNavigationGuard(null);
    this.#disconnectEvents();
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "budget:account-created":
        this.#handleAccountCreated(event);
        break;

      case "submit":
        this.#handleSubmit(event as SubmitEvent);
        break;

      case "segmented-control-selection":
        this.#handleKindSelection(event);
        break;

      case "date-change":
        handleCustomEvent("date-changed", event, ({ value }) => {
          this.#compactDatePicker.value = value;
          this.#inlineDatePicker.value = value;
        });
        break;

      case "account-selected":
        this.#handleAccountSelected(event as CustomEvent);
        break;

      case "payment-type-change":
        this.#syncSourceVisibility();
        break;

      case "click":
        if ((event.target as HTMLElement).closest('[data-action="open-import"]'))
          router.navigate("import");
        else if (
          (event.target as HTMLElement).closest(
            '[data-action="submit-transaction"]',
          )
        )
          this.#form.requestSubmit();
        break;

      default:
        break;
    }
  }

  #captureElements(): void {
    this.#form = this.querySelector("#new-transaction-form")!;
    this.#kindControl = this.querySelector("#new-transaction-kind")!;
    this.#inlineDatePicker = this.querySelector("#new-transaction-date-inline");
    this.#compactDatePicker = this.querySelector(
      "#new-transaction-date-compact",
    );
    this.#amountInput = this.querySelector("currency-input")!;
    this.#categorySelect = this.querySelector("category-select")!;
    this.#vendorSelect = this.querySelector("vendor-select")!;
    this.#peopleSelect = this.querySelector("people-select")!;
    this.#accountSelect = this.querySelector("account-select")!;
    this.#sourceSelect = this.querySelector("source-select")!;
    this.#paymentType = this.querySelector("#new-transaction-payment-type")!;
    this.#message = this.querySelector("#new-transaction-message")!;
    this.#noteInput = this.querySelector("#new-transaction_notes")!;

    this.querySelectorAll(
      ".new-transaction-page__detail-list dropdown-menu",
    ).forEach((dropdown) => {
      dropdown.removeAttribute("align-start");
      dropdown.removeAttribute("align-center");
      dropdown.setAttribute("align-end", "");
    });
  }

  #bindEvents(): void {
    this.#form.addEventListener("submit", this);
    this.addEventListener("click", this);
    this.#kindControl.addEventListener("segmented-control-selection", this);
    this.#inlineDatePicker.addEventListener("date-change", this);
    this.#compactDatePicker.addEventListener("date-change", this);
    this.#accountSelect.addEventListener("account-selected", this);
    this.#paymentType.addEventListener("payment-type-change", this);
    addListener("budget:account-created", window, this);
  }

  #disconnectEvents() {
    this.#form.removeEventListener("submit", this);
    this.removeEventListener("click", this);
    this.#kindControl.removeEventListener("segmented-control-selection", this);
    this.#inlineDatePicker.removeEventListener("date-change", this);
    this.#compactDatePicker.removeEventListener("date-change", this);
    this.#accountSelect.removeEventListener("account-selected", this);
    this.#paymentType.removeEventListener("payment-type-change", this);
    removeListener("budget:account-created", window, this);
  }

  #state(): string {
    return JSON.stringify({
      kind: this.#formController.kind,
      amount: this.#amountInput.value,
      paymentType: this.#paymentType.value,
      date: this.#dateValue,
      categoryId: this.#categorySelect.value,
      vendorId: this.#vendorSelect.value,
      assignmentId: this.#peopleSelect.value,
      accountId: this.#accountSelect.value,
      source: this.#sourceSelect.value,
      notes: this.#noteInput.value,
    });
  }

  #handleKindSelection = (event: Event): void => {
    this.#kindControl.handleSelection(event, ({ value }) => {
      const current = this.#formController.kind;

      if (current === "expense") {
        this.#expenseDraft = {
          categoryId: this.#categorySelect.value,
          vendorId: this.#vendorSelect.value,
        };
      } else if (current === "income") {
        this.#incomeDraft = {
          categoryId: this.#categorySelect.value,
          vendorId: this.#vendorSelect.value,
        };
      }

      this.#setKind(value);
    });
  };

  #setKind(value: string): void {
    const kind = this.#formController.setKind(value);
    const isAccount = kind === "account";
    const isIncome = kind === "income";
    this.#kindControl.selection = kind;
    this.#categorySelect.hidden = isAccount;
    this.#categorySelect.type = isIncome ? "income" : "expense";
    this.#categorySelect.value = null;
    this.#vendorSelect.hidden = isAccount;
    this.#vendorSelect.toggleAttribute("optional", isIncome);
    this.#peopleSelect.hidden = isAccount;
    this.#accountSelect.hidden = !isAccount;
    this.#amountInput.min = "0.01";
    this.#paymentType.kind = kind;
    this.#paymentType.accountType = isAccount
      ? this.#selectedAccountType
      : null;

    this.#sourceSelect.value =
      value === "income" ? "manual" : this.#sourceSelect.value;
    this.#syncSourceVisibility();

    this.#sourceSelect.tooltip =
      value === "expense"
        ? "Expenses paid through a paycheck deduction (like health insurance) are counted as both income and an expense."
        : value === "account"
          ? "Investments and debt payments paid through paycheck deductions are counted as both income and an account transfer."
          : "";
  }

  #syncSourceVisibility(): void {
    const isIncome = this.#formController.kind === "income";
    const isBalance =
      this.#formController.kind === "account" &&
      this.#paymentType.value === "balance";
    this.#sourceSelect.hidden = isIncome || isBalance;
  }

  #handleAccountSelected = (event: CustomEvent): void => {
    const account = event.detail.account;
    this.#selectedAccountType = account?.type || null;
    this.#paymentType.accountType = this.#selectedAccountType;
    this.#sourceSelect.value = account?.source || "manual";
  };

  get #dateValue(): string {
    return this.#compactDatePicker.value || this.#inlineDatePicker.value || "";
  }

  #setDateValue(value: string): void {
    this.#inlineDatePicker.value = value;
    this.#compactDatePicker.value = value;
  }

  #handleAccountCreated = (event: Event): void => {
    handleCustomEvent(
      "budget:account-created",
      event,
      ({ account, requestId }) => {
        if (!this.#accountRequestId || requestId !== this.#accountRequestId)
          return;

        this.#accountRequestId = "";
        this.#accountSelect.value = account.id;
        this.#selectedAccountType = account.type || null;
        this.#paymentType.accountType = this.#selectedAccountType;
        this.#sourceSelect.value = account.source || "manual";
      },
    );
  };

  #showSelectionError(component: any, text: string): void {
    this.#message.className = "form-message error";
    this.#message.textContent = text;
    component.reportSelectionError?.(text);
  }

  #validate(kind: string): boolean {
    if (!this.#dateValue) {
      const compact = window.matchMedia("(max-width: 960px)").matches;
      this.#showSelectionError(
        compact ? this.#compactDatePicker : this.#inlineDatePicker,
        "Choose a transaction date.",
      );
      return false;
    }
    if (kind === "account") {
      if (!this.#accountSelect.value) {
        this.#showSelectionError(this.#accountSelect, "Choose an account.");
        return false;
      }
      return true;
    }
    if (!this.#categorySelect.value) {
      this.#showSelectionError(this.#categorySelect, "Choose a category.");
      return false;
    }
    if (kind === "expense" && !this.#vendorSelect.value) {
      this.#showSelectionError(
        this.#vendorSelect,
        "Choose a vendor for this expense.",
      );
      return false;
    }
    if (!this.#peopleSelect.value) {
      this.#showSelectionError(this.#peopleSelect, "Choose an assignment.");
      return false;
    }
    return true;
  }

  #handleSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    this.#message.textContent = "";
    this.#message.className = "form-message";
    const kind = this.#formController.kind;
    if (!this.#validate(kind)) return;
    if (!this.#form.checkValidity()) {
      this.#form.reportValidity();
      this.#message.className = "form-message error";
      this.#message.textContent = "Complete the required fields before saving.";
      return;
    }

    const values = new FormData(this.#form);
    try {
      if (kind === "account" && this.#paymentType.value === "balance") {
        const accountId = this.#accountSelect.value;
        const date = this.#dateValue;
        const month = date.slice(0, 7);
        const current = APIs.accounts.monthData(accountId, month);
        if (current?.balance?.asOfDate && current.balance.asOfDate >= date) {
          this.#message.className = "form-message error";
          this.#message.textContent =
            "A later balance already exists for this month.";
          return;
        }
        await APIs.accounts.saveMonth({
          accountId,
          month,
          balance: values.get("amount") as string,
          asOfDate: date,
          balanceId: current?.balance?.id,
          existingActivity: current?.activity || [],
          activity: current?.activity || [],
        });
        showToast("Balance added. Syncing…");
        this.#reset(date, true);
        return;
      }
      APIs.budget.queueTransaction(
        this.#formController.buildDraft({
          kind,
          amount: this.#paymentType.signedAmount(
            values.get("amount") as string,
          ),
          date: this.#dateValue,
          categoryId: this.#categorySelect.value,
          vendorId: this.#vendorSelect.value,
          assignmentId: this.#peopleSelect.value,
          accountId: this.#accountSelect.value,
          notes: values.get("notes") as string,
          source: this.#sourceSelect.value,
        }),
      );
      showToast("Transaction added. Syncing…");
      this.#reset(this.#dateValue, true);
    } catch (error) {
      this.#message.className = "form-message error";
      this.#message.textContent =
        error instanceof Error ? error.message : "Unable to add transaction.";
    }
  };

  #reset(date: string, announce: boolean): void {
    const activeKind = this.#formController.kind;
    this.#expenseDraft = { categoryId: "", vendorId: "" };
    this.#incomeDraft = {
      categoryId: APIs.budget.INCOME_CATEGORY_ID,
      vendorId: "",
    };
    this.#amountInput.value = "";
    this.#noteInput.value = "";
    this.#setDateValue(date);
    this.#categorySelect.clearFallbackSelection?.();
    this.#vendorSelect.clearFallbackSelection?.();
    this.#peopleSelect.clearFallbackSelection?.();
    this.#accountSelect.value = "";
    this.#selectedAccountType = null;
    this.#paymentType.value = "positive";
    this.#paymentType.accountType = null;
    this.#sourceSelect.value = "manual";
    this.#vendorSelect.value = "";
    this.#peopleSelect.value = APIs.budget.SHARED_ASSIGNMENT_ID;
    this.#setKind(activeKind);
    if (activeKind === "income") {
      this.#categorySelect.value = APIs.budget.INCOME_CATEGORY_ID;
    }
    this.#message.className = announce
      ? "form-message success"
      : "form-message";
    this.#message.textContent = announce
      ? "Transaction added. Ready for the next one."
      : "";
    this.#initialState = this.#state();
    queueMicrotask(() => {
      this.#initialState = this.#state();
      if (announce) this.#amountInput.focus({ preventScroll: true });
    });
  }
}

if (!customElements.get("new-transaction-screen")) {
  customElements.define("new-transaction-screen", NewTransactionScreen);
}
