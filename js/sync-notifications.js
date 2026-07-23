(function () {
  const badge = document.getElementById("sync-nav-badge");

  let outageToast = null;

  function updateBadge() {
    const items = window.BudgetAPI.getSyncItems();

    const failed = items.filter((item) => item.status === "failed").length;

    badge.hidden = items.length === 0;
    badge.textContent = String(items.length);
    badge.classList.toggle("failed", failed > 0);
  }

  function viewSync() {
    window.AppRouter.navigate("sync");
  }

  function handleSyncSucceeded(event) {
    updateBadge();

    const count = Number(event.detail?.count) || 1;

    if (
      !window.BudgetAPI.getSyncItems().some(
        (item) => item.retrying || item.waitingForOnline,
      )
    ) {
      outageToast?.remove();
      outageToast = null;
    }

    window.ToastUI.show(
      `${count} ${count === 1 ? "change" : "changes"} saved to the Sheet.`,
    );
  }

  function handleSyncFailed(event) {
    updateBadge();

    const count = Number(event.detail?.count) || 1;

    window.ToastUI.show(
      `${count} ${count === 1 ? "change needs" : "changes need"} attention.`,
      {
        type: "error",
        sticky: true,
        action: "View Sync",
        onAction: viewSync,
      },
    );
  }

  function handleRetryScheduled() {
    updateBadge();

    if (outageToast?.isConnected) {
      return;
    }

    outageToast = window.ToastUI.show(
      "Couldn’t reach Google. Changes are saved locally and will retry automatically.",
      {
        type: "error",
        sticky: true,
        action: "View Sync",
        onAction: viewSync,
      },
    );
  }

  window.addEventListener("budget:sync-changed", updateBadge);
  window.addEventListener("budget:sync-succeeded", handleSyncSucceeded);
  window.addEventListener("budget:sync-failed", handleSyncFailed);
  window.addEventListener("budget:sync-retry-scheduled", handleRetryScheduled);
  window.addEventListener("online", updateBadge);
  window.addEventListener("offline", updateBadge);

  updateBadge();
})();
