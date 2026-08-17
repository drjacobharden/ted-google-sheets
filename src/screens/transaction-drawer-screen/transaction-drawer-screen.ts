// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { InvestmentView } from "../../utilities/investment-view";
import { showToast } from "../../components/toast-stack/toast-service";
import templateString from "./template.html" with { type: "text" };
import { CustomButton } from "../../components/button/button";
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
  const { createdDateTimeFormatter, toISODate } = DateUtils;

  const backdrop = document.getElementById("transaction-drawer-backdrop");
  const drawer = document.getElementById("transaction-drawer");
  const form = document.getElementById("transaction-edit-form");
  const header = document.getElementById("transaction-drawer-header");
  const typeControl = form.querySelector("#transaction-type-control");
  const typeInput = form.elements.type;

  typeControl.items = [
    { key: "expense", title: "Expense", isDefaultValue: true },
    { key: "income", title: "Income" },
  ];

  const message = document.getElementById("transaction-edit-message");
  const datePickerElement = form.querySelector('date-picker[name="date"]');
  const appShell = document.querySelector(".app-shell");
  const cancelButton = document.getElementById("cancel-transaction-edit");

  const saveButton = form.querySelector(
    'custom-button[type="submit"]',
  ) as CustomButton;
  const transactionMetadata = form.querySelector(".transaction-metadata");
  const batchEntryToggle = document.getElementById("batch-entry-toggle");
  const batchEntryInput = form.elements.batchEntry;
  const transactionIdElement = document.getElementById("transaction-edit-id");
  const createdFootnote = document.getElementById(
    "transaction-created-footnote",
  );

  const categorySelect = form.querySelector("category-select");
  const vendorSelect = form.querySelector("vendor-input");
  const peopleSelect = form.querySelector("people-select");

  let mode = "create";
  let transactionId = "";
  let openedBase = null;
  let initialFormState = "";
  let drawerDirty = false;
  let trackDrawerChanges = false;
  let returnFocus = null;
  let activeType = "expense";
  let expenseDraft = { categoryId: "", vendorId: "" };
  let closing = false;
  let closeTimer = 0;
  let closeAnimationHandler = null;

  //  Open the drawer in creation mode to add a new transaction
  //    - 1: Set the flag for mode to create and clear the transaction id
  //    - 2: Reset the form so it shows all blanks
  //    - 3: Set the title, eyebrow, and subtitles while hiding the metadata
  function openCreate() {
    trackDrawerChanges = false;
    drawerDirty = false;
    mode = "create";
    transactionId = "";
    openedBase = null;
    returnFocus = document.activeElement;

    message.textContent = "";
    message.className = "form-message";

    setTransactionTypeSelection("expense");
    form.elements.amount.value = "";
    form.elements.notes.value = "";
    batchEntryInput.checked = false;
    activeType = "expense";
    expenseDraft = { categoryId: "", vendorId: "" };

    categorySelect.clearFallbackSelection();
    vendorSelect.clearFallbackSelection();
    peopleSelect.clearFallbackSelection();

    if (datePickerElement) {
      datePickerElement.value = toISODate(new Date());
    }

    populateFormOptions();

    header.title = "New transaction";
    saveButton.label = "Add transaction";
    transactionMetadata.hidden = true;
    batchEntryToggle.hidden = false;

    initialFormState = formState();
    showDrawer();
    window.setTimeout(() => {
      if (mode === "create" && !backdrop.hidden) {
        initialFormState = formState();
        trackDrawerChanges = true;
      }
    }, 0);
    return true;
  }

  //  Open the drawer in edit mode to edit an existing transaction
  //    - 1: Set the flag for mode to edit and populate the transaction id
  //    - 2: If no transaction was found, throw a toast error up to alert the user
  //    - 2: Populate the form with the data from the transaction
  //    - 3: Set the title, eyebrow, and subtitles while showing the metadata
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

    mode = "edit";
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

    populateFormFromRecord(record);

    header.title = "Edit transaction";
    saveButton.label = "Save changes";
    transactionMetadata.hidden = false;
    batchEntryToggle.hidden = true;
    batchEntryInput.checked = false;
    transactionIdElement.textContent = record.id;

    const createdAt = new Date(record.createdAt);
    const createdWhen = Number.isNaN(createdAt.getTime())
      ? record.createdAt
      : createdDateTimeFormatter.format(createdAt);

    createdFootnote.textContent = `Created by ${record.createdByName || "Unknown"} on ${createdWhen}`;

    initialFormState = formState();
    showDrawer();
    window.setTimeout(() => {
      if (mode === "edit" && !backdrop.hidden) {
        initialFormState = formState();
        trackDrawerChanges = true;
      }
    }, 0);
    return true;
  }

  //  Shared display logic that runs regardless of the mode
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

    // drawer.focus();

    // setTimeout(() => {
    //   form.elements.amount.focus();
    // }, 0);
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

    activeType = typeInput.value === "income" ? "income" : "expense";
    if (activeType === "expense") {
      expenseDraft = { categoryId, vendorId };
    }
    updateTypeFields(activeType);
    peopleSelect.value = assignmentId;
  }

  function populateFormFromRecord(record) {
    setTransactionTypeSelection(record.type || "expense");

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
    const income = type === "income";
    categorySelect.type = type;
    categorySelect.value = income
      ? APIs.budget.INCOME_CATEGORY_ID
      : expenseDraft.categoryId;
    vendorSelect.hidden = income;
    vendorSelect.value = income ? "" : expenseDraft.vendorId;
    activeType = type;
  }

  function setTransactionTypeSelection(type) {
    const nextType = type === "income" ? "income" : "expense";
    typeInput.value = nextType;
    typeControl.selection = nextType;
  }

  function formState() {
    const state = Object.fromEntries(new FormData(form));
    state.date = datePickerElement.value;
    state.categoryId = categorySelect.value;
    state.vendorId = vendorSelect.value;
    state.assignmentId = peopleSelect.value;
    return JSON.stringify(state);
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
    initialFormState = "";
    expenseDraft = { categoryId: "", vendorId: "" };
    (returnFocus && document.contains(returnFocus)
      ? returnFocus
      : document.querySelector('[data-tab="transactions"]')
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

    const draft = {
      id: transactionId,
      type,
      amount: Number(values.get("amount")),
      date: datePickerElement.value,
      categoryId: categorySelect.value,
      vendorId: type === "income" ? "" : vendorSelect.value,
      assignmentId: peopleSelect.value,
      notes: String(values.get("notes") || "").trim(),
    };

    try {
      if (mode === "create") {
        createTransaction(draft);
      } else {
        updateTransaction({
          ...draft,
          id: transactionId,
        });
      }

      initialFormState = formState();
      if (mode === "create" && batchEntryInput.checked) {
        resetForBatchEntry(draft.date);
      } else {
        close(true);
      }
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    }
  }

  // Create a new transaction
  function createTransaction(draft) {
    APIs.budget.queueTransaction(draft);
    showToast("Transaction added. Syncing…");
  }

  // Update an existing transaction
  function updateTransaction(draft) {
    APIs.budget.queueTransactionUpdate(draft, openedBase);
    showToast("Transaction updated. Syncing…");
  }

  function resetForBatchEntry(date) {
    setTransactionTypeSelection("expense");
    form.elements.amount.value = "";
    form.elements.notes.value = "";
    activeType = "expense";
    expenseDraft = { categoryId: "", vendorId: "" };
    categorySelect.clearFallbackSelection();
    vendorSelect.clearFallbackSelection();
    peopleSelect.clearFallbackSelection();
    datePickerElement.value = date;
    populateFormOptions();
    message.className = "form-message success";
    message.textContent = "Transaction added. Ready for the next one.";
    initialFormState = formState();
    form.elements.amount.focus({ preventScroll: true });
  }

  typeControl.addEventListener("segmented-control-selection", (event) => {
    const nextType = event.detail.value === "income" ? "income" : "expense";
    if (activeType === "expense" && nextType === "income") {
      expenseDraft = {
        categoryId: categorySelect.value,
        vendorId: vendorSelect.value,
      };
    }
    typeInput.value = nextType;
    updateTypeFields(nextType);
    if (trackDrawerChanges) drawerDirty = true;
  });

  categorySelect.addEventListener("category-selected", () => {
    if (trackDrawerChanges) drawerDirty = true;
    if (activeType === "expense") {
      expenseDraft.categoryId = categorySelect.value;
    }
  });
  vendorSelect.addEventListener("vendor-selected", () => {
    if (trackDrawerChanges) drawerDirty = true;
    if (activeType === "expense") expenseDraft.vendorId = vendorSelect.value;
  });

  //  Form submission
  //    - 1: Check to see if all data is valid. If not, throw an error message.
  //    - 2: Process the data and get it ready to submit to the spreadsheet
  //    - 3: Queue the submission for editing or creating
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("input", () => {
    if (trackDrawerChanges) drawerDirty = true;
  });
  form.addEventListener("change", () => {
    if (trackDrawerChanges) drawerDirty = true;
  });

  // Handle the clicks that open the new transaction drawer
  function handleNewTransactionClick(event) {
    const button = event.target.closest('[data-action="new-transaction"]');
    if (!button) return;
    event.preventDefault();
    router.updateParams({
      drawer: "new",
      transactionId: null,
    });
  }

  document.addEventListener("click", handleNewTransactionClick);

  let openedRouteKey = "";

  function openDrawerFromCurrentRoute() {
    const params = router.currentParams();
    const action = params.drawer;
    const id = params.transactionId;
    const routeKey = `${action || ""}:${id || ""}`;

    if (!["new", "edit", "review"].includes(action)) {
      openedRouteKey = "";
      if (!backdrop.hidden) close(true, { updateRoute: false });
      return;
    }

    if (routeKey === openedRouteKey && !backdrop.hidden) return;

    if (action === "new") {
      if (openCreate()) openedRouteKey = routeKey;
      return;
    }

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

  cancelButton.addEventListener("click", () => close());
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
