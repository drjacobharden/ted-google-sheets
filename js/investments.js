document.addEventListener("DOMContentLoaded", () => {
  const { card, currentMonth, metrics, trendSVG } = window.InvestmentView;
  const { money, monthOffset } = window.AppUtils;
  let loaded = false;
  let loadPromise = null;
  const month = currentMonth();
  let dashboardRange = { preset: "month", start: month, end: month };

  function renderDashboardRange() {
    const root = document.querySelector(
      '[data-screen="dashboard"] [data-month-range]',
    );
    if (!root) return;
    const year = month.slice(0, 4);
    const presets = [
      ["month", "Month"],
      ["three", "3 Months"],
      ["year", year],
      ["all", "All time"],
    ];
    root.innerHTML = `<div class="date-range-presets" role="group" aria-label="Reporting months">${presets.map(([key, label]) => `<button type="button" data-dashboard-month-preset="${key}" class="${dashboardRange.preset === key ? "active" : ""}">${label}</button>`).join("")}</div>`;
  }

  function renderDashboard() {
    const summary = document.getElementById("dashboard-summary");
    const trend = document.getElementById("dashboard-trend");
    const breakdown = document.getElementById("dashboard-breakdown");
    if (!summary || !trend || !breakdown) return;

    const totals = window.InvestmentAPI.calculate(
      window.BudgetUI?.getTransactions() || [],
      dashboardRange,
    );
    const investmentMetrics = metrics(dashboardRange);
    summary.innerHTML =
      card("Total savings", money(totals.totalSavings)) +
      card("Budget surplus", money(totals.budgetSurplus)) +
      card(
        "Paycheck investing",
        money(totals.paycheckContributions),
        "Counted in savings",
      ) +
      card("Income", money(totals.income)) +
      card("Spending", money(totals.spending)) +
      card("Investment balance", money(investmentMetrics.balance));
    trend.innerHTML = trendSVG();
    breakdown.innerHTML =
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

  async function load() {
    if (loaded) {
      renderDashboard();
      return;
    }
    if (!loadPromise) {
      loadPromise = window.InvestmentAPI.load()
        .then(() => {
          loaded = true;
          window.dispatchEvent(new CustomEvent("budget:investments-loaded"));
          renderDashboard();
        })
        .catch((error) => {
          window.ToastUI?.show(`Couldn’t load investments: ${error.message}`, {
            type: "error",
            sticky: true,
          });
          throw error;
        })
        .finally(() => {
          loadPromise = null;
        });
    }
    return loadPromise;
  }

  window.addEventListener("budget:investments-changed", renderDashboard);
  window.addEventListener("budget:transaction-saved", renderDashboard);
  window.addEventListener("budget:transaction-queued", renderDashboard);
  document
    .querySelector('[data-screen="dashboard"] [data-month-range]')
    ?.addEventListener("click", (event) => {
      const preset = event.target.closest("[data-dashboard-month-preset]")
        ?.dataset.dashboardMonthPreset;
      if (!preset) return;
      const year = month.slice(0, 4);
      if (preset === "month")
        dashboardRange = { preset, start: month, end: month };
      if (preset === "three")
        dashboardRange = {
          preset,
          start: monthOffset(month, -2),
          end: month,
        };
      if (preset === "year")
        dashboardRange = {
          preset,
          start: `${year}-01`,
          end: `${year}-12`,
        };
      if (preset === "all")
        dashboardRange = { preset, start: "", end: "" };
      renderDashboardRange();
      renderDashboard();
    });

  window.InvestmentUI = {
    isLoaded: () => loaded,
    load,
    renderDashboard,
    setDashboardRange(range) {
      dashboardRange = { ...range };
      renderDashboard();
    },
  };
  renderDashboardRange();
});
