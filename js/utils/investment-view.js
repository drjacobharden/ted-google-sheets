(function () {
  const { escapeHTML, money, netFlows } = window.AppUtils;

  function currentMonth() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }

  function sourceLabel(source) {
    return source === "paycheck" ? "Paycheck deduction" : "Manual transfer";
  }

  function latestByAccount(end = "9999-12") {
    const latest = new Map();
    window.InvestmentAPI.balances()
      .filter((item) => item.month <= end)
      .sort((a, b) => a.month.localeCompare(b.month))
      .forEach((item) => latest.set(item.accountId, item));
    return latest;
  }

  function metrics(range) {
    const allBalances = window.InvestmentAPI.balances();
    const allFlows = window.InvestmentAPI.contributions();
    const accounts = window.InvestmentAPI.accounts().filter(
      (item) => item.active !== false,
    );
    const ending = latestByAccount(range.end || "9999-12");
    let balance = 0;
    let contributions = 0;
    let growth = 0;
    let covered = 0;
    let stale = 0;

    accounts.forEach((account) => {
      const rows = allBalances
        .filter((item) => item.accountId === account.id)
        .sort((a, b) => a.month.localeCompare(b.month));
      const closing = ending.get(account.id);
      if (closing) {
        balance += Number(closing.balance || 0);
        if (closing.month < (range.end || currentMonth())) stale += 1;
      }
      const flows = allFlows.filter(
        (item) =>
          item.accountId === account.id &&
          (!range.start || item.month >= range.start) &&
          (!range.end || item.month <= range.end),
      );
      contributions += netFlows(flows);
      const opening = range.start
        ? rows.filter((item) => item.month < range.start).at(-1)
        : null;
      if (opening && closing) {
        growth += window.InvestmentAPI.calculateGrowth(
          opening.balance,
          closing.balance,
          flows,
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
      total: accounts.length,
    };
  }

  function card(label, value, hint = "") {
    return `<article class="summary-card"><div><p>${escapeHTML(label)}</p><strong>${escapeHTML(value)}</strong>${hint ? `<small>${escapeHTML(hint)}</small>` : ""}</div></article>`;
  }

  function trendSVG() {
    const balances = window.InvestmentAPI.balances();
    const months = [...new Set(balances.map((item) => item.month))].sort();
    const accounts = window.InvestmentAPI.accounts();
    const points = months.map((month) => ({
      month,
      value: accounts.reduce((sum, account) => {
        const row = balances
          .filter(
            (item) => item.accountId === account.id && item.month <= month,
          )
          .sort((a, b) => a.month.localeCompare(b.month))
          .at(-1);
        return sum + Number(row?.balance || 0);
      }, 0),
    }));
    if (!points.length) {
      return '<div class="investment-empty">Add monthly balances to build your trend.</div>';
    }

    const width = 760;
    const height = 230;
    const pad = 34;
    const max = Math.max(...points.map((item) => item.value), 1);
    const min = Math.min(...points.map((item) => item.value), 0);
    const span = Math.max(max - min, 1);
    const coordinates = points.map((item, index) => ({
      ...item,
      x:
        pad +
        (points.length === 1
          ? (width - pad * 2) / 2
          : (index * (width - pad * 2)) / (points.length - 1)),
      y: height - pad - ((item.value - min) / span) * (height - pad * 2),
    }));

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Investment balance trend from ${points[0].month} to ${points.at(-1).month}"><path class="trend-area" d="M${coordinates[0].x},${height - pad} ${coordinates.map((point) => `L${point.x},${point.y}`).join(" ")} L${coordinates.at(-1).x},${height - pad} Z"/><path class="trend-line" d="M${coordinates.map((point) => `${point.x},${point.y}`).join(" L")}"/>${coordinates.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4"><title>${point.month}: ${money(point.value)}</title></circle>`).join("")}<text x="${pad}" y="${height - 8}">${points[0].month}</text><text x="${width - pad}" y="${height - 8}" text-anchor="end">${points.at(-1).month}</text></svg>`;
  }

  window.InvestmentView = {
    card,
    currentMonth,
    latestByAccount,
    metrics,
    sourceLabel,
    trendSVG,
  };
})();
