(function () {
  const { escapeHTML, money } = window.AppUtils;
  const {
    card,
    latestByAccount,
    metrics,
    monthRangeFromDates,
    mountTrend,
  } = window.InvestmentView;
  let cleanup = null;

  function mount(root) {
    const rangePicker = root.querySelector("date-range-picker");
    const summary = root.querySelector("#investment-summary");
    const trend = root.querySelector("#investment-trend");
    const coverage = root.querySelector("#investment-coverage");
    const allocation = root.querySelector("#investment-allocation");
    let dateRange = rangePicker.value;
    let cleanupTrend = null;

    function render() {
      const range = monthRangeFromDates(dateRange);
      const values = metrics(range);
      summary.innerHTML =
        card("Current balance", money(values.balance)) +
        card("Net contributions", money(values.contributions)) +
        card(
          "Investment growth",
          values.covered ? money(values.growth) : "Not available",
          values.covered
            ? `${values.covered} of ${values.total} accounts covered`
            : "Needs a prior snapshot",
        );
      cleanupTrend?.();
      cleanupTrend = mountTrend(trend, {
        range,
        includeContributions: true,
      });
      coverage.textContent = values.total
        ? `Growth coverage: ${values.covered} of ${values.total} active accounts${values.stale ? ` · ${values.stale} carried forward from an earlier month` : ""}.`
        : "Add an account to begin.";

      const latest = latestByAccount(range.end || "9999-12");
      const accounts = window.InvestmentAPI.accounts()
        .filter((item) => item.active !== false)
        .map((account) => ({
          account,
          balance: Number(latest.get(account.id)?.balance || 0),
        }))
        .filter((item) => item.balance > 0)
        .sort((a, b) => b.balance - a.balance);
      const total = accounts.reduce((sum, item) => sum + item.balance, 0);
      allocation.innerHTML = accounts.length
        ? `<h3>Allocation</h3>${accounts.map((item) => `<div class="allocation-row"><div><span>${escapeHTML(item.account.name)}</span><strong>${Math.round((item.balance / total) * 100)}%</strong></div><div class="allocation-track"><span style="width:${(item.balance / total) * 100}%"></span></div><small>${window.InvestmentView.sourceLabel(item.account.source)} · ${money(item.balance)}</small></div>`).join("")}`
        : "";
    }

    function handleRangeChange(event) {
      if (event.target !== rangePicker) return;
      dateRange = event.detail;
      render();
    }

    root.addEventListener("date-range-changed", handleRangeChange);
    window.addEventListener("budget:investments-changed", render);
    window.addEventListener("budget:investments-loaded", render);
    render();

    cleanup = () => {
      cleanupTrend?.();
      root.removeEventListener("date-range-changed", handleRangeChange);
      window.removeEventListener("budget:investments-changed", render);
      window.removeEventListener("budget:investments-loaded", render);
    };
  }

  function unmount() {
    cleanup?.();
    cleanup = null;
  }

  window.InvestmentOverviewRoute = { mount, unmount };
})();
