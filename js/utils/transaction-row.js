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

window.TransactionRow = {
  create: createTransactionRow,
};
