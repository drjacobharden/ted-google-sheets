document.addEventListener("DOMContentLoaded", () => {
  const backdrop = document.getElementById("transaction-drawer-backdrop");
  const drawer = document.getElementById("transaction-drawer");
  const form = document.getElementById("transaction-edit-form");

  const message = document.getElementById("transaction-edit-message");
  const vendorField = document.getElementById("edit-vendor-field");
  const datePickerElement = form.querySelector('date-picker[name="date"]');
  const appShell = document.querySelector(".app-shell");
  const createdFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  let transactionId = "";
  let openedBase = null;
  let initialFormState = "";
  let returnFocus = null;

  function option(value, label, selected = false) {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = label;
    item.selected = selected;
    return item;
  }

  function populateSelect(select, records, currentId, currentName, emptyLabel) {
    select.replaceChildren(option("", emptyLabel));
    records.forEach((record) =>
      select.append(option(record.id, record.name, record.id === currentId)),
    );
    if (currentId && !records.some((record) => record.id === currentId)) {
      select.append(
        option(currentId, `${currentName || "Archived item"} (archived)`, true),
      );
    }
    select.value = currentId || "";
  }

  function updateTypeFields(preferredCategory = "") {
    const type = form.elements.type.value;
    const current =
      window.BudgetUI.getTransaction(transactionId) || openedBase || {};
    const categories = window.BudgetAPI.listCategories({ type });
    const categoryId =
      type === "income"
        ? window.BudgetAPI.INCOME_CATEGORY_ID
        : preferredCategory;
    populateSelect(
      form.elements.categoryId,
      categories,
      categoryId,
      current.category,
      "Choose a category",
    );
    const income = type === "income";
    vendorField.hidden = income;
    form.elements.vendorId.required = !income;
    if (income) form.elements.vendorId.value = "";
  }

  function formState() {
    return JSON.stringify(Object.fromEntries(new FormData(form)));
  }

  function isDirty() {
    return !backdrop.hidden && formState() !== initialFormState;
  }

  function close(force = false) {
    if (
      !force &&
      isDirty() &&
      !window.confirm("Discard your unsaved transaction changes?")
    )
      return false;
    backdrop.hidden = true;
    document.body.classList.remove("drawer-open");
    appShell.inert = false;
    transactionId = "";
    openedBase = null;
    initialFormState = "";
    (returnFocus && document.contains(returnFocus)
      ? returnFocus
      : document.querySelector('[data-tab="transactions"]')
    )?.focus();
    return true;
  }

  function open(id, options = {}) {
    const displayed = window.BudgetUI?.getTransaction(id);
    const queued = window.BudgetAPI.getTransactionOutboxItem(id);
    if (!displayed && !queued) {
      window.ToastUI?.show("That transaction is no longer available.", {
        type: "error",
      });
      return;
    }
    returnFocus = document.activeElement;
    transactionId = id;
    const record =
      options.review && queued
        ? {
            ...queued.record,
            ...window.BudgetAPI.getSyncItems().find(
              (item) => item.source === "transaction" && item.id === id,
            )?.record,
          }
        : displayed || queued.record;
    openedBase =
      options.review && queued?.currentRecord
        ? queued.currentRecord
        : queued?.baseRecord || displayed || queued.record;
    message.textContent = "";
    message.className = "form-message";
    form.elements.type.value = record.type;
    form.elements.amount.value = Number(record.amount);
    form.elements.notes.value = record.notes || "";

    if (datePickerElement) {
      datePickerElement.value = record.date;
    }

    updateTypeFields(record.categoryId);
    populateSelect(
      form.elements.vendorId,
      window.BudgetAPI.listVendors(),
      record.vendorId,
      record.vendor,
      "Choose a vendor",
    );
    populateSelect(
      form.elements.assignmentId,
      window.BudgetAPI.listPeople(),
      record.assignmentId,
      record.assignment,
      "Choose an assignment",
    );
    if (record.type === "income") form.elements.vendorId.value = "";
    document.getElementById("transaction-edit-id").textContent = record.id;
    const createdAt = new Date(record.createdAt);
    const createdWhen = Number.isNaN(createdAt.getTime())
      ? record.createdAt
      : createdFormatter.format(createdAt);
    document.getElementById("transaction-created-footnote").textContent =
      `Created by ${record.createdByName || "Unknown"} on ${createdWhen}`;
    initialFormState = formState();
    backdrop.hidden = false;
    document.body.classList.add("drawer-open");
    appShell.inert = true;
    drawer.focus();
    setTimeout(() => form.elements.amount.focus(), 0);
  }

  form.querySelectorAll('[name="type"]').forEach((input) =>
    input.addEventListener("change", () => {
      const preferred =
        input.value === "expense" && openedBase?.type === "expense"
          ? openedBase.categoryId
          : "";
      updateTypeFields(preferred);
    }),
  );

  /**
   * Form submission
   *
   * When the form is submitted, each of the items are retrieved from the form data and sent to the spreadsheet.
   *
   */
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.textContent = "";
    if (!form.checkValidity()) {
      form.reportValidity();
      message.className = "form-message error";
      message.textContent = "Complete the required fields before saving.";
      return;
    }
    const values = new FormData(form);
    const draft = {
      id: transactionId,
      type: values.get("type"),
      amount: Number(values.get("amount")),
      date: values.get("date"),
      categoryId: values.get("categoryId"),
      vendorId: values.get("type") === "income" ? "" : values.get("vendorId"),
      assignmentId: values.get("assignmentId"),
      notes: String(values.get("notes") || "").trim(),
    };
    try {
      window.BudgetAPI.queueTransactionUpdate(draft, openedBase);
      initialFormState = formState();
      close(true);
      window.ToastUI?.show("Transaction updated. Syncing…");
    } catch (error) {
      message.className = "form-message error";
      message.textContent = `Couldn’t update this transaction: ${error.message}`;
    }
  });

  document
    .getElementById("close-transaction-drawer")
    .addEventListener("click", () => close());
  document
    .getElementById("cancel-transaction-edit")
    .addEventListener("click", () => close());
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (backdrop.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...drawer.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hidden);
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

  document
    .getElementById("copy-transaction-id")
    .addEventListener("click", async () => {
      const id = document.getElementById("transaction-edit-id").textContent;
      try {
        await navigator.clipboard.writeText(id);
        window.ToastUI?.show("Transaction ID copied.");
      } catch {
        window.prompt("Copy the transaction ID:", id);
      }
    });

  window.TransactionEditor = { open, close };
  window.openTransactionEditor = open;
});
