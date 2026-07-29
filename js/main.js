document.addEventListener("DOMContentLoaded", () => {
  let unmountCurrentRoute = null;
  let appDataPromise;
  let referenceDataLoaded = false;
  let mountedContentKey = "";

  window.addEventListener("budget:reference-data-changed", () => {
    referenceDataLoaded = true;
  });

  // Mount the template for the route provided.
  //  - 1: unmount the currently mounted route if it exists
  //  - 2: find the template for the new route (error if no template exists)
  //  - 3: if the template exists, mount its content inside the outlet
  //  - 4: get the module for the route and mount its associated data and listeners
  //  - 5: set the unmount to the current route's unmount function so that all listeners can be removed when navigating away
  function mountTemplate(name, params = {}) {
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
      dashboard: window.DashboardRoute,
      categories: window.CategoryRoute,
      vendors: window.VendorRoute,
      people: window.PeopleRoute,
      import: window.ImportRoute,
      transactions: window.TransactionsRoute,
      sync: window.SyncRoute,
      settings: window.SettingsRoute,
      "entity-detail": window.EntityRoute,
      "entity-archive": window.EntityArchiveRoute,
      "investment-overview": window.InvestmentOverviewRoute,
      "investment-accounts": window.InvestmentAccountsRoute,
      "investment-account-detail": window.InvestmentAccountDetailRoute,
    };

    const routeModule = routeModules[name];

    if (!routeModule) {
      console.error(`Missing route module for: ${name}`);
      return;
    }

    screen.hidden = false;
    routeModule.mount(screen, { route: name, params });

    unmountCurrentRoute = () => {
      routeModule?.unmount();
      outlet.replaceChildren();
    };
  }

  const state = { transactions: [], search: "", type: "all", loaded: false };

  const navSections = document.querySelectorAll("[data-nav-section]");
  const screens = document.querySelectorAll(".screen[data-screen]");
  const appNotice = document.getElementById("app-notice");
  const appShell = document.querySelector(".app-shell");
  const loadingSplash = document.getElementById("app-loading-splash");
  const loadingSplashMessage = document.getElementById("app-loading-message");
  const loadingSplashRetry = document.getElementById("app-loading-retry");
  const refreshIndicator = document.getElementById("app-refresh-indicator");
  const refreshIndicatorText = document.getElementById("app-refresh-text");
  const refreshIndicatorRetry = document.getElementById("app-refresh-retry");
  let appNoticeTimer;

  // TODO: Remove later. Currently for compatibility while we migrate to routing.
  function showTab(name) {
    window.AppRouter.navigate(name);
  }

  function renderRoute(name, params = {}) {
    const contentParams = { ...params };
    delete contentParams.drawer;
    delete contentParams.transactionId;
    delete contentParams.entityKind;
    delete contentParams.entityId;
    delete contentParams.investmentAccountId;
    delete contentParams.investmentMonth;
    delete contentParams.investmentReviewId;
    const contentKey = `${name}?${new URLSearchParams(contentParams)}`;

    if (contentKey === mountedContentKey) return;

    mountedContentKey = contentKey;
    screens.forEach((screen) => {
      screen.hidden = screen.dataset.screen !== name;
    });
    const activeTab =
      name === "investment-account-detail" ? "investment-accounts" : name;
    document
      .querySelectorAll(".navigation-button[data-tab]")
      .forEach((item) => {
        const active = item.dataset.tab === activeTab;
        item.classList.toggle("active", active);
        active
          ? item.setAttribute("aria-current", "page")
          : item.removeAttribute("aria-current");
      });

    enterRoute(name).catch(() => {});
    updateNavigationSection(name);
    mountTemplate(name, contentParams);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function enterRoute(name) {
    if (name === "dashboard") {
      await initializeData();
    }

    if (["transactions", "entity-detail"].includes(name) && !state.loaded) {
      await initializeData();
    }

    if (name === "import") {
      await initializeData();
    }

    if (name.startsWith("investment-")) await initializeData();
  }

  function updateNavigationSection(name) {
    const activeTab =
      name === "investment-account-detail" ? "investment-accounts" : name;
    const activeNav = document.querySelector(
      `.nav-item[data-tab="${activeTab}"]`,
    );
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
    renderRoute(event.detail.route, event.detail.params);
  });

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

  function retryAppData() {
    loadingSplashMessage.textContent = "Loading your budget…";
    loadingSplashRetry.hidden = true;
    refreshIndicatorRetry.hidden = true;
    initializeData({ refresh: true, startup: !loadingSplash.hidden }).catch(
      () => {},
    );
  }

  loadingSplashRetry.addEventListener("click", retryAppData);
  refreshIndicatorRetry.addEventListener("click", retryAppData);

  window.addEventListener("budget:data-refresh-started", (event) => {
    if (!event.detail.connected) return;
    loadingSplashRetry.hidden = true;
    refreshIndicatorRetry.hidden = true;
    if (event.detail.coldStart) {
      loadingSplash.hidden = false;
      loadingSplashMessage.textContent = "Loading your budget…";
      appShell.inert = true;
      return;
    }
    refreshIndicator.hidden = false;
    refreshIndicatorText.textContent = "Refreshing data…";
  });

  window.addEventListener("budget:data-refresh-complete", () => {
    loadingSplash.hidden = true;
    refreshIndicator.hidden = true;
    loadingSplashRetry.hidden = true;
    refreshIndicatorRetry.hidden = true;
    if (!window.OnboardingUI?.isBlocking()) appShell.inert = false;
  });

  window.addEventListener("budget:data-refresh-failed", (event) => {
    if (!event.detail.connected) return;
    if (!loadingSplash.hidden && !event.detail.showingCachedData) {
      loadingSplashMessage.textContent = `We couldn’t load your budget. ${event.detail.error.message}`;
      loadingSplashRetry.hidden = false;
      return;
    }
    refreshIndicator.hidden = false;
    refreshIndicatorText.textContent = "Showing saved data · refresh failed";
    refreshIndicatorRetry.hidden = false;
  });

  function loadTransactions() {
    return state.loaded
      ? Promise.resolve(state.transactions.slice())
      : initializeData();
  }

  function initializeData(options = {}) {
    if (options.refresh) {
      appDataPromise = null;
      state.loaded = false;
      referenceDataLoaded = false;
    }
    if (!appDataPromise) {
      const cachedTransactions = window.BudgetAPI.getCachedTransactions?.();
      const usingCache =
        !state.loaded &&
        cachedTransactions !== null &&
        cachedTransactions !== undefined;
      if (usingCache) {
        state.transactions = cachedTransactions;
        state.loaded = true;
        window.dispatchEvent(
          new CustomEvent("budget:transactions-loaded", {
            detail: { source: "cache" },
          }),
        );
      }
      const connected = Boolean(window.BudgetAPI.getConfig().endpoint);
      const coldStart = Boolean(options.startup && connected && !state.loaded);
      window.dispatchEvent(
        new CustomEvent("budget:data-refresh-started", {
          detail: {
            source: usingCache ? "cache" : "network",
            coldStart,
            connected,
          },
        }),
      );
      appDataPromise = window.BudgetAPI.loadAppData({
        refresh: options.refresh,
      })
        .then(async (data) => {
          state.transactions = data.transactions || [];
          state.loaded = true;
          referenceDataLoaded = true;
          await window.InvestmentAPI.load();
          window.dispatchEvent(
            new CustomEvent("budget:transactions-loaded", {
              detail: { source: "server" },
            }),
          );
          window.dispatchEvent(
            new CustomEvent("budget:data-refresh-complete", {
              detail: { source: "server" },
            }),
          );
          return data;
        })
        .catch((error) => {
          appDataPromise = null;
          if (!state.loaded) {
            window.dispatchEvent(
              new CustomEvent("budget:transactions-load-error", {
                detail: { error },
              }),
            );
          }
          window.dispatchEvent(
            new CustomEvent("budget:data-refresh-failed", {
              detail: { error, showingCachedData: state.loaded, connected },
            }),
          );
          window.dispatchEvent(
            new CustomEvent("budget:api-warning", {
              detail: state.loaded
                ? `Showing saved data. Couldn’t refresh Google Sheets: ${error.message}`
                : `Couldn’t load app data: ${error.message}`,
            }),
          );
          throw error;
        });
    }
    return appDataPromise;
  }

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
  window.addEventListener("budget:transactions-queued", (event) =>
    upsertTransactions(event.detail.transactions || []),
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
    const connected = Boolean(window.BudgetAPI.getConfig().endpoint);
    document.body.dataset.connected = String(connected);
    initializeData().catch(() => {});
  });

  window.BudgetUI = {
    renderRoute,
    showTab,
    loadTransactions,
    initializeData,
    getTransactions: () => state.transactions.slice(),
    renameEntityTransactions,
    getTransaction: (id) =>
      state.transactions.find((transaction) => transaction.id === id) || null,
    areTransactionsLoaded: () => state.loaded,
    isReferenceDataLoaded: () => referenceDataLoaded,
  };

  if (!window.OnboardingUI?.isBlocking())
    initializeData({ startup: true }).catch(() => {});

  window.AppRouter.start();
});
