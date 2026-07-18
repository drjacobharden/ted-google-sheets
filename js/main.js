document.addEventListener("DOMContentLoaded", () => {
  const state = { transactions: [], search: "", type: "all", loaded: false };
  let activeRange = { start: "", end: "", preset: "all" };

  const navItems = document.querySelectorAll("[data-tab]");
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

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function enterRoute(name) {
    if ((name === "transactions" || name === "dashboard") && !state.loaded)
      loadTransactions();
    if (name === "dashboard" || name.startsWith("investment-"))
      window.InvestmentUI?.load();
    if (name === "new-transaction")
      document.querySelector('[name="amount"]')?.focus();
    if (name === "categories") window.CategoryUI?.load();
    if (name === "vendors") window.VendorUI?.load();
    if (name === "people") window.PeopleUI?.load();
    if (name === "entity-detail") window.EntityDetailUI?.render();
    if (name === "sync") window.SyncUI?.render();
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

  function amountFor(transaction) {
    const amount = Number(transaction.amount) || 0;
    return transaction.type === "income" ? amount : -amount;
  }

  function updateSummary() {
    const ranged = state.transactions.filter((transaction) => {
      const { start, end } = activeRange;
      return (
        (!start || transaction.date >= start) &&
        (!end || transaction.date <= end)
      );
    });

    const income = ranged
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expenses = ranged
      .filter((item) => item.type !== "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const balance = ranged.reduce((sum, item) => sum + amountFor(item), 0);

    document.getElementById("summary-balance").textContent =
      currency.format(balance);
    document.getElementById("summary-income").textContent =
      currency.format(income);
    document.getElementById("summary-expenses").textContent =
      currency.format(expenses);
  }

  function filteredTransactions() {
    const query = state.search.toLowerCase().trim();
    return state.transactions
      .filter((item) => {
        const { start, end } = activeRange;
        return (!start || item.date >= start) && (!end || item.date <= end);
      })
      .filter((item) => state.type === "all" || item.type === state.type)
      .filter(
        (item) =>
          !query ||
          [
            item.category,
            item.vendor,
            item.assignment || "Shared",
            item.notes,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
          ),
      )
      .sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date)) ||
          String(b.createdAt).localeCompare(String(a.createdAt)),
      );
  }

  function renderTransactions() {
    const items = filteredTransactions();
    const tableWrap = document.getElementById("transaction-table-wrap");
    const message = document.getElementById("transaction-state");
    const list = document.getElementById("transaction-list");
    const total = items.length;
    document.getElementById("transaction-count").textContent =
      `${total} ${total === 1 ? "transaction" : "transactions"}`;

    if (!items.length) {
      tableWrap.hidden = true;
      message.hidden = false;
      const filtered = Boolean(
        state.search || state.type !== "all" || activeRange.preset !== "all",
      );
      message.innerHTML = `<div class="empty-symbol" aria-hidden="true">${filtered ? "?" : "$"}</div><h3>${filtered ? "No matches found" : "Your ledger is ready"}</h3><p>${filtered ? "Try changing your search or filter." : "Add your first transaction and it will appear here."}</p>`;
      return;
    }

    list.replaceChildren(...items.map(createTransactionRow));
    message.hidden = true;
    tableWrap.hidden = false;
  }

  function createTransactionRow(transaction) {
    const row = document.createElement("tr");
    row.dataset.transactionId = transaction.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute(
      "aria-label",
      `Edit ${transaction.vendor || transaction.category || "transaction"} from ${transaction.date}`,
    );
    const isIncome = transaction.type === "income";
    const category = String(
      transaction.category || (isIncome ? "Income" : "Other"),
    );
    const initial = category.charAt(0).toUpperCase();
    const note = String(transaction.notes || "").trim();
    const syncStatus = transaction.syncStatus;
    const syncBadge = syncStatus
      ? `<span class="transaction-sync-badge ${syncStatus}" title="${escapeHTML(transaction.syncError || "Waiting to sync")}">${syncStatus === "failed" ? "Needs attention" : "Pending"}</span>`
      : "";
    row.innerHTML = `
        <td>${dateFormatter.format(new Date(`${transaction.date}T00:00:00Z`))}${syncBadge}</td>
        <td><div class="transaction-name"><span class="category-icon${isIncome ? " income-category-icon" : ""}" aria-hidden="true">${escapeHTML(initial)}</span><strong class="${isIncome ? "income-category-title" : ""}">${escapeHTML(category)}</strong></div></td>
        <td class="vendor-cell">${escapeHTML(isIncome ? "---" : transaction.vendor || "---")}</td>
        <td><span class="assignment-chip">${escapeHTML(transaction.assignment || "Shared")}</span></td>
        <td class="note-cell"><span title="${escapeHTML(note)}">${escapeHTML(note || "---")}</span></td>
        <td class="amount-cell ${isIncome ? "amount-income" : "amount-expense"}">${isIncome ? "+" : "−"}${currency.format(Math.abs(Number(transaction.amount) || 0))}</td>`;
    return row;
  }

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

  async function loadTransactions() {
    const message = document.getElementById("transaction-state");
    document.getElementById("transaction-table-wrap").hidden = true;
    message.hidden = false;
    message.innerHTML =
      '<div class="spinner" aria-hidden="true"></div><p>Loading your transactions…</p>';
    try {
      state.transactions = await window.BudgetAPI.listTransactions();
      state.loaded = true;
      updateSummary();
      renderTransactions();
    } catch (error) {
      message.innerHTML = `<div class="empty-symbol" aria-hidden="true">!</div><h3>We couldn’t load your sheet</h3><p>${escapeHTML(error.message)} Check the URL and deployment access in Settings.</p>`;
    }
  }

  document
    .getElementById("transaction-search")
    .addEventListener("input", (event) => {
      state.search = event.target.value;
      renderTransactions();
    });
  document.getElementById("type-filter").addEventListener("change", (event) => {
    state.type = event.target.value;
    renderTransactions();
  });
  window.addEventListener("date-range-changed", (e) => {
    activeRange = e.detail;
    updateSummary();
    renderTransactions();
  });
  document
    .getElementById("transaction-list")
    .addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-transaction-id]");
      if (row) window.TransactionEditor?.open(row.dataset.transactionId);
    });
  document
    .getElementById("transaction-list")
    .addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("tr[data-transaction-id]");
      if (!row) return;
      event.preventDefault();
      window.TransactionEditor?.open(row.dataset.transactionId);
    });

  const settingsForm = document.getElementById("connection-form");
  const settingsMessage = settingsForm.querySelector(".settings-message");

  function loadSettings() {
    settingsForm.elements.endpoint.value =
      window.BudgetAPI.getConfig().endpoint;
    settingsMessage.textContent = "";
  }

  async function initializeData() {
    try {
      await window.BudgetAPI.loadReferenceData();
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("budget:api-warning", {
          detail: `Couldn’t refresh lists: ${error.message}`,
        }),
      );
    }
    await Promise.all([loadTransactions(), window.InvestmentUI?.load?.()]);
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
  function upsertTransactions(transactions) {
    const incoming = new Map(
      transactions.map((transaction) => [transaction.id, transaction]),
    );
    state.transactions = state.transactions.filter(
      (transaction) => !incoming.has(transaction.id),
    );
    state.transactions.push(...incoming.values());
    updateSummary();
    renderTransactions();
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
    updateSummary();
    renderTransactions();
  }
  window.addEventListener("budget:transaction-queued", (event) =>
    upsertTransactions([event.detail.transaction]),
  );
  window.addEventListener("budget:transaction-saved", (event) =>
    upsertTransactions(event.detail.saved || []),
  );
  window.addEventListener("budget:transaction-sync-changed", (event) => {
    const queued = event.detail.transactions || [];
    const queuedIds = new Set(queued.map((transaction) => transaction.id));
    state.transactions = state.transactions.filter(
      (transaction) => !transaction.syncStatus || queuedIds.has(transaction.id),
    );
    upsertTransactions(queued);
  });
  window.addEventListener("budget:transaction-restored", (event) =>
    upsertTransactions([event.detail.transaction]),
  );
  window.addEventListener("budget:transaction-removed", (event) => {
    state.transactions = state.transactions.filter(
      (transaction) => transaction.id !== event.detail.id,
    );
    updateSummary();
    renderTransactions();
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
    createTransactionRow,
    renameEntityTransactions,
    getTransaction: (id) =>
      state.transactions.find((transaction) => transaction.id === id) || null,
  };
  updateConnectionUI();
  if (!window.OnboardingUI?.isBlocking()) initializeData();

  window.AppRouter.start();
});
