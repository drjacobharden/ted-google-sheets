(function () {
  const { escapeHTML, money, netFlows } = window.AppUtils;

  function currentMonth() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }

  function sourceLabel(source) {
    return source === "paycheck" ? "Paycheck deduction" : "Manual transfer";
  }

  function formatMonth(value) {
    const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])/);
    if (!match) return "Unknown month";
    return `${window.DateUtils.shortMonthNames[Number(match[2]) - 1]} ${match[1]}`;
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

  function monthIndex(month) {
    const match = String(month || "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
  }

  function monthFromIndex(index) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function monthsBetween(start, end) {
    const first = monthIndex(start);
    const last = monthIndex(end);
    if (first === null || last === null || first > last) return [];
    return Array.from({ length: last - first + 1 }, (_, offset) =>
      monthFromIndex(first + offset),
    );
  }

  function buildTrendSeries({
    balances = [],
    contributions = [],
    accounts = [],
    range = {},
  }) {
    const accountIds = new Set(accounts.map((account) => account.id));
    const validBalances = balances
      .filter(
        (item) => accountIds.has(item.accountId) && monthIndex(item.month) !== null,
      )
      .sort((a, b) => a.month.localeCompare(b.month));
    if (!validBalances.length) {
      return {
        months: [],
        balances: [],
        contributions: [],
        monthlyContributions: [],
        monthlyWithdrawals: [],
        monthlyNetFlows: [],
      };
    }

    const start = monthIndex(range.start) !== null
      ? range.start
      : validBalances[0].month;
    const end = monthIndex(range.end) !== null
      ? range.end
      : validBalances.at(-1).month;
    const months = monthsBetween(start, end);
    const rowsByAccount = new Map(
      accounts.map((account) => [
        account.id,
        validBalances.filter((item) => item.accountId === account.id),
      ]),
    );

    const aggregateBalances = months.map((month) => {
      const target = monthIndex(month);
      return accounts.reduce((total, account) => {
        const rows = rowsByAccount.get(account.id);
        if (!rows?.length || target < monthIndex(rows[0].month)) return total;

        const previous = rows.filter((row) => row.month <= month).at(-1);
        const next = rows.find((row) => row.month >= month);
        if (!previous) return total;
        if (!next || next.month === previous.month) {
          return total + Number(previous.balance || 0);
        }

        const previousIndex = monthIndex(previous.month);
        const nextIndex = monthIndex(next.month);
        const progress = (target - previousIndex) / (nextIndex - previousIndex);
        const interpolated =
          Number(previous.balance || 0) +
          (Number(next.balance || 0) - Number(previous.balance || 0)) * progress;
        return total + interpolated;
      }, 0);
    });

    const validContributions = contributions.filter(
      (item) =>
        accountIds.has(item.accountId) && monthIndex(item.month) !== null,
    );
    const cumulativeContributions = months.map((month) =>
      validContributions
        .filter((item) => item.month <= month)
        .reduce((total, item) => total + Number(item.amount || 0), 0),
    );
    const monthlyContributions = months.map((month) =>
      validContributions
        .filter((item) => item.month === month && Number(item.amount || 0) > 0)
        .reduce((total, item) => total + Number(item.amount || 0), 0),
    );
    const monthlyWithdrawals = months.map((month) =>
      validContributions
        .filter((item) => item.month === month && Number(item.amount || 0) < 0)
        .reduce((total, item) => total + Math.abs(Number(item.amount || 0)), 0),
    );
    const monthlyNetFlows = monthlyContributions.map(
      (amount, index) => amount - monthlyWithdrawals[index],
    );

    return {
      months,
      balances: aggregateBalances,
      contributions: cumulativeContributions,
      monthlyContributions,
      monthlyWithdrawals,
      monthlyNetFlows,
    };
  }

  function legacyTrendSeries() {
    const balances = window.InvestmentAPI.balances();
    const months = [...new Set(balances.map((item) => item.month))].sort();
    const accounts = window.InvestmentAPI.accounts();
    return {
      months,
      balances: months.map((month) =>
        accounts.reduce((sum, account) => {
          const row = balances
            .filter(
              (item) => item.accountId === account.id && item.month <= month,
            )
            .sort((a, b) => a.month.localeCompare(b.month))
            .at(-1);
          return sum + Number(row?.balance || 0);
        }, 0),
      ),
      contributions: [],
      monthlyContributions: months.map(() => 0),
      monthlyWithdrawals: months.map(() => 0),
      monthlyNetFlows: months.map(() => 0),
    };
  }

  function monthRangeFromDates(range = {}) {
    return {
      ...range,
      start: String(range.start || "").slice(0, 7),
      end: String(range.end || "").slice(0, 7),
    };
  }

  function niceScale(values, tickCount = 4) {
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (min === max) max = min + 1;
    const roughStep = (max - min) / tickCount;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;
    const step =
      (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
      magnitude;
    min = Math.floor(min / step) * step;
    max = Math.ceil(max / step) * step;
    const ticks = [];
    for (let value = min; value <= max + step / 2; value += step) {
      ticks.push(Math.abs(value) < step / 1000 ? 0 : value);
    }
    return { min, max, ticks };
  }

  function compactMoney(value) {
    const absolute = Math.abs(value);
    const compact = (divisor, suffix) => {
      const result = absolute / divisor;
      return `${result >= 10 || Number.isInteger(result) ? result.toFixed(0) : result.toFixed(1)}${suffix}`;
    };
    const amount = absolute >= 1000000
      ? compact(1000000, "M")
      : absolute >= 1000
        ? compact(1000, "K")
        : absolute.toFixed(0);
    return `${value < 0 ? "−" : ""}$${amount}`;
  }

  function trendSeries(options) {
    return options
      ? buildTrendSeries({
          balances: window.InvestmentAPI.balances(),
          contributions: window.InvestmentAPI.contributions(),
          accounts: window.InvestmentAPI.accounts(),
          range: monthRangeFromDates(options.range),
        })
      : legacyTrendSeries();
  }

  function renderTrendSVG(series, includeContributions) {
    if (!series.months.length) {
      return '<div class="investment-empty">Add monthly balances to build your trend.</div>';
    }

    const width = 760;
    const height = 270;
    const plot = { top: 42, right: 24, bottom: 42, left: 76 };
    const visibleValues = includeContributions
      ? [...series.balances, ...series.contributions]
      : series.balances;
    const { min, max, ticks } = niceScale(visibleValues);
    const span = Math.max(max - min, 1);
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    const x = (index) =>
      plot.left +
      (series.months.length === 1
        ? plotWidth / 2
        : (index * plotWidth) / (series.months.length - 1));
    const y = (value) => plot.top + ((max - value) / span) * plotHeight;
    const coordinates = (values) =>
      values.map((value, index) => ({
        month: series.months[index],
        value,
        x: x(index),
        y: y(value),
      }));
    const balancePoints = coordinates(series.balances);
    const contributionPoints = coordinates(series.contributions);
    const xLabelStep = Math.max(1, Math.ceil((series.months.length - 1) / 5));
    const xLabelIndexes = new Set(
      series.months
        .map((_, index) => index)
        .filter(
          (index) =>
            index === 0 ||
            index === series.months.length - 1 ||
            index % xLabelStep === 0,
        ),
    );
    const line = (points) =>
      points.length === 1
        ? `M${plot.left},${points[0].y} L${width - plot.right},${points[0].y}`
        : `M${points.map((point) => `${point.x},${point.y}`).join(" L")}`;
    const circles = (points, className, label) =>
      points
        .map(
          (point, index) =>
            `<circle class="${className}" data-trend-series="${label.toLowerCase().replaceAll(" ", "-")}" data-trend-index="${index}" cx="${point.x}" cy="${point.y}" r="3.5"><title>${formatMonth(point.month)} — ${label}: ${money(point.value)}</title></circle>`,
        )
        .join("");
    const ariaLabel = includeContributions
      ? "Investment balance and cumulative net contribution trend"
      : "Investment balance trend";
    const zeroY = y(0);

    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel} from ${formatMonth(series.months[0])} to ${formatMonth(series.months.at(-1))}">
      ${includeContributions ? `<g class="trend-legend" aria-hidden="true"><line class="trend-line trend-balance-line" x1="${plot.left}" y1="16" x2="${plot.left + 28}" y2="16"/><text x="${plot.left + 36}" y="20">Balance</text><line class="trend-line trend-contribution-line" x1="${plot.left + 118}" y1="16" x2="${plot.left + 146}" y2="16"/><text x="${plot.left + 154}" y="20">Net contributions</text></g>` : ""}
      <g class="trend-grid" aria-hidden="true">${ticks.map((tick) => `<line x1="${plot.left}" y1="${y(tick)}" x2="${width - plot.right}" y2="${y(tick)}"/><text x="${plot.left - 10}" y="${y(tick) + 4}" text-anchor="end">${compactMoney(tick)}</text>`).join("")}</g>
      <line class="trend-y-axis" x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${height - plot.bottom}" aria-hidden="true"/>
      <path class="trend-area" d="M${balancePoints[0].x},${zeroY} ${balancePoints.map((point) => `L${point.x},${point.y}`).join(" ")} L${balancePoints.at(-1).x},${zeroY} Z"/>
      <path class="trend-line trend-balance-line" d="${line(balancePoints)}"/>
      ${includeContributions ? `<path class="trend-line trend-contribution-line" d="${line(contributionPoints)}"/>` : ""}
      ${circles(balancePoints, "trend-balance-point", "Balance")}
      ${includeContributions ? circles(contributionPoints, "trend-contribution-point", "Net contributions") : ""}
      <g class="trend-x-labels" aria-hidden="true">${[...xLabelIndexes].map((index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? "start" : index === series.months.length - 1 ? "end" : "middle"}">${formatMonth(series.months[index])}</text>`).join("")}</g>
      <g class="trend-scrub-layer" aria-hidden="true" hidden>
        <line class="trend-scrub-guide" x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${height - plot.bottom}"/>
        <circle class="trend-scrub-balance-marker" r="6"/>
        ${includeContributions ? '<circle class="trend-scrub-contribution-marker" r="6"/>' : ""}
      </g>
      <rect class="trend-scrub-hitbox" x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" tabindex="0" role="slider" aria-label="Explore investment trend by month" aria-valuemin="1" aria-valuemax="${series.months.length}" aria-valuenow="1"/>
    </svg>`;
  }

  function trendSVG(options) {
    return renderTrendSVG(
      trendSeries(options),
      options?.includeContributions === true,
    );
  }

  function mountTrend(container, options = {}) {
    const includeContributions = options.includeContributions === true;
    const series = trendSeries(options);
    container.innerHTML = renderTrendSVG(series, includeContributions);
    const svg = container.querySelector("svg");
    if (!svg || !series.months.length) return () => {};

    const hitbox = svg.querySelector(".trend-scrub-hitbox");
    const layer = svg.querySelector(".trend-scrub-layer");
    const guide = svg.querySelector(".trend-scrub-guide");
    const balanceMarker = svg.querySelector(".trend-scrub-balance-marker");
    const contributionMarker = svg.querySelector(
      ".trend-scrub-contribution-marker",
    );
    const tooltip = document.createElement("div");
    tooltip.className = "trend-scrub-tooltip";
    tooltip.setAttribute("role", "status");
    tooltip.hidden = true;
    container.append(tooltip);

    const width = 760;
    const plotLeft = 76;
    const plotRight = 24;
    const plotWidth = width - plotLeft - plotRight;
    let activeIndex = 0;
    let dragging = false;

    function point(seriesName, index) {
      return svg.querySelector(
        `[data-trend-series="${seriesName}"][data-trend-index="${index}"]`,
      );
    }

    function show(index, clientX = null) {
      activeIndex = Math.max(0, Math.min(series.months.length - 1, index));
      const balancePoint = point("balance", activeIndex);
      const contributionPoint = point("net-contributions", activeIndex);
      if (!balancePoint) return;
      const x = Number(balancePoint.getAttribute("cx"));
      const balanceY = Number(balancePoint.getAttribute("cy"));

      guide.setAttribute("x1", x);
      guide.setAttribute("x2", x);
      balanceMarker.setAttribute("cx", x);
      balanceMarker.setAttribute("cy", balanceY);
      if (contributionMarker && contributionPoint) {
        contributionMarker.setAttribute(
          "cx",
          contributionPoint.getAttribute("cx"),
        );
        contributionMarker.setAttribute(
          "cy",
          contributionPoint.getAttribute("cy"),
        );
      }
      layer.removeAttribute("hidden");
      hitbox.setAttribute("aria-valuenow", String(activeIndex + 1));
      hitbox.setAttribute(
        "aria-valuetext",
        `${formatMonth(series.months[activeIndex])}, balance ${money(series.balances[activeIndex])}`,
      );
      tooltip.innerHTML = `
        <strong>${escapeHTML(formatMonth(series.months[activeIndex]))}</strong>
        <span><em>Balance</em>${escapeHTML(money(series.balances[activeIndex]))}</span>
        <span><em>Contributions</em>${escapeHTML(money(series.monthlyContributions[activeIndex] || 0))}</span>
        <span><em>Withdrawals</em>${escapeHTML(money(series.monthlyWithdrawals[activeIndex] || 0))}</span>
        <span><em>Monthly net</em>${escapeHTML(money(series.monthlyNetFlows[activeIndex] || 0))}</span>
        <span><em>Cumulative net</em>${escapeHTML(money(series.contributions[activeIndex] || 0))}</span>`;
      tooltip.hidden = false;

      const bounds = container.getBoundingClientRect();
      const desired = clientX === null
        ? ((x / width) * bounds.width)
        : clientX - bounds.left;
      const half = tooltip.offsetWidth / 2;
      tooltip.style.left = `${Math.max(half + 8, Math.min(bounds.width - half - 8, desired))}px`;
    }

    function indexFromPointer(event) {
      const bounds = svg.getBoundingClientRect();
      const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
      if (series.months.length === 1) return 0;
      return Math.round(
        ((Math.max(plotLeft, Math.min(width - plotRight, svgX)) - plotLeft) /
          plotWidth) *
          (series.months.length - 1),
      );
    }

    function handlePointerDown(event) {
      dragging = true;
      hitbox.setPointerCapture?.(event.pointerId);
      show(indexFromPointer(event), event.clientX);
    }
    function handlePointerMove(event) {
      if (event.pointerType === "touch" && !dragging) return;
      show(indexFromPointer(event), event.clientX);
    }
    function handlePointerUp(event) {
      dragging = false;
      hitbox.releasePointerCapture?.(event.pointerId);
    }
    function handlePointerLeave() {
      if (dragging) return;
      tooltip.hidden = true;
      layer.setAttribute("hidden", "");
    }
    function handleKeydown(event) {
      const next = {
        ArrowLeft: activeIndex - 1,
        ArrowDown: activeIndex - 1,
        ArrowRight: activeIndex + 1,
        ArrowUp: activeIndex + 1,
        Home: 0,
        End: series.months.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      show(next);
    }
    function handleFocus() {
      show(activeIndex);
    }

    hitbox.addEventListener("pointerdown", handlePointerDown);
    hitbox.addEventListener("pointermove", handlePointerMove);
    hitbox.addEventListener("pointerup", handlePointerUp);
    hitbox.addEventListener("pointercancel", handlePointerUp);
    hitbox.addEventListener("pointerleave", handlePointerLeave);
    hitbox.addEventListener("keydown", handleKeydown);
    hitbox.addEventListener("focus", handleFocus);

    return () => {
      hitbox.removeEventListener("pointerdown", handlePointerDown);
      hitbox.removeEventListener("pointermove", handlePointerMove);
      hitbox.removeEventListener("pointerup", handlePointerUp);
      hitbox.removeEventListener("pointercancel", handlePointerUp);
      hitbox.removeEventListener("pointerleave", handlePointerLeave);
      hitbox.removeEventListener("keydown", handleKeydown);
      hitbox.removeEventListener("focus", handleFocus);
    };
  }

  window.InvestmentView = {
    card,
    buildTrendSeries,
    currentMonth,
    formatMonth,
    latestByAccount,
    metrics,
    monthRangeFromDates,
    mountTrend,
    sourceLabel,
    trendSVG,
  };
})();
