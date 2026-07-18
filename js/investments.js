document.addEventListener("DOMContentLoaded", () => {
  // Utitlies pulled from the utils.js file
  const { escapeHTML, money, monthOffset, netFlows } = window.AppUtils;

  // Reference to the current date
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  let range = { preset: "month", start: currentMonth, end: currentMonth };
  let loaded = false;
  let editingAccountId = "";
  let editingMonthAccountId = "";
  let reviewingConflictId = "";
  let monthDrawerDirty = false;
  let monthDrawerOpener = null;
  let importRows = [];

  const flowsFor = (accountId, month) =>
    window.InvestmentAPI.contributions().filter(
      (item) => item.accountId === accountId && item.month === month,
    );

  function setPreset(preset) {
    if (preset === "month")
      range = { preset, start: currentMonth, end: currentMonth };
    if (preset === "three")
      range = {
        preset,
        start: monthOffset(currentMonth, -2),
        end: currentMonth,
      };
    if (preset === "ytd" || preset === "year")
      range = {
        preset,
        start: `${today.getFullYear()}-01`,
        end: `${today.getFullYear()}-12`,
      };
    if (preset === "all") range = { preset, start: "", end: "" };
    renderRangeControls();
    renderAll();
  }

  /**
   *
   * Renders the date range picker with the option for a custom range selection
   *
   */
  function renderRangeControls() {
    const items = [
      ["month", "Month"],
      ["three", "3 Months"],
      ["ytd", "YTD"],
      ["year", String(today.getFullYear())],
      ["all", "All time"],
      ["custom", "Custom"],
    ];

    const mapped = items
      .map(([key, label]) => {
        const isActive = range.preset === key;
        const buttonClass = isActive ? "active" : "";

        return `<button type="button" data-month-preset="${key}" class="${buttonClass}">${label}</button>`;
      })
      .join("");

    const html = `
      <div class="date-range-presets" role="group" aria-label="Reporting months">
      ${mapped}
      </div>
      <div class="custom-month-range" ${range.preset === "custom" ? "" : "hidden"}>
        <month-picker label="From" data-month-start value="${range.start || currentMonth}"></month-picker>
        <month-picker label="To" data-month-end value="${range.end || currentMonth}"></month-picker>
        <button class="secondary-button compact" type="button" data-month-apply>Apply</button>
        </div>
        <p class="month-range-error" data-month-range-error role="alert" aria-live="polite" hidden></p>
    `;

    document.querySelectorAll("[data-month-range]").forEach((root) => {
      root.innerHTML = html;
    });
  }

  document.addEventListener("click", (event) => {
    const preset = event.target.closest("[data-month-preset]")?.dataset
      .monthPreset;
    if (preset && preset !== "custom") setPreset(preset);
    if (preset === "custom") {
      range = {
        ...range,
        preset: "custom",
        start: range.start || currentMonth,
        end: range.end || currentMonth,
      };
      renderRangeControls();
    }
    if (event.target.closest("[data-month-apply]")) {
      const root = event.target.closest("[data-month-range]");
      const start = root.querySelector("[data-month-start]").value;
      const end = root.querySelector("[data-month-end]").value;
      const error = root.querySelector("[data-month-range-error]");
      if (!start || !end) {
        error.textContent = "Choose both a From month and a To month.";
        error.hidden = false;
        return;
      }
      if (start > end) {
        error.textContent =
          "From month must be before or the same as To month.";
        error.hidden = false;
        return;
      }
      range = { preset: "custom", start, end };
      renderRangeControls();
      renderAll();
    }
  });

  document.addEventListener("change", (event) => {
    const picker = event.target.closest(
      "month-picker[data-month-start], month-picker[data-month-end]",
    );
    const root = picker?.closest("[data-month-range]");
    if (!root) return;
    const start = root.querySelector("[data-month-start]").value;
    const end = root.querySelector("[data-month-end]").value;
    if (start && end && start <= end) {
      const error = root.querySelector("[data-month-range-error]");
      error.textContent = "";
      error.hidden = true;
    }
  });

  function latestByAccount(end = "9999-12") {
    const map = new Map();
    window.InvestmentAPI.balances()
      .filter((item) => item.month <= end)
      .sort((a, b) => a.month.localeCompare(b.month))
      .forEach((item) => map.set(item.accountId, item));
    return map;
  }
  function investmentMetrics() {
    const allBalances = window.InvestmentAPI.balances();
    const allFlows = window.InvestmentAPI.contributions();
    const active = window.InvestmentAPI.accounts().filter(
      (item) => item.active !== false,
    );
    const ending = latestByAccount(range.end || "9999-12");
    let balance = 0,
      contributions = 0,
      growth = 0,
      covered = 0,
      stale = 0;
    active.forEach((account) => {
      const rows = allBalances
        .filter((item) => item.accountId === account.id)
        .sort((a, b) => a.month.localeCompare(b.month));
      const close = ending.get(account.id);
      if (close) {
        balance += Number(close.balance || 0);
        if (close.month < (range.end || currentMonth)) stale += 1;
      }
      const periodFlows = allFlows.filter(
        (item) =>
          item.accountId === account.id &&
          (!range.start || item.month >= range.start) &&
          (!range.end || item.month <= range.end),
      );
      contributions += netFlows(periodFlows);
      const opening = range.start
        ? rows.filter((item) => item.month < range.start).at(-1)
        : null;
      if (opening && close) {
        growth += window.InvestmentAPI.calculateGrowth(
          opening.balance,
          close.balance,
          periodFlows,
        );
        covered += 1;
      }
    });
    return {
      balance,
      contributions,
      growth,
      covered,
      stale,
      total: active.length,
    };
  }
  function card(label, value, hint = "") {
    return `<article class="summary-card"><div><p>${escapeHTML(label)}</p><strong>${escapeHTML(value)}</strong>${hint ? `<small>${escapeHTML(hint)}</small>` : ""}</div></article>`;
  }
  function trendData() {
    const all = window.InvestmentAPI.balances();
    const months = [...new Set(all.map((item) => item.month))].sort();
    const accountRows = window.InvestmentAPI.accounts();
    return months.map((month) => ({
      month,
      value: accountRows.reduce((sum, account) => {
        const row = all
          .filter(
            (item) => item.accountId === account.id && item.month <= month,
          )
          .sort((a, b) => a.month.localeCompare(b.month))
          .at(-1);
        return sum + Number(row?.balance || 0);
      }, 0),
    }));
  }
  function trendSVG() {
    const points = trendData();
    if (!points.length)
      return '<div class="investment-empty">Add monthly balances to build your trend.</div>';
    const width = 760,
      height = 230,
      pad = 34,
      max = Math.max(...points.map((item) => item.value), 1),
      min = Math.min(...points.map((item) => item.value), 0),
      span = Math.max(max - min, 1);
    const coords = points.map((item, index) => ({
      ...item,
      x:
        pad +
        (points.length === 1
          ? (width - pad * 2) / 2
          : (index * (width - pad * 2)) / (points.length - 1)),
      y: height - pad - ((item.value - min) / span) * (height - pad * 2),
    }));
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Investment balance trend from ${points[0].month} to ${points.at(-1).month}"><path class="trend-area" d="M${coords[0].x},${height - pad} ${coords.map((point) => `L${point.x},${point.y}`).join(" ")} L${coords.at(-1).x},${height - pad} Z"/><path class="trend-line" d="M${coords.map((point) => `${point.x},${point.y}`).join(" L")}"/>${coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4"><title>${point.month}: ${money(point.value)}</title></circle>`).join("")}<text x="${pad}" y="${height - 8}">${points[0].month}</text><text x="${width - pad}" y="${height - 8}" text-anchor="end">${points.at(-1).month}</text></svg>`;
  }
  function renderDashboard() {
    const totals = window.InvestmentAPI.calculate(
      window.BudgetUI?.getTransactions() || [],
      range,
    );
    const metrics = investmentMetrics();
    document.getElementById("dashboard-summary").innerHTML =
      card("Total savings", money(totals.totalSavings)) +
      card("Budget surplus", money(totals.budgetSurplus)) +
      card(
        "Paycheck investing",
        money(totals.paycheckContributions),
        "Counted in savings",
      ) +
      card("Income", money(totals.income)) +
      card("Spending", money(totals.spending)) +
      card("Investment balance", money(metrics.balance));
    document.getElementById("dashboard-trend").innerHTML = trendSVG();
    document.getElementById("dashboard-breakdown").innerHTML =
      [
        ["Budget surplus", totals.budgetSurplus],
        ["Paycheck net flows", totals.paycheckContributions],
        ["Manual net flows", totals.manualContributions],
      ]
        .map(
          ([label, value]) =>
            `<div><span>${label}</span><strong>${money(value)}</strong></div>`,
        )
        .join("") +
      '<p class="transfer-note">Paycheck contributions are added to Total savings and withdrawals reduce them. Manual transfers are excluded because they allocate savings already counted in income minus spending.</p>';
  }
  function renderInvestmentSummary() {
    const metrics = investmentMetrics();
    document.getElementById("investment-summary").innerHTML =
      card("Current balance", money(metrics.balance)) +
      card("Net contributions", money(metrics.contributions)) +
      card(
        "Investment growth",
        metrics.covered ? money(metrics.growth) : "Not available",
        metrics.covered
          ? `${metrics.covered} of ${metrics.total} accounts covered`
          : "Needs a prior snapshot",
      );
    document.getElementById("investment-trend").innerHTML = trendSVG();
    document.getElementById("investment-coverage").textContent = metrics.total
      ? `Growth coverage: ${metrics.covered} of ${metrics.total} active accounts${metrics.stale ? ` · ${metrics.stale} carried forward from an earlier month` : ""}.`
      : "Add an account to begin.";
    const latest = latestByAccount(range.end || "9999-12");
    const allocations = window.InvestmentAPI.accounts()
      .filter((item) => item.active !== false)
      .map((account) => ({
        account,
        balance: Number(latest.get(account.id)?.balance || 0),
      }))
      .filter((item) => item.balance > 0)
      .sort((a, b) => b.balance - a.balance);
    const total = allocations.reduce((sum, item) => sum + item.balance, 0);
    document.getElementById("investment-allocation").innerHTML =
      allocations.length
        ? `<h3>Allocation</h3>${allocations.map((item) => `<div class="allocation-row"><div><span>${escapeHTML(item.account.name)}</span><strong>${Math.round((item.balance / total) * 100)}%</strong></div><div class="allocation-track"><span style="width:${(item.balance / total) * 100}%"></span></div><small>${item.account.source === "paycheck" ? "Paycheck deduction" : "Manual transfer"} · ${money(item.balance)}</small></div>`).join("")}`
        : "";
  }
  function renderAccounts() {
    const accountRows = window.InvestmentAPI.accounts().filter(
      (item) => item.active !== false,
    );
    const latest = latestByAccount();
    document.getElementById("investment-account-count").textContent =
      `${accountRows.length} ${accountRows.length === 1 ? "account" : "accounts"}`;
    document.getElementById("investment-account-list").innerHTML =
      accountRows.length
        ? accountRows
            .map(
              (account) =>
                `<article class="category-item investment-account-row" role="button" tabindex="0" data-investment-account="${account.id}"><span class="category-icon">${escapeHTML(account.name.charAt(0).toUpperCase())}</span><div><strong>${escapeHTML(account.name)}</strong><p>${account.source === "paycheck" ? "Paycheck deduction" : "Manual transfer"}</p></div><strong class="account-balance">${money(latest.get(account.id)?.balance || 0)}</strong></article>`,
            )
            .join("")
        : '<div class="investment-empty">Add your first investment account.</div>';
  }

  function renderMonthList() {
    const month =
      document.getElementById("investment-entry-month").value || currentMonth;

    const syncItems = window.BudgetAPI.getSyncItems().filter(
      (item) =>
        item.source === "investmentMonth" && item.record.month === month,
    );
    document.getElementById("investment-month-list").innerHTML =
      window.InvestmentAPI.accounts()
        .filter((item) => item.active !== false)
        .map((account) => {
          const data = window.InvestmentAPI.monthData(account.id, month);
          const gross = data.contributions
            .filter((item) => item.amount > 0)
            .reduce((sum, item) => sum + item.amount, 0);
          const withdrawals = data.contributions.filter(
            (item) => item.amount < 0,
          );
          const status = syncItems.find(
            (item) => item.record.accountId === account.id,
          );
          const countCopy = `${data.contributions.filter((item) => item.amount > 0).length} ${data.contributions.filter((item) => item.amount > 0).length === 1 ? "contribution" : "contributions"} · ${withdrawals.length} ${withdrawals.length === 1 ? "withdrawal" : "withdrawals"}`;
          return `<tr role="button" tabindex="0" data-investment-month-account="${account.id}" aria-label="Edit ${escapeHTML(account.name)} for ${month}"><td><strong>${escapeHTML(account.name)}</strong><small>${account.source === "paycheck" ? "Paycheck deduction" : "Manual transfer"}${status ? ` · <span class="${status.status === "failed" ? "error" : "pending-label"}">${status.status === "failed" ? "Needs attention" : "Pending"}</span>` : ""}</small></td><td>${data.balance ? money(data.balance.balance) : '<span class="muted">Not entered</span>'}</td><td>${money(gross + withdrawals.reduce((sum, item) => sum + item.amount, 0))}</td><td>${countCopy}</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="4">Add an account before entering monthly balances.</td></tr>';
  }

  function renderBalanceHistory() {
    const rows = window.InvestmentAPI.snapshots().sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        a.accountName.localeCompare(b.accountName),
    );
    const body = document.getElementById("investment-history-body"),
      empty = document.getElementById("investment-history-empty"),
      wrap = document.getElementById("investment-history-wrap");
    document.getElementById("investment-history-count").textContent =
      `${rows.length} ${rows.length === 1 ? "snapshot" : "snapshots"}`;
    body.innerHTML = rows
      .map(
        (item) =>
          `<tr data-history-snapshot="${item.id}" data-history-account="${item.accountId}" data-history-month="${item.month}" role="button" tabindex="0" aria-label="Edit ${escapeHTML(item.accountName)} balance for ${item.month}"><td>${item.month}</td><td><strong>${escapeHTML(item.accountName)}</strong></td><td>${item.source === "paycheck" ? "Paycheck deduction" : "Manual transfer"}</td><td>${money(item.contribution)}</td><td class="amount-cell">${money(item.balance)}</td></tr>`,
      )
      .join("");
    empty.hidden = rows.length > 0;
    wrap.hidden = rows.length === 0;
  }
  function renderAll() {
    if (!window.InvestmentAPI) return;
    renderDashboard();
    renderInvestmentSummary();
    renderAccounts();
    renderMonthList();
    renderBalanceHistory();
  }
  async function load() {
    try {
      await window.InvestmentAPI.load();
      loaded = true;
      renderAll();
    } catch (error) {
      window.ToastUI?.show(`Couldn’t load investments: ${error.message}`, {
        type: "error",
        sticky: true,
      });
    }
  }

  const entryMonth = document.getElementById("investment-entry-month");
  entryMonth.value = currentMonth;
  entryMonth.addEventListener("change", renderMonthList);
  const monthBackdrop = document.getElementById(
      "investment-month-drawer-backdrop",
    ),
    monthDrawer = document.getElementById("investment-month-drawer"),
    monthForm = document.getElementById("investment-month-form");
  function flowTotal(value) {
    return (value?.contributions || []).reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
  }
  function flowRow(record, type) {
    const amount = Math.abs(Number(record?.amount || 0));
    return `<div class="investment-flow-row" data-flow-id="${record?.id || ""}"><label><span class="sr-only">${type} amount</span><span class="currency-prefix">$</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${amount || ""}" aria-label="${type} amount" /></label><button type="button" data-remove-flow aria-label="Remove ${type.toLowerCase()}">×</button></div>`;
  }
  function updateDrawerTotals() {
    const positive = [
      ...document.querySelectorAll("#investment-contribution-list input"),
    ].reduce((sum, input) => sum + Number(input.value || 0), 0);
    const withdrawals = [
      ...document.querySelectorAll("#investment-withdrawal-list input"),
    ].reduce((sum, input) => sum + Number(input.value || 0), 0);
    document.getElementById("investment-gross-contributions").textContent =
      money(positive);
    document.getElementById("investment-total-withdrawals").textContent =
      money(withdrawals);
    document.getElementById("investment-net-contribution").textContent = money(
      positive - withdrawals,
    );
  }
  function populateMonthDrawer(value, conflict = null) {
    const account = window.InvestmentAPI.accounts().find(
      (item) => item.id === value.accountId,
    );
    editingMonthAccountId = value.accountId;
    document.getElementById("investment-month-drawer-title").textContent =
      `${account?.name || "Investment"} · ${value.month}`;
    monthForm.elements.balance.value = value.balance?.balance ?? "";
    document.getElementById("investment-contribution-list").innerHTML =
      value.contributions
        .filter((item) => item.amount > 0)
        .map((item) => flowRow(item, "Contribution"))
        .join("");
    document.getElementById("investment-withdrawal-list").innerHTML =
      value.contributions
        .filter((item) => item.amount < 0)
        .map((item) => flowRow(item, "Withdrawal"))
        .join("");
    const panel = document.getElementById("investment-month-conflict");
    panel.hidden = !conflict;
    if (conflict) {
      document.getElementById("investment-month-sheet-balance").textContent =
        money(conflict.current.balance?.balance);
      document.getElementById("investment-month-sheet-flow").textContent =
        `${money(flowTotal(conflict.current))} net contribution`;
      document.getElementById("investment-month-draft-balance").textContent =
        money(conflict.draft.balance?.balance);
      document.getElementById("investment-month-draft-flow").textContent =
        `${money(flowTotal(conflict.draft))} net contribution`;
    }
    document.getElementById("investment-month-message").textContent = "";
    updateDrawerTotals();
    monthDrawerDirty = false;
    monthBackdrop.hidden = false;
    document.body.classList.add("drawer-open");
    monthDrawer.focus();
  }
  function openMonth(accountId, reviewId = "") {
    monthDrawerOpener = document.activeElement;
    const month = entryMonth.value || currentMonth;
    reviewingConflictId = reviewId;
    const conflict = reviewId
      ? window.InvestmentAPI.getConflict(reviewId)
      : null;
    const value =
      conflict?.draft || window.InvestmentAPI.monthData(accountId, month);
    populateMonthDrawer(value, conflict);
    monthForm.elements.balance.focus();
  }
  function closeMonthDrawer(force = false) {
    if (
      !force &&
      monthDrawerDirty &&
      !confirm("Discard your unsaved investment changes?")
    )
      return false;
    monthBackdrop.hidden = true;
    document.body.classList.remove("drawer-open");
    editingMonthAccountId = "";
    reviewingConflictId = "";
    monthDrawerDirty = false;
    if (monthDrawerOpener?.isConnected) monthDrawerOpener.focus();
    monthDrawerOpener = null;
    return true;
  }
  function addFlow(type) {
    const list = document.getElementById(
      type === "Contribution"
        ? "investment-contribution-list"
        : "investment-withdrawal-list",
    );
    list.insertAdjacentHTML("beforeend", flowRow(null, type));
    list.querySelector(".investment-flow-row:last-child input")?.focus();
    monthDrawerDirty = true;
    updateDrawerTotals();
  }
  function collectFlows() {
    const collect = (selector, sign) =>
      [
        ...document.querySelectorAll(`${selector} .investment-flow-row`),
      ].flatMap((row) => {
        const raw = row.querySelector("input").value;
        if (raw === "" || Number(raw) === 0) return [];
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount < 0)
          throw new Error(
            "Enter contribution and withdrawal amounts as positive values.",
          );
        return [{ id: row.dataset.flowId || "", amount: sign * amount }];
      });
    return [
      ...collect("#investment-contribution-list", 1),
      ...collect("#investment-withdrawal-list", -1),
    ];
  }
  document
    .getElementById("investment-month-list")
    .addEventListener("click", (event) => {
      const row = event.target.closest("[data-investment-month-account]");
      if (row) openMonth(row.dataset.investmentMonthAccount);
    });
  document
    .getElementById("investment-month-list")
    .addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      const row = event.target.closest("[data-investment-month-account]");
      if (row) {
        event.preventDefault();
        openMonth(row.dataset.investmentMonthAccount);
      }
    });
  document
    .getElementById("add-investment-contribution")
    .addEventListener("click", () => addFlow("Contribution"));
  document
    .getElementById("add-investment-withdrawal")
    .addEventListener("click", () => addFlow("Withdrawal"));
  monthForm.addEventListener("input", () => {
    monthDrawerDirty = true;
    updateDrawerTotals();
  });
  monthForm.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-flow]");
    if (button) {
      button.closest(".investment-flow-row").remove();
      monthDrawerDirty = true;
      updateDrawerTotals();
    }
  });
  monthForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = document.getElementById("investment-month-message");
    try {
      const input = {
        accountId: editingMonthAccountId,
        month: entryMonth.value,
        balance: monthForm.elements.balance.value,
        contributions: collectFlows(),
      };
      if (reviewingConflictId)
        window.InvestmentAPI.resolveConflict(reviewingConflictId, input);
      else window.InvestmentAPI.queueMonth(input);
      closeMonthDrawer(true);
      window.ToastUI?.show(
        "Monthly investment update saved locally and syncing.",
      );
      renderAll();
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message;
    }
  });
  document
    .getElementById("investment-month-use-sheet")
    .addEventListener("click", () => {
      if (!reviewingConflictId) return;
      window.InvestmentAPI.discard("investmentMonth", reviewingConflictId);
      closeMonthDrawer(true);
      renderAll();
      window.ToastUI?.show("Google Sheet values restored.");
    });
  document
    .getElementById("cancel-investment-month")
    .addEventListener("click", () => closeMonthDrawer());
  document
    .getElementById("close-investment-month-drawer")
    .addEventListener("click", () => closeMonthDrawer());
  monthBackdrop.addEventListener("click", (event) => {
    if (event.target === monthBackdrop) closeMonthDrawer();
  });
  monthDrawer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMonthDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...monthDrawer.querySelectorAll(
        "button:not([disabled]),input:not([disabled])",
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document
    .getElementById("investment-account-form")
    .addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        message = form.querySelector(".settings-message");
      try {
        const record = window.InvestmentAPI.addAccount(
          Object.fromEntries(new FormData(form)),
        );
        form.reset();
        message.className = "settings-message success";
        message.textContent = `${record.name} added. Syncing…`;
        renderAll();
      } catch (error) {
        message.className = "settings-message error";
        message.textContent = error.message;
      }
    });
  const drawerBackdrop = document.getElementById(
      "investment-account-drawer-backdrop",
    ),
    editForm = document.getElementById("investment-account-edit-form");
  function openAccount(id) {
    const account = window.InvestmentAPI.accounts().find(
      (item) => item.id === id,
    );
    if (!account) return;
    editingAccountId = id;
    editForm.elements.name.value = account.name;
    editForm.elements.source.value = account.source;
    const chronological = window.InvestmentAPI.balances()
      .filter((item) => item.accountId === id)
      .sort((a, b) => a.month.localeCompare(b.month));
    const history = [...chronological].reverse();
    document.getElementById("investment-account-history").innerHTML =
      `<h3>Balance history</h3>${
        history.length
          ? history
              .map((item) => {
                const previous = chronological
                  .filter((entry) => entry.month < item.month)
                  .at(-1);
                const flows = flowsFor(id, item.month);
                const growth = previous
                  ? window.InvestmentAPI.calculateGrowth(
                      previous.balance,
                      item.balance,
                      flows,
                    )
                  : null;
                return `<button type="button" data-edit-investment-month="${item.month}"><span>${item.month}<small>Net contribution ${money(netFlows(flows))}${growth === null ? "" : ` · Growth ${money(growth)}`}</small></span><strong>${money(item.balance)}</strong></button>`;
              })
              .join("")
          : "<p>No balances yet.</p>"
      }`;
    drawerBackdrop.hidden = false;
    document.getElementById("investment-account-drawer").focus();
  }
  function closeDrawer() {
    drawerBackdrop.hidden = true;
    editingAccountId = "";
  }
  document
    .getElementById("investment-account-list")
    .addEventListener("click", (event) => {
      const row = event.target.closest("[data-investment-account]");
      if (row) openAccount(row.dataset.investmentAccount);
    });
  document
    .getElementById("investment-account-list")
    .addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        const row = event.target.closest("[data-investment-account]");
        if (row) {
          event.preventDefault();
          openAccount(row.dataset.investmentAccount);
        }
      }
    });
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = editForm.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await window.InvestmentAPI.updateAccount({
        id: editingAccountId,
        ...Object.fromEntries(new FormData(editForm)),
      });
      closeDrawer();
      window.ToastUI?.show("Investment account updated.");
      renderAll();
    } catch (error) {
      editForm.querySelector(".form-message").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  editForm
    .querySelector("[data-account-archive]")
    .addEventListener("click", async () => {
      if (
        !confirm(
          "Archive this investment account? Its history will remain available.",
        )
      )
        return;
      try {
        await window.InvestmentAPI.archiveAccount(editingAccountId);
        closeDrawer();
        renderAll();
      } catch (error) {
        editForm.querySelector(".form-message").textContent = error.message;
      }
    });
  editForm
    .querySelector("[data-account-cancel]")
    .addEventListener("click", closeDrawer);
  document
    .getElementById("close-investment-account-drawer")
    .addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", (event) => {
    if (event.target === drawerBackdrop) closeDrawer();
  });
  document
    .getElementById("investment-account-history")
    .addEventListener("click", (event) => {
      const month = event.target.closest("[data-edit-investment-month]")
        ?.dataset.editInvestmentMonth;
      if (month) {
        const accountId = editingAccountId;
        entryMonth.value = month;
        closeDrawer();
        openMonth(accountId);
      }
    });
  document
    .getElementById("investment-history-body")
    .addEventListener("click", (event) => {
      const row = event.target.closest("[data-history-account]");
      if (row) {
        entryMonth.value = row.dataset.historyMonth;
        window.BudgetUI.showTab("investment-update");
        openMonth(row.dataset.historyAccount);
      }
    });
  document
    .getElementById("investment-history-body")
    .addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      const row = event.target.closest("[data-history-account]");
      if (row) {
        event.preventDefault();
        entryMonth.value = row.dataset.historyMonth;
        window.BudgetUI.showTab("investment-update");
        openMonth(row.dataset.historyAccount);
      }
    });

  function reviewMonth(id) {
    const conflict = window.InvestmentAPI.getConflict(id);
    if (!conflict?.current) {
      window.ToastUI?.show("That conflict is no longer available.", {
        type: "error",
        sticky: true,
      });
      return;
    }
    entryMonth.value = conflict.draft.month;
    window.BudgetUI.showTab("investment-update");
    openMonth(conflict.draft.accountId, id);
  }
  function parseDelimited(text) {
    const rows = [];
    let row = [],
      field = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i],
        next = text[i + 1];
      if (char === '"' && quoted && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = !quoted;
      else if (!quoted && (char === "," || char === "\t")) {
        row.push(field.trim());
        field = "";
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") i++;
        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        field = "";
      } else field += char;
    }
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }
  const headerKey = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  function previewImport() {
    const matrix = parseDelimited(
        document.getElementById("investment-import-text").value,
      ),
      message = document.getElementById("investment-import-message");
    if (matrix.length < 2) {
      message.textContent = "Paste a header row and at least one data row.";
      return;
    }
    const headers = matrix[0].map(headerKey),
      find = (names) => headers.findIndex((header) => names.includes(header)),
      columns = {
        account: find(["account", "accountname", "name"]),
        source: find(["source", "contributionsource"]),
        month: find(["month", "reportingmonth"]),
        balance: find(["balance", "endingbalance"]),
        contribution: find([
          "contribution",
          "totalcontribution",
          "netcontribution",
        ]),
        notes: find(["notes", "note"]),
      };
    if (columns.account < 0 || columns.month < 0 || columns.balance < 0) {
      message.textContent = "Required columns: Account, Month, and Balance.";
      return;
    }
    const seen = new Set(),
      errors = [];
    importRows = matrix.slice(1).map((values, index) => {
      const get = (key) => (columns[key] >= 0 ? values[columns[key]] : ""),
        accountName = get("account"),
        month = get("month"),
        key = `${accountName.toLowerCase()}|${month}`;
      if (!accountName)
        errors.push(`Row ${index + 2}: account name is required.`);
      if (seen.has(key))
        errors.push(`Row ${index + 2}: duplicate account and month.`);
      seen.add(key);
      if (!/^\d{4}-\d{2}$/.test(month))
        errors.push(`Row ${index + 2}: invalid month.`);
      if (
        !Number.isFinite(Number(get("balance"))) ||
        Number(get("balance")) < 0
      )
        errors.push(`Row ${index + 2}: invalid balance.`);
      if (get("contribution") && !Number.isFinite(Number(get("contribution"))))
        errors.push(`Row ${index + 2}: invalid contribution.`);
      const sourceText = get("source").toLowerCase(),
        paycheck = ["paycheck", "paycheck deduction", "payroll"],
        manual = ["", "manual", "manual transfer"];
      if (!paycheck.includes(sourceText) && !manual.includes(sourceText))
        errors.push(`Row ${index + 2}: source must be paycheck or manual.`);
      return {
        accountName,
        source: paycheck.includes(sourceText) ? "paycheck" : "manual",
        month,
        balance: Number(get("balance")),
        contribution: Number(get("contribution") || 0),
        notes: get("notes"),
      };
    });
    const replacing = importRows.filter((row) =>
      window.InvestmentAPI.balances().some(
        (item) =>
          item.month === row.month &&
          item.accountName.toLowerCase() === row.accountName.toLowerCase(),
      ),
    ).length;
    document.getElementById("investment-import-preview").innerHTML =
      `<strong>${importRows.length} rows ready</strong><p>${new Set(importRows.map((row) => row.accountName)).size} accounts · ${replacing} existing months will replace their contribution and withdrawal entries</p>${errors.map((error) => `<p class="error">${escapeHTML(error)}</p>`).join("")}`;
    document.getElementById("confirm-investment-import").disabled =
      errors.length > 0;
    message.textContent = errors.length
      ? "Correct the highlighted import problems."
      : "Review the counts, then import.";
  }
  const importOverlay = document.getElementById("investment-import-overlay");
  document
    .getElementById("open-investment-import")
    .addEventListener("click", () => {
      importOverlay.hidden = false;
      importRows = [];
      document.getElementById("confirm-investment-import").disabled = true;
    });
  document
    .getElementById("cancel-investment-import")
    .addEventListener("click", () => {
      importOverlay.hidden = true;
    });
  document
    .getElementById("preview-investment-import")
    .addEventListener("click", previewImport);
  document
    .getElementById("confirm-investment-import")
    .addEventListener("click", () => {
      try {
        const accountMap = new Map(
          window.InvestmentAPI.accounts().map((item) => [
            item.name.toLowerCase(),
            item,
          ]),
        );
        importRows.forEach((row) => {
          const key = row.accountName.toLowerCase();
          let account = accountMap.get(key);
          if (!account) {
            account = window.InvestmentAPI.addAccount({
              name: row.accountName,
              source: row.source,
            });
            accountMap.set(key, account);
          }
          const existing = window.InvestmentAPI.monthData(
            account.id,
            row.month,
          );
          window.InvestmentAPI.queueMonth({
            accountId: account.id,
            month: row.month,
            balance: row.balance,
            notes: row.notes,
            balanceId: existing.balance?.id,
            contributions:
              row.contribution === 0 ? [] : [{ amount: row.contribution }],
          });
        });
        importOverlay.hidden = true;
        window.ToastUI?.show(
          `${importRows.length} investment months queued for synchronization.`,
        );
        renderAll();
      } catch (error) {
        document.getElementById("investment-import-message").textContent =
          error.message;
      }
    });

  window.addEventListener("budget:investments-changed", renderAll);
  window.addEventListener("budget:transaction-saved", renderDashboard);
  window.addEventListener("budget:transaction-queued", renderDashboard);
  window.InvestmentUI = {
    load: () => (loaded ? Promise.resolve(renderAll()) : load()),
    render: renderAll,
    getRange: () => ({ ...range }),
    reviewMonth,
    reviewSnapshot: reviewMonth,
  };
  renderRangeControls();
});
