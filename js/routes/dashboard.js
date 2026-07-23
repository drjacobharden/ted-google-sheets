(function () {
  const { money } = window.AppUtils;
  const { card, metrics, monthRangeFromDates, mountTrend } =
    window.InvestmentView;
  let cleanup = null;

  function mount(root) {
    const rangePicker = root.querySelector("date-range-picker");
    const summary = root.querySelector("#dashboard-summary");
    const trend = root.querySelector("#dashboard-trend");
    const breakdown = root.querySelector("#dashboard-breakdown");
    let range = rangePicker.value;
    let cleanupTrend = null;

    function render() {
      const totals = window.InvestmentAPI.calculate(
        window.BudgetUI?.getTransactions() || [],
        range,
      );
      const monthRange = monthRangeFromDates(range);
      const investmentMetrics = metrics(monthRange);
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
      cleanupTrend?.();
      cleanupTrend = mountTrend(trend, {
        range: monthRange,
        includeContributions: false,
      });
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

    function handleRangeChange(event) {
      if (event.target !== rangePicker) return;
      range = event.detail;
      render();
    }

    root.addEventListener("date-range-changed", handleRangeChange);
    window.addEventListener("budget:investments-changed", render);
    window.addEventListener("budget:investments-loaded", render);
    window.addEventListener("budget:transaction-saved", render);
    window.addEventListener("budget:transaction-queued", render);
    render();

    cleanup = () => {
      cleanupTrend?.();
      root.removeEventListener("date-range-changed", handleRangeChange);
      window.removeEventListener("budget:investments-changed", render);
      window.removeEventListener("budget:investments-loaded", render);
      window.removeEventListener("budget:transaction-saved", render);
      window.removeEventListener("budget:transaction-queued", render);
    };
  }

  function unmount() {
    cleanup?.();
    cleanup = null;
  }

  window.DashboardRoute = { mount, unmount };
})();
