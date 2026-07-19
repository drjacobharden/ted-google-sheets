(function () {
  let cleanup = null;

  function mount(root) {
    // References to the form, list, and message
    const categoryForm = root.querySelector("#category-form");
    const categoryList = root.querySelector("#category-list");
    const categoryCount = root.querySelector("#category-count");
    const formMessage = categoryForm.querySelector(".category-form-message");
    let usage = new Map();

    //  Render the category list from the spreadsheet data
    function render() {
      const categories = window.BudgetAPI.listCategories({ type: "expense" });

      const count = categories.length;
      const label = categories.length === 1 ? "category" : "categories";
      categoryCount.textContent = `${count} ${label}`;

      categoryList.innerHTML = categories
        .map((category) => {
          const count = usage.get(category.id) || 0;

          const sync = window.BudgetAPI.getEntitySyncStatus(
            "category",
            category.id,
          );

          const syncControls = sync
            ? `<div class="entity-sync-state ${sync.status}"><span>${sync.status === "failed" ? "Needs attention" : "Pending"}</span>${sync.status === "failed" ? `<button type="button" data-entity-action="retry" data-entity-id="${category.id}">Retry</button><button type="button" data-entity-action="remove" data-entity-id="${category.id}">Remove</button>` : ""}</div>`
            : "";
          return `<article class="category-item entity-link" data-entity-kind="category" data-entity-id="${category.id}" role="button" tabindex="0" aria-label="View ${escapeHTML(category.name)} category">
        <span class="category-avatar" aria-hidden="true">${escapeHTML(category.name.charAt(0).toUpperCase())}</span>
        <div class="category-details"><strong>${escapeHTML(category.name)}</strong><span>${count} ${count === 1 ? "transaction" : "transactions"}</span></div>
        ${syncControls}
      </article>`;
        })
        .join("");
    }

    // Load in all the transactions and set the counts for each category
    function load() {
      usage = new Map();
      const transactions = window.BudgetUI?.getTransactions() || [];

      transactions
        .filter((transaction) => transaction.type !== "income")
        .forEach((transaction) => {
          const key = transaction.categoryId;
          usage.set(key, (usage.get(key) || 0) + 1);
        });

      render();
    }

    //  Handle form submission
    //  If the form is submitted, a new category is added
    async function handleSubmit(event) {
      event.preventDefault();
      formMessage.textContent = "";
      if (!categoryForm.checkValidity()) {
        categoryForm.reportValidity();
        return;
      }
      try {
        const category = await window.BudgetAPI.addCategory({
          name: categoryForm.elements.categoryName.value,
          type: "expense",
        });
        categoryForm.reset();
        categoryForm.elements.categoryName.focus();
        formMessage.className = "category-form-message success";
        formMessage.textContent = window.BudgetAPI.getConfig().endpoint
          ? `${category.name} was added. Syncing…`
          : `${category.name} was added.`;
        render();
      } catch (error) {
        formMessage.className = "category-form-message error";
        formMessage.textContent = error.message;
      }
    }

    //  Handle clicks inside the list
    //  if the user clicks an item in the list, it opens the detail screen for that category
    function handleClick(event) {
      const button = event.target.closest("[data-entity-action]");
      if (!button) {
        const row = event.target.closest("[data-entity-id]");
        if (row) window.EntityDetailUI?.open("category", row.dataset.entityId);
        return;
      }
      try {
        if (button.dataset.entityAction === "retry")
          window.BudgetAPI.retryEntity("category", button.dataset.entityId);
        if (
          button.dataset.entityAction === "remove" &&
          window.confirm("Remove this unsynced category from this computer?")
        ) {
          window.BudgetAPI.removeFailedEntity(
            "category",
            button.dataset.entityId,
          );
        }
      } catch (error) {
        formMessage.className = "category-form-message error";
        formMessage.textContent = error.message;
      }
    }

    // Handle keyboard use
    // if the user hits enter while on the list, it will open the detail screen
    function handleKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      if (event.target.closest("[data-entity-action]")) {
        return;
      }

      const row = event.target.closest("[data-entity-id]");
      if (!row) return;

      event.preventDefault();

      window.EntityDetailUI?.open("category", row.dataset.entityId);
    }

    //  Listen to the submission and click events
    //  Rerender if the categories change
    categoryForm.addEventListener("submit", handleSubmit);
    categoryList.addEventListener("click", handleClick);
    categoryList.addEventListener("keydown", handleKeydown);
    window.addEventListener("budget:categories-changed", render);
    window.addEventListener("budget:entity-sync-changed", render);
    window.addEventListener("budget:transaction-sync-changed", load);
    window.addEventListener("budget:transaction-saved", load);

    // Run an initial render on mount that gets all of the counts for each category
    load();

    // Set the cleanup to remove the listeners
    cleanup = () => {
      categoryForm.removeEventListener("submit", handleSubmit);
      categoryList.removeEventListener("click", handleClick);
      window.removeEventListener("budget:categories-changed", render);
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

  window.CategoryRoute = {
    mount,
    unmount,
  };
})();
