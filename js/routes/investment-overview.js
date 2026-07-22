(function () {
  const { escapeHTML, money, monthOffset } = window.AppUtils;
  const { card, currentMonth, latestByAccount, metrics, trendSVG } =
    window.InvestmentView;
  let cleanup = null;

  function mount(root) {
    const rangeRoot = root.querySelector("[data-month-range]");
    const summary = root.querySelector("#investment-summary");
    const trend = root.querySelector("#investment-trend");
    const coverage = root.querySelector("#investment-coverage");
    const allocation = root.querySelector("#investment-allocation");
    const month = currentMonth();
    const year = month.slice(0, 4);
    let range = { preset: "month", start: month, end: month };

    function renderRange() {
      const presets = [
        ["month", "Month"],
        ["three", "3 Months"],
        ["year", year],
        ["all", "All time"],
        ["custom", "Custom"],
      ];
      rangeRoot.innerHTML = `
        <div class="date-range-presets" role="group" aria-label="Reporting months">
          ${presets.map(([key, label]) => `<button type="button" data-month-preset="${key}" class="${range.preset === key ? "active" : ""}">${label}</button>`).join("")}
        </div>
        <div class="custom-month-range" ${range.preset === "custom" ? "" : "hidden"}>
          <month-picker label="From" data-month-start value="${range.start || month}"></month-picker>
          <month-picker label="To" data-month-end value="${range.end || month}"></month-picker>
          <button class="secondary-button compact" type="button" data-month-apply>Apply</button>
        </div>
        <p class="month-range-error" data-month-range-error role="alert" aria-live="polite" hidden></p>`;
    }

    function render() {
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
      trend.innerHTML = trendSVG();
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

    function handleClick(event) {
      const preset = event.target.closest("[data-month-preset]")?.dataset
        .monthPreset;
      if (preset) {
        if (preset === "month")
          range = { preset, start: month, end: month };
        if (preset === "three")
          range = { preset, start: monthOffset(month, -2), end: month };
        if (preset === "year")
          range = { preset, start: `${year}-01`, end: `${year}-12` };
        if (preset === "all") range = { preset, start: "", end: "" };
        if (preset === "custom")
          range = {
            ...range,
            preset,
            start: range.start || month,
            end: range.end || month,
          };
        renderRange();
        if (preset !== "custom") render();
        return;
      }

      if (!event.target.closest("[data-month-apply]")) return;
      const start = rangeRoot.querySelector("[data-month-start]").value;
      const end = rangeRoot.querySelector("[data-month-end]").value;
      const error = rangeRoot.querySelector("[data-month-range-error]");
      if (!start || !end || start > end) {
        error.textContent = !start || !end
          ? "Choose both a From month and a To month."
          : "From month must be before or the same as To month.";
        error.hidden = false;
        return;
      }
      range = { preset: "custom", start, end };
      renderRange();
      render();
    }

    rangeRoot.addEventListener("click", handleClick);
    window.addEventListener("budget:investments-changed", render);
    window.addEventListener("budget:investments-loaded", render);
    renderRange();
    render();

    cleanup = () => {
      rangeRoot.removeEventListener("click", handleClick);
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
