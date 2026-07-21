document.addEventListener("DOMContentLoaded", () => {
  let unmountCurrentRoute = null;
  let referenceDataPromise;

  // Mount the template for the route provided.
  //  - 1: unmount the currently mounted route if it exists
  //  - 2: find the template for the new route (error if no template exists)
  //  - 3: if the template exists, mount its content inside the outlet
  //  - 4: get the module for the route and mount its associated data and listeners
  //  - 5: set the unmount to the current route's unmount function so that all listeners can be removed when navigating away
  function mountTemplate(name) {
    unmountCurrentRoute?.();

    const outlet = document.getElementById("route-outlet");
    const template = document.getElementById(`route-${name}`);

    if (!template) {
      console.error(`Missing template for route: ${name}`);
      return;
    }

    outlet.replaceChildren(template.content.cloneNode(true));

    const screen = outlet.querySelector("[data-screen]");

    const routeModules = {
      categories: window.CategoryRoute,
      vendors: window.VendorRoute,
      people: window.PeopleRoute,
      transactions: window.TransactionsRoute,
      sync: window.SyncRoute,
    };

    const routeModule = routeModules[name];

    if (!routeModule) {
      console.error(`Missing route module for: ${name}`);
      return;
    }

    routeModule.mount(screen);

    unmountCurrentRoute = () => {
      routeModule?.unmount();
      outlet.replaceChildren();
    };
  }

  const state = { transactions: [], search: "", type: "all", loaded: false };

  const navSections = document.querySelectorAll("[data-nav-section]");
  const screens = document.querySelectorAll(".screen[data-screen]");
  const appNotice = document.getElementById("app-notice");
  let appNoticeTimer;

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  function updateConnectionUI() {
    const connected = Boolean(window.BudgetAPI.getConfig().endpoint);
    document.body.dataset.connected = String(connected);
    document.getElementById("copy-connection").disabled = !connected;
    document.querySelectorAll("[data-connection-label]").forEach((element) => {
      element.textContent = connected ? "Sheet connected" : "Local mode";
    });
  }

  // TODO: Remove later. Currently for compatibility while we migrate to routing.
  function showTab(name) {
    window.AppRouter.navigate(name);
  }

  function renderRoute(name) {
    screens.forEach((screen) => {
      screen.hidden = screen.dataset.screen !== name;
    });
    document.querySelectorAll(".nav-item[data-tab]").forEach((item) => {
      const active = item.dataset.tab === name;
      item.classList.toggle("active", active);
      active
        ? item.setAttribute("aria-current", "page")
        : item.removeAttribute("aria-current");
    });

    enterRoute(name);
    updateNavigationSection(name);
    mountTemplate(name);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function enterRoute(name) {
    if (name === "dashboard") {
      await ensureReferenceData();

      await Promise.all([
        state.loaded ? undefined : loadTransactions(),
        window.InvestmentUI?.load?.(),
      ]);
    }

    if (name === "transactions" && !state.loaded) {
      await ensureReferenceData();
      await loadTransactions();
    }

    if (name.startsWith("investment-")) {
      await window.InvestmentUI?.load?.();
    }

    if (name === "dashboard" || name.startsWith("investment-"))
      window.InvestmentUI?.load();
    if (name === "new-transaction")
      document.querySelector('[name="amount"]')?.focus();
    // if (name === "categories") window.CategoryUI?.load();
    // if (name === "vendors") window.VendorUI?.load();
    // if (name === "people") window.PeopleUI?.load();
    if (name === "entity-detail") window.EntityDetailUI?.render();
    if (name === "settings") {
      loadSettings();
      window.UserUI?.load();
    }
  }

  function updateNavigationSection(name) {
    const activeNav = document.querySelector(`.nav-item[data-tab="${name}"]`);
    const activeSection = activeNav?.closest("[data-nav-section]");
    if (activeSection) {
      activeSection.classList.remove("collapsed");
      activeSection
        .querySelector("[data-nav-section-toggle]")
        ?.setAttribute("aria-expanded", "true");
      if (window.matchMedia("(max-width: 860px)").matches)
        navSections.forEach((section) => {
          if (section === activeSection) return;
          section.classList.add("collapsed");
          section
            .querySelector("[data-nav-section-toggle]")
            ?.setAttribute("aria-expanded", "false");
        });
    }
  }

  //  Listens for a click on a navigation button and routes to its associated route
  document.addEventListener("click", (event) => {
    const item = event.target.closest("[data-tab]");
    if (!item) return;

    event.preventDefault();
    window.AppRouter.navigate(item.dataset.tab);
  });

  //  Listen for the change in route from router.js and render the route's data.
  window.addEventListener("app:route-changed", (event) => {
    renderRoute(event.detail.route);
  });

  document.querySelectorAll("[data-nav-section-toggle]").forEach((toggle) =>
    toggle.addEventListener("click", () => {
      const section = toggle.closest("[data-nav-section]");
      const collapsed = section.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
    }),
  );
  if (window.matchMedia("(max-width: 860px)").matches)
    navSections.forEach((section) => {
      section.classList.add("collapsed");
      section
        .querySelector("[data-nav-section-toggle]")
        ?.setAttribute("aria-expanded", "false");
    });

  function showAppNotice(text) {
    clearTimeout(appNoticeTimer);
    document.getElementById("app-notice-text").textContent = String(
      text || "The Ledger needs attention.",
    );
    appNotice.hidden = false;
    appNoticeTimer = setTimeout(() => {
      appNotice.hidden = true;
    }, 10000);
  }
  document
    .getElementById("dismiss-app-notice")
    .addEventListener("click", () => {
      clearTimeout(appNoticeTimer);
      appNotice.hidden = true;
    });
  window.addEventListener("budget:api-warning", (event) =>
    showAppNotice(event.detail),
  );

  async function loadTransactions() {
    try {
      // Get all of the transactions from the spreadsheet
      state.transactions = await window.BudgetAPI.listTransactions();
      // Flag that the data loaded
      state.loaded = true;
      //  Alert listeners that the data has loaded
      window.dispatchEvent(new CustomEvent("budget:transactions-loaded"));
    } catch (error) {
      //  Alert listenters that the data failed to load
      window.dispatchEvent(
        new CustomEvent("budget:transactions-load-error", {
          detail: { error },
        }),
      );
    }
  }

  const settingsForm = document.getElementById("connection-form");
  const settingsMessage = settingsForm.querySelector(".settings-message");

  function loadSettings() {
    settingsForm.elements.endpoint.value =
      window.BudgetAPI.getConfig().endpoint;
    settingsMessage.textContent = "";
  }

  function ensureReferenceData() {
    if (!referenceDataPromise) {
      referenceDataPromise = window.BudgetAPI.loadReferenceData().catch(
        (error) => {
          referenceDataPromise = null;

          window.dispatchEvent(
            new CustomEvent("budget:api-warning", {
              detail: `Couldn’t refresh lists: ${error.message}`,
            }),
          );

          throw error;
        },
      );
    }

    return referenceDataPromise;
  }

  async function initializeData() {
    await ensureReferenceData();
  }

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const endpoint = settingsForm.elements.endpoint.value.trim();
    if (endpoint && !endpoint.startsWith("https://script.google.com/")) {
      settingsMessage.className = "settings-message error";
      settingsMessage.textContent =
        "Use the HTTPS web app URL provided by Google Apps Script.";
      return;
    }
    try {
      window.BudgetAPI.saveConfig({ endpoint });
    } catch (error) {
      settingsMessage.className = "settings-message error";
      settingsMessage.textContent = error.message;
      return;
    }
    updateConnectionUI();
    window.UserUI?.load();
    window.BudgetAPI.loadReferenceData()
      .then(loadTransactions)
      .catch((error) => {
        settingsMessage.className = "settings-message error";
        settingsMessage.textContent = `Settings saved, but data refresh failed: ${error.message}`;
      });
    settingsMessage.className = "settings-message success";
    settingsMessage.textContent = endpoint
      ? "Settings saved. New requests will use your sheet."
      : "Settings saved. Using local mode.";
  });

  document
    .getElementById("test-connection")
    .addEventListener("click", async (event) => {
      const endpoint = settingsForm.elements.endpoint.value.trim();
      if (!endpoint) {
        settingsMessage.className = "settings-message error";
        settingsMessage.textContent = "Paste a web app URL before testing.";
        return;
      }
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Testing…";
      settingsMessage.textContent = "";
      try {
        await window.BudgetAPI.testConnection(endpoint);
        settingsMessage.className = "settings-message success";
        settingsMessage.textContent = "Connection successful.";
      } catch (error) {
        settingsMessage.className = "settings-message error";
        settingsMessage.textContent = `Connection failed: ${error.message}`;
      } finally {
        button.disabled = false;
        button.textContent = "Test connection";
      }
    });

  document
    .getElementById("copy-connection")
    .addEventListener("click", async () => {
      const endpoint = window.BudgetAPI.getConfig().endpoint;
      if (!endpoint) {
        settingsMessage.className = "settings-message error";
        settingsMessage.textContent =
          "Save a connection URL before copying it.";
        return;
      }
      try {
        await navigator.clipboard.writeText(endpoint);
        settingsMessage.className = "settings-message success";
        settingsMessage.textContent =
          "Connection URL copied. Share it only with trusted household members.";
      } catch (error) {
        settingsForm.elements.endpoint.value = endpoint;
        settingsForm.elements.endpoint.focus();
        settingsForm.elements.endpoint.select();
        try {
          if (document.execCommand("copy")) {
            settingsMessage.className = "settings-message success";
            settingsMessage.textContent =
              "Connection URL copied. Share it only with trusted household members.";
          } else {
            settingsMessage.textContent =
              "The URL is selected. Press Ctrl+C or Command+C to copy it.";
          }
        } catch (fallbackError) {
          settingsMessage.textContent =
            "The URL is selected. Press Ctrl+C or Command+C to copy it.";
        }
      }
    });

  window.addEventListener("budget:connection-changed", updateConnectionUI);

  //  Inserts or updates a transaction when something is added or edited so we don't have to refetch everything
  function upsertTransactions(transactions) {
    const incoming = new Map(
      transactions.map((transaction) => [transaction.id, transaction]),
    );
    state.transactions = state.transactions.filter(
      (transaction) => !incoming.has(transaction.id),
    );
    state.transactions.push(...incoming.values());
  }

  function renameEntityTransactions(kind, id, name) {
    const idField = {
      category: "categoryId",
      vendor: "vendorId",
      assignment: "assignmentId",
    }[kind];
    const nameField = {
      category: "category",
      vendor: "vendor",
      assignment: "assignment",
    }[kind];
    state.transactions = state.transactions.map((transaction) =>
      transaction[idField] === id
        ? { ...transaction, [nameField]: name }
        : transaction,
    );
  }

  //  Add or update the transactions tate when a transaction starts syncing
  window.addEventListener("budget:transaction-queued", (event) =>
    upsertTransactions([event.detail.transaction]),
  );

  //  Add or update the tranasaction state when a transaction is saved
  window.addEventListener("budget:transaction-saved", (event) =>
    upsertTransactions(event.detail.saved || []),
  );

  //  Update the transaction state when a transactions sync state changes
  window.addEventListener("budget:transaction-sync-changed", (event) => {
    const queued = event.detail.transactions || [];
    const queuedIds = new Set(queued.map((transaction) => transaction.id));
    state.transactions = state.transactions.filter(
      (transaction) => !transaction.syncStatus || queuedIds.has(transaction.id),
    );
    upsertTransactions(queued);
  });

  //  Update the transaction state when a transaction is restored
  window.addEventListener("budget:transaction-restored", (event) =>
    upsertTransactions([event.detail.transaction]),
  );

  //  Update the transaction state when a transaction is removed
  window.addEventListener("budget:transaction-removed", (event) => {
    state.transactions = state.transactions.filter(
      (transaction) => transaction.id !== event.detail.id,
    );
  });

  window.addEventListener("budget:onboarding-complete", () => {
    updateConnectionUI();
    initializeData();
  });

  window.BudgetUI = {
    renderRoute,
    showTab,
    loadTransactions,
    initializeData,
    updateConnectionUI,
    getTransactions: () => state.transactions.slice(),
    renameEntityTransactions,
    getTransaction: (id) =>
      state.transactions.find((transaction) => transaction.id === id) || null,
    areTransactionsLoaded: () => state.loaded,
  };
  updateConnectionUI();
  if (!window.OnboardingUI?.isBlocking()) initializeData();

  window.AppRouter.start();
});
