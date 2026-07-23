document.addEventListener("DOMContentLoaded", () => {
  const vendorForm = document.getElementById("vendor-form");
  const vendorList = document.getElementById("vendor-list");
  const formMessage = vendorForm.querySelector(".vendor-form-message");
  const search = document.getElementById("vendor-search");
  let usage = new Map();
  let query = "";

  function escapeHTML(value) {
    return String(value).replace(
      /[&<>'"]/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[char],
    );
  }

  function render() {
    const allVendors = window.BudgetAPI.listVendors();
    const vendors = allVendors.filter((vendor) =>
      vendor.name.toLowerCase().includes(query),
    );
    document.getElementById("vendor-count").textContent = query
      ? `${vendors.length} of ${allVendors.length} vendors`
      : `${allVendors.length} ${allVendors.length === 1 ? "vendor" : "vendors"}`;
    if (!allVendors.length) {
      vendorList.innerHTML =
        '<div class="entity-empty"><strong>No vendors yet</strong><span>Add your first vendor to use it on transactions.</span></div>';
      return;
    }
    if (!vendors.length) {
      vendorList.innerHTML =
        '<div class="entity-empty"><strong>No matching vendors</strong><span>Try a different search.</span></div>';
      return;
    }
    vendorList.innerHTML = vendors
      .map((vendor) => {
        const count = usage.get(vendor.id) || 0;
        const sync = window.BudgetAPI.getEntitySyncStatus("vendor", vendor.id);
        const syncControls = sync
          ? `<div class="entity-sync-state ${sync.status}"><span>${sync.status === "failed" ? "Needs attention" : "Pending"}</span>${sync.status === "failed" ? `<button type="button" data-entity-action="retry" data-entity-id="${vendor.id}">Retry</button><button type="button" data-entity-action="remove" data-entity-id="${vendor.id}">Remove</button>` : ""}</div>`
          : "";
        return `<article class="category-item entity-link" data-entity-kind="vendor" data-entity-id="${vendor.id}" role="button" tabindex="0" aria-label="View ${escapeHTML(vendor.name)} vendor">
        <span class="category-avatar vendor-avatar" aria-hidden="true">${escapeHTML(vendor.name.charAt(0).toUpperCase())}</span>
        <div class="category-details"><strong>${escapeHTML(vendor.name)}</strong><span>${count} ${count === 1 ? "transaction" : "transactions"}</span></div>
        ${syncControls}
      </article>`;
      })
      .join("");
  }

  function load() {
    usage = new Map();
    (window.BudgetUI?.getTransactions() || [])
      .filter((transaction) => transaction.type !== "income")
      .forEach((transaction) => {
        if (!transaction.vendor) return;
        const key = transaction.vendorId;
        usage.set(key, (usage.get(key) || 0) + 1);
      });
    render();
  }

  vendorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.textContent = "";
    if (!vendorForm.checkValidity()) {
      vendorForm.reportValidity();
      return;
    }
    try {
      const vendor = await window.BudgetAPI.addVendor({
        name: vendorForm.elements.vendorName.value,
      });
      vendorForm.reset();
      vendorForm.elements.vendorName.focus();
      formMessage.className = "vendor-form-message success";
      formMessage.textContent = window.BudgetAPI.getConfig().endpoint
        ? `${vendor.name} was added. Syncing…`
        : `${vendor.name} was added.`;
      render();
    } catch (error) {
      formMessage.className = "vendor-form-message error";
      formMessage.textContent = error.message;
    }
  });

  search.addEventListener("input", () => {
    query = search.value.trim().toLowerCase();
    render();
  });
  vendorList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-entity-action]");
    if (!button) {
      const row = event.target.closest("[data-entity-id]");
      if (row) window.EntityDetailUI?.open("vendor", row.dataset.entityId);
      return;
    }
    try {
      if (button.dataset.entityAction === "retry")
        window.BudgetAPI.retryEntity("vendor", button.dataset.entityId);
      if (
        button.dataset.entityAction === "remove" &&
        window.confirm("Remove this unsynced vendor from this computer?")
      ) {
        window.BudgetAPI.removeFailedEntity("vendor", button.dataset.entityId);
      }
    } catch (error) {
      formMessage.className = "vendor-form-message error";
      formMessage.textContent = error.message;
    }
  });

  vendorList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("[data-entity-action]")) return;
    const row = event.target.closest("[data-entity-id]");
    if (!row) return;
    event.preventDefault();
    window.EntityDetailUI?.open("vendor", row.dataset.entityId);
  });

  window.addEventListener("budget:vendors-changed", render);
  window.addEventListener("budget:entity-sync-changed", render);
  window.addEventListener("budget:transaction-sync-changed", load);
  window.addEventListener("budget:transaction-saved", load);
  window.VendorUI = { load, render };
  render();
});
