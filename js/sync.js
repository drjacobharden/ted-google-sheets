document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("sync-list");
  const empty = document.getElementById("sync-empty");
  const summary = document.getElementById("sync-screen-summary");
  const badge = document.getElementById("sync-nav-badge");
  const retryAll = document.getElementById("retry-all-sync");
  const toastStack = document.getElementById("toast-stack");
  let countdownTimer = null;
  let outageToast = null;
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  function escapeHTML(value) {
    return String(value).replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );
  }

  function transactionDescription(record) {
    const name =
      record.type === "income"
        ? record.category
        : record.vendor || record.category;
    return `${record.date} · ${name || "Transaction"} · ${currency.format(Number(record.amount) || 0)}`;
  }

  function browserIsOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function retryDescription(item) {
    const seconds = Math.max(0, Math.ceil((Number(item.nextRetryAt) - Date.now()) / 1000));
    const timing = seconds > 0 ? `Retrying in ${seconds}s` : "Retrying now";
    return `Couldn’t reach Google · ${timing} · Attempt ${item.attempts}`;
  }

  function itemMarkup(item) {
    const failed = item.status === "failed";
    const syncing = item.status === "syncing";
    const retrying = item.retrying;
    const waitingForOnline = item.waitingForOnline;
    const title = item.source === "transaction"
      ? `${item.operation === "update" ? "Update" : "New"} transaction`
      : item.source === "investmentAccount" ? "New investment account"
      : ["investmentSnapshot", "investmentMonth"].includes(item.source) ? "Investment monthly update"
      : `New ${{ category: "category", vendor: "vendor", assignment: "assignment" }[item.kind]}`;
    const detail =
      item.source === "transaction" ? transactionDescription(item.record)
      : ["investmentSnapshot", "investmentMonth"].includes(item.source) ? `${item.record.month} · ${item.record.accountName} · ${currency.format(Number(item.record.balance) || 0)}`
      : item.record.name;
    const icon =
      item.source === "transaction" ? "$"
        : ["investmentSnapshot", "investmentMonth"].includes(item.source) ? "↗"
        : String(item.record.name || "?")
            .charAt(0)
            .toUpperCase();
    const offlineRetryControl = '<button class="sync-retry-now" type="button" disabled title="Available when online">Retry now</button>';
    const controls = waitingForOnline
      ? `${offlineRetryControl}<button class="sync-discard" type="button" data-sync-action="discard">Discard</button>`
      : retrying
      ? '<button class="sync-retry-now" type="button" data-sync-action="retry">Retry now</button><button class="sync-discard" type="button" data-sync-action="discard">Discard</button>'
      : failed
      ? `${item.failureCode === "conflict" ? `<button class="sync-review" type="button" data-sync-action="review">Review</button>` : browserIsOffline() ? offlineRetryControl : `<button class="sync-retry" type="button" data-sync-action="retry" aria-label="Retry ${escapeHTML(title)}"><span class="retry-idle" aria-hidden="true">×</span><span class="retry-hover" aria-hidden="true">↻</span><span class="sr-only">Retry</span></button>`}<button class="sync-discard" type="button" data-sync-action="discard">Discard</button>`
      : syncing
        ? '<span class="sync-status-spinner" aria-label="Syncing"></span>'
        : '<span class="sync-pending-dot" aria-label="Waiting to sync"></span>';

    return `
      <article class="sync-item ${escapeHTML(item.status)}" data-sync-key="${escapeHTML(item.key)}">
        <span class="sync-item-icon" aria-hidden="true">${escapeHTML(icon)}</span>
        <div class="sync-item-copy">
          ${escapeHTML(title)}
          <span class="sync-item-description">${escapeHTML(detail)}</span>
          ${waitingForOnline ? `<small class="sync-retry-details offline">Offline · Sync will attempt again when back online</small>${item.error ? `<small class="sync-transport-error">${escapeHTML(item.error)}</small>` : ""}` : ""}
          ${retrying ? `<small class="sync-retry-details">${escapeHTML(retryDescription(item))}</small><small class="sync-transport-error">${escapeHTML(item.error)}</small>` : ""}
          ${failed ? `<small class="error">Needs attention · ${escapeHTML(item.error)}</small>` : ""}</div>
        <div class="sync-item-actions">${controls}</div>
    </article>`;
  }

  function render() {
    const items = window.BudgetAPI.getSyncItems();
    const failed = items.filter((item) => item.status === "failed").length;
    const retrying = items.filter((item) => item.retrying).length;
    const waitingForOnline = items.filter((item) => item.waitingForOnline).length;
    const retryable = items.filter(
      (item) => (item.status === "failed" && item.failureCode !== "conflict") || item.retrying || item.waitingForOnline,
    ).length;
    const syncing = items.filter((item) => item.status === "syncing").length;
    badge.hidden = items.length === 0;
    badge.textContent = String(items.length);
    badge.classList.toggle("failed", failed > 0);
    empty.hidden = items.length > 0;
    list.innerHTML = items.map(itemMarkup).join("");
    retryAll.hidden = retryable === 0;
    retryAll.disabled = browserIsOffline() && retryable > 0;
    retryAll.title = retryAll.disabled ? "Available when online" : "";
    summary.textContent = !items.length
      ? "All changes are saved."
      : waitingForOnline
        ? `Offline · Sync will attempt again when back online. ${waitingForOnline} ${waitingForOnline === 1 ? "change is" : "changes are"} waiting${failed ? ` · ${failed} ${failed === 1 ? "needs" : "need"} attention` : ""}.`
      : failed
        ? `${failed} ${failed === 1 ? "change needs" : "changes need"} attention · ${items.length - failed} waiting`
        : retrying
          ? `${retrying} ${retrying === 1 ? "change is" : "changes are"} waiting to retry.`
        : syncing
          ? `Syncing ${syncing} ${syncing === 1 ? "change" : "changes"}…`
          : `${items.length} ${items.length === 1 ? "change is" : "changes are"} waiting to sync.`;
    if (retrying > 0 && countdownTimer === null) countdownTimer = setInterval(render, 1000);
    if (retrying === 0 && countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (waitingForOnline > 0 && !outageToast?.isConnected) {
      outageToast = showToast("Offline. Changes are saved locally and will sync when back online.", {
        type: "error", sticky: true, action: "View Sync",
        onAction: () => window.BudgetUI.showTab("sync"),
      });
    }
    if (!items.length && outageToast?.isConnected) {
      outageToast.remove();
      outageToast = null;
    }
  }

  function showToast(text, options = {}) {
    const toast = document.createElement("div");
    toast.className = `toast${options.type === "error" ? " error" : ""}`;
    toast.innerHTML = `<p>${escapeHTML(text)}</p><div class="toast-actions">${options.action ? `<button type="button" data-toast-action>${escapeHTML(options.action)}</button>` : ""}<button type="button" data-toast-dismiss aria-label="Dismiss notification">×</button></div>`;
    toast
      .querySelector("[data-toast-dismiss]")
      .addEventListener("click", () => toast.remove());
    toast
      .querySelector("[data-toast-action]")
      ?.addEventListener("click", () => {
        options.onAction?.();
        toast.remove();
      });
    toastStack.append(toast);
    if (!options.sticky)
      setTimeout(() => toast.remove(), options.duration || 4500);
    return toast;
  }

  list.addEventListener("click", (event) => {
    const action =
      event.target.closest("[data-sync-action]")?.dataset.syncAction;
    const element = event.target.closest("[data-sync-key]");
    if (!action || !element) return;
    const item = window.BudgetAPI.getSyncItems().find(
      (entry) => entry.key === element.dataset.syncKey,
    );
    if (!item) return;
    try {
      if (action === "review") {
        if (item.source === "transaction") window.TransactionEditor.open(item.id, { review: true });
        if (["investmentSnapshot", "investmentMonth"].includes(item.source)) window.InvestmentUI?.reviewMonth(item.id);
      }
      if (action === "retry") {
        if (item.source === "transaction")
          window.BudgetAPI.retryTransaction(item.id);
        else if (item.source.startsWith("investment")) window.InvestmentAPI.retry(item.source, item.id);
        else window.BudgetAPI.retryEntity(item.kind, item.id);
      }
      if (
        action === "discard" &&
        window.confirm(
          `Discard this unsynchronized ${item.source === "transaction" ? "transaction change" : ["investmentSnapshot", "investmentMonth"].includes(item.source) ? "investment update" : item.source === "investmentAccount" ? "investment account" : item.kind}?`,
        )
      ) {
        if (item.source === "transaction")
          window.BudgetAPI.discardTransactionChange(item.id);
        else if (item.source.startsWith("investment")) window.InvestmentAPI.discard(item.source, item.id);
        else window.BudgetAPI.discardEntityChange(item.kind, item.id);
      }
    } catch (error) {
      showToast(error.message, { type: "error", sticky: true });
    }
    render();
  });

  retryAll.addEventListener("click", () => {
    window.BudgetAPI.getSyncItems()
      .filter((item) => item.retrying || item.status === "failed")
      .forEach((item) => {
        if (item.failureCode === "conflict") return;
        if (item.source === "transaction")
          window.BudgetAPI.retryTransaction(item.id);
        else if (item.source.startsWith("investment")) window.InvestmentAPI.retry(item.source, item.id);
        else window.BudgetAPI.retryEntity(item.kind, item.id);
      });
    render();
  });

  window.addEventListener("budget:sync-changed", render);
  window.addEventListener("budget:sync-succeeded", (event) => {
    if (!window.BudgetAPI.getSyncItems().some((item) => item.retrying || item.waitingForOnline)) {
      outageToast?.remove();
      outageToast = null;
    }
    const count = Number(event.detail?.count) || 1;
    showToast(
      `${count} ${count === 1 ? "change" : "changes"} saved to the Sheet.`,
    );
  });
  window.addEventListener("budget:sync-failed", (event) => {
    const count = Number(event.detail?.count) || 1;
    showToast(
      `${count} ${count === 1 ? "change needs" : "changes need"} attention.`,
      {
        type: "error",
        sticky: true,
        action: "View Sync",
        onAction: () => window.BudgetUI.showTab("sync"),
      },
    );
  });
  window.addEventListener("budget:sync-retry-scheduled", () => {
    if (outageToast?.isConnected) return;
    outageToast = showToast("Couldn’t reach Google. Changes are saved locally and will retry automatically.", {
      type: "error",
      sticky: true,
      action: "View Sync",
      onAction: () => window.BudgetUI.showTab("sync"),
    });
  });
  window.addEventListener("online", render);
  window.addEventListener("offline", render);

  window.ToastUI = { show: showToast };
  window.SyncUI = { render };
  render();
});
