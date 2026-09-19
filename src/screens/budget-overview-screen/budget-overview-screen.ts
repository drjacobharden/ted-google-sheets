import type {
  SegmentedControl,
  SegmentedControlSelectionEvent,
} from "../../components/segmented-control/segmented-control";
import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type {
  DataTable,
  DataTableCellClasses,
  DataTableData,
} from "../../components/data-table/data-table";
import type { SpendTrendPeriod } from "../../utilities/spend-trend";
import { appState } from "../../state/app-state";
import { appController } from "../../state/app-controller";
import { APIs } from "../../api/api";
import type { DataChart } from "../../components/data-chart/data-chart";
import type { SpendingHeatmapChart } from "../../components/spending-heatmap-chart/spending-heatmap-chart";
import type {
  SpendingInsightSelectionEvent,
  SpendingInsights,
} from "../../components/spending-insights/spending-insights";
import {
  budgetOverviewChartData,
  buildBudgetOverviewChartMonths,
  type BudgetOverviewChartDisplay,
} from "../../utilities/budget-overview-chart";
import { escapeHTML, money } from "../../utilities/view-formatters";
import type { MonthlyTransactionSummaryRow } from "../../utilities/monthly-transaction-summary";
import type {
  AnnualBudgetOverview,
  AnnualSpendingRank,
} from "../../utilities/annual-budget-overview";
import { getIcon } from "../../icons";
import type {
  AnnualSummaryMetric,
  AnnualSummaryMetricKey,
} from "../../utilities/annual-summary-cards";
import type { OverlayManager } from "../../elements/overlay-manager/overlay-manager";
import type {
  AnnualSpendTrendPoint,
  AnnualSpendTrendSeries,
} from "../../utilities/annual-spend-trend";
import { buildCurrencyAxisScale } from "../../utilities/currency-axis-scale";
import {
  activeMonthAverage,
  savingsRateBreakdown,
} from "../../utilities/savings-rate-breakdown";
import { deductedInvestmentSavings } from "../../utilities/activity-effects";
import { buildAnnualSpendingHeatmap } from "../../utilities/annual-spending-heatmap";
import { buildBudgetSpendingInsights } from "../../utilities/budget-spending-insights";
import templateString from "./template.html" with { type: "text" };

import { DateUtils } from "../../utilities/date-utilities";

const template = document.createElement("template");
template.innerHTML = templateString;

let selectedBudgetOverviewChart: BudgetOverviewChartDisplay =
  "cumulative-savings";

interface MonthlySummaryTableRow {
  month: string;
  income: string;
  spend: string;
  amount: string;
  comparison: string;
  amountValue: number;
  comparisonValue: number | null;
  hasData: boolean;
}

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const monthYear = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const shortMonthYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthName = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentage = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const legendPercentage = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DONUT_CENTER_X = 90;
const DONUT_CENTER_Y = 90;
const DONUT_RADIUS = 70;
const DONUT_SEGMENT_GAP = 2.5;
const DONUT_SEGMENT_CORNER_RADIUS = 2;

interface DonutPoint {
  x: number;
  y: number;
}

function donutPoint(radius: number, angle: number): DonutPoint {
  return {
    x: DONUT_CENTER_X + radius * Math.cos(angle),
    y: DONUT_CENTER_Y - radius * Math.sin(angle),
  };
}

function donutCoordinate(point: DonutPoint): string {
  return `${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
}

/** Draws a constant-width annular segment with subtly rounded square ends. */
function donutSegmentPath(
  startPercent: number,
  endPercent: number,
  width: number,
): string {
  const sweepPercent = Math.min(99.999, Math.max(0, endPercent - startPercent));
  const adjustedEndPercent = startPercent + sweepPercent;
  const startAngle = Math.PI / 2 - Math.PI * 2 * (startPercent / 100);
  const endAngle = Math.PI / 2 - Math.PI * 2 * (adjustedEndPercent / 100);
  const largeArc = sweepPercent > 50 ? 1 : 0;
  const outerRadius = DONUT_RADIUS + width / 2;
  const innerRadius = DONUT_RADIUS - width / 2;
  const arcLength = Math.max(0, (startAngle - endAngle) * innerRadius);
  const corner = Math.min(
    DONUT_SEGMENT_CORNER_RADIUS,
    width / 2,
    arcLength / 2,
  );
  const outerInset = corner / outerRadius;
  const innerInset = corner / innerRadius;

  const outerStart = donutPoint(outerRadius, startAngle - outerInset);
  const outerEnd = donutPoint(outerRadius, endAngle + outerInset);
  const outerEndCorner = donutPoint(outerRadius, endAngle);
  const endOuterCap = donutPoint(outerRadius - corner, endAngle);
  const endInnerCap = donutPoint(innerRadius + corner, endAngle);
  const innerEndCorner = donutPoint(innerRadius, endAngle);
  const innerEnd = donutPoint(innerRadius, endAngle + innerInset);
  const innerStart = donutPoint(innerRadius, startAngle - innerInset);
  const innerStartCorner = donutPoint(innerRadius, startAngle);
  const startInnerCap = donutPoint(innerRadius + corner, startAngle);
  const startOuterCap = donutPoint(outerRadius - corner, startAngle);
  const outerStartCorner = donutPoint(outerRadius, startAngle);

  return [
    `M ${donutCoordinate(outerStart)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${donutCoordinate(outerEnd)}`,
    `Q ${donutCoordinate(outerEndCorner)} ${donutCoordinate(endOuterCap)}`,
    `L ${donutCoordinate(endInnerCap)}`,
    `Q ${donutCoordinate(innerEndCorner)} ${donutCoordinate(innerEnd)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${donutCoordinate(innerStart)}`,
    `Q ${donutCoordinate(innerStartCorner)} ${donutCoordinate(startInnerCap)}`,
    `L ${donutCoordinate(startOuterCap)}`,
    `Q ${donutCoordinate(outerStartCorner)} ${donutCoordinate(outerStart)}`,
    "Z",
  ].join(" ");
}

const ANNUAL_CARD_LABELS: Record<AnnualSummaryMetricKey, string> = {
  spend: "Total spend",
  income: "Total income",
  paycheckDeductions: "Paycheck deductions",
  totalSavings: "Total savings",
};

const ANNUAL_CARD_KEYS: AnnualSummaryMetricKey[] = [
  "spend",
  "income",
  "paycheckDeductions",
  "totalSavings",
];

const ANNUAL_CARD_HELP: Record<AnnualSummaryMetricKey, string> = {
  spend: "The total amount spent for the year",
  income: "The total amount you earned during the year",
  paycheckDeductions: "Savings deducted directly from your paycheck",
  totalSavings:
    "The total amount saved. Calculated as total income minus total spend",
};

function signedMoney(value: number): string {
  if (Math.abs(value) < 0.005) return money(0);
  return `${value > 0 ? "+ " : "− "}${money(Math.abs(value), false)}`;
}

function summaryTableMoney(value: number): string {
  return money(value, Math.abs(value) < 1);
}

function signedSummaryTableMoney(value: number): string {
  if (Math.abs(value) < 0.005) return summaryTableMoney(0);
  return `${value > 0 ? "+ " : "− "}${summaryTableMoney(Math.abs(value))}`;
}

function percentChange(current: number, previous: number): number | null {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function signedPercentage(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) < 0.05) return "0%";
  return `${value > 0 ? "+" : "−"}${percentage.format(Math.abs(value))}%`;
}

function stackedTooltip(
  titleText: string,
  detailText: string,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const div = document.createElement("div");
  div.classList.add("budget-overview-stacked-tooltip");
  const title = document.createElement("strong");
  title.className = "text-90 fw-medium chart-title";
  title.textContent = titleText;
  const detail = document.createElement("span");
  detail.className = "text-90 fw-regular chart-detail";
  detail.textContent = detailText;
  div.append(title, detail);
  fragment.append(div);
  return fragment;
}

// Creates the mini chart for the annual summary cards at the top of the screen
function renderMiniBars(
  metric: AnnualSummaryMetric,
  selectedYear: number,
): string {
  const values = metric.months.flatMap((month) =>
    month.value === null ? [] : [month.value],
  );
  const maximum = Math.max(1, ...values.map((value) => Math.abs(value)));

  const currentDate = DateUtils.today;
  const currentMonthIndex =
    selectedYear === currentDate.getFullYear() ? currentDate.getMonth() : -1;

  // Create HTML strings for the individual bars that will be in the chart
  const bars = metric.months.map((month, i) => {
    let height = 0;

    const value = month.value;

    if (value !== null) {
      const min = value === 0 ? 2 : 7;
      const max = (Math.abs(value) / maximum) * (value < 0 ? 20 : 70);
      height = Math.max(min, max);
    }

    const monthId = month.monthId + "-01";
    const date = DateUtils.fromDateId(monthId);
    const monthLabel = DateUtils.monthFormatter.format(date);

    const classNames = [
      "bar",
      value === null ? "is-future" : "",
      value !== null && value < 0 ? "is-negative" : "",
      i === currentMonthIndex ? "is-current" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const position =
      value !== null && value < 0
        ? `top:78%;height:${height}%`
        : `bottom:22%;height:${height}%`;

    const tooltip = `${monthLabel}, ${ANNUAL_CARD_LABELS[metric.key]} ${signedMoney(value ?? 0)}`;

    return `
      <button 
        class="slot" 
        type="button"
        ${value === null ? " disabled" : ""} 
        data-annual-tooltip-date="${escapeHTML(monthLabel)}" 
        data-annual-tooltip-value="${escapeHTML(signedMoney(value ?? 0))}" 
        aria-label="${escapeHTML(tooltip)}"
      >
        <i 
          class="${classNames}" 
          style="${position}" aria-hidden="true"
        ></i>
      </button>`;
  });

  return `
    <div 
      class="mini-chart" 
      role="group" 
      aria-label="${escapeHTML(ANNUAL_CARD_LABELS[metric.key])} by month for ${selectedYear}"
    >
      <span class="baseline" aria-hidden="true"></span>
      ${bars.join("")}
    </div>
  `;
}

function curvedPath(coordinates: Array<{ x: number; y: number }>): string {
  if (coordinates.length < 2) return "";
  return coordinates.slice(1).reduce((path, point, index) => {
    const previous = coordinates[index];
    const before = coordinates[Math.max(0, index - 1)];
    const after = coordinates[Math.min(coordinates.length - 1, index + 2)];
    const control1 = {
      x: previous.x + (point.x - before.x) / 6,
      y: previous.y + (point.y - before.y) / 6,
    };
    const control2 = {
      x: point.x - (after.x - previous.x) / 6,
      y: point.y - (after.y - previous.y) / 6,
    };
    return `${path} C${control1.x},${control1.y} ${control2.x},${control2.y} ${point.x},${point.y}`;
  }, `M${coordinates[0].x},${coordinates[0].y}`);
}

function withLeadIn(
  coordinates: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (!coordinates.length) return coordinates;
  return [
    { x: Math.max(0, coordinates[0].x - 12), y: coordinates[0].y },
    ...coordinates,
  ];
}

function chartGeometry(
  series: AnnualSpendTrendSeries,
  width: number,
): {
  plotLeft: number;
  plotRight: number;
  dataLeft: number;
  dataWidth: number;
  barWidth: number;
} {
  const plotLeft = 68;
  const pointCount = Math.max(1, series.points.length);
  const plotWidth = Math.max(1, width - plotLeft);
  const intervalWidth = plotWidth / pointCount;
  const dataLeft = plotLeft + intervalWidth / 2;
  const barWidth = Math.max(
    5,
    Math.min(series.period === "monthly" ? 56 : 14, intervalWidth * 0.78),
  );
  const plotRight = intervalWidth / 2;
  return {
    plotLeft,
    plotRight,
    dataLeft,
    dataWidth: intervalWidth * Math.max(0, pointCount - 1),
    barWidth,
  };
}

function renderChartSVG(
  series: AnnualSpendTrendSeries,
  width: number,
  selectedRange: { start: number; end: number },
): string {
  const { points } = series;
  const height = 330;
  const geometry = chartGeometry(series, width);
  const plot = {
    left: geometry.plotLeft,
    right: geometry.plotRight,
    top: 16,
    bottom: 42,
  };
  const { dataLeft, dataWidth, barWidth } = geometry;
  const hitboxWidth = width - plot.left;
  const plotHeight = height - plot.top - plot.bottom;
  const scale = buildCurrencyAxisScale(
    Math.max(
      ...points.flatMap((point) => [
        point.total ?? 0,
        point.isTrendAvailable ? point.trend : 0,
        point.priorYearTrend ?? 0,
      ]),
    ),
  );
  const { maximum, ticks } = scale;
  const x = (index: number): number =>
    points.length === 1
      ? dataLeft
      : dataLeft + (index / (points.length - 1)) * dataWidth;
  const y = (value: number): number =>
    plot.top + plotHeight - (value / maximum) * plotHeight;
  const coordinates = points.map((point, index) => ({ point, x: x(index) }));
  const zeroY = y(0);
  const trendPath = curvedPath(
    withLeadIn(
      coordinates
        .filter(({ point }) => point.isTrendAvailable)
        .map(({ point, x: pointX }) => ({ x: pointX, y: y(point.trend) })),
    ),
  );
  const previousPath = series.hasPriorYearTrend
    ? curvedPath(
        withLeadIn(
          coordinates.map(({ point, x: pointX }) => ({
            x: pointX,
            y: y(point.priorYearTrend ?? 0),
          })),
        ),
      )
    : "";
  const xLabels = points.flatMap((point, index) => {
    const date = new Date(`${point.date}T00:00:00Z`);
    if (series.period === "monthly") {
      const step = width < 700 ? 2 : 1;
      return index % step === 0
        ? [
            {
              index,
              label: shortMonthYear.format(date).replace(` ${series.year}`, ""),
            },
          ]
        : [];
    }
    const previous = points[index - 1];
    const beginsMonth =
      index === 0 || point.date.slice(0, 7) !== previous.date.slice(0, 7);
    return beginsMonth
      ? [
          {
            index,
            label: shortMonthYear.format(date).replace(` ${series.year}`, ""),
          },
        ]
      : [];
  });

  const periodLabel = series.period === "monthly" ? "Monthly" : "Weekly";

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${periodLabel} spending trend for ${series.year}${series.hasPriorYearTrend ? ` compared with ${series.year - 1}` : ""}">
      <g class="grid" aria-hidden="true">
        ${ticks.map((tick) => `<line x1="${plot.left}" y1="${y(tick)}" x2="${width}" y2="${y(tick)}"/>`).join("")}
      </g>
      <g class="labels" aria-hidden="true">
        ${ticks.map((tick) => `<text x="0" y="${y(tick) + 4}" text-anchor="start">${escapeHTML(compactCurrency.format(tick))}</text>`).join("")}
        ${xLabels
          .map(
            ({ index, label }) =>
              `<text x="${x(index)}" y="${height - 12}" text-anchor="middle">${escapeHTML(label)}</text>`,
          )
          .join("")}
      </g>
      <g class="spend-bars" aria-hidden="true">
        ${coordinates
          .map(({ point, x: pointX }, index) => {
            if (point.total === null) return "";
            const valueY = y(point.total);
            const barY = Math.min(valueY, zeroY);
            const barHeight = Math.max(1, Math.abs(zeroY - valueY));
            const outside =
              index < selectedRange.start || index >= selectedRange.end;
            return `<rect class="spend-bar${outside ? " is-outside-range" : ""}" data-spend-trend="raw" data-period-index="${index}" x="${pointX - barWidth / 2}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="3" ry="3"/>`;
          })
          .join("")}
      </g>
      ${previousPath ? `<path class="previous-line" d="${previousPath}"/>` : ""}
      ${trendPath ? `<path class="average-line" d="${trendPath}"/>` : ""}
      <g data-scrub-layer aria-hidden="true" hidden>
        <line class="scrub-guide" data-scrub-guide x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${height - plot.bottom}"/>
        <circle class="scrub-average" data-scrub-average r="4"/>
      </g>
      <rect class="scrub-hitbox" data-scrub-hitbox x="${plot.left}" y="${plot.top}" width="${hitboxWidth}" height="${plotHeight}" fill="transparent" tabindex="0" role="slider" aria-label="Explore ${series.period} spending" aria-valuemin="1" aria-valuemax="${points.length}" aria-valuenow="1"/>
    </svg>`;
}

function mountChartAtWidth(
  container: HTMLElement,
  series: AnnualSpendTrendSeries,
  overlayManager: OverlayManager,
  width: number,
  selectedRange: { start: number; end: number },
): () => void {
  container.innerHTML = renderChartSVG(series, width, selectedRange);
  const svg = container.querySelector<SVGSVGElement>("svg")!;
  const hitbox = svg.querySelector<SVGRectElement>("[data-scrub-hitbox]")!;
  const layer = svg.querySelector<SVGGElement>("[data-scrub-layer]")!;
  const guide = svg.querySelector<SVGLineElement>("[data-scrub-guide]")!;
  const spendBars = Array.from(
    svg.querySelectorAll<SVGRectElement>("[data-spend-trend='raw']"),
  );
  const averageMarker = svg.querySelector<SVGCircleElement>(
    "[data-scrub-average]",
  )!;
  const tooltipAnchor = document.createElement("span");
  tooltipAnchor.className = "tooltip-anchor";
  tooltipAnchor.setAttribute("aria-hidden", "true");
  container.append(tooltipAnchor);
  const geometry = chartGeometry(series, width);
  const plotRight = geometry.plotRight;
  const { dataLeft, dataWidth } = geometry;
  let activeIndex = 0;
  let dragging = false;

  function tooltipContent(point: AnnualSpendTrendPoint): HTMLDivElement {
    const content = document.createElement("div");
    content.className = "budget-overview-chart-tooltip";
    const title = document.createElement("strong");
    title.className = "text-90 fw-medium";
    title.textContent = monthYear.format(new Date(`${point.date}T00:00:00Z`));
    content.append(title);
    const rows: Array<[string, number | null, string]> = [
      ["Trend", point.isTrendAvailable ? point.trend : null, "is-trend"],
      [
        series.period === "monthly" ? "Monthly spend" : "Weekly spend",
        point.total,
        "is-spend",
      ],
      ["Prev year trend", point.priorYearTrend, "is-previous"],
    ];
    rows.forEach(([label, value, className]) => {
      const row = document.createElement("div");
      row.className = "text-sm fw-regular chart-tooltip-row";
      const swatch = document.createElement("i");
      swatch.className = className;
      swatch.setAttribute("aria-hidden", "true");
      const rowLabel = document.createElement("span");
      rowLabel.className = "chart-label";
      rowLabel.textContent = label;
      const rowValue = document.createElement("span");
      rowValue.className = "chart-value";
      rowValue.textContent = value === null ? "—" : money(value);
      row.append(swatch, rowLabel, rowValue);
      content.append(row);
    });
    return content;
  }

  function show(index: number): void {
    activeIndex = Math.max(0, Math.min(series.points.length - 1, index));
    const pointData = series.points[activeIndex];
    const pointX =
      dataLeft +
      (activeIndex / Math.max(1, series.points.length - 1)) * dataWidth;
    guide.setAttribute("x1", String(pointX));
    guide.setAttribute("x2", String(pointX));
    spendBars.forEach((bar) =>
      bar.classList.toggle(
        "is-active",
        bar.dataset.periodIndex === String(activeIndex),
      ),
    );
    averageMarker.setAttribute("cx", String(pointX));
    const maxValue = buildCurrencyAxisScale(
      Math.max(
        ...series.points.flatMap((point) => [
          point.total ?? 0,
          point.isTrendAvailable ? point.trend : 0,
          point.priorYearTrend ?? 0,
        ]),
      ),
    ).maximum;
    const anchorValue = pointData.isTrendAvailable
      ? pointData.trend
      : (pointData.priorYearTrend ?? 0);
    const trendY =
      16 + (330 - 16 - 42) - (anchorValue / maxValue) * (330 - 16 - 42);
    averageMarker.setAttribute("cy", String(trendY));
    averageMarker.toggleAttribute("hidden", !pointData.isTrendAvailable);
    const svgBounds = svg.getBoundingClientRect();
    const containerBounds = container.getBoundingClientRect();
    tooltipAnchor.style.left = `${svgBounds.left - containerBounds.left + (pointX / width) * svgBounds.width}px`;
    tooltipAnchor.style.top = `${svgBounds.top - containerBounds.top + (16 / 330) * svgBounds.height}px`;
    layer.removeAttribute("hidden");
    hitbox.setAttribute("aria-valuenow", String(activeIndex + 1));
    hitbox.setAttribute(
      "aria-valuetext",
      `${monthYear.format(new Date(`${pointData.date}T00:00:00Z`))}${pointData.isTrendAvailable ? `, trend ${money(pointData.trend)}` : ""}${pointData.total === null ? "" : `, ${series.period} spend ${money(pointData.total)}`}${pointData.priorYearTrend === null ? "" : `, prior year trend ${money(pointData.priorYearTrend)}`}`,
    );
    overlayManager.showTooltip(tooltipAnchor, tooltipContent(pointData), {
      side: "top",
      align: "center",
      gap: 8,
    });
  }

  function indexFromPointer(event: PointerEvent): number {
    const bounds = svg.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    if (series.points.length === 1) return 0;
    return Math.round(
      ((Math.max(dataLeft, Math.min(width - plotRight, svgX)) - dataLeft) /
        dataWidth) *
        (series.points.length - 1),
    );
  }

  function handlePointerDown(event: PointerEvent): void {
    dragging = true;
    hitbox.setPointerCapture?.(event.pointerId);
    show(indexFromPointer(event));
  }
  function handlePointerMove(event: PointerEvent): void {
    if (event.pointerType === "touch" && !dragging) return;
    show(indexFromPointer(event));
  }
  function handlePointerUp(event: PointerEvent): void {
    dragging = false;
    hitbox.releasePointerCapture?.(event.pointerId);
  }
  function handlePointerLeave(): void {
    if (dragging) return;
    overlayManager.hideTooltip();
    layer.setAttribute("hidden", "");
    spendBars.forEach((bar) => bar.classList.remove("is-active"));
  }
  function handleKeydown(event: KeyboardEvent): void {
    const next = (
      {
        ArrowLeft: activeIndex - 1,
        ArrowDown: activeIndex - 1,
        ArrowRight: activeIndex + 1,
        ArrowUp: activeIndex + 1,
        Home: 0,
        End: series.points.length - 1,
      } as Partial<Record<string, number>>
    )[event.key];
    if (next === undefined) return;
    event.preventDefault();
    show(next);
  }
  function handleFocus(): void {
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
    overlayManager.hideTooltip();
    tooltipAnchor.remove();
  };
}

function chartContentWidth(container: HTMLElement): number {
  const style = getComputedStyle(container);
  const horizontalPadding =
    Number.parseFloat(style.paddingLeft) +
    Number.parseFloat(style.paddingRight);
  return Math.max(180, Math.round(container.clientWidth - horizontalPadding));
}

function mountChart(
  container: HTMLElement,
  series: AnnualSpendTrendSeries,
  overlayManager: OverlayManager,
  selectedRange: () => { start: number; end: number },
): () => void {
  let width = chartContentWidth(container);
  let cleanup = mountChartAtWidth(
    container,
    series,
    overlayManager,
    width,
    selectedRange(),
  );
  const observer = new ResizeObserver(() => {
    const nextWidth = chartContentWidth(container);
    if (nextWidth === width) return;
    width = nextWidth;
    cleanup();
    cleanup = mountChartAtWidth(
      container,
      series,
      overlayManager,
      width,
      selectedRange(),
    );
  });
  observer.observe(container);
  return () => {
    observer.disconnect();
    cleanup();
  };
}

type ChartRangeAction = "start" | "move" | "end";

interface ChartRangeDrag {
  action: ChartRangeAction;
  pointerId: number;
  pointerUnit: number;
  startBoundary: number;
  endBoundary: number;
}

/** Displays weekly or monthly spending totals and their recent-weighted trend. */
export class BudgetOverviewScreen
  extends HTMLElement
  implements EventListenerObject
{
  #selectedYear = new Date().getFullYear();

  // Retained only for the legacy helper methods below; the active chart is monthly-only.
  #periodControl!: SegmentedControl;
  #period: SpendTrendPeriod = "monthly";
  #chart!: DataChart;
  #chartMode!: DropdownMenu;
  #metrics!: HTMLElement;
  #totalBalance!: HTMLElement;
  #totalBalanceCaption!: HTMLElement;
  #totalSpend!: HTMLElement;
  #totalIncome!: HTMLElement;
  #totalSpendComparison!: HTMLElement;
  #totalIncomeComparison!: HTMLElement;
  #range!: HTMLElement;
  #rangeTrack!: HTMLElement;
  #rangeSelection!: HTMLElement;
  #rangeStartHandle!: HTMLButtonElement;
  #rangeMoveHandle!: HTMLButtonElement;
  #rangeEndHandle!: HTMLButtonElement;
  #rangeStartTooltip!: HTMLOutputElement;
  #rangeEndTooltip!: HTMLOutputElement;
  #empty!: HTMLElement;
  #emptyTitle!: HTMLElement;
  #emptyCopy!: HTMLElement;
  #legend!: HTMLElement;
  #legendTotal!: HTMLElement;
  #previousLegend!: HTMLElement;
  #monthlySummaryTable!: DataTable<MonthlySummaryTableRow>;
  #monthlySummaryAssignmentSelector!: DropdownMenu;
  #monthlySummaryAssignmentId: string | null = null;
  #spendingHeatmap!: SpendingHeatmapChart;
  #spendingInsights!: SpendingInsights;
  #topVendorsList!: HTMLOListElement;
  #topVendorsEmpty!: HTMLElement;
  #topCategoriesList!: HTMLOListElement;
  #topCategoriesEmpty!: HTMLElement;
  #topCategoriesComparisonLabel!: HTMLElement;
  #topVendorsComparisonLabel!: HTMLElement;
  #insightsGrid!: HTMLElement;
  #savingsRateDonut!: HTMLElement;
  #savingsRateSpentRing!: SVGPathElement;
  #savingsRatePaycheckRing!: SVGPathElement;
  #savingsRateBudgetRing!: SVGPathElement;
  #savingsRateDescription!: SVGDescElement;
  #savingsRateValue!: HTMLElement;
  #savingsLegendRate!: HTMLElement;
  #savingsLegendAmount!: HTMLElement;
  #savingsLegendAverage!: HTMLElement;
  #savingsLegendFill!: HTMLElement;
  #deductionsLegendRate!: HTMLElement;
  #deductionsLegendAmount!: HTMLElement;
  #deductionsLegendAverage!: HTMLElement;
  #deductionsLegendFill!: HTMLElement;
  #spendLegendRate!: HTMLElement;
  #spendLegendAmount!: HTMLElement;
  #spendLegendAverage!: HTMLElement;
  #spendLegendFill!: HTMLElement;
  #annualSummaryCards!: HTMLElement;

  #overlayManager!: OverlayManager;
  #chartDisplay: BudgetOverviewChartDisplay = selectedBudgetOverviewChart;

  #rangeStart = 0;
  #rangeEnd = -1;
  #rangePointCount = 0;
  #rangeVisualStart = 0;
  #rangeVisualEnd = 0;
  #rangeDrag: ChartRangeDrag | null = null;
  #cleanupChart: (() => void) | null = null;
  #unsubscribeBudgetOverview: (() => void) | null = null;
  #unsubscribePaycheckHistory: (() => void) | null = null;
  #unsubscribeBudgetingContext: (() => void) | null = null;
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.classList.add("editorial-theme");
      this.dataset.screen = "budget-overview";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
      this.#selectedYear = appState.get("budgetingContext").year;
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#monthlySummaryAssignmentSelector.addListener(this);
    this.#chartMode.addEventListener("dropdown-selection", this);
    this.#spendingInsights.addEventListener("spending-insight-change", this);

    this.#annualSummaryCards.addEventListener("pointerover", this);
    this.#annualSummaryCards.addEventListener("pointerout", this);
    this.#annualSummaryCards.addEventListener("focusin", this);
    this.#annualSummaryCards.addEventListener("focusout", this);
    this.#insightsGrid.addEventListener("pointerover", this);
    this.#insightsGrid.addEventListener("pointerout", this);
    this.#insightsGrid.addEventListener("focusin", this);
    this.#insightsGrid.addEventListener("focusout", this);
    this.#unsubscribeBudgetOverview = appState.subscribe("budgetOverview", () =>
      this.#renderOverview(),
    );
    this.#unsubscribePaycheckHistory = appState.subscribe(
      "hasPaycheckDeductionHistory",
      () => this.#renderAnnualSummaryCards(),
    );
    this.#unsubscribeBudgetingContext = appState.subscribe(
      "budgetingContext",
      (context) => {
        if (this.#selectedYear === context.year) return;
        this.#selectedYear = context.year;
        this.#renderOverview();
      },
    );
    this.#renderOverview();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#monthlySummaryAssignmentSelector.removeListener(this);
    this.#chartMode.removeEventListener("dropdown-selection", this);
    this.#spendingInsights.removeEventListener("spending-insight-change", this);

    this.#annualSummaryCards.removeEventListener("pointerover", this);
    this.#annualSummaryCards.removeEventListener("pointerout", this);
    this.#annualSummaryCards.removeEventListener("focusin", this);
    this.#annualSummaryCards.removeEventListener("focusout", this);
    this.#insightsGrid.removeEventListener("pointerover", this);
    this.#insightsGrid.removeEventListener("pointerout", this);
    this.#insightsGrid.removeEventListener("focusin", this);
    this.#insightsGrid.removeEventListener("focusout", this);
    this.#overlayManager.hideTooltip();
    this.#unsubscribeBudgetOverview?.();
    this.#unsubscribeBudgetOverview = null;
    this.#unsubscribePaycheckHistory?.();
    this.#unsubscribePaycheckHistory = null;
    this.#unsubscribeBudgetingContext?.();
    this.#unsubscribeBudgetingContext = null;
    this.#cleanupChart?.();
    this.#cleanupChart = null;
  }

  handleEvent(event: Event): void {
    if (
      event.type === "spending-insight-change" &&
      event.target === this.#spendingInsights
    ) {
      const selection = event as SpendingInsightSelectionEvent;
      this.#spendingHeatmap.highlightedDayIds =
        selection.detail.insight.dayIds ?? [];
      this.#spendingHeatmap.highlightZeroSpendDays =
        selection.detail.insight.highlightZeroSpendDays === true;
      return;
    }
    if (
      event.type === "dropdown-selection" &&
      event.target === this.#monthlySummaryAssignmentSelector
    ) {
      const selection = event as DropdownSelectionEvent;
      this.#monthlySummaryAssignmentId =
        selection.detail.value === "all" ? null : selection.detail.value;
      this.#renderMonthlySummary();
      return;
    }
    if (
      event.type === "dropdown-selection" &&
      event.target === this.#chartMode
    ) {
      const value = (event as DropdownSelectionEvent).detail
        .value as BudgetOverviewChartDisplay;
      if (
        [
          "total-savings",
          "income-vs-expense",
          "monthly-income",
          "monthly-spend",
          "monthly-savings-rate",
          "cumulative-income",
          "cumulative-spend",
          "cumulative-income-vs-spend",
          "cumulative-savings-rate",
          "cumulative-savings",
        ].includes(value)
      ) {
        this.#chartDisplay = value;
        selectedBudgetOverviewChart = value;
        this.#renderTrend();
      }
      return;
    }
    if (
      event.currentTarget === this.#insightsGrid &&
      (event.type === "pointerover" || event.type === "focusin")
    ) {
      const anchor = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-insight-help]",
      );
      if (!anchor || !this.#insightsGrid.contains(anchor)) return;
      const messages: Record<string, string> = {
        categories: `Showing your top spending categories for ${this.#selectedYear}.`,
        savings:
          "Savings rate is calculated by dividing your total savings by your total income. It is the most important factor impacting how quickly you can retire.",
        vendors: `Showing who you spent the most money on in ${this.#selectedYear}.`,
      };
      this.#overlayManager.showTooltip(
        anchor,
        messages[anchor.dataset.insightHelp ?? ""] ?? "",
        { side: "top", align: "end", gap: 8 },
      );
      return;
    }
    if (
      event.currentTarget === this.#insightsGrid &&
      (event.type === "pointerout" || event.type === "focusout")
    ) {
      const leaving = (event.target as Element | null)?.closest(
        "[data-insight-help]",
      );
      const entering = (event as MouseEvent | FocusEvent).relatedTarget;
      const next =
        entering instanceof Element
          ? entering.closest("[data-insight-help]")
          : null;
      if (leaving && !next) this.#overlayManager.hideTooltip();
      return;
    }
    if (
      event.currentTarget === this.#annualSummaryCards &&
      (event.type === "pointerover" || event.type === "focusin")
    ) {
      const help = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-annual-summary-help]",
      );
      if (help && this.#annualSummaryCards.contains(help)) {
        const key = help.dataset.annualSummaryHelp as AnnualSummaryMetricKey;
        this.#overlayManager.showTooltip(help, ANNUAL_CARD_HELP[key] ?? "", {
          side: "top",
          align: "end",
          gap: 8,
        });
        return;
      }
      const anchor = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-annual-tooltip-date]",
      );
      if (!anchor || !this.#annualSummaryCards.contains(anchor)) return;
      this.#overlayManager.showTooltip(
        anchor,
        stackedTooltip(
          anchor.dataset.annualTooltipDate ?? "",
          anchor.dataset.annualTooltipValue ?? "—",
        ),
        { side: "top", align: "center", gap: 8 },
      );
      return;
    }
    if (
      event.currentTarget === this.#annualSummaryCards &&
      (event.type === "pointerout" || event.type === "focusout")
    ) {
      const leaving = (event.target as Element | null)?.closest(
        "[data-annual-tooltip-date], [data-annual-summary-help]",
      );
      const entering = (event as MouseEvent | FocusEvent).relatedTarget;
      const nextAnchor =
        entering instanceof Element
          ? entering.closest(
              "[data-annual-tooltip-date], [data-annual-summary-help]",
            )
          : null;
      if (leaving && !nextAnchor) this.#overlayManager.hideTooltip();
      return;
    }
  }

  #captureElements(): void {
    this.#chart = this.querySelector<DataChart>("#weekly-spend-chart")!;
    this.#chartMode = this.querySelector<DropdownMenu>(
      "#spend-trend-chart-mode",
    )!;
    this.#chartMode.items = [
      {
        key: "cumulative-savings",
        title: "Savings",
        selectionLabel: "Cumulative savings",
        group: "Cumulative",
        isDefaultValue: true,
      },
      {
        key: "cumulative-income",
        title: "Income",
        selectionLabel: "Cumulative income",
        group: "Cumulative",
      },
      {
        key: "cumulative-spend",
        title: "Spend",
        selectionLabel: "Cumulative spend",
        group: "Cumulative",
      },
      {
        key: "cumulative-income-vs-spend",
        title: "Income vs Spend",
        selectionLabel: "Cumulative Income vs Spend",
        group: "Cumulative",
      },
      {
        key: "cumulative-savings-rate",
        title: "Savings rate",
        selectionLabel: "Cumulative savings rate",
        group: "Cumulative",
      },
      {
        key: "total-savings",
        title: "Savings",
        selectionLabel: "Monthly savings",
        group: "Monthly",
      },
      {
        key: "monthly-income",
        title: "Income",
        selectionLabel: "Monthly income",
        group: "Monthly",
      },
      {
        key: "monthly-spend",
        title: "Spend",
        selectionLabel: "Monthly spend",
        group: "Monthly",
      },
      {
        key: "monthly-savings-rate",
        title: "Savings rate",
        selectionLabel: "Monthly savings rate",
        group: "Monthly",
      },
      {
        key: "income-vs-expense",
        title: "Income vs Spend",
        selectionLabel: "Monthly Income vs Spend",
        group: "Monthly",
      },
    ];
    this.#metrics = this.querySelector<HTMLElement>("#spend-trend-metrics")!;
    this.#totalBalance = this.querySelector<HTMLElement>(
      "#overview-total-balance",
    )!;
    this.#totalBalanceCaption = this.querySelector<HTMLElement>(
      "#overview-total-balance-caption",
    )!;
    this.#totalSpend = this.querySelector<HTMLElement>(
      "#overview-total-spend",
    )!;
    this.#totalIncome = this.querySelector<HTMLElement>(
      "#overview-total-income",
    )!;
    this.#totalSpendComparison = this.querySelector<HTMLElement>(
      "#overview-total-spend-comparison",
    )!;
    this.#totalIncomeComparison = this.querySelector<HTMLElement>(
      "#overview-total-income-comparison",
    )!;
    this.#empty = this.querySelector<HTMLElement>("#weekly-spend-empty")!;
    this.#emptyTitle = this.querySelector<HTMLElement>(
      "#weekly-spend-empty-title",
    )!;
    this.#emptyCopy = this.querySelector<HTMLElement>(
      "#weekly-spend-empty-copy",
    )!;
    this.#monthlySummaryTable = this.querySelector<
      DataTable<MonthlySummaryTableRow>
    >("#monthly-summary-table")!;
    this.#monthlySummaryAssignmentSelector = this.querySelector<DropdownMenu>(
      "#monthly-summary-assignment-selector",
    )!;
    this.#spendingHeatmap = this.querySelector<SpendingHeatmapChart>(
      "#budget-overview-spending-heatmap",
    )!;
    this.#spendingInsights = this.querySelector<SpendingInsights>(
      "#budget-overview-spending-insights",
    )!;

    this.#topVendorsList =
      this.querySelector<HTMLOListElement>("#top-vendors-list")!;
    this.#topVendorsEmpty =
      this.querySelector<HTMLElement>("#top-vendors-empty")!;
    this.#topCategoriesList = this.querySelector<HTMLOListElement>(
      "#top-categories-list",
    )!;
    this.#topCategoriesEmpty = this.querySelector<HTMLElement>(
      "#top-categories-empty",
    )!;
    this.#topCategoriesComparisonLabel = this.querySelector<HTMLElement>(
      "#top-categories-comparison-label",
    )!;
    this.#topVendorsComparisonLabel = this.querySelector<HTMLElement>(
      "#top-vendors-comparison-label",
    )!;
    this.#insightsGrid = this.querySelector<HTMLElement>(".insights-grid")!;
    this.#savingsRateDonut = this.querySelector<HTMLElement>(
      "#savings-rate-donut",
    )!;
    this.#savingsRateSpentRing = this.querySelector<SVGPathElement>(
      "#savings-rate-spent-ring",
    )!;
    this.#savingsRatePaycheckRing = this.querySelector<SVGPathElement>(
      "#savings-rate-paycheck-ring",
    )!;
    this.#savingsRateBudgetRing = this.querySelector<SVGPathElement>(
      "#savings-rate-budget-ring",
    )!;
    this.#savingsRateDescription = this.querySelector<SVGDescElement>(
      "#savings-rate-chart-description",
    )!;
    this.#savingsRateValue = this.querySelector<HTMLElement>(
      "#savings-rate-value",
    )!;
    this.#savingsLegendRate = this.querySelector<HTMLElement>(
      "#savings-legend-rate",
    )!;
    this.#savingsLegendAmount = this.querySelector<HTMLElement>(
      "#savings-legend-amount",
    )!;
    this.#savingsLegendAverage = this.querySelector<HTMLElement>(
      "#savings-legend-average",
    )!;
    this.#savingsLegendFill = this.querySelector<HTMLElement>(
      "#savings-legend-fill",
    )!;
    this.#deductionsLegendRate = this.querySelector<HTMLElement>(
      "#deductions-legend-rate",
    )!;
    this.#deductionsLegendAmount = this.querySelector<HTMLElement>(
      "#deductions-legend-amount",
    )!;
    this.#deductionsLegendAverage = this.querySelector<HTMLElement>(
      "#deductions-legend-average",
    )!;
    this.#deductionsLegendFill = this.querySelector<HTMLElement>(
      "#deductions-legend-fill",
    )!;
    this.#spendLegendRate =
      this.querySelector<HTMLElement>("#spend-legend-rate")!;
    this.#spendLegendAmount = this.querySelector<HTMLElement>(
      "#spend-legend-amount",
    )!;
    this.#spendLegendAverage = this.querySelector<HTMLElement>(
      "#spend-legend-average",
    )!;
    this.#spendLegendFill =
      this.querySelector<HTMLElement>("#spend-legend-fill")!;
    this.#annualSummaryCards = this.querySelector<HTMLElement>(
      "#annual-summary-cards",
    )!;
    this.querySelectorAll<HTMLElement>("[data-insight-help]").forEach(
      (button) => button.append(getIcon("info")!),
    );
    this.#overlayManager =
      document.querySelector<OverlayManager>("overlay-manager")!;
  }

  #renderOverview(): void {
    // this.#renderAssignmentFilter();
    this.#renderMonthlySummary();
    this.#renderDailySpendingInsights();
    this.#renderAnnualSummaryCards();
    this.#renderTrend();
    this.#renderInsights();
  }

  #renderAnnualSummaryCards(): void {
    const yearSummary =
      appState.get("budgetOverview").annualSummaryCards[this.#selectedYear];

    const hasPaycheckDeductions = appState.get("hasPaycheckDeductionHistory");

    const keys = ANNUAL_CARD_KEYS.filter(
      (key) => key !== "paycheckDeductions" || hasPaycheckDeductions,
    );

    this.#annualSummaryCards.classList.toggle(
      "has-paycheck-deductions",
      hasPaycheckDeductions,
    );

    if (!yearSummary) {
      this.#annualSummaryCards.replaceChildren();
      return;
    }

    const cards = keys.map((key) => {
      const metric = yearSummary.metrics[key];

      const comparison =
        metric.comparison === null
          ? `Avg ${money(metric.averagePerMonth, metric.averagePerMonth < 1)} per month`
          : `${signedMoney(metric.comparison)} vs ${metric.comparisonYear}`;

      const favorable =
        key === "spend"
          ? metric.comparison !== null && metric.comparison < 0
          : metric.comparison !== null && metric.comparison > 0;

      const unfavorable =
        key === "spend"
          ? metric.comparison !== null && metric.comparison > 0
          : metric.comparison !== null && metric.comparison < 0;

      const comparisonClass = favorable
        ? "is-favorable"
        : unfavorable
          ? "is-unfavorable"
          : "";

      return `
        <article class="summary-card">
          <h2 class="text-200 fw-regular">${escapeHTML(ANNUAL_CARD_LABELS[key])}</h2>
          <div class="help push-right" data-annual-summary-help="${key}" aria-label="About ${escapeHTML(ANNUAL_CARD_LABELS[key])}"></div>
          <div>
            <strong class="text-400">${escapeHTML(money(metric.total, false))}</strong>
            <small class="${comparisonClass}">${escapeHTML(comparison)}</small>
            </div>
          </div>
          ${renderMiniBars(metric, this.#selectedYear)}
        </article>`;
    });

    this.#annualSummaryCards.innerHTML = cards.join("");

    this.#annualSummaryCards
      .querySelectorAll<HTMLElement>("[data-annual-summary-help]")
      .forEach((button) => button.append(getIcon("info")!));
  }

  #renderHeroComparison(
    element: HTMLElement,
    current: number,
    previous: number,
    hasPreviousData: boolean,
    inverse: boolean,
    previousYear: number,
  ): void {
    const change = hasPreviousData ? percentChange(current, previous) : null;
    element.textContent =
      change === null ? "—" : `${signedPercentage(change)} vs ${previousYear}`;
    const favorable = change !== null && (inverse ? change < 0 : change > 0);
    const unfavorable = change !== null && (inverse ? change > 0 : change < 0);
    element.classList.toggle("is-positive", favorable);
    element.classList.toggle("is-negative", unfavorable);
  }

  #renderTrend(): void {
    const transactions = appController.getTransactions();
    const accounts = APIs.accounts.accounts();
    const rows = buildBudgetOverviewChartMonths(
      transactions,
      accounts,
      this.#selectedYear,
      DateUtils.today,
    );
    const todayIso = DateUtils.today.toISOString().slice(0, 10);
    const latestCurrentYearDate =
      this.#selectedYear === DateUtils.today.getFullYear()
        ? transactions
            .map((transaction) => transaction.date)
            .filter(
              (date) =>
                /^\d{4}-\d{2}-\d{2}$/.test(date) &&
                date.startsWith(`${this.#selectedYear}-`) &&
                date <= todayIso,
            )
            .sort()
            .at(-1)
        : undefined;
    const previousYearThroughDate = latestCurrentYearDate
      ? `${this.#selectedYear - 1}${latestCurrentYearDate.slice(4)}`
      : undefined;
    const previousRows = buildBudgetOverviewChartMonths(
      transactions,
      accounts,
      this.#selectedYear - 1,
      new Date(this.#selectedYear, 11, 31),
    );
    const comparisonPreviousRows = previousYearThroughDate
      ? buildBudgetOverviewChartMonths(
          transactions,
          accounts,
          this.#selectedYear - 1,
          new Date(this.#selectedYear, 11, 31),
          previousYearThroughDate,
        )
      : previousRows;
    const hasData = rows.some((row) => row.hasData);
    const totals = rows.reduce(
      (total, row) => ({
        income: total.income + (row.hasData ? row.income : 0),
        spend: total.spend + (row.hasData ? row.spend : 0),
        savings: total.savings + (row.hasData ? row.totalSavings : 0),
      }),
      { income: 0, spend: 0, savings: 0 },
    );
    const previousTotals = comparisonPreviousRows.reduce(
      (total, row) => ({
        income: total.income + (row.hasData ? row.income : 0),
        spend: total.spend + (row.hasData ? row.spend : 0),
        savings: total.savings + (row.hasData ? row.totalSavings : 0),
      }),
      { income: 0, spend: 0, savings: 0 },
    );
    const hasPreviousData = comparisonPreviousRows.some((row) => row.hasData);
    this.#totalBalance.textContent = hasData
      ? money(totals.savings, false)
      : "—";
    this.#totalBalanceCaption.textContent = `Total savings in ${this.#selectedYear}`;
    this.#totalSpend.textContent = hasData ? money(totals.spend, false) : "—";
    this.#totalIncome.textContent = hasData ? money(totals.income, false) : "—";
    this.#renderHeroComparison(
      this.#totalSpendComparison,
      totals.spend,
      previousTotals.spend,
      hasData && hasPreviousData,
      true,
      this.#selectedYear - 1,
    );
    this.#renderHeroComparison(
      this.#totalIncomeComparison,
      totals.income,
      previousTotals.income,
      hasData && hasPreviousData,
      false,
      this.#selectedYear - 1,
    );
    this.#empty.hidden = hasData;
    this.#chart.hidden = !hasData;
    if (!hasData) {
      this.#emptyTitle.textContent = "No financial history yet";
      this.#emptyCopy.textContent =
        "Monthly activity will appear here after you add transactions.";
      this.#chart.data = { year: this.#selectedYear, series: [] };
      return;
    }
    this.#chart.data = budgetOverviewChartData(
      rows,
      this.#chartDisplay,
      this.#selectedYear,
      previousRows,
    );
  }

  #renderDailySpendingInsights(): void {
    const data = buildAnnualSpendingHeatmap(
      appController.getTransactions(),
      APIs.accounts.accounts(),
      this.#selectedYear,
    );
    const { insights } = buildBudgetSpendingInsights({
      data,
      transactions: appController.getTransactions(),
      accounts: APIs.accounts.accounts(),
      categories: APIs.budget.listAllCategories(),
      vendors: APIs.budget.listAllVendors(),
      people: APIs.budget.listAllPeople(),
    });
    this.#spendingHeatmap.data = data;
    this.#spendingInsights.data = insights;
  }

  #renderMonthlySummary(): void {
    const overviewSummaries =
      appState.get("budgetOverview").monthlyTransactionSummaries;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const availableYears = Object.keys(overviewSummaries)
      .map(Number)
      .filter((year) => Number.isInteger(year) && year <= currentYear)
      .sort((a, b) => a - b);
    const earliestYear = availableYears[0] ?? currentYear;
    this.#selectedYear = Math.max(
      earliestYear,
      Math.min(currentYear, this.#selectedYear),
    );

    const comparisonLabel = `vs ${this.#selectedYear - 1}`;
    this.#topCategoriesComparisonLabel.textContent = comparisonLabel;
    this.#topVendorsComparisonLabel.textContent = comparisonLabel;

    const assignments = appController.getBudgetOverviewAssignments();
    if (
      this.#monthlySummaryAssignmentId !== null &&
      !assignments.some(({ id }) => id === this.#monthlySummaryAssignmentId)
    ) {
      this.#monthlySummaryAssignmentId = null;
    }
    this.#monthlySummaryAssignmentSelector.items = [
      {
        key: "all",
        title: "All assignments",
        isDefaultValue: this.#monthlySummaryAssignmentId === null,
      },
      ...assignments.map(({ id, name }) => ({
        key: id,
        title: name,
        isDefaultValue: id === this.#monthlySummaryAssignmentId,
      })),
    ];

    const selectedAssignment = assignments.find(
      ({ id }) => id === this.#monthlySummaryAssignmentId,
    );
    this.#monthlySummaryTable.setAttribute(
      "aria-label",
      `Monthly transaction summary for ${this.#selectedYear}, ${selectedAssignment?.name ?? "all assignments"}`,
    );
    const ledger = appController.getMonthlyLedger(
      this.#monthlySummaryAssignmentId,
    );
    const summaries = ledger.monthlyTransactionSummaries;
    const rows =
      summaries[this.#selectedYear] ??
      Array.from(
        { length: 12 },
        (_, index) =>
          ({
            monthId: `${this.#selectedYear}-${String(index + 1).padStart(2, "0")}`,
            spend: null,
            income: null,
            netBalance: null,
            hasData: false,
          }) satisfies MonthlyTransactionSummaryRow,
      );
    const previousRows = summaries[this.#selectedYear - 1] ?? [];
    const totals = {
      income: 0,
      spend: 0,
      net: 0,
      previousNet: 0,
      hasPreviousData: false,
    };
    const tableRows: MonthlySummaryTableRow[] = rows.map((row, index) => {
      const isCurrentMonth =
        this.#selectedYear === currentYear && index === currentDate.getMonth();
      const monthLabel = `${monthName.format(
        new Date(`${row.monthId}-01T00:00:00Z`),
      )}${isCurrentMonth ? " · In progress" : ""}`;

      const hasData = row.hasData;
      const income = row.income ?? 0;
      const spend = row.spend ?? 0;
      const net = income - spend;
      const previousRow = previousRows[index];
      const previousHasData = Boolean(previousRow?.hasData);
      const previousNet =
        (previousRow?.income ?? 0) - (previousRow?.spend ?? 0);
      const difference = hasData && previousHasData ? net - previousNet : null;
      if (hasData) {
        totals.income += income;
        totals.spend += spend;
        totals.net += net;
      }
      if (previousHasData) {
        totals.previousNet += previousNet;
        totals.hasPreviousData = true;
      }
      return {
        month: monthLabel,
        income: hasData ? summaryTableMoney(income) : "—",
        spend: hasData ? summaryTableMoney(spend) : "—",
        amount: hasData ? summaryTableMoney(net) : "—",
        comparison:
          difference === null ? "—" : signedSummaryTableMoney(difference),
        amountValue: net,
        comparisonValue: difference,
        hasData,
      };
    });
    const yearDifference = totals.hasPreviousData
      ? totals.net - totals.previousNet
      : null;
    const cellClass = (value: number | null): DataTableCellClasses =>
      value !== null && value > 0
        ? "is-positive"
        : value !== null && value < 0
          ? "is-negative"
          : "";

    const tableData: DataTableData<MonthlySummaryTableRow> = {
      columns: [
        { key: "month", title: "Month", cellClass: ["detail"] },
        {
          key: "income",
          title: "Income",
          cellClass: ["numeric", "align-right"],
        },
        { key: "spend", title: "Spend", cellClass: ["numeric", "align-right"] },
        {
          key: "amount",
          title: "Net",
          headerClass: "align-right",
          cellClass: [
            "numeric",
            "align-right",
            "strong",
            (row) => cellClass(row.hasData ? row.amountValue : null),
          ],
        },
        {
          key: "comparison",
          title: comparisonLabel,
          headerClass: "align-right",
          textAlign: "right",
          sizing: "narrow",
          cellClass: [
            "comparison",
            "align-right",
            (row) => cellClass(row.comparisonValue),
          ],
        },
      ],
      rows: tableRows,
      footer: {
        cells: [
          "Year total",
          summaryTableMoney(totals.income),
          summaryTableMoney(totals.spend),
          summaryTableMoney(totals.net),
          yearDifference === null
            ? "—"
            : signedSummaryTableMoney(yearDifference),
        ],
      },
    };

    this.#monthlySummaryTable.data = tableData;
  }

  #renderRanking(
    list: HTMLOListElement,
    empty: HTMLElement,
    items: AnnualSpendingRank[],
  ): void {
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const row = document.createElement("li");
      const rank = document.createElement("span");
      rank.className = "rank-number";
      rank.textContent = String(index + 1);
      const label = document.createElement("span");
      label.className = "rank-name";
      label.textContent = item.name;
      label.title = item.name;
      const value = document.createElement("strong");
      value.className = "rank-total";
      value.textContent = summaryTableMoney(item.total);
      const inflation = document.createElement("span");
      inflation.className = "rank-inflation";
      inflation.textContent =
        item.inflationRate === null
          ? "—"
          : `${item.inflationRate > 0 ? "+" : item.inflationRate < 0 ? "−" : ""}${percentage.format(Math.abs(item.inflationRate))}%`;
      if (item.inflationRate !== null && item.inflationRate > 0)
        inflation.classList.add("is-increase");
      if (item.inflationRate !== null && item.inflationRate < 0)
        inflation.classList.add("is-decrease");
      row.append(rank, label, value, inflation);
      fragment.append(row);
    });
    list.replaceChildren(fragment);
    list.hidden = items.length === 0;
    empty.hidden = items.length > 0;
  }

  #renderInsights(): void {
    const overview: AnnualBudgetOverview | undefined =
      appState.get("budgetOverview").annualBudgetOverviews[this.#selectedYear];

    this.#renderRanking(
      this.#topVendorsList,
      this.#topVendorsEmpty,
      overview?.topVendors ?? [],
    );
    this.#renderRanking(
      this.#topCategoriesList,
      this.#topCategoriesEmpty,
      overview?.topCategories ?? [],
    );

    const budgetOverviewState = appState.get("budgetOverview");
    const summary = budgetOverviewState.annualSummaryCards[this.#selectedYear];
    const income = overview?.totalIncome ?? 0;
    const deductedSavings = deductedInvestmentSavings(
      appController.getTransactions(),
      APIs.accounts.accounts(),
      this.#selectedYear,
    );
    const breakdown = savingsRateBreakdown({
      income,
      spend: overview?.totalSpend ?? 0,
      deductions: deductedSavings,
    });
    const segments: Array<[SVGPathElement, number]> = [
      [this.#savingsRateBudgetRing, breakdown.savingsPercent],
      [this.#savingsRatePaycheckRing, breakdown.deductionsPercent],
      [this.#savingsRateSpentRing, breakdown.spendPercent],
    ];
    let offset = 0;
    const positionedSegments = segments.map(([ring, segment]) => {
      const length = Math.min(100 - offset, Math.max(0, segment));
      const positioned = { ring, length, start: offset, end: offset + length };
      offset += length;
      return positioned;
    });
    const visibleSegments = positionedSegments.filter(
      ({ length }) => length > 0,
    );
    const segmentWidth =
      Number.parseFloat(
        getComputedStyle(this).getPropertyValue("--donut-track"),
      ) || 8;
    const halfGapPercent =
      (DONUT_SEGMENT_GAP / 2 / (Math.PI * 2 * DONUT_RADIUS)) * 100;

    positionedSegments.forEach(({ ring, length, start, end }) => {
      const visibleIndex = visibleSegments.findIndex(
        ({ ring: visibleRing }) => visibleRing === ring,
      );
      if (visibleIndex >= 0) {
        let startInset = visibleSegments.length > 1 ? halfGapPercent : 0;
        let endInset = visibleSegments.length > 1 ? halfGapPercent : 0;
        if (startInset + endInset >= length) {
          const scale = (length * 0.8) / (startInset + endInset);
          startInset *= scale;
          endInset *= scale;
        }
        ring.setAttribute(
          "d",
          donutSegmentPath(start + startInset, end - endInset, segmentWidth),
        );
      } else {
        ring.removeAttribute("d");
      }
      ring.style.visibility = length > 0 ? "visible" : "hidden";
      ring.style.pointerEvents = "none";
    });

    const activeMonths = summary?.metrics.totalSavings.months ?? [];
    const activeMonthCount = activeMonths.filter(
      ({ hasData }) => hasData,
    ).length;
    const updateLegend = (
      rateElement: HTMLElement,
      amountElement: HTMLElement,
      averageElement: HTMLElement,
      fillElement: HTMLElement,
      amount: number,
      segmentPercentage: number,
    ): void => {
      const normalizedAmount = Math.max(0, amount);
      const average = activeMonthAverage(normalizedAmount, activeMonths);
      rateElement.textContent = `${legendPercentage.format(segmentPercentage)}%`;
      // amountElement.textContent = money(normalizedAmount, false) + " total";
      averageElement.textContent =
        average === null
          ? "No monthly average"
          : `${money(average, false)} per month`;
      fillElement.style.width = `${Math.min(
        100,
        Math.max(0, segmentPercentage),
      )}%`;
    };

    updateLegend(
      this.#savingsLegendRate,
      this.#savingsLegendAmount,
      this.#savingsLegendAverage,
      this.#savingsLegendFill,
      breakdown.amountSaved,
      breakdown.savingsPercent,
    );
    updateLegend(
      this.#deductionsLegendRate,
      this.#deductionsLegendAmount,
      this.#deductionsLegendAverage,
      this.#deductionsLegendFill,
      deductedSavings,
      breakdown.deductionsPercent,
    );
    updateLegend(
      this.#spendLegendRate,
      this.#spendLegendAmount,
      this.#spendLegendAverage,
      this.#spendLegendFill,
      overview?.totalSpend ?? 0,
      breakdown.spendPercent,
    );

    this.#savingsRateValue.textContent =
      breakdown.rate === null ? "—" : `${percentage.format(breakdown.rate)}%`;
    this.#savingsRateDescription.textContent =
      breakdown.rate === null
        ? `No income data for ${this.#selectedYear}.`
        : `${percentage.format(breakdown.rate)} percent of income saved in ${this.#selectedYear}. Budget savings ${legendPercentage.format(breakdown.savingsPercent)} percent, deducted savings ${legendPercentage.format(breakdown.deductionsPercent)} percent, and spend ${legendPercentage.format(breakdown.spendPercent)} percent. Monthly averages use ${activeMonthCount} ${activeMonthCount === 1 ? "month" : "months"} with data.`;
  }
}

if (!customElements.get("budget-overview-screen")) {
  customElements.define("budget-overview-screen", BudgetOverviewScreen);
}
