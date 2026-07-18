(function () {
  let cleanup = null;

  function mount(root) {
    // References to the form, list, and message
    const categoryForm = root.querySelector("#category-form");
    const categoryList = root.querySelector("#category-list");
    const formMessage = categoryForm.querySelector(".category-form-message");

    /** Render the category list from the spreadsheet data
     *
     */
    function render() {
      const categories = window.BudgetAPI.listCategories({ type: "expense" });
      document.getElementById("category-count").textContent =
        `${categories.length} ${categories.length === 1 ? "category" : "categories"}`;

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

    /** Handle submission of the form
     *
     */
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

    /** Handle clicks inside the list
     *
     */
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

    //  Listen to the submission and click events
    //  Rerender if the categories change
    categoryForm.addEventListener("submit", handleSubmit);
    categoryList.addEventListener("click", handleClick);
    window.addEventListener("budget:categories-changed", render);

    // Run an initial render on mount
    render();

    // Set the cleanup to remove the listeners
    cleanup = () => {
      categoryForm.removeEventListener("submit", handleSubmit);
      categoryList.removeEventListener("click", handleClick);
      window.removeEventListener("budget:categories-changed", render);
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
