const EntityDetailConfig = {
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

const EntityDetailRenderEvents = [
  "budget:transaction-queued",
  "budget:transaction-saved",
  "budget:transaction-sync-changed",
  "budget:transaction-restored",
  "budget:transaction-removed",
  "budget:transactions-loaded",
  "budget:reference-data-changed",
  "budget:categories-changed",
  "budget:vendors-changed",
  "budget:people-changed",
  "budget:entity-sync-changed",
];

(function () {
  const { money } = window.AppUtils;
  const { create: createTransactionRow } = window.TransactionRow;

  let cleanup = null;

  function mount(root, { params = {} } = {}) {
    const selected =
      EntityDetailConfig[params.kind] && params.id
        ? { kind: params.kind, id: String(params.id) }
        : null;

    if (!selected) {
      window.AppRouter.navigate("transactions");
      return;
    }

    const header = root.querySelector("page-title");
    const editButton = root.querySelector("#edit-entity");
    const rangePicker = root.querySelector("date-range-picker");
    const summary = root.querySelector("#entity-summary-grid");
    const count = root.querySelector("#entity-transaction-count");
    const list = root.querySelector("#entity-transaction-list");
    const table = root.querySelector("#entity-transaction-table-wrap");
    const empty = root.querySelector("#entity-transaction-state");

    let currentRange = { start: "", end: "" };

    if (rangePicker) {
      currentRange = rangePicker.value;
    }

    function handleDateRangeChange(event) {
      currentRange = event.detail; // { preset, start, end, label }
      render();
    }

    function record() {
      return selected
        ? EntityDetailConfig[selected.kind]
            .records()
            .find((item) => item.id === selected.id)
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
      if (!selected) return; // Safety guard to not render anything if an entity type isn't selected.

      const entity = record();

      if (!entity) {
        if (!window.BudgetUI.isReferenceDataLoaded()) {
          header.title = "Loading details…";
          editButton.disabled = true;
          summary.replaceChildren();
          table.hidden = true;
          empty.hidden = false;
          empty.innerHTML =
            '<div class="spinner" aria-hidden="true"></div><p>Loading details…</p>';
          return;
        }

        window.AppRouter.navigate(EntityDetailConfig[selected.kind].screen);
        return;
      }

      const items = transactions();

      header.title = entity.name;
      header.eyebrow = `${EntityDetailConfig[selected.kind].label} details`;
      editButton.textContent = `Edit ${EntityDetailConfig[selected.kind].label}`;

      const sync = window.BudgetAPI.getEntitySyncStatus(
        selected.kind,
        selected.id,
      );

      editButton.disabled = Boolean(sync);
      editButton.title = sync ? "Available after sync completes" : "";

      // Set up the summary at the top of the screen
      if (selected.kind === "assignment") {
        const income = items
          .filter((item) => item.type === "income")
          .reduce((total, item) => total + Number(item.amount || 0), 0);
        const expenses = items
          .filter((item) => item.type !== "income")
          .reduce((total, item) => total + Number(item.amount || 0), 0);
        summary.innerHTML =
          card("Income", money(income), "amount-income") +
          card("Expenses", money(expenses), "amount-expense") +
          card("Net activity", money(income - expenses));
      } else {
        const total = items.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0,
        );
        summary.innerHTML =
          card("Total spent", money(total), "amount-expense") +
          card("Transactions", String(items.length)) +
          card(
            "Average transaction",
            money(items.length ? total / items.length : 0),
          );
      }
      count.textContent = `${items.length} ${items.length === 1 ? "transaction" : "transactions"}`;
      if (!items.length) {
        table.hidden = true;
        empty.hidden = false;
        empty.innerHTML =
          '<div class="empty-symbol" aria-hidden="true">$</div><h3>No activity in this range</h3><p>Choose another date range to see more transactions.</p>';
      } else {
        list.replaceChildren(...items.map(createTransactionRow));
        empty.hidden = true;
        table.hidden = false;
      }
    }

    function handleEditButtonClick() {
      if (!selected) return;
      window.AppRouter.updateParams({
        drawer: "entity-edit",
        entityKind: selected.kind,
        entityId: selected.id,
      });
    }

    function handleListClick(event) {
      const row = event.target.closest("tr[data-transaction-id]");
      if (row) {
        window.AppRouter.updateParams({
          drawer: "edit",
          transactionId: row.dataset.transactionId,
        });
      }
    }

    function handleListKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("tr[data-transaction-id]");
      if (!row) return;
      event.preventDefault();
      window.AppRouter.updateParams({
        drawer: "edit",
        transactionId: row.dataset.transactionId,
      });
    }

    root.addEventListener("date-range-changed", handleDateRangeChange);
    editButton.addEventListener("click", handleEditButtonClick);
    list.addEventListener("click", handleListClick);
    list.addEventListener("keydown", handleListKeydown);
    EntityDetailRenderEvents.forEach((name) =>
      window.addEventListener(name, render),
    );

    render();

    cleanup = () => {
      root.removeEventListener("date-range-changed", handleDateRangeChange);
      editButton.removeEventListener("click", handleEditButtonClick);
      list.removeEventListener("click", handleListClick);
      list.removeEventListener("keydown", handleListKeydown);
      EntityDetailRenderEvents.forEach((name) =>
        window.removeEventListener(name, render),
      );
    };
  }

  function unmount() {
    cleanup?.();
    cleanup = null;
  }

  window.EntityRoute = {
    mount,
    unmount,
  };
})();
