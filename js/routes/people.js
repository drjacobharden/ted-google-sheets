(function () {
  const { escapeHTML } = window.AppUtils;

  let cleanup = null;

  function mount(root) {
    // References to the form, list, and message
    const peopleForm = root.querySelector("#people-form");
    const peopleList = root.querySelector("#people-list");
    const peopleCount = root.querySelector("#people-count");
    const formMessage = peopleForm.querySelector(".vendor-form-message");
    let usage = new Map();
    let query = "";

    //  Render the vendor list from the spreadsheet data
    function render() {
      const people = window.BudgetAPI.listPeople();

      peopleCount.textContent = `${people.length} ${people.length === 1 ? "assignment" : "assignments"}`;

      peopleList.innerHTML = people
        .map((person) => {
          const count = usage.get(person.id) || 0;
          const sync = window.BudgetAPI.getEntitySyncStatus(
            "assignment",
            person.id,
          );
          const syncControls = sync
            ? `<div class="entity-sync-state ${sync.status}"><span>${sync.status === "failed" ? "Needs attention" : "Pending"}</span>${sync.status === "failed" ? `<button type="button" data-entity-action="retry" data-entity-id="${person.id}">Retry</button><button type="button" data-entity-action="remove" data-entity-id="${person.id}">Remove</button>` : ""}</div>`
            : "";
          return `<article class="category-item entity-link" data-entity-kind="assignment" data-entity-id="${person.id}" role="button" tabindex="0" aria-label="View ${escapeHTML(person.name)} assignment">
        <span class="category-avatar person-avatar" aria-hidden="true">${escapeHTML(person.name.charAt(0).toUpperCase())}</span>
        <div class="category-details"><strong>${escapeHTML(person.name)}</strong><span>${count} ${count === 1 ? "transaction" : "transactions"}</span></div>
        ${person.isDefault ? '<span class="category-kind">Default</span>' : ""}
        ${syncControls}
      </article>`;
        })
        .join("");
    }

    // Gets the transaction count per vendor and renders the list
    function load() {
      usage = new Map();

      const transactions = window.BudgetUI?.getTransactions() || [];

      transactions.forEach((transaction) => {
        const key = transaction.assignmentId;
        usage.set(key, (usage.get(key) || 0) + 1);
      });
      render();
    }

    //  Handle submission of the form
    //  if the user submits the form, a new vendor will be added
    async function handleSubmit(event) {
      event.preventDefault();
      formMessage.textContent = "";
      if (!peopleForm.checkValidity()) {
        peopleForm.reportValidity();
        return;
      }
      try {
        const person = await window.BudgetAPI.addPerson({
          name: peopleForm.elements.personName.value,
        });
        peopleForm.reset();
        peopleForm.elements.personName.focus();
        formMessage.className = "people-form-message success";
        formMessage.textContent = window.BudgetAPI.getConfig().endpoint
          ? `${person.name} was added. Syncing…`
          : `${person.name} was added.`;
        render();
      } catch (error) {
        formMessage.className = "people-form-message error";
        formMessage.textContent = error.message;
      }
    }

    //  Handle clicks inside the list
    //  open the entity detail screen for the vendor
    function handleClick(event) {
      const button = event.target.closest("[data-entity-action]");
      if (!button) {
        const row = event.target.closest("[data-entity-id]");
        if (row)
          window.AppRouter.navigate("entity-detail", {
            kind: "assignment",
            id: row.dataset.entityId,
          });
        return;
      }
      try {
        if (button.dataset.entityAction === "retry")
          window.BudgetAPI.retryEntity("assignment", button.dataset.entityId);
        if (
          button.dataset.entityAction === "remove" &&
          window.confirm("Remove this unsynced assignment from this computer?")
        ) {
          window.BudgetAPI.removeFailedEntity(
            "assignment",
            button.dataset.entityId,
          );
        }
      } catch (error) {
        formMessage.className = "people-form-message error";
        formMessage.textContent = error.message;
      }
    }

    function handleKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("[data-entity-action]")) return;
      const row = event.target.closest("[data-entity-id]");
      if (!row) return;
      event.preventDefault();
      window.AppRouter.navigate("entity-detail", {
        kind: "assignment",
        id: row.dataset.entityId,
      });
    }

    //  Listen to the submission and click events
    //  Rerender when the search input changes
    //  Rerender when vendors change, sync completes, or a transaction saves
    peopleForm.addEventListener("submit", handleSubmit);
    peopleList.addEventListener("click", handleClick);
    peopleList.addEventListener("keydown", handleKeydown);
    window.addEventListener("budget:people-changed", render);
    window.addEventListener("budget:entity-sync-changed", render);
    window.addEventListener("budget:transaction-sync-changed", load);
    window.addEventListener("budget:transaction-saved", load);

    // Run an initial render on mount
    load();

    // Set the cleanup to remove the listeners
    cleanup = () => {
      peopleForm.removeEventListener("submit", handleSubmit);
      peopleList.removeEventListener("click", handleClick);
      peopleList.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("budget:vendors-changed", render);
      window.removeEventListener("budget:entity-sync-changed", render);
      window.removeEventListener("budget:transaction-sync-changed", load);
      window.removeEventListener("budget:transaction-saved", load);
    };
  }

  // Remove the listeners when we navigate away
  function unmount() {
    cleanup?.();
    cleanup = null;
  }

  window.PeopleRoute = {
    mount,
    unmount,
  };
})();
