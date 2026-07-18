document.addEventListener("DOMContentLoaded", () => {
  const { toISODate } = window.AppUtils;

  const form = document.querySelector(".transaction-form");
  if (!form) return;

  /**
   * Handle the value input
   *
   */

  /**
   * Handle the date picker input
   *
   * When the date picker is rendered, the form recognizes the component.
   * The initial date is set to today. Upon validation, the date value will be taken
   * from the dateInput component.
   *
   * The internal state for the date picker is handled inside of date-picker.js
   */
  const dateInput = form.elements["transaction-date"];
  const datePickerElement = form.querySelector(
    'date-picker[name="transaction-date"]',
  );

  function setToday() {
    if (datePickerElement) {
      datePickerElement.value = toISODate(new Date());
    }
  }

  const categorySelect = form.elements.category;
  const categoryField = form.querySelector(".category-form-field");
  const inlineCategory = document.getElementById("inline-category");
  const inlineCategoryName = document.getElementById("inline-category-name");
  const inlineCategoryMessage = inlineCategory.querySelector(
    ".inline-category-message",
  );
  const vendorIdInput = form.elements.vendor;
  const vendorInput = document.getElementById("vendor-combobox-input");
  const vendorCombobox = document.getElementById("vendor-combobox");
  const vendorList = document.getElementById("vendor-combobox-list");
  const vendorField = form.querySelector(".vendor-form-field");
  const inlineVendorMessage = vendorField.querySelector(
    ".inline-vendor-message",
  );
  const assignmentSelect = form.elements.assignment;
  const inlinePerson = document.getElementById("inline-person");
  const inlinePersonName = document.getElementById("inline-person-name");
  const inlinePersonMessage = inlinePerson.querySelector(
    ".inline-person-message",
  );
  const message = form.querySelector(".form-message");
  const syncText = document.getElementById("transaction-sync-text");
  const syncActions = document.getElementById("transaction-sync-actions");

  let activeVendorIndex = -1;

  function populateCategories(preferredValue = categorySelect.value) {
    const type = form.elements.type.value;
    const categories = window.BudgetAPI.listCategories({ type });
    categorySelect.replaceChildren(
      new Option("Select a category", ""),
      ...categories.map((category) => new Option(category.name, category.id)),
      ...(type === "expense"
        ? [new Option("+ Add new category…", "__new__")]
        : []),
    );
    if (
      [...categorySelect.options].some(
        (option) => option.value === preferredValue,
      )
    ) {
      categorySelect.value = preferredValue;
    }
  }

  function closeInlineCategory(resetSelection = false) {
    inlineCategory.hidden = true;
    inlineCategoryName.value = "";
    inlineCategoryMessage.textContent = "";
    if (resetSelection) categorySelect.value = "";
  }

  function selectVendor(vendor) {
    vendorIdInput.value = vendor?.id || "";
    vendorInput.value = vendor?.name || "";
    inlineVendorMessage.textContent = "";
    closeVendorList();
  }
  function closeVendorList() {
    vendorList.hidden = true;
    vendorInput.setAttribute("aria-expanded", "false");
    vendorInput.removeAttribute("aria-activedescendant");
    activeVendorIndex = -1;
  }
  function renderVendorList() {
    const query = vendorInput.value.trim().toLowerCase();
    const vendors = window.BudgetAPI.listVendors().filter(
      (vendor) => !query || vendor.name.toLowerCase().includes(query),
    );
    const exact = window.BudgetAPI.listVendors().some(
      (vendor) => vendor.name.toLowerCase() === query,
    );
    const options = vendors.map((vendor) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.id = `vendor-option-${vendor.id}`;
      button.dataset.vendorId = vendor.id;
      button.textContent = vendor.name;
      return button;
    });
    if (query && !exact) {
      const add = document.createElement("button");
      add.type = "button";
      add.setAttribute("role", "option");
      add.className = "add-option";
      add.id = "vendor-option-add";
      add.dataset.addVendor = "";
      add.textContent = `Add “${vendorInput.value.trim()}”`;
      options.push(add);
    }
    if (options.length) vendorList.replaceChildren(...options);
    else {
      const empty = document.createElement("p");
      empty.className = "combobox-empty";
      empty.textContent = "No matching vendors";
      vendorList.replaceChildren(empty);
    }
    vendorList.hidden = false;
    vendorInput.setAttribute("aria-expanded", "true");
    activeVendorIndex = -1;
  }
  function resetVendor() {
    vendorIdInput.value = "";
    vendorInput.value = "";
    inlineVendorMessage.textContent = "";
    closeVendorList();
  }

  function populateAssignments(
    preferredValue = assignmentSelect.value ||
      window.BudgetAPI.SHARED_ASSIGNMENT_ID,
  ) {
    const people = window.BudgetAPI.listPeople();
    assignmentSelect.replaceChildren(
      ...people.map((person) => new Option(person.name, person.id)),
      new Option("+ Add new person…", "__new__"),
    );
    assignmentSelect.value = people.some(
      (person) => person.id === preferredValue,
    )
      ? preferredValue
      : window.BudgetAPI.SHARED_ASSIGNMENT_ID;
  }

  function closeInlinePerson(resetSelection = false) {
    inlinePerson.hidden = true;
    inlinePersonName.value = "";
    inlinePersonMessage.textContent = "";
    if (resetSelection)
      assignmentSelect.value = window.BudgetAPI.SHARED_ASSIGNMENT_ID;
  }

  function updateTransactionTypeFields() {
    const isIncome = form.elements.type.value === "income";
    categoryField.hidden = isIncome;
    vendorField.hidden = isIncome;
    categorySelect.required = true;
    populateCategories(isIncome ? window.BudgetAPI.INCOME_CATEGORY_ID : "");
    if (isIncome) {
      closeInlineCategory();
      categorySelect.value = window.BudgetAPI.INCOME_CATEGORY_ID;
      resetVendor();
    }
  }

  setToday();
  populateCategories("");
  populateAssignments(window.BudgetAPI.SHARED_ASSIGNMENT_ID);
  updateTransactionTypeFields();

  form.querySelectorAll('[name="type"]').forEach((input) =>
    input.addEventListener("change", () => {
      updateTransactionTypeFields();
    }),
  );

  categorySelect.addEventListener("change", () => {
    const adding = categorySelect.value === "__new__";
    inlineCategory.hidden = !adding;
    inlineCategoryMessage.textContent = "";
    if (adding) inlineCategoryName.focus();
  });

  document
    .getElementById("save-inline-category")
    .addEventListener("click", async () => {
      inlineCategoryMessage.textContent = "";
      try {
        const category = await window.BudgetAPI.addCategory({
          name: inlineCategoryName.value,
          type: "expense",
        });
        populateCategories(category.id);
        closeInlineCategory();
      } catch (error) {
        inlineCategoryMessage.className = "inline-category-message error";
        inlineCategoryMessage.textContent = error.message;
      }
    });

  document
    .getElementById("cancel-inline-category")
    .addEventListener("click", () => {
      closeInlineCategory(true);
      categorySelect.focus();
    });

  inlineCategoryName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("save-inline-category").click();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeInlineCategory(true);
      categorySelect.focus();
    }
  });

  window.addEventListener("budget:categories-changed", (event) => {
    if (!inlineCategory.hidden) return;
    populateCategories(event.detail?.id || categorySelect.value);
  });

  async function addTypedVendor() {
    const name = vendorInput.value.trim();
    if (!name) return;
    inlineVendorMessage.textContent = "";
    try {
      selectVendor(await window.BudgetAPI.addVendor({ name }));
    } catch (error) {
      inlineVendorMessage.className = "inline-vendor-message error";
      inlineVendorMessage.textContent = error.message;
    }
  }
  function chooseVendorOption(option) {
    if (option.dataset.addVendor !== undefined) {
      addTypedVendor();
      return;
    }
    const vendor = window.BudgetAPI.listVendors().find(
      (item) => item.id === option.dataset.vendorId,
    );
    if (vendor) selectVendor(vendor);
  }
  function moveVendorOption(direction) {
    const options = [...vendorList.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    activeVendorIndex =
      (activeVendorIndex + direction + options.length) % options.length;
    options.forEach((option, index) =>
      option.classList.toggle("active", index === activeVendorIndex),
    );
    vendorInput.setAttribute(
      "aria-activedescendant",
      options[activeVendorIndex].id,
    );
    options[activeVendorIndex].scrollIntoView({ block: "nearest" });
  }
  vendorInput.addEventListener("focus", renderVendorList);
  vendorInput.addEventListener("input", () => {
    const selected = window.BudgetAPI.listVendors().find(
      (item) => item.id === vendorIdInput.value,
    );
    if (!selected || selected.name !== vendorInput.value)
      vendorIdInput.value = "";
    inlineVendorMessage.textContent = "";
    renderVendorList();
  });
  vendorInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (vendorList.hidden) renderVendorList();
      moveVendorOption(event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key === "Enter" && !vendorList.hidden) {
      const options = [...vendorList.querySelectorAll('[role="option"]')];
      if (options[activeVendorIndex]) {
        event.preventDefault();
        chooseVendorOption(options[activeVendorIndex]);
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeVendorList();
    }
  });
  vendorList.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) chooseVendorOption(option);
  });
  document.addEventListener("click", (event) => {
    if (!vendorCombobox.contains(event.target)) closeVendorList();
  });
  window.addEventListener("budget:vendors-changed", (event) => {
    if (event.detail?.oldId === vendorIdInput.value) selectVendor(event.detail);
    else if (vendorIdInput.value) {
      const selected = window.BudgetAPI.listVendors().find(
        (item) => item.id === vendorIdInput.value,
      );
      if (selected) vendorInput.value = selected.name;
    }
    if (!vendorList.hidden) renderVendorList();
  });

  window.addEventListener("budget:people-changed", (event) => {
    if (!inlinePerson.hidden) return;
    populateAssignments(event.detail?.id || assignmentSelect.value);
  });

  assignmentSelect.addEventListener("change", () => {
    const adding = assignmentSelect.value === "__new__";
    inlinePerson.hidden = !adding;
    inlinePersonMessage.textContent = "";
    if (adding) inlinePersonName.focus();
  });

  document
    .getElementById("save-inline-person")
    .addEventListener("click", async () => {
      inlinePersonMessage.textContent = "";
      try {
        const person = await window.BudgetAPI.addPerson({
          name: inlinePersonName.value,
        });
        populateAssignments(person.id);
        closeInlinePerson();
      } catch (error) {
        inlinePersonMessage.className = "inline-person-message error";
        inlinePersonMessage.textContent = error.message;
      }
    });

  document
    .getElementById("cancel-inline-person")
    .addEventListener("click", () => {
      closeInlinePerson(true);
      assignmentSelect.focus();
    });

  inlinePersonName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("save-inline-person").click();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeInlinePerson(true);
      assignmentSelect.focus();
    }
  });

  function renderSyncStatus(status = window.BudgetAPI.getOutboxStatus()) {
    if (status.failed) {
      const pendingStatus = status.waitingForOnline
        ? " · Offline · Sync will attempt again when back online"
        : status.pending
          ? ` · ${status.pending} saving`
          : "";
      syncText.textContent = `${status.failed} ${status.failed === 1 ? "transaction needs" : "transactions need"} attention${pendingStatus}`;
      syncActions.hidden = false;
      return;
    }
    if (status.retrying) {
      syncText.textContent = `Waiting to retry ${status.retrying} ${status.retrying === 1 ? "transaction" : "transactions"}`;
      syncActions.hidden = false;
      return;
    }
    if (status.waitingForOnline) {
      syncText.textContent =
        "Offline · Sync will attempt again when back online";
      syncActions.hidden = false;
      return;
    }
    syncActions.hidden = true;
    syncText.textContent = status.pending
      ? `Saving ${status.pending} ${status.pending === 1 ? "transaction" : "transactions"}…`
      : "All changes saved";
  }

  document
    .getElementById("view-sync-from-form")
    .addEventListener("click", () => window.BudgetUI.showTab("sync"));
  window.addEventListener("budget:transaction-sync-changed", (event) =>
    renderSyncStatus(event.detail),
  );

  /**
   * Handle form submission
   *
   *
   *
   */
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.textContent = "";

    const isIncome = form.elements.type.value === "income";

    if (!isIncome && categorySelect.value === "__new__") {
      inlineCategoryMessage.className = "inline-category-message error";
      inlineCategoryMessage.textContent =
        "Add the new category before saving the transaction.";
      inlineCategoryName.focus();
      return;
    }

    if (!isIncome && !vendorIdInput.value) {
      inlineVendorMessage.className = "inline-vendor-message error";
      inlineVendorMessage.textContent =
        "Choose a vendor or add the typed name.";
      vendorInput.focus();
      return;
    }

    if (!dateInput.value) {
      message.className = "form-message error";
      message.textContent = "Choose a transaction date.";

      const trigger = datePickerEl?.querySelector(".date-picker-trigger");
      if (trigger) trigger.focus();
      return;
    }

    if (assignmentSelect.value === "__new__") {
      inlinePersonMessage.className = "inline-person-message error";
      inlinePersonMessage.textContent =
        "Add the household member before saving the transaction.";
      inlinePersonName.focus();
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      message.className = "form-message error";
      message.textContent = "Complete the required fields before saving.";
      return;
    }

    const values = new FormData(form);
    const transaction = {
      type: values.get("type"),
      amount: Number(values.get("amount")),
      date: values.get("transaction-date"),
      categoryId: values.get("category"),
      vendorId: isIncome ? "" : values.get("vendor"),
      assignmentId:
        values.get("assignment") || window.BudgetAPI.SHARED_ASSIGNMENT_ID,
      notes: values.get("notes").trim(),
    };

    try {
      window.BudgetAPI.queueTransaction(transaction);
      form.reset();
      setToday();
      closeInlineCategory();
      populateCategories("");
      resetVendor();
      closeInlinePerson();
      populateAssignments(window.BudgetAPI.SHARED_ASSIGNMENT_ID);
      updateTransactionTypeFields();
      message.className = "form-message success";
      message.textContent = "Transaction added. Ready for another.";
      form.elements.amount.focus();
    } catch (error) {
      message.className = "form-message error";
      message.textContent = `Couldn’t save this transaction: ${error.message}`;
    }
  });

  window.addEventListener("budget:reference-data-changed", () => {
    populateCategories(
      form.elements.type.value === "income"
        ? window.BudgetAPI.INCOME_CATEGORY_ID
        : categorySelect.value,
    );
    if (vendorIdInput.value) {
      const vendor = window.BudgetAPI.listVendors().find(
        (item) => item.id === vendorIdInput.value,
      );
      if (vendor) selectVendor(vendor);
    }
    populateAssignments(assignmentSelect.value);
    updateTransactionTypeFields();
  });
  renderSyncStatus();
});
