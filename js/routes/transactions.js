(function () {
  const { escapeHTML, money } = window.AppUtils;
  const { shortDateFormatter } = window.DateUtils;

  let cleanup = null;

  function mount(root) {
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

    // HTML for a single row in the table
    function createTransactionRow(transaction) {
      const row = document.createElement("tr");
      row.dataset.transactionId = transaction.id;
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute(
        "aria-label",
        `Edit ${transaction.vendor || transaction.category || "transaction"} from ${transaction.date}`,
      );
      const isIncome = transaction.type === "income";
      const category = String(
        transaction.category || (isIncome ? "Income" : "Other"),
      );
      const initial = category.charAt(0).toUpperCase();
      const note = String(transaction.notes || "").trim();
      const syncStatus = transaction.syncStatus;
      const syncBadge = syncStatus
        ? `<span class="transaction-sync-badge ${syncStatus}" title="${escapeHTML(transaction.syncError || "Waiting to sync")}">${syncStatus === "failed" ? "Needs attention" : "Pending"}</span>`
        : "";
      row.innerHTML = `
        <td>${shortDateFormatter.format(new Date(`${transaction.date}T00:00:00Z`))}${syncBadge}</td>
        <td><div class="transaction-name"><span class="category-icon${isIncome ? " income-category-icon" : ""}" aria-hidden="true">${escapeHTML(initial)}</span><strong class="${isIncome ? "income-category-title" : ""}">${escapeHTML(category)}</strong></div></td>
        <td class="vendor-cell">${escapeHTML(isIncome ? "---" : transaction.vendor || "---")}</td>
        <td><span class="assignment-chip">${escapeHTML(transaction.assignment || "Shared")}</span></td>
        <td class="note-cell"><span title="${escapeHTML(note)}">${escapeHTML(note || "---")}</span></td>
        <td class="amount-cell ${isIncome ? "amount-income" : "amount-expense"}">${isIncome ? "+" : "−"}${currency.format(Math.abs(Number(transaction.amount) || 0))}</td>`;
      return row;
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
    function handleClick(event) {
      const row = event.target.closest("tr[data-transaction-id]");
      if (row) window.TransactionEditor?.open(row.dataset.transactionId);
    }

    function handleKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("tr[data-transaction-id]");
      if (!row) return;
      event.preventDefault();
      window.TransactionEditor?.open(row.dataset.transactionId);
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
    window.addEventListener("budget:transactions-loaded", load);
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

    // Set the cleanup to remove the listeners
    cleanup = () => {
      transactionList.removeEventListener("click", handleClick);
      transactionList.removeEventListener("keydown", handleKeydown);
      search.removeEventListener("input", handleSearch);
      typeFilter.removeEventListener("change", handleTypeChange);
      window.removeEventListener("date-range-changed", handleDateRangeChange);
      window.removeEventListener("budget:transaction-sync-changed", load);
      window.removeEventListener("budget:transaction-saved", load);
      window.removeEventListener("budget:transactions-loaded", load);
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
