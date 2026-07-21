(function () {
  const { create: createTransactionRow } = window.TransactionRow;
  const { escapeHTML, money } = window.AppUtils;
  const { shortDateFormatter } = window.DateUtils;

  let cleanup = null;

  function mount(root, { params = {} } = {}) {
    // References to the form, list, and message
    const transactionList = root.querySelector("#transaction-list");
    const search = root.querySelector("#transaction-search");
    const typeFilter = root.querySelector("#type-filter");
    const summaryBalance = root.querySelector("#summary-balance");
    const summaryIncome = root.querySelector("#summary-income");
    const summaryExpenses = root.querySelector("#summary-expenses");
    const tableWrap = root.querySelector("#transaction-table-wrap");
    const message = root.querySelector("#transaction-state");
    const transactionCount = root.querySelector("#transaction-count");
    const list = root.querySelector("#transaction-list");

    let query = "";
    let type = "all";
    let activeRange = { start: "", end: "", preset: "all" };
    let drawerOpened = false;

    function amountFor(transaction) {
      const amount = Number(transaction.amount) || 0;
      return transaction.type === "income" ? amount : -amount;
    }

    //  Update the summary tabs at the top of the screen
    function updateSummary() {
      const transactions = window.BudgetUI?.getTransactions() || [];
      const ranged = transactions.filter((transaction) => {
        const { start, end } = activeRange;
        return (
          (!start || transaction.date >= start) &&
          (!end || transaction.date <= end)
        );
      });

      const income = ranged
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const expenses = ranged
        .filter((item) => item.type !== "income")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const balance = ranged.reduce((sum, item) => sum + amountFor(item), 0);

      summaryBalance.textContent = money(balance);
      summaryIncome.textContent = money(income);
      summaryExpenses.textContent = money(expenses);
    }

    //  Filter the transactions by the search key and type selection
    function filteredTransactions() {
      const transactions = window.BudgetUI?.getTransactions() || [];

      return transactions
        .filter((item) => {
          const { start, end } = activeRange;
          return (!start || item.date >= start) && (!end || item.date <= end);
        })
        .filter((item) => type === "all" || item.type === type)
        .filter(
          (item) =>
            !query ||
            [
              item.category,
              item.vendor,
              item.assignment || "Shared",
              item.notes,
            ].some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(query),
            ),
        )
        .sort(
          (a, b) =>
            String(b.date).localeCompare(String(a.date)) ||
            String(b.createdAt).localeCompare(String(a.createdAt)),
        );
    }

    //  Render the vendor list from the spreadsheet data
    function render() {
      const items = filteredTransactions();

      const total = items.length;
      transactionCount.textContent = `${total} ${total === 1 ? "transaction" : "transactions"}`;

      if (!items.length) {
        tableWrap.hidden = true;
        message.hidden = false;
        const filtered = Boolean(
          query || type !== "all" || activeRange.preset !== "all",
        );
        message.innerHTML = `<div class="empty-symbol" aria-hidden="true">${filtered ? "?" : "$"}</div><h3>${filtered ? "No matches found" : "Your ledger is ready"}</h3><p>${filtered ? "Try changing your search or filter." : "Add your first transaction and it will appear here."}</p>`;
        return;
      }

      list.replaceChildren(...items.map(createTransactionRow));
      message.hidden = true;
      tableWrap.hidden = false;
    }

    //  Handle clicks inside the list
    //  open the entity detail screen for the vendor
    function editTransaction(id) {
      window.AppRouter.navigate("transactions", {
        drawer: "edit",
        id,
      });
    }

    function handleClick(event) {
      const row = event.target.closest("tr[data-transaction-id]");
      if (row) editTransaction(row.dataset.transactionId);
    }

    function handleKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("tr[data-transaction-id]");
      if (!row) return;
      event.preventDefault();
      editTransaction(row.dataset.transactionId);
    }

    function handleSearch() {
      query = search.value.trim().toLowerCase();
      render();
    }

    function handleTypeChange(event) {
      type = event.target.value;
      render();
    }

    function handleDateRangeChange(event) {
      activeRange = event.detail;
      load();
    }

    function handleLoadError(event) {
      tableWrap.hidden = true;
      message.hidden = false;

      message.innerHTML = `
        <div class="empty-symbol" aria-hidden="true">!</div>
        <h3>We couldn’t load your sheet</h3>
        <p>
          ${escapeHTML(event.detail.error.message)}
          Check the URL and deployment access in Settings.
        </p>`;
    }

    function load() {
      updateSummary();
      render();
    }

    function openRequestedDrawer() {
      if (drawerOpened) return;

      if (params.drawer === "new") {
        drawerOpened = Boolean(window.TransactionEditor?.openCreate());
        return;
      }

      if (!["edit", "review"].includes(params.drawer) || !params.id) return;

      const transactionIsAvailable =
        window.BudgetUI.areTransactionsLoaded() ||
        Boolean(window.BudgetAPI.getTransactionOutboxItem(params.id));

      if (!transactionIsAvailable) return;

      drawerOpened = Boolean(
        window.TransactionEditor?.openEdit(params.id, {
          review: params.drawer === "review",
        }),
      );

      if (!drawerOpened && window.BudgetUI.areTransactionsLoaded()) {
        window.AppRouter.navigate("transactions");
      }
    }

    function handleTransactionsLoaded() {
      load();
      openRequestedDrawer();
    }

    //  Listen to the submission and click events
    //  Rerender when the search input changes
    //  Rerender when vendors change, sync completes, or a transaction saves
    transactionList.addEventListener("click", handleClick);
    transactionList.addEventListener("keydown", handleKeydown);
    search.addEventListener("input", handleSearch);
    typeFilter.addEventListener("change", handleTypeChange);
    window.addEventListener("date-range-changed", handleDateRangeChange);
    window.addEventListener("budget:transaction-sync-changed", load);
    window.addEventListener("budget:transaction-saved", load);
    window.addEventListener(
      "budget:transactions-loaded",
      handleTransactionsLoaded,
    );
    window.addEventListener("budget:transaction-removed", load);
    window.addEventListener("budget:transaction-restored", load);
    window.addEventListener("budget:transaction-queued", load);
    window.addEventListener("budget:transactions-load-error", handleLoadError);

    // Run an initial render on mount
    if (window.BudgetUI.areTransactionsLoaded()) {
      load();
    } else {
      tableWrap.hidden = true;
      message.hidden = false;
      message.innerHTML = `
        <div class="spinner" aria-hidden="true"></div>
        <p>Loading your transactions…</p>
    `;
    }

    openRequestedDrawer();

    // Set the cleanup to remove the listeners
    cleanup = () => {
      transactionList.removeEventListener("click", handleClick);
      transactionList.removeEventListener("keydown", handleKeydown);
      search.removeEventListener("input", handleSearch);
      typeFilter.removeEventListener("change", handleTypeChange);
      window.removeEventListener("date-range-changed", handleDateRangeChange);
      window.removeEventListener("budget:transaction-sync-changed", load);
      window.removeEventListener("budget:transaction-saved", load);
      window.removeEventListener(
        "budget:transactions-loaded",
        handleTransactionsLoaded,
      );
      window.removeEventListener("budget:transaction-removed", load);
      window.removeEventListener("budget:transaction-restored", load);
      window.removeEventListener("budget:transaction-queued", load);
      window.removeEventListener(
        "budget:transactions-load-error",
        handleLoadError,
      );
    };
  }

  // Remove the listeners when we navigate away
  function unmount() {
    cleanup?.();
    cleanup = null;
  }

  window.TransactionsRoute = {
    mount,
    unmount,
  };
})();
