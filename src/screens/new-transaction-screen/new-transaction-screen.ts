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
import { latestDatePerMonth } from "./batch-entry";
import { CustomButton } from "../../components/button/button";

const KIND_OPTIONS = [
  { key: "budgeting", title: "Budgeting", isDefaultValue: true },
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
  #formGrid!: HTMLElement;
  #batchToggle!: HTMLInputElement;
  #batchList!: HTMLElement;
  #batchDetailsTitle!: HTMLElement;
  #batchCards!: HTMLElement;
  #addBatchEntry!: HTMLElement;
  #batchNotice!: HTMLElement;
  #singleAmount!: HTMLElement & { value: string; min: string | null };
  #batchMode = false;
  #batchDates: string[] = [];
  #batchAmountValues: string[] = [];
  #initialState = "";
  #accountRequestId = "";
  #budgetKind: "expense" | "income" = "expense";
  #selectedCategoryId: string | null = null;
  #selectedVendorId: string | null = null;
  #selectedAccountType: AccountType | null = null;
  #pendingCategoryCreate = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.innerHTML = templateString;
      this.#captureElements();
      this.#kindControl.items = KIND_OPTIONS;
      this.#bindEvents();
      this.#reset(DateUtils.toISODate(new Date()), false);
      if (router.currentParams().transactionKind === "account") {
        this.#setMode("account");
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

      case "change":
        if (event.target === this.#batchToggle) this.#toggleBatchMode();
        break;

      case "segmented-control-selection":
        this.#handleKindSelection(event);
        break;

      case "category-selected":
        this.#handleCategorySelection(event as CustomEvent);
        break;

      case "budget:category-created":
        this.#handleCategoryCreated(event as CustomEvent);
        break;

      case "app:route-changed":
        this.#handleRouteChanged(event as CustomEvent);
        break;

      case "date-change":
        this.#handleDateChange(event as CustomEvent);
        break;

      case "account-selected":
        this.#handleAccountSelected(event as CustomEvent);
        break;

      case "payment-type-change":
        this.#syncSourceVisibility();
        break;

      case "click":
        if (
          (event.target as HTMLElement).closest('[data-action="open-import"]')
        )
          router.navigate("import");
        else if (
          (event.target as HTMLElement).closest(
            '[data-action="add-batch-entry"]',
          )
        )
          this.#addBatchDate();
        else if ((event.target as HTMLElement).closest("[data-batch-remove]"))
          this.#removeBatchDate(
            Number(
              (event.target as HTMLElement)
                .closest("[data-batch-remove]")!
                .getAttribute("data-batch-remove"),
            ),
          );
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
    this.#formGrid = this.querySelector(".new-transaction-page__grid")!;
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
    this.#batchToggle = this.querySelector("#new-transaction-batch-toggle")!;
    this.#batchList = this.querySelector(".new-transaction-page__batch-list")!;
    this.#batchDetailsTitle = this.querySelector(
      ".new-transaction-page__batch-section-title",
    )!;
    this.#batchCards = this.querySelector(
      ".new-transaction-page__batch-cards",
    )!;
    this.#addBatchEntry = this.querySelector(
      '[data-action="add-batch-entry"]',
    )!;
    this.#batchNotice = this.querySelector(
      ".new-transaction-page__batch-notice",
    )!;
    this.#singleAmount = this.querySelector(
      ".new-transaction-page__amount-editor currency-input",
    )!;

    this.#categorySelect.configureOptions({
      onAddRequest: (name: string) => {
        this.#pendingCategoryCreate = true;
        router.updateParams({
          drawer: "entity-new",
          entityKind: "category",
          entityId: null,
          entityDraftName: name,
        });
      },
    });

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
    this.#batchToggle.addEventListener("change", this);
    this.addEventListener("click", this);
    this.#kindControl.addEventListener("segmented-control-selection", this);
    this.#categorySelect.addEventListener("category-selected", this);
    this.#inlineDatePicker.addEventListener("date-change", this);
    this.#compactDatePicker.addEventListener("date-change", this);
    this.#accountSelect.addEventListener("account-selected", this);
    this.#paymentType.addEventListener("payment-type-change", this);
    window.addEventListener("budget:category-created", this);
    window.addEventListener("app:route-changed", this);
    addListener("budget:account-created", window, this);
  }

  #disconnectEvents() {
    this.#form.removeEventListener("submit", this);
    this.#batchToggle.removeEventListener("change", this);
    this.removeEventListener("click", this);
    this.#kindControl.removeEventListener("segmented-control-selection", this);
    this.#categorySelect.removeEventListener("category-selected", this);
    this.#inlineDatePicker.removeEventListener("date-change", this);
    this.#compactDatePicker.removeEventListener("date-change", this);
    this.#accountSelect.removeEventListener("account-selected", this);
    this.#paymentType.removeEventListener("payment-type-change", this);
    window.removeEventListener("budget:category-created", this);
    window.removeEventListener("app:route-changed", this);
    removeListener("budget:account-created", window, this);
  }

  #handleCategoryCreated = (event: CustomEvent): void => {
    const category = event.detail?.category;
    if (!this.#pendingCategoryCreate || !category?.id) return;
    this.#pendingCategoryCreate = false;
    this.#categorySelect.select(category.id, true);
  };

  #handleRouteChanged = (event: CustomEvent): void => {
    const params = event.detail?.params;
    if (params?.drawer !== "entity-new" || params?.entityKind !== "category") {
      this.#pendingCategoryCreate = false;
    }
  };

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
      batchDates: this.#batchMode ? this.#batchDates : [],
      batchAmounts: this.#batchMode ? [...this.#batchAmountValues] : [],
    });
  }

  #handleKindSelection = (event: Event): void => {
    this.#kindControl.handleSelection(event, ({ value }) => {
      this.#setMode(value);
    });
  };

  #handleCategorySelection = (event: CustomEvent): void => {
    const type = event.detail?.category?.type;
    if (
      (type !== "expense" && type !== "income") ||
      this.#kindControl.selection === "account"
    ) {
      return;
    }

    this.#budgetKind = type;
    this.#syncMode();
  };

  #setMode(value: string): void {
    this.#kindControl.selection = value === "account" ? "account" : "budgeting";
    this.#syncMode();
  }

  #syncMode(): void {
    const isAccount = this.#kindControl.selection === "account";
    const kind = this.#formController.setKind(
      isAccount ? "account" : this.#budgetKind,
    );
    const typeInput =
      this.#form.querySelector<HTMLInputElement>('input[name="type"]');
    if (typeInput) typeInput.value = kind;
    this.#categorySelect.hidden = isAccount;
    this.#vendorSelect.hidden = isAccount;
    this.#vendorSelect.toggleAttribute(
      "optional",
      !isAccount && this.#budgetKind === "income",
    );
    this.#peopleSelect.hidden = isAccount;
    this.#accountSelect.hidden = !isAccount;
    this.#amountInput.min = "0.01";
    this.#categorySelect.setAttribute("create-type", this.#budgetKind);
    this.#paymentType.kind = kind;
    this.#paymentType.accountType = isAccount
      ? this.#selectedAccountType
      : null;

    if (!isAccount && this.#budgetKind === "income") {
      this.#sourceSelect.value = "manual";
    }
    this.#syncSourceVisibility();

    this.#sourceSelect.tooltip =
      kind === "expense"
        ? "Expenses paid through a paycheck deduction (like health insurance) are counted as both income and an expense."
        : kind === "account"
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
    return this.#batchMode
      ? this.#batchDates.at(-1) || ""
      : this.#compactDatePicker.value || this.#inlineDatePicker.value || "";
  }

  #handleDateChange(event: CustomEvent): void {
    if (this.#batchMode) {
      const picker = event.target as HTMLElement & { value: string };
      const card = picker.closest("[data-batch-index]") as HTMLElement | null;
      if (!card) return;
      const index = Number(card.dataset.batchIndex);
      const nextDate = event.detail?.value || picker.value;
      const previousDate = this.#batchDates[index];
      if (!nextDate) {
        picker.value = previousDate;
        this.#message.className = "form-message error";
        this.#message.textContent =
          "Choose a valid date for this batch entry.";
        return;
      }
      this.#batchDates[index] = nextDate;
      this.#renderBatchEntries();
      return;
    }
    handleCustomEvent("date-changed", event, ({ value }) => {
      this.#compactDatePicker.value = value;
      this.#inlineDatePicker.value = value;
    });
  }

  #toggleBatchMode(): void {
    const currentDate = this.#dateValue;
    this.#batchMode = !this.#batchMode;
    this.#batchNotice.hidden = true;
    this.#batchNotice.textContent = "";
    if (this.#batchMode) {
      const initialDate = currentDate || DateUtils.toISODate(new Date());
      this.#batchDates = [initialDate];
      this.#batchAmountValues = [this.#singleAmount.value];
      this.#batchToggle.checked = true;
    } else {
      const date = this.#batchDates.at(-1) || this.#dateValue;
      this.#singleAmount.value =
        this.#batchAmountValues.at(-1) || this.#singleAmount.value;
      this.#setDateValue(date);
      this.#batchDates = [];
      this.#batchAmountValues = [];
      this.#batchToggle.checked = false;
    }
    this.#renderBatchEntries();
  }

  #removeBatchDate(index: number): void {
    if (this.#batchDates.length <= 1) return;
    const existingPickers = [
      ...this.#batchCards.querySelectorAll("date-picker"),
    ] as Array<HTMLElement & { value: string }>;
    const existingAmounts = [
      ...this.#batchCards.querySelectorAll("currency-input"),
    ] as Array<HTMLElement & { value: string }>;
    if (existingPickers.length === this.#batchDates.length) {
      const currentDates = existingPickers.map(
        (picker, pickerIndex) => picker.value || this.#batchDates[pickerIndex],
      );
      const currentAmounts = currentDates.map(
        (_date, pickerIndex) => existingAmounts[pickerIndex]?.value || this.#batchAmountValues[pickerIndex] || "",
      );
      currentDates.splice(index, 1);
      currentAmounts.splice(index, 1);
      this.#batchDates = currentDates;
      this.#batchAmountValues = currentAmounts;
      this.#renderBatchEntries();
      return;
    }
    this.#batchDates.splice(index, 1);
    this.#batchAmountValues.splice(index, 1);
    this.#renderBatchEntries();
  }

  #syncBatchCardState(): void {
    const pickers = [
      ...this.#batchCards.querySelectorAll("date-picker"),
    ] as Array<HTMLElement & { value: string }>;
    const amounts = [
      ...this.#batchCards.querySelectorAll("currency-input"),
    ] as Array<HTMLElement & { value: string }>;
    if (pickers.length !== this.#batchDates.length) return;
    this.#batchDates = pickers.map(
      (picker, index) => picker.value || this.#batchDates[index],
    );
    this.#batchAmountValues = amounts.map(
      (amount, index) => amount.value || this.#batchAmountValues[index] || "",
    );
  }

  #addBatchDate(): void {
    this.#syncBatchCardState();
    const existingPickers = [
      ...this.#batchCards.querySelectorAll("date-picker"),
    ] as Array<HTMLElement & { value: string }>;
    if (existingPickers.length === this.#batchDates.length) {
      const currentDates = existingPickers.map(
        (picker, index) => picker.value || this.#batchDates[index],
      );
      const currentAmounts = currentDates.map(
        (_date, index) => this.#batchAmountValues[index] || "",
      );
      this.#batchDates = currentDates;
      this.#batchAmountValues = currentAmounts;
    }
    if (this.#batchDates.length >= 50) {
      this.#message.className = "form-message error";
      this.#message.textContent = "A batch can include up to 50 dates.";
      return;
    }
    const date = this.#batchDates.at(-1) || DateUtils.toISODate(new Date());
    this.#batchAmountValues.push(
      this.#batchAmountValues.at(-1) || this.#singleAmount.value,
    );
    this.#batchDates.push(date);
    this.#message.textContent = "";
    this.#message.className = "form-message";
    this.#renderBatchEntries();
  }

  #renderBatchEntries(): void {
    const isBatch = this.#batchMode;
    this.#formGrid.classList.toggle("is-batch-entry", isBatch);
    this.#batchList.hidden = !isBatch;
    this.#batchDetailsTitle.hidden = !isBatch;
    this.#inlineDatePicker.hidden = isBatch;
    this.#compactDatePicker.hidden = isBatch;
    this.#singleAmount.hidden = isBatch;
    const nativeAmount = this.#singleAmount.querySelector("input");
    if (nativeAmount) nativeAmount.required = !isBatch;
    if (!isBatch) {
      this.#batchCards.replaceChildren();
      return;
    }
    const rows = this.#batchDates.map((date, index) => {
      const row = document.createElement("div");
      row.className = "new-transaction-page__batch-card";
      row.dataset.batchIndex = String(index);
      const datePicker = document.createElement("date-picker");
      datePicker.setAttribute("alignment", "left");
      const amount = document.createElement("currency-input") as HTMLElement & {
        value: string;
      };
      amount.setAttribute(
        "aria-label",
        `Amount for ${DateUtils.longDateFormatter.format(DateUtils.fromISODate(date))}`,
      );
      amount.setAttribute("min", "0.01");
      amount.setAttribute("required", "");
      amount.setAttribute("value", this.#batchAmountValues[index] || "");
      amount.setAttribute("name", `batch-amount-${date}`);
      amount.addEventListener("input", () =>
        (this.#batchAmountValues[index] = amount.value),
      );
      const remove = document.createElement("custom-button") as CustomButton;

      remove.classList.add("tertiary", "square");
      remove.leadingIcon = "close";
      remove.setAttribute("data-batch-remove", String(index));
      remove.setAttribute(
        "aria-label",
        `Remove entry for ${DateUtils.longDateFormatter.format(DateUtils.fromISODate(date))}`,
      );

      remove.hidden = this.#batchDates.length <= 1;
      row.append(datePicker, amount, remove);
      return row;
    });
    this.#batchCards.replaceChildren(...rows);
    this.#batchCards.querySelectorAll("date-picker").forEach((picker, index) => {
      (picker as HTMLElement & { value: string }).value = this.#batchDates[index];
    });
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
    if (this.#batchMode ? !this.#batchDates.length : !this.#dateValue) {
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
    if (this.#batchMode) this.#syncBatchCardState();
    let savedBalanceNotice = "";
    try {
      if (
        kind === "account" &&
        this.#paymentType.value === "balance" &&
        !this.#batchMode
      ) {
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
      const entryDates = this.#batchMode
        ? [...this.#batchDates]
        : [this.#dateValue];
      const amountFor = (date: string, index: number) =>
        this.#batchMode
          ? this.#batchAmountValues[index] || ""
          : (values.get("amount") as string);
      const buildDraft = (date: string, index: number) =>
        this.#formController.buildDraft({
          kind,
          amount: this.#paymentType.signedAmount(amountFor(date, index)),
          date,
          categoryId: this.#categorySelect.value,
          vendorId: this.#vendorSelect.value,
          assignmentId: this.#peopleSelect.value,
          accountId: this.#accountSelect.value,
          notes: values.get("notes") as string,
          source: this.#sourceSelect.value,
        });

      if (
        this.#batchMode &&
        kind === "account" &&
        this.#paymentType.value === "balance"
      ) {
        const { kept, dropped } = latestDatePerMonth(entryDates);
        if (dropped.length) {
          savedBalanceNotice = `Only the latest date in each month was saved. Dropped: ${dropped.map((date) => DateUtils.longDateFormatter.format(DateUtils.fromISODate(date))).join(", ")}.`;
          this.#batchNotice.hidden = false;
          this.#batchNotice.textContent = savedBalanceNotice;
        }
        for (const date of kept) {
          const month = date.slice(0, 7);
          const current = APIs.accounts.monthData(
            this.#accountSelect.value,
            month,
          );
          if (current?.balance?.asOfDate && current.balance.asOfDate >= date) {
            this.#message.className = "form-message error";
            this.#message.textContent =
              "A later balance already exists for this month.";
            return;
          }
        }
        for (const date of kept) {
          const month = date.slice(0, 7);
          const current = APIs.accounts.monthData(
            this.#accountSelect.value,
            month,
          );
          await APIs.accounts.saveMonth({
            accountId: this.#accountSelect.value,
            month,
            balance: amountFor(date, entryDates.indexOf(date)),
            asOfDate: date,
            balanceId: current?.balance?.id,
            existingActivity: current?.activity || [],
            activity: current?.activity || [],
          });
        }
      } else if (this.#batchMode) {
        APIs.budget.queueImportedTransactions(entryDates.map(buildDraft));
      } else {
        APIs.budget.queueTransaction(buildDraft(this.#dateValue, 0));
      }
      showToast(
        entryDates.length > 1
          ? `${entryDates.length} transactions added. Syncing…`
          : "Transaction added. Syncing…",
      );
      this.#reset(this.#dateValue, true);
      if (savedBalanceNotice) {
        this.#batchNotice.hidden = false;
        this.#batchNotice.textContent = savedBalanceNotice;
      }
    } catch (error) {
      this.#message.className = "form-message error";
      this.#message.textContent =
        error instanceof Error ? error.message : "Unable to add transaction.";
    }
  };

  #reset(date: string, announce: boolean): void {
    const activeMode = this.#kindControl.selection ?? "budgeting";
    if (this.#batchMode) this.#toggleBatchMode();
    this.#amountInput.value = "";
    this.#noteInput.value = "";
    this.#setDateValue(date);
    this.#categorySelect.clearFallbackSelection?.();
    this.#categorySelect.value = "";
    this.#vendorSelect.clearFallbackSelection?.();
    this.#peopleSelect.clearFallbackSelection?.();
    this.#accountSelect.value = "";
    this.#selectedAccountType = null;
    this.#paymentType.value = "positive";
    this.#paymentType.accountType = null;
    this.#sourceSelect.value = "manual";
    this.#vendorSelect.value = "";
    this.#peopleSelect.value = APIs.budget.SHARED_ASSIGNMENT_ID;
    this.#setMode(activeMode);
    if (activeMode !== "account" && this.#budgetKind === "income") {
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
