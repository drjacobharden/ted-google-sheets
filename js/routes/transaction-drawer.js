document.addEventListener("DOMContentLoaded", () => {
  const { createdDateTimeFormatter, toISODate } = window.DateUtils;

  const backdrop = document.getElementById("transaction-drawer-backdrop");
  const drawer = document.getElementById("transaction-drawer");
  const form = document.getElementById("transaction-edit-form");

  const message = document.getElementById("transaction-edit-message");
  const datePickerElement = form.querySelector('date-picker[name="date"]');
  const appShell = document.querySelector(".app-shell");
  const closeButton = document.getElementById("close-transaction-drawer");
  const cancelButton = document.getElementById("cancel-transaction-edit");

  const drawerTitle = document.getElementById("transaction-drawer-title");
  const saveButton = form.querySelector('button[type="submit"]');
  const transactionMetadata = form.querySelector(".transaction-metadata");
  const transactionIdElement = document.getElementById("transaction-edit-id");
  const createdFootnote = document.getElementById(
    "transaction-created-footnote",
  );

  const vendorField = form.querySelector(".vendor-form-field");
  const categorySelect = form.querySelector("category-select");
  const vendorSelect = form.querySelector("vendor-input");
  const peopleSelect = form.querySelector("people-select");

  let mode = "create";
  let transactionId = "";
  let openedBase = null;
  let initialFormState = "";
  let returnFocus = null;
  let activeType = "expense";
  let expenseDraft = { categoryId: "", vendorId: "" };

  //  Open the drawer in creation mode to add a new transaction
  //    - 1: Set the flag for mode to create and clear the transaction id
  //    - 2: Reset the form so it shows all blanks
  //    - 3: Set the title, eyebrow, and subtitles while hiding the metadata
  function openCreate() {
    mode = "create";
    transactionId = "";
    openedBase = null;
    returnFocus = document.activeElement;

    message.textContent = "";
    message.className = "form-message";

    form.elements.type.value = "expense";
    form.elements.amount.value = "";
    form.elements.notes.value = "";
    activeType = "expense";
    expenseDraft = { categoryId: "", vendorId: "" };

    categorySelect.clearFallbackSelection();
    vendorSelect.clearFallbackSelection();
    peopleSelect.clearFallbackSelection();

    if (datePickerElement) {
      datePickerElement.value = toISODate(new Date());
    }

    populateFormOptions();

    drawerTitle.textContent = "New transaction";
    saveButton.textContent = "Add transaction";
    transactionMetadata.hidden = true;

    initialFormState = formState();
    showDrawer();
    return true;
  }

  //  Open the drawer in edit mode to edit an existing transaction
  //    - 1: Set the flag for mode to edit and populate the transaction id
  //    - 2: If no transaction was found, throw a toast error up to alert the user
  //    - 2: Populate the form with the data from the transaction
  //    - 3: Set the title, eyebrow, and subtitles while showing the metadata
  function openEdit(id, options = {}) {
    const displayed = window.BudgetUI.getTransaction(id);
    const queued = window.BudgetAPI.getTransactionOutboxItem(id);

    if (!displayed && !queued) {
      window.ToastUI?.show("That transaction is no longer available.", {
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

    expenseDraft =
      record.type === "expense"
        ? {
            categoryId: record.categoryId || "",
            vendorId: record.vendorId || "",
          }
        : { categoryId: "", vendorId: "" };

    populateFormFromRecord(record);

    drawerTitle.textContent = "Edit transaction";
    saveButton.textContent = "Save changes";
    transactionMetadata.hidden = false;
    transactionIdElement.textContent = record.id;

    const createdAt = new Date(record.createdAt);
    const createdWhen = Number.isNaN(createdAt.getTime())
      ? record.createdAt
      : createdDateTimeFormatter.format(createdAt);

    createdFootnote.textContent = `Created by ${record.createdByName || "Unknown"} on ${createdWhen}`;

    initialFormState = formState();
    showDrawer();
    return true;
  }

  //  Shared display logic that runs regardless of the mode
  function showDrawer() {
    message.textContent = "";
    backdrop.hidden = false;
    document.body.classList.add("drawer-open");
    appShell.inert = true;
    drawer.focus();

    setTimeout(() => {
      form.elements.amount.focus();
    }, 0);
  }

  function populateFormOptions({
    categoryId = "",
    category = "",
    vendorId = "",
    vendor = "",
    assignmentId = window.BudgetAPI.SHARED_ASSIGNMENT_ID,
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

    activeType = form.elements.type.value === "income" ? "income" : "expense";
    if (activeType === "expense") {
      expenseDraft = { categoryId, vendorId };
    }
    updateTypeFields(activeType);
    peopleSelect.value = assignmentId;
  }

  function populateFormFromRecord(record) {
    form.elements.type.value = record.type || "expense";

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
      assignmentId:
        record.assignmentId || window.BudgetAPI.SHARED_ASSIGNMENT_ID,
      assignment: record.assignment || "Shared",
    });
  }

  function updateTypeFields(type) {
    const income = type === "income";
    categorySelect.type = type;
    categorySelect.value = income
      ? window.BudgetAPI.INCOME_CATEGORY_ID
      : expenseDraft.categoryId;
    vendorField.hidden = income;
    vendorSelect.value = income ? "" : expenseDraft.vendorId;
    activeType = type;
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
    return !backdrop.hidden && formState() !== initialFormState;
  }

  function close(force = false, { updateRoute = true } = {}) {
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
    expenseDraft = { categoryId: "", vendorId: "" };
    (returnFocus && document.contains(returnFocus)
      ? returnFocus
      : document.querySelector('[data-tab="transactions"]')
    )?.focus();

    if (
      updateRoute &&
      window.AppRouter.currentRoute() === "transactions" &&
      window.AppRouter.currentParams().drawer
    ) {
      window.AppRouter.navigate("transactions");
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
      close(true);
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    }
  }

  // Create a new transaction
  function createTransaction(draft) {
    window.BudgetAPI.queueTransaction(draft);
    window.ToastUI?.show("Transaction added. Syncing…");
  }

  // Update an existing transaction
  function updateTransaction(draft) {
    window.BudgetAPI.queueTransactionUpdate(draft, openedBase);
    window.ToastUI?.show("Transaction updated. Syncing…");
  }

  form.querySelectorAll('[name="type"]').forEach((input) =>
    input.addEventListener(
      "change",
      () => {
        const nextType = input.value === "income" ? "income" : "expense";
        if (activeType === "expense" && nextType === "income") {
          expenseDraft = {
            categoryId: categorySelect.value,
            vendorId: vendorSelect.value,
          };
        }
        updateTypeFields(nextType);
      },
      true,
    ),
  );

  categorySelect.addEventListener("category-selected", () => {
    if (activeType === "expense") {
      expenseDraft.categoryId = categorySelect.value;
    }
  });
  vendorSelect.addEventListener("vendor-selected", () => {
    if (activeType === "expense") expenseDraft.vendorId = vendorSelect.value;
  });

  //  Form submission
  //    - 1: Check to see if all data is valid. If not, throw an error message.
  //    - 2: Process the data and get it ready to submit to the spreadsheet
  //    - 3: Queue the submission for editing or creating
  form.addEventListener("submit", handleSubmit);

  // Handle the clicks that open the new transaction drawer
  function handleNewTransactionClick(event) {
    const button = event.target.closest("[data-new-transaction]");
    if (!button) return;
    event.preventDefault();
    window.AppRouter.navigate("transactions", { drawer: "new" });
  }

  document.addEventListener("click", handleNewTransactionClick);

  window.addEventListener("app:route-changed", (event) => {
    const { route, params = {} } = event.detail;
    const drawerRequested =
      route === "transactions" &&
      ["new", "edit", "review"].includes(params.drawer);

    if (!drawerRequested && !backdrop.hidden) {
      close(true, { updateRoute: false });
    }
  });

  closeButton.addEventListener("click", () => close());
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

  window.TransactionEditor = {
    openCreate,
    openEdit,
    close,
  };
});
