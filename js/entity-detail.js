document.addEventListener("DOMContentLoaded", () => {
  const title = document.getElementById("entity-detail-title");
  const eyebrow = document.getElementById("entity-detail-eyebrow");
  const editButton = document.getElementById("edit-entity");
  const summary = document.getElementById("entity-summary-grid");
  const count = document.getElementById("entity-transaction-count");
  const list = document.getElementById("entity-transaction-list");
  const table = document.getElementById("entity-transaction-table-wrap");
  const empty = document.getElementById("entity-transaction-state");
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  let selected = null;

  /**
   * Set the date range to filter data
   */
  let currentRange = { start: "", end: "" };
  const rangePicker = document.querySelector("date-range-picker");

  if (rangePicker) {
    currentRange = rangePicker.value;
  }

  // Update the local state whenever the range changes and refresh the view
  document.addEventListener("date-range-changed", (event) => {
    currentRange = event.detail; // { preset, start, end, label }
    render();
  });

  const config = {
    category: {
      label: "category",
      plural: "categories",
      screen: "categories",
      records: () => window.BudgetAPI.listCategories({ type: "expense" }),
    },
    vendor: {
      label: "vendor",
      plural: "vendors",
      screen: "vendors",
      records: () => window.BudgetAPI.listVendors(),
    },
    assignment: {
      label: "person",
      plural: "people",
      screen: "people",
      records: () => window.BudgetAPI.listPeople(),
    },
  };

  function record() {
    return selected
      ? config[selected.kind].records().find((item) => item.id === selected.id)
      : null;
  }

  // Get the transactions and filter them down by the necessary categories and date range
  function transactions() {
    if (!selected) return [];
    const field = {
      category: "categoryId",
      vendor: "vendorId",
      assignment: "assignmentId",
    }[selected.kind];

    const allTransactions = window.BudgetUI.getTransactions;

    return allTransactions()
      .filter((item) => item[field] === selected.id)
      .filter(
        (item) => selected.kind === "assignment" || item.type !== "income",
      )
      .filter((item) => {
        const { start, end } = currentRange;
        return (!start || item.date >= start) && (!end || item.date <= end);
      })
      .sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date)) ||
          String(b.createdAt).localeCompare(String(a.createdAt)),
      );
  }

  function card(label, value, extra = "") {
    return `<article class="summary-card"><div><p>${label}</p><strong class="${extra}">${value}</strong></div></article>`;
  }

  function render() {
    if (!selected) return;
    const entity = record();
    if (!entity) {
      window.BudgetUI.showTab(config[selected.kind].screen);
      return;
    }
    const items = transactions();
    title.textContent = entity.name;
    eyebrow.textContent = `${config[selected.kind].label} details`;
    editButton.textContent = `Edit ${config[selected.kind].label}`;
    const sync = window.BudgetAPI.getEntitySyncStatus(
      selected.kind,
      selected.id,
    );
    editButton.disabled = Boolean(sync);
    editButton.title = sync ? "Available after this item finishes syncing" : "";
    if (selected.kind === "assignment") {
      const income = items
        .filter((item) => item.type === "income")
        .reduce((total, item) => total + Number(item.amount || 0), 0);
      const expenses = items
        .filter((item) => item.type !== "income")
        .reduce((total, item) => total + Number(item.amount || 0), 0);
      summary.innerHTML =
        card("Income", currency.format(income), "amount-income") +
        card("Expenses", currency.format(expenses), "amount-expense") +
        card("Net activity", currency.format(income - expenses));
    } else {
      const total = items.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0,
      );
      summary.innerHTML =
        card("Total spent", currency.format(total), "amount-expense") +
        card("Transactions", String(items.length)) +
        card(
          "Average transaction",
          currency.format(items.length ? total / items.length : 0),
        );
    }
    count.textContent = `${items.length} ${items.length === 1 ? "transaction" : "transactions"}`;
    if (!items.length) {
      table.hidden = true;
      empty.hidden = false;
      empty.innerHTML =
        '<div class="empty-symbol" aria-hidden="true">$</div><h3>No activity in this range</h3><p>Choose another date range to see more transactions.</p>';
    } else {
      list.replaceChildren(...items.map(window.BudgetUI.createTransactionRow));
      empty.hidden = true;
      table.hidden = false;
    }
  }

  function open(kind, id) {
    if (!config[kind]) return;
    selected = { kind, id };
    window.BudgetUI.showTab("entity-detail");
    render();
  }
  document
    .getElementById("entity-detail-back")
    .addEventListener(
      "click",
      () => selected && window.BudgetUI.showTab(config[selected.kind].screen),
    );
  editButton.addEventListener(
    "click",
    () => selected && window.EntityEditor.open(selected.kind, selected.id),
  );
  list.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-transaction-id]");
    if (row) window.TransactionEditor.open(row.dataset.transactionId);
  });
  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("tr[data-transaction-id]");
    if (!row) return;
    event.preventDefault();
    window.TransactionEditor.open(row.dataset.transactionId);
  });
  [
    "budget:date-range-changed",
    "budget:transaction-queued",
    "budget:transaction-saved",
    "budget:transaction-sync-changed",
    "budget:transaction-restored",
    "budget:transaction-removed",
    "budget:categories-changed",
    "budget:vendors-changed",
    "budget:people-changed",
    "budget:entity-sync-changed",
  ].forEach((name) => window.addEventListener(name, render));
  window.EntityDetailUI = {
    open,
    render,
    getSelected: () => (selected ? { ...selected } : null),
  };
});
