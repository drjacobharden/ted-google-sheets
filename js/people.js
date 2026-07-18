document.addEventListener("DOMContentLoaded", () => {
  const peopleForm = document.getElementById("people-form");
  const peopleList = document.getElementById("people-list");
  const formMessage = peopleForm.querySelector(".people-form-message");
  let usage = new Map();

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function render() {
    const people = window.BudgetAPI.listPeople();
    document.getElementById("people-count").textContent = `${people.length} ${people.length === 1 ? "assignment" : "assignments"}`;
    peopleList.innerHTML = people.map((person) => {
      const count = usage.get(person.id) || 0;
      const sync = window.BudgetAPI.getEntitySyncStatus("assignment", person.id);
      const syncControls = sync ? `<div class="entity-sync-state ${sync.status}"><span>${sync.status === "failed" ? "Needs attention" : "Pending"}</span>${sync.status === "failed" ? `<button type="button" data-entity-action="retry" data-entity-id="${person.id}">Retry</button><button type="button" data-entity-action="remove" data-entity-id="${person.id}">Remove</button>` : ""}</div>` : "";
      return `<article class="category-item entity-link" data-entity-kind="assignment" data-entity-id="${person.id}" role="button" tabindex="0" aria-label="View ${escapeHTML(person.name)} assignment">
        <span class="category-avatar person-avatar" aria-hidden="true">${escapeHTML(person.name.charAt(0).toUpperCase())}</span>
        <div class="category-details"><strong>${escapeHTML(person.name)}</strong><span>${count} ${count === 1 ? "transaction" : "transactions"}</span></div>
        ${person.isDefault ? '<span class="category-kind">Default</span>' : ""}
        ${syncControls}
      </article>`;
    }).join("");
  }

  function load() {
    usage = new Map();
    (window.BudgetUI?.getTransactions() || []).forEach((transaction) => {
      const key = transaction.assignmentId;
      usage.set(key, (usage.get(key) || 0) + 1);
    });
    render();
  }

  peopleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.textContent = "";
    if (!peopleForm.checkValidity()) {
      peopleForm.reportValidity();
      return;
    }
    try {
      const person = await window.BudgetAPI.addPerson({ name: peopleForm.elements.personName.value });
      peopleForm.reset();
      peopleForm.elements.personName.focus();
      formMessage.className = "people-form-message success";
      formMessage.textContent = window.BudgetAPI.getConfig().endpoint ? `${person.name} was added. Syncing…` : `${person.name} was added.`;
      render();
    } catch (error) {
      formMessage.className = "people-form-message error";
      formMessage.textContent = error.message;
    }
  });

  peopleList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-entity-action]");
    if (!button) {
      const row = event.target.closest("[data-entity-id]");
      if (row) window.EntityDetailUI?.open("assignment", row.dataset.entityId);
      return;
    }
    try {
      if (button.dataset.entityAction === "retry") window.BudgetAPI.retryEntity("assignment", button.dataset.entityId);
      if (button.dataset.entityAction === "remove" && window.confirm("Remove this unsynced assignment from this computer?")) {
        window.BudgetAPI.removeFailedEntity("assignment", button.dataset.entityId);
      }
    } catch (error) {
      formMessage.className = "people-form-message error";
      formMessage.textContent = error.message;
    }
  });
  peopleList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("[data-entity-action]")) return;
    const row = event.target.closest("[data-entity-id]");
    if (!row) return;
    event.preventDefault(); window.EntityDetailUI?.open("assignment", row.dataset.entityId);
  });
  window.addEventListener("budget:people-changed", render);
  window.addEventListener("budget:entity-sync-changed", render);
  window.addEventListener("budget:transaction-sync-changed", load);
  window.addEventListener("budget:transaction-saved", load);
  window.PeopleUI = { load, render };
  render();
});
