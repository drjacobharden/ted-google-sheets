(function () {
  const { escapeHTML } = window.AppUtils;
  const settingsByKind = {
    category: {
      collection: "categories",
      singular: "category",
      plural: "categories",
      route: "categories",
    },
    vendor: {
      collection: "vendors",
      singular: "vendor",
      plural: "vendors",
      route: "vendors",
    },
    assignment: {
      collection: "assignments",
      singular: "person",
      plural: "people",
      route: "people",
    },
  };
  let cleanup = null;

  function mount(root, { params = {} } = {}) {
    const kind = settingsByKind[params.kind] ? params.kind : "category";
    const settings = settingsByKind[kind];
    const title = root.querySelector("[data-archive-title]");
    const count = root.querySelector("[data-archive-count]");
    const search = root.querySelector("[data-archive-search]");
    const list = root.querySelector("[data-archive-list]");
    const back = root.querySelector("[data-archive-back]");
    let collections = { categories: [], vendors: [], assignments: [] };
    let query = "";
    let mounted = true;

    title.textContent = `Archived ${settings.plural}`;
    search.placeholder = `Search archived ${settings.plural}`;

    function render() {
      const all = collections[settings.collection] || [];
      const items = all.filter((item) =>
        item.name.toLowerCase().includes(query),
      );
      count.textContent = query
        ? `${items.length} of ${all.length} archived ${settings.plural}`
        : `${all.length} archived ${all.length === 1 ? settings.singular : settings.plural}`;
      if (!all.length) {
        list.innerHTML = `<div class="entity-empty"><strong>No archived ${escapeHTML(settings.plural)}</strong><span>Archived items will appear here.</span></div>`;
        return;
      }
      if (!items.length) {
        list.innerHTML =
          '<div class="entity-empty"><strong>No matching items</strong><span>Try a different search.</span></div>';
        return;
      }
      list.innerHTML = items
        .map(
          (item) => `
            <article class="category-item entity-link" data-entity-id="${item.id}" role="button" tabindex="0" aria-label="Edit archived ${escapeHTML(item.name)}">
              <span class="category-avatar archived-avatar" aria-hidden="true">${escapeHTML(item.name.charAt(0).toUpperCase())}</span>
              <div class="category-details">
                <strong>${escapeHTML(item.name)}</strong>
                <span>Archived</span>
              </div>
              <span class="category-kind">Reactivate</span>
            </article>`,
        )
        .join("");
    }

    async function load(options = {}) {
      list.innerHTML =
        '<div class="entity-empty"><span class="spinner" aria-hidden="true"></span><span>Loading archived items…</span></div>';
      try {
        collections = await window.BudgetAPI.listArchivedEntities(options);
        if (mounted) render();
      } catch (error) {
        if (!mounted) return;
        list.innerHTML = `<div class="entity-empty"><strong>Couldn’t load archived items</strong><span>${escapeHTML(error.message)}</span></div>`;
      }
    }

    function openItem(id) {
      window.AppRouter.updateParams({
        drawer: "entity-edit",
        entityKind: kind,
        entityId: id,
      });
    }

    function handleClick(event) {
      const row = event.target.closest("[data-entity-id]");
      if (row) openItem(row.dataset.entityId);
    }

    function handleKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-entity-id]");
      if (!row) return;
      event.preventDefault();
      openItem(row.dataset.entityId);
    }

    function handleSearch() {
      query = search.value.trim().toLowerCase();
      render();
    }

    function handleChanged() {
      collections = {
        ...collections,
        [settings.collection]: collections[settings.collection].filter(
          (item) => window.BudgetAPI.getEntity(kind, item.id)?.active === false,
        ),
      };
      render();
    }

    function handleBack() {
      window.AppRouter.navigate(settings.route);
    }

    back.addEventListener("click", handleBack);
    search.addEventListener("input", handleSearch);
    list.addEventListener("click", handleClick);
    list.addEventListener("keydown", handleKeydown);
    window.addEventListener(
      `budget:${settings.collection === "assignments" ? "people" : settings.collection}-changed`,
      handleChanged,
    );
    load();

    cleanup = () => {
      mounted = false;
      back.removeEventListener("click", handleBack);
      search.removeEventListener("input", handleSearch);
      list.removeEventListener("click", handleClick);
      list.removeEventListener("keydown", handleKeydown);
      window.removeEventListener(
        `budget:${settings.collection === "assignments" ? "people" : settings.collection}-changed`,
        handleChanged,
      );
    };
  }

  function unmount() {
    cleanup?.();
    cleanup = null;
  }

  window.EntityArchiveRoute = { mount, unmount };
})();
