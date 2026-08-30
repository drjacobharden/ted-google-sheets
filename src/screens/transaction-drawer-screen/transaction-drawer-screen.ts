// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { showToast } from "../../components/toast-stack/toast-service";
import templateString from "./template.html" with { type: "text" };
import {
  addListener,
  handleCustomEvent,
} from "../../utilities/event-utilities";
import { TransactionFormController } from "../transaction-form-controller";

export class TransactionDrawerScreen extends HTMLElement {
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.innerHTML = templateString;
    }
  }
}

if (!customElements.get("transaction-drawer-screen"))
  customElements.define("transaction-drawer-screen", TransactionDrawerScreen);

document.addEventListener("DOMContentLoaded", () => {
  const { createdDateTimeFormatter } = DateUtils;

  const backdrop = document.getElementById("transaction-drawer-backdrop");
  const drawer = backdrop.querySelector(".side-drawer");
  const form = document.getElementById("transaction-edit-form");
  const typeInput = form.elements.type;

  const message = document.getElementById("transaction-edit-message");
  const datePickerElement = form.querySelector('date-picker[name="date"]');
  const appShell = document.querySelector(".app-shell");
  const deleteButton = document.getElementById("delete-transaction");

  const saveButton = form.querySelector('custom-button[type="submit"]');
  const transactionIdElement = document.getElementById("transaction-edit-id");
  const createdFootnote = document.getElementById(
    "transaction-created-footnote",
  );

  const categorySelect = form.querySelector("category-select");
  const vendorSelect = form.querySelector("vendor-select");
  const peopleSelect = form.querySelector("people-select");
  const sourceSelect = form.querySelector("source-select");
  const accountSelect = form.querySelector("account-select");
  const amountControl = form.querySelector("currency-input");
  const formController = new TransactionFormController();

  let transactionId = "";
  let openedBase = null;
  let drawerDirty = false;
  let trackDrawerChanges = false;
  let returnFocus = null;
  let activeType = "expense";
  let expenseDraft = { categoryId: "", vendorId: "" };
  let incomeDraft = {
    categoryId: APIs.budget.INCOME_CATEGORY_ID,
    vendorId: "",
  };
  let closing = false;
  let closeTimer = 0;
  let closeAnimationHandler = null;

  // Open the drawer to edit an existing transaction or resolve its conflict.
  function openEdit(id, options = {}) {
    trackDrawerChanges = false;
    drawerDirty = false;
    const displayed = appController.getTransaction(id);
    const queued = APIs.budget.getTransactionOutboxItem(id);

    if (!displayed && !queued) {
      showToast("That transaction is no longer available.", {
        type: "error",
      });

      return false;
    }

    transactionId = id;
    returnFocus = document.activeElement;

    const record =
      options.review && queued
        ? {
            ...queued.record,
            ...APIs.budget
              .getSyncItems()
              .find((item) => item.source === "transaction" && item.id === id)
              ?.record,
          }
        : displayed || queued.record;

    openedBase =
      options.review && queued?.currentRecord
        ? queued.currentRecord
        : queued?.baseRecord || displayed || queued.record;

    message.textContent = "";
    message.className = "form-message";

    expenseDraft =
      record.type === "expense"
        ? {
            categoryId: record.categoryId || "",
            vendorId: record.vendorId || "",
          }
        : { categoryId: "", vendorId: "" };
    incomeDraft = {
      categoryId:
        record.type === "income"
          ? record.categoryId || APIs.budget.INCOME_CATEGORY_ID
          : APIs.budget.INCOME_CATEGORY_ID,
      vendorId: record.type === "income" ? record.vendorId || "" : "",
    };
    populateFormFromRecord(record);
    accountSelect.value = record.accountId || "";
    sourceSelect.value = record.source || "manual";

    transactionIdElement.textContent = record.id;

    const createdAt = new Date(record.createdAt);
    const createdWhen = Number.isNaN(createdAt.getTime())
      ? record.createdAt
      : createdDateTimeFormatter.format(createdAt);

    createdFootnote.textContent = `Created by ${record.createdByName || "Unknown"} on ${createdWhen}`;

    showDrawer();
    window.setTimeout(() => {
      if (!backdrop.hidden) {
        trackDrawerChanges = true;
      }
    }, 0);
    return true;
  }

  // Reveal the populated edit drawer and move focus into the form.
  function showDrawer() {
    message.textContent = "";
    if (closeTimer) window.clearTimeout(closeTimer);
    if (closeAnimationHandler) {
      drawer.removeEventListener("transitionend", closeAnimationHandler);
    }
    closing = false;
    closeTimer = 0;
    closeAnimationHandler = null;
    backdrop.classList.remove("is-closing", "is-open");
    backdrop.hidden = false;
    // Commit the off-screen state before enabling transitions. Without this
    // layout boundary, repeated opens can skip or compress the entrance.
    void drawer.offsetWidth;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      form.elements.amount.focus({ preventScroll: true });
    } else {
      drawer.addEventListener("transitionend", handleDrawerOpened);
    }

    backdrop.classList.add("is-open");
    document.body.classList.add("drawer-open");
    appShell.inert = true;
  }

  function populateFormOptions({
    categoryId = "",
    category = "",
    vendorId = "",
    vendor = "",
    assignmentId = APIs.budget.SHARED_ASSIGNMENT_ID,
    assignment = "Shared",
  } = {}) {
    categorySelect.setFallbackSelection(
      categoryId ? { id: categoryId, name: category, archived: true } : null,
    );
    vendorSelect.setFallbackSelection(
      vendorId ? { id: vendorId, name: vendor, archived: true } : null,
    );
    peopleSelect.setFallbackSelection(
      assignmentId
        ? { id: assignmentId, name: assignment, archived: true }
        : null,
    );

    activeType = ["income", "account"].includes(typeInput.value)
      ? typeInput.value
      : "expense";
    if (activeType === "expense") {
      expenseDraft = { categoryId, vendorId };
    } else {
      incomeDraft = {
        categoryId: categoryId || APIs.budget.INCOME_CATEGORY_ID,
        vendorId,
      };
    }
    updateTypeFields(activeType);
    peopleSelect.value = assignmentId;
  }

  function populateFormFromRecord(record) {
    setTransactionTypeSelection(
      record.accountId ? "account" : record.type || "expense",
    );

    form.elements.amount.value =
      record.amount === undefined || record.amount === null
        ? ""
        : Number(record.amount);

    form.elements.notes.value = record.notes || "";

    if (datePickerElement) {
      datePickerElement.value = record.date || "";
    }

    populateFormOptions({
      categoryId: record.categoryId || "",
      category: record.category || "",
      vendorId: record.vendorId || "",
      vendor: record.vendor || "",
      assignmentId: record.assignmentId || APIs.budget.SHARED_ASSIGNMENT_ID,
      assignment: record.assignment || "Shared",
    });
  }

  function updateTypeFields(type) {
    const account = type === "account";
    const income = type === "income";
    categorySelect.hidden = account;
    categorySelect.type = income ? "income" : "expense";
    categorySelect.value = income
      ? incomeDraft.categoryId
      : expenseDraft.categoryId;
    vendorSelect.toggleAttribute("optional", income);
    vendorSelect.hidden = account;
    vendorSelect.value = income ? incomeDraft.vendorId : expenseDraft.vendorId;
    peopleSelect.hidden = account;
    accountSelect.hidden = !account;
    amountControl.helper = account
      ? "Use negative amounts for investment withdrawals or additional borrowing on your debt."
      : "Use negative amounts for refunds.";
    amountControl.min = null;
    activeType = type;
  }

  function setTransactionTypeSelection(type) {
    const nextType = ["income", "account"].includes(type) ? type : "expense";
    typeInput.value = nextType;
  }

  function isDirty() {
    return !backdrop.hidden && drawerDirty;
  }

  function finishClose() {
    if (!closing) return;
    closing = false;
    if (closeTimer) window.clearTimeout(closeTimer);
    if (closeAnimationHandler) {
      drawer.removeEventListener("transitionend", closeAnimationHandler);
    }
    closeTimer = 0;
    closeAnimationHandler = null;
    backdrop.hidden = true;
    backdrop.classList.remove("is-closing", "is-open");
    document.body.classList.remove("drawer-open");
    appShell.inert = false;
    transactionId = "";
    openedBase = null;
    expenseDraft = { categoryId: "", vendorId: "" };
    incomeDraft = { categoryId: APIs.budget.INCOME_CATEGORY_ID, vendorId: "" };
    (returnFocus && document.contains(returnFocus)
      ? returnFocus
      : document.querySelector('[data-tab="budgeting"]')
    )?.focus();
  }

  function close(force = false, { updateRoute = true } = {}) {
    if (closing || backdrop.hidden) return true;
    if (
      !force &&
      isDirty() &&
      !window.confirm("Discard your unsaved transaction changes?")
    )
      return false;

    closing = true;
    backdrop.classList.remove("is-open");
    backdrop.classList.add("is-closing");
    closeAnimationHandler = (event) => {
      if (event.target === drawer && event.propertyName === "transform") {
        finishClose();
      }
    };
    drawer.addEventListener("transitionend", closeAnimationHandler);
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    closeTimer = window.setTimeout(finishClose, reducedMotion ? 0 : 320);

    if (updateRoute && router.currentParams().drawer) {
      router.updateParams({
        drawer: null,
        transactionId: null,
      });
    }

    return true;
  }

  function showSelectionError(component, text) {
    message.className = "form-message error";
    message.textContent = text;
    component.reportSelectionError(text);
  }

  function validateCustomFields(type) {
    if (!datePickerElement.value) {
      showSelectionError(datePickerElement, "Choose a transaction date.");
      return false;
    }
    if (type === "account") {
      if (!accountSelect.value) {
        showSelectionError(accountSelect, "Choose an account.");
        return false;
      }
      return true;
    }
    if (!categorySelect.value) {
      showSelectionError(categorySelect, "Choose a category.");
      return false;
    }
    if (type === "expense" && !vendorSelect.value) {
      showSelectionError(vendorSelect, "Choose a vendor for this expense.");
      return false;
    }
    if (!peopleSelect.value) {
      showSelectionError(peopleSelect, "Choose an assignment.");
      return false;
    }
    return true;
  }

  function handleSubmit(event) {
    event.preventDefault();

    message.textContent = "";
    message.className = "form-message";

    const values = new FormData(form);
    const type = values.get("type");

    if (!validateCustomFields(type)) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      message.className = "form-message error";
      message.textContent = "Complete the required fields before saving.";
      return;
    }

    const draft = formController.buildDraft({
      id: transactionId,
      kind: type,
      amount: values.get("amount"),
      date: datePickerElement.value,
      categoryId: categorySelect.value,
      vendorId: vendorSelect.value,
      assignmentId: peopleSelect.value,
      accountId: accountSelect.value,
      notes: values.get("notes"),
      source: sourceSelect.value,
    });

    try {
      updateTransaction({
        ...draft,
        id: transactionId,
      });

      close(true);
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    }
  }

  // Update an existing transaction
  function updateTransaction(draft) {
    APIs.budget.queueTransactionUpdate(draft, openedBase);
    showToast("Transaction updated. Syncing…");
  }

  async function deleteCurrentTransaction() {
    if (
      deleteButton.hasAttribute("disabled") ||
      !transactionId ||
      !window.confirm("Delete this transaction? This cannot be undone.")
    )
      return;
    deleteButton.setAttribute("disabled", "");
    try {
      await APIs.budget.deleteTransaction(transactionId, openedBase);
      drawerDirty = false;
      showToast("Transaction deleted.");
      close(true);
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    } finally {
      deleteButton.removeAttribute("disabled");
    }
  }

  addListener("segmented-control-selection", drawer, (event) => {
    handleCustomEvent("segmented-control-selection", event, ({ value }) => {
      const nextType = ["income", "account"].includes(value)
        ? value
        : "expense";
      if (activeType === "expense") {
        expenseDraft = {
          categoryId: categorySelect.value,
          vendorId: vendorSelect.value,
        };
      } else if (activeType === "income") {
        incomeDraft.categoryId = categorySelect.value;
      }
      setTransactionTypeSelection(nextType);
      updateTypeFields(nextType);
      if (trackDrawerChanges) drawerDirty = true;
    });
  });

  categorySelect.addEventListener("category-selected", () => {
    if (trackDrawerChanges) drawerDirty = true;
    if (activeType === "expense") {
      expenseDraft.categoryId = categorySelect.value;
    } else {
      incomeDraft.categoryId = categorySelect.value;
    }
  });
  vendorSelect.addEventListener("vendor-selected", () => {
    if (trackDrawerChanges) drawerDirty = true;
    if (activeType === "expense") expenseDraft.vendorId = vendorSelect.value;
    else incomeDraft.vendorId = vendorSelect.value;
  });
  sourceSelect.addEventListener("source-selected", () => {
    if (trackDrawerChanges) drawerDirty = true;
  });
  accountSelect.addEventListener("account-selected", () => {
    if (trackDrawerChanges) drawerDirty = true;
  });

  // Queue edits after the shared transaction validation succeeds.
  form.addEventListener("submit", handleSubmit);
  saveButton.addEventListener("click", () => form.requestSubmit());
  form.addEventListener("input", () => {
    if (trackDrawerChanges) drawerDirty = true;
  });
  form.addEventListener("change", () => {
    if (trackDrawerChanges) drawerDirty = true;
  });

  let openedRouteKey = "";

  function openDrawerFromCurrentRoute() {
    const params = router.currentParams();
    const action = params.drawer;
    const id = params.transactionId;
    const routeKey = `${action || ""}:${id || ""}`;

    if (action === "new") {
      router.navigate("new-transaction");
      return;
    }

    if (!["edit", "review"].includes(action)) {
      openedRouteKey = "";
      if (!backdrop.hidden) close(true, { updateRoute: false });
      return;
    }

    if (routeKey === openedRouteKey && !backdrop.hidden) return;

    if (!id) {
      router.updateParams({ drawer: null, transactionId: null });
      return;
    }

    const transactionIsAvailable =
      appController.areTransactionsLoaded() ||
      Boolean(APIs.budget.getTransactionOutboxItem(id));

    if (!transactionIsAvailable) {
      appController.loadTransactions();
      return;
    }

    if (openEdit(id, { review: action === "review" })) {
      openedRouteKey = routeKey;
    } else if (appController.areTransactionsLoaded()) {
      router.updateParams({ drawer: null, transactionId: null });
    }
  }

  function handleDrawerOpened(event) {
    if (event.target !== drawer || event.propertyName !== "transform") {
      return;
    }

    drawer.removeEventListener("transitionend", handleDrawerOpened);

    form.elements.amount.focus({
      preventScroll: true,
    });
  }

  window.addEventListener("app:route-changed", openDrawerFromCurrentRoute);
  window.addEventListener(
    "budget:transactions-loaded",
    openDrawerFromCurrentRoute,
  );
  window.addEventListener("drawer:close-requested", close);

  deleteButton.addEventListener("click", deleteCurrentTransaction);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (backdrop.hidden) return;
      if (event.key === "Escape") {
        const openComponent = [
          categorySelect,
          vendorSelect,
          peopleSelect,
          datePickerElement,
        ].find((component) => component.isOpen);
        if (openComponent) {
          event.preventDefault();
          event.stopPropagation();
          openComponent.closePopup({ focusTrigger: true });
          return;
        }
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...drawer.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (element) => !element.hidden && element.getClientRects().length > 0,
      );
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    true,
  );

  const id = document.getElementById("transaction-edit-id");

  id?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(id.textContent);
      showToast("Transaction ID copied.");
    } catch {
      window.prompt("Copy the transaction ID:", id.textContent);
    }
  });
});
