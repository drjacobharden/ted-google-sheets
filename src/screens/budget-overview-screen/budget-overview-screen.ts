import type {
  DropdownMenu,
  DropdownMenuItem,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type {
  SegmentedControl,
  SegmentedControlSelectionEvent,
} from "../../components/segmented-control/segmented-control";
import { type SpendTrendPeriod } from "../../utilities/spend-trend";
import { appState } from "../../state/app-state";
import { appController } from "../../state/app-controller";
import { escapeHTML, money } from "../../utilities/view-formatters";
import {
  monthlyNetDifference,
  type MonthlyTransactionSummaryRow,
} from "../../utilities/monthly-transaction-summary";
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
  savingsRateBreakdown,
  savingsRateChange,
} from "../../utilities/savings-rate-breakdown";
import templateString from "./template.html" with { type: "text" };

import { DateUtils } from "../../utilities/date-utilities";
import { handleCustomEvent } from "../../utilities/event-utilities";

const template = document.createElement("template");
template.innerHTML = templateString;

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
const DONUT_SEGMENT_GAP = 4;
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
  const startAngle = Math.PI * (1 - startPercent / 100);
  const endAngle = Math.PI * (1 - endPercent / 100);
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
    `A ${outerRadius} ${outerRadius} 0 0 1 ${donutCoordinate(outerEnd)}`,
    `Q ${donutCoordinate(outerEndCorner)} ${donutCoordinate(endOuterCap)}`,
    `L ${donutCoordinate(endInnerCap)}`,
    `Q ${donutCoordinate(innerEndCorner)} ${donutCoordinate(innerEnd)}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${donutCoordinate(innerStart)}`,
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
    "The total amount saved. Calculated as your paycheck deductions plus the difference between income and spend",
};

function signedMoney(value: number): string {
  if (Math.abs(value) < 0.005) return money(0);
  return `${value > 0 ? "+ " : "− "}${money(Math.abs(value), false)}`;
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

function getAvailableYears(): DropdownMenuItem[] {
  const summaries = appState.get("budgetOverview").monthlyTransactionSummaries;

  const currentYear = DateUtils.today.getFullYear();

  const availableYears = Object.keys(summaries)
    .map(Number)
    .filter((year) => Number.isInteger(year) && year <= currentYear);

  if (!availableYears.includes(currentYear)) {
    availableYears.push(currentYear);
  }

  return availableYears
    .sort((a, b) => b - a)
    .map((y) => ({
      key: y.toString(),
      title: y.toString(),
      isDefaultValue: y === currentYear,
    }));
}

function getAvailableAssignments(): DropdownMenuItem[] {
  const selectedId = appState.get("budgetOverview").assignmentId;
  const assignments = appController.getBudgetOverviewAssignments();

  return [
    {
      key: "all",
      title: "All assignments",
      isDefaultValue: selectedId === null,
    },
    ...assignments.map((assignment) => ({
      key: assignment.id,
      title: assignment.name,
      isDefaultValue: assignment.id === selectedId,
    })),
  ];
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
  #yearControl!: DropdownMenu;
  #selectedYear = new Date().getFullYear();

  #assignmentControl!: DropdownMenu;

  #contentControl!: DropdownMenu;

  #periodControl!: SegmentedControl;
  #chart!: HTMLElement;
  #metrics!: HTMLElement;
  #totalBalance!: HTMLElement;
  #totalBalanceCaption!: HTMLElement;
  #totalSpend!: HTMLElement;
  #totalIncome!: HTMLElement;
  #totalDeductions!: HTMLElement;
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
  #monthlySummaryYear!: HTMLElement;
  #monthlySummaryCaption!: HTMLElement;
  #monthlySummaryBody!: HTMLTableSectionElement;
  #monthlySummaryComparisonLabel!: HTMLElement;
  #previousYearButton!: HTMLButtonElement;
  #nextYearButton!: HTMLButtonElement;
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
  #savingsRateSegments: SVGPathElement[] = [];
  #savingsRateDescription!: SVGDescElement;
  #savingsRateValue!: HTMLElement;
  #savingsRateChange!: HTMLElement;
  #savingsRateSubtitle!: HTMLElement;
  #savingsLegendRate!: HTMLElement;
  #deductionsLegendRate!: HTMLElement;
  #spendLegendRate!: HTMLElement;
  #annualSummaryCards!: HTMLElement;

  #overlayManager!: OverlayManager;
  #period: SpendTrendPeriod = "weekly";

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

  #yearSelector!: DropdownMenu;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "budget-overview";
      this.append(template.content.cloneNode(true));
      this.#captureElements();

      //
      this.#initialize.capture();
      this.#initialize.setup();
      this.#selectedYear = appState.get("budgetingContext").year;
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#periodControl.addListener(this);
    this.#range.addEventListener("pointerdown", this);
    this.#range.addEventListener("pointermove", this);
    this.#range.addEventListener("pointerup", this);
    this.#range.addEventListener("pointercancel", this);
    this.#range.addEventListener("keydown", this);

    this.#previousYearButton.addEventListener("click", this);
    this.#nextYearButton.addEventListener("click", this);
    this.#annualSummaryCards.addEventListener("pointerover", this);
    this.#annualSummaryCards.addEventListener("pointerout", this);
    this.#annualSummaryCards.addEventListener("focusin", this);
    this.#annualSummaryCards.addEventListener("focusout", this);
    this.#insightsGrid.addEventListener("pointerover", this);
    this.#insightsGrid.addEventListener("pointerout", this);
    this.#insightsGrid.addEventListener("focusin", this);
    this.#insightsGrid.addEventListener("focusout", this);
    this.#savingsRateSegments.forEach((segment) => {
      segment.addEventListener("focus", this);
      segment.addEventListener("blur", this);
    });
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
        this.#rangeStart = 0;
        this.#rangeEnd = -1;
        this.#renderOverview();
      },
    );
    this.#renderOverview();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#periodControl.removeListener(this);
    this.#range.removeEventListener("pointerdown", this);
    this.#range.removeEventListener("pointermove", this);
    this.#range.removeEventListener("pointerup", this);
    this.#range.removeEventListener("pointercancel", this);
    this.#range.removeEventListener("keydown", this);

    this.#previousYearButton.removeEventListener("click", this);
    this.#nextYearButton.removeEventListener("click", this);
    this.#annualSummaryCards.removeEventListener("pointerover", this);
    this.#annualSummaryCards.removeEventListener("pointerout", this);
    this.#annualSummaryCards.removeEventListener("focusin", this);
    this.#annualSummaryCards.removeEventListener("focusout", this);
    this.#insightsGrid.removeEventListener("pointerover", this);
    this.#insightsGrid.removeEventListener("pointerout", this);
    this.#insightsGrid.removeEventListener("focusin", this);
    this.#insightsGrid.removeEventListener("focusout", this);
    this.#savingsRateSegments.forEach((segment) => {
      segment.removeEventListener("focus", this);
      segment.removeEventListener("blur", this);
    });
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
    switch (event.type) {
      case "dropdown-selection":
        this.#eventHandlers.dropdownSelection(event);
        return;

      default:
        break;
    }

    if (event.currentTarget === this.#range) {
      if (event instanceof PointerEvent) this.#handleRangePointer(event);
      else if (event instanceof KeyboardEvent) this.#handleRangeKeydown(event);
      return;
    }
    if (
      event.currentTarget instanceof SVGElement &&
      event.currentTarget.matches("[data-donut-segment]")
    ) {
      const segment = event.currentTarget;
      if (event.type === "focus") {
        this.#overlayManager.showTooltip(
          segment as unknown as HTMLElement,
          stackedTooltip(
            segment.dataset.tooltipName ?? "",
            `${segment.dataset.tooltipAmount ?? "—"} · ${segment.dataset.tooltipPercent ?? "—"}`,
          ),
          { side: "top", align: "center", gap: 8 },
        );
      } else if (event.type === "blur") {
        this.#overlayManager.hideTooltip();
      }
      return;
    }
    if (
      event.currentTarget === this.#insightsGrid &&
      (event.type === "pointerover" || event.type === "focusin")
    ) {
      const donutSegment = (
        event.target as Element | null
      )?.closest<SVGElement>("[data-donut-segment]");
      if (donutSegment && this.#insightsGrid.contains(donutSegment)) {
        this.#overlayManager.showTooltip(
          donutSegment as unknown as HTMLElement,
          stackedTooltip(
            donutSegment.dataset.tooltipName ?? "",
            `${donutSegment.dataset.tooltipAmount ?? "—"} · ${donutSegment.dataset.tooltipPercent ?? "—"}`,
          ),
          { side: "top", align: "center", gap: 8 },
        );
        return;
      }
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
        "[data-insight-help], [data-donut-segment]",
      );
      const entering = (event as MouseEvent | FocusEvent).relatedTarget;
      const next =
        entering instanceof Element
          ? entering.closest("[data-insight-help], [data-donut-segment]")
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
    if (
      event.type === "dropdown-selection" &&
      event.target === this.#assignmentControl
    ) {
      const selection = event as DropdownSelectionEvent;
      appController.setBudgetOverviewAssignment(
        selection.detail.value === "all" ? null : selection.detail.value,
      );
      return;
    }
    if (
      event.type === "segmented-control-selection" &&
      event.target === this.#periodControl
    ) {
      const value = (event as SegmentedControlSelectionEvent).detail.value;
      if (value === "weekly" || value === "monthly") this.#period = value;
      this.#rangeStart = 0;
      this.#rangeEnd = -1;
      this.#renderTrend();
      return;
    }
    if (
      event.type === "click" &&
      event.currentTarget === this.#previousYearButton
    ) {
      this.#selectedYear -= 1;
      this.#rangeStart = 0;
      this.#rangeEnd = -1;
      this.#renderOverview();
    } else if (
      event.type === "click" &&
      event.currentTarget === this.#nextYearButton
    ) {
      this.#selectedYear += 1;
      this.#rangeStart = 0;
      this.#rangeEnd = -1;
      this.#renderOverview();
    }
  }

  #initialize = {
    capture: () => {
      this.#contentControl = this.querySelector("#content-selector")!;
      this.#assignmentControl = this.querySelector("#assignment-selector")!;
      this.#yearControl = this.querySelector("#year-selector")!;
    },
    setup: () => {
      this.#update.assignmentControl();
      this.#update.contentControl();
      this.#update.yearControl();
    },
    addListeners: () => {},
    teardown: () => {},
  };

  #update = {
    assignmentControl: () => {
      this.#assignmentControl.items = getAvailableAssignments();
    },
    contentControl: () => {
      this.#contentControl.items = [
        {
          key: "overview",
          title: "Overview",
          icon: "dashboard",
          isDefaultValue: true,
        },
        { key: "transactions", title: "Transactions", icon: "transactions" },
        { key: "categories", title: "Categories", icon: "label" },
        { key: "vendors", title: "Vendors", icon: "cart" },
        { key: "assignments", title: "People", icon: "people" },
      ];
    },
    yearControl: () => {
      this.#yearControl.items = getAvailableYears();
    },
  };

  #eventHandlers = {
    dropdownSelection: (event: Event) => {
      handleCustomEvent("dropdown-selection", event, ({ value, title, id }) => {
        switch (id) {
          case "content-selector":
            console.log({ value, title });
            break;

          case "year-selector":
            this.#selectedYear = Number(value);
            this.#rangeStart = 0;
            this.#rangeEnd = -1;
            this.#renderOverview();
            console.log({ value, title });
            break;

          case "assignment-selector":
            appController.setBudgetOverviewAssignment(
              value === "all" ? null : value,
            );
            break;

          default:
            break;
        }
      });
    },
  };

  #captureElements(): void {
    this.#periodControl = this.querySelector<SegmentedControl>(
      "#spend-trend-period",
    )!;
    this.#periodControl.items = [
      { key: "weekly", title: "Weekly", isDefaultValue: true },
      { key: "monthly", title: "Monthly" },
    ];
    this.#chart = this.querySelector<HTMLElement>("#weekly-spend-chart")!;
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
    this.#totalDeductions = this.querySelector<HTMLElement>(
      "#overview-total-deductions",
    )!;
    this.#range = this.querySelector<HTMLElement>("#spend-trend-range")!;
    this.#rangeTrack = this.querySelector<HTMLElement>(
      "#spend-trend-range-track",
    )!;
    this.#rangeSelection = this.querySelector<HTMLElement>(
      "#spend-trend-range-selection",
    )!;
    this.#rangeStartHandle = this.querySelector<HTMLButtonElement>(
      '[data-range-action="start"]',
    )!;
    this.#rangeMoveHandle = this.querySelector<HTMLButtonElement>(
      '[data-range-action="move"]',
    )!;
    this.#rangeEndHandle = this.querySelector<HTMLButtonElement>(
      '[data-range-action="end"]',
    )!;
    this.#rangeStartTooltip = this.querySelector<HTMLOutputElement>(
      "#spend-trend-range-start-tooltip",
    )!;
    this.#rangeEndTooltip = this.querySelector<HTMLOutputElement>(
      "#spend-trend-range-end-tooltip",
    )!;
    this.#empty = this.querySelector<HTMLElement>("#weekly-spend-empty")!;
    this.#emptyTitle = this.querySelector<HTMLElement>(
      "#weekly-spend-empty-title",
    )!;
    this.#emptyCopy = this.querySelector<HTMLElement>(
      "#weekly-spend-empty-copy",
    )!;
    this.#legend = this.querySelector<HTMLElement>("#weekly-spend-legend")!;
    this.#legendTotal = this.querySelector<HTMLElement>(
      "#spend-trend-legend-total",
    )!;
    this.#previousLegend = this.querySelector<HTMLElement>(
      "#spend-trend-previous-legend",
    )!;

    this.#monthlySummaryCaption = this.querySelector<HTMLElement>(
      "#monthly-summary-caption",
    )!;
    this.#monthlySummaryBody = this.querySelector<HTMLTableSectionElement>(
      "#monthly-summary-body",
    )!;
    this.#monthlySummaryComparisonLabel = this.querySelector<HTMLElement>(
      "#monthly-summary-comparison-label",
    )!;

    // Buttons to control year navigation
    this.#previousYearButton = this.querySelector(
      '.page-header-wrapper [data-action="prevYear"]',
    )!;
    this.#nextYearButton = this.querySelector(
      '.page-header-wrapper [data-action="nextYear"]',
    )!;
    this.#monthlySummaryYear = this.querySelector(
      '.page-header-wrapper [data-id="summary-year"]',
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
    this.#savingsRateSegments = [
      this.#savingsRateSpentRing,
      this.#savingsRatePaycheckRing,
      this.#savingsRateBudgetRing,
    ];
    this.#savingsRateDescription = this.querySelector<SVGDescElement>(
      "#savings-rate-chart-description",
    )!;
    this.#savingsRateValue = this.querySelector<HTMLElement>(
      "#savings-rate-value",
    )!;
    this.#savingsRateChange = this.querySelector<HTMLElement>(
      "#savings-rate-change",
    )!;
    this.#savingsRateSubtitle = this.querySelector<HTMLElement>(
      "#savings-rate-subtitle",
    )!;
    this.#savingsLegendRate = this.querySelector<HTMLElement>(
      "#savings-legend-rate",
    )!;
    this.#deductionsLegendRate = this.querySelector<HTMLElement>(
      "#deductions-legend-rate",
    )!;
    this.#spendLegendRate =
      this.querySelector<HTMLElement>("#spend-legend-rate")!;
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

  #renderPeriodControl(): void {
    this.#periodControl.selection = this.#period;
  }

  #rangeSeries(): AnnualSpendTrendSeries | undefined {
    return appState.get("budgetOverview").annualSpendTrendsByYear[
      this.#selectedYear
    ]?.[this.#period];
  }

  #rangeUnitFromPointer(event: PointerEvent): number {
    const bounds = this.#rangeTrack.getBoundingClientRect();
    const progress = bounds.width
      ? (event.clientX - bounds.left) / bounds.width
      : 0;
    return Math.max(
      0,
      Math.min(this.#rangePointCount, progress * this.#rangePointCount),
    );
  }

  #updateRangeFromPointer(event: PointerEvent): void {
    const drag = this.#rangeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pointerUnit = this.#rangeUnitFromPointer(event);
    if (drag.action === "start") {
      this.#rangeVisualStart = Math.max(
        0,
        Math.min(
          drag.endBoundary - 1,
          drag.startBoundary + pointerUnit - drag.pointerUnit,
        ),
      );
      this.#rangeVisualEnd = drag.endBoundary;
    } else if (drag.action === "end") {
      this.#rangeVisualStart = drag.startBoundary;
      this.#rangeVisualEnd = Math.min(
        this.#rangePointCount,
        Math.max(
          drag.startBoundary + 1,
          drag.endBoundary + pointerUnit - drag.pointerUnit,
        ),
      );
    } else {
      const length = drag.endBoundary - drag.startBoundary;
      const requestedDelta = pointerUnit - drag.pointerUnit;
      const delta = Math.max(
        -drag.startBoundary,
        Math.min(this.#rangePointCount - drag.endBoundary, requestedDelta),
      );
      this.#rangeVisualStart = drag.startBoundary + delta;
      this.#rangeVisualEnd = this.#rangeVisualStart + length;
    }
    const series = this.#rangeSeries();
    if (series) {
      this.#renderRangeSelector(series);
      this.#renderRangeBarSelection(
        this.#rangeVisualStart,
        this.#rangeVisualEnd,
      );
    }
  }

  #handleRangePointer(event: PointerEvent): void {
    if (event.type === "pointerdown") {
      const control = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-range-action]",
      );
      if (!control || !this.#range.contains(control)) return;
      const action = control.dataset.rangeAction as ChartRangeAction;
      event.preventDefault();
      this.#rangeDrag = {
        action,
        pointerId: event.pointerId,
        pointerUnit: this.#rangeUnitFromPointer(event),
        startBoundary: this.#rangeStart,
        endBoundary: this.#rangeEnd + 1,
      };
      this.#rangeVisualStart = this.#rangeStart;
      this.#rangeVisualEnd = this.#rangeEnd + 1;
      this.#range.classList.add("is-dragging");
      this.#range.setPointerCapture?.(event.pointerId);
      return;
    }
    if (!this.#rangeDrag || this.#rangeDrag.pointerId !== event.pointerId)
      return;
    if (event.type === "pointermove") {
      this.#updateRangeFromPointer(event);
      return;
    }
    if (event.type === "pointercancel") {
      const series = this.#rangeSeries();
      this.#rangeDrag = null;
      this.#rangeVisualStart = this.#rangeStart;
      this.#rangeVisualEnd = this.#rangeEnd + 1;
      this.#range.classList.remove("is-dragging");
      if (series) {
        this.#renderRangeSelector(series);
        this.#renderRangeBarSelection(
          this.#rangeVisualStart,
          this.#rangeVisualEnd,
        );
      }
      return;
    }
    if (event.type === "pointerup") {
      this.#updateRangeFromPointer(event);
      this.#range.releasePointerCapture?.(event.pointerId);
      const drag = this.#rangeDrag;
      this.#rangeDrag = null;
      if (drag?.action === "move") {
        const length = drag.endBoundary - drag.startBoundary;
        this.#rangeStart = Math.max(
          0,
          Math.min(
            this.#rangePointCount - length,
            Math.round(this.#rangeVisualStart),
          ),
        );
        this.#rangeEnd = this.#rangeStart + length - 1;
      } else {
        this.#rangeStart = Math.max(
          0,
          Math.min(
            this.#rangePointCount - 1,
            Math.round(this.#rangeVisualStart),
          ),
        );
        const endExclusive = Math.max(
          this.#rangeStart + 1,
          Math.min(this.#rangePointCount, Math.round(this.#rangeVisualEnd)),
        );
        this.#rangeEnd = endExclusive - 1;
      }
      this.#rangeVisualStart = this.#rangeStart;
      this.#rangeVisualEnd = this.#rangeEnd + 1;
      this.#range.classList.remove("is-dragging");
      const series = this.#rangeSeries();
      if (series) {
        this.#renderRangeSelector(series);
        this.#renderRangeBarSelection(
          this.#rangeVisualStart,
          this.#rangeVisualEnd,
        );
        this.#renderSelectedRangeTotals(series);
      }
    }
  }

  #handleRangeKeydown(event: KeyboardEvent): void {
    const control = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-range-action]",
    );
    if (!control || !this.#range.contains(control)) return;
    const action = control.dataset.rangeAction as ChartRangeAction;
    const direction =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? 1
          : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (action === "start") {
      this.#rangeStart =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? this.#rangeEnd
            : Math.max(
                0,
                Math.min(this.#rangeEnd, this.#rangeStart + direction),
              );
    } else if (action === "end") {
      this.#rangeEnd =
        event.key === "Home"
          ? this.#rangeStart
          : event.key === "End"
            ? this.#rangePointCount - 1
            : Math.max(
                this.#rangeStart,
                Math.min(this.#rangePointCount - 1, this.#rangeEnd + direction),
              );
    } else {
      const length = this.#rangeEnd - this.#rangeStart;
      const maximumStart = this.#rangePointCount - 1 - length;
      const nextStart =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? maximumStart
            : Math.max(0, Math.min(maximumStart, this.#rangeStart + direction));
      this.#rangeStart = nextStart;
      this.#rangeEnd = nextStart + length;
    }
    const series = this.#rangeSeries();
    if (!series) return;
    this.#rangeVisualStart = this.#rangeStart;
    this.#rangeVisualEnd = this.#rangeEnd + 1;
    this.#renderRangeSelector(series);
    this.#renderRangeBarSelection(this.#rangeVisualStart, this.#rangeVisualEnd);
    this.#renderSelectedRangeTotals(series);
  }

  #rangeDates(
    series: AnnualSpendTrendSeries,
    startIndex: number,
    endIndex: number,
  ): { start: string; end: string } {
    const first = series.points[startIndex];
    const last = series.points[endIndex];
    const yearStart = `${series.year}-01-01`;
    const yearEnd = `${series.year}-12-31`;
    return {
      start: first
        ? first.periodStart < yearStart
          ? yearStart
          : first.periodStart
        : yearStart,
      end: last
        ? last.periodEnd > yearEnd
          ? yearEnd
          : last.periodEnd
        : yearEnd,
    };
  }

  #selectedRangeDates(series: AnnualSpendTrendSeries): {
    start: string;
    end: string;
  } {
    return this.#rangeDates(series, this.#rangeStart, this.#rangeEnd);
  }

  #renderRangeSelector(series: AnnualSpendTrendSeries): void {
    const count = series.points.length;
    if (!count) return;
    const left = (this.#rangeVisualStart / count) * 100;
    const width =
      ((this.#rangeVisualEnd - this.#rangeVisualStart) / count) * 100;
    this.#rangeSelection.style.left = `${left}%`;
    this.#rangeSelection.style.width = `${width}%`;
    const visualStartIndex = Math.max(
      0,
      Math.min(count - 1, Math.round(this.#rangeVisualStart)),
    );
    const visualEndIndex = Math.max(
      visualStartIndex,
      Math.min(count - 1, Math.round(this.#rangeVisualEnd) - 1),
    );
    const { start, end } = this.#rangeDates(
      series,
      visualStartIndex,
      visualEndIndex,
    );
    const startLabel = shortDate.format(new Date(`${start}T00:00:00Z`));
    const endLabel = shortDate.format(new Date(`${end}T00:00:00Z`));
    this.#rangeStartTooltip.textContent = startLabel;
    this.#rangeEndTooltip.textContent = endLabel;
    this.#rangeStartTooltip.style.left = `calc(${left}% + 7px)`;
    this.#rangeEndTooltip.style.left = `calc(${left + width}% - 7px)`;
    [this.#rangeStartHandle, this.#rangeEndHandle].forEach((handle) => {
      handle.setAttribute("aria-valuemin", "1");
      handle.setAttribute("aria-valuemax", String(count));
      handle.setAttribute("aria-orientation", "horizontal");
    });
    this.#rangeStartHandle.setAttribute(
      "aria-valuenow",
      String(visualStartIndex + 1),
    );
    this.#rangeStartHandle.setAttribute("aria-valuetext", startLabel);
    this.#rangeEndHandle.setAttribute(
      "aria-valuenow",
      String(visualEndIndex + 1),
    );
    this.#rangeEndHandle.setAttribute("aria-valuetext", endLabel);
    this.#rangeMoveHandle.setAttribute(
      "aria-label",
      `Move selected range, ${startLabel} through ${endLabel}`,
    );
  }

  #renderRangeBarSelection(start: number, end: number): void {
    const selectedStart = Math.max(
      0,
      Math.min(this.#rangePointCount - 1, Math.round(start)),
    );
    const selectedEnd = Math.max(
      selectedStart + 1,
      Math.min(this.#rangePointCount, Math.round(end)),
    );
    this.#chart
      .querySelectorAll<SVGRectElement>("[data-period-index]")
      .forEach((bar) => {
        const index = Number(bar.dataset.periodIndex);
        const selected = index >= selectedStart && index < selectedEnd;
        bar.classList.toggle("is-outside-range", !selected);
      });
  }

  #renderSelectedRangeTotals(series: AnnualSpendTrendSeries): void {
    const overview = appState.get("budgetOverview");
    const summary = overview.annualSummaryCards[this.#selectedYear];
    const { start, end } = this.#selectedRangeDates(series);
    const assignmentId = overview.assignmentId;
    const today = DateUtils.today;
    const todayId = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const dataEnd = end > todayId ? todayId : end;
    const transactions = appController
      .getTransactions()
      .filter(
        (transaction) =>
          transaction.date >= start &&
          transaction.date <= dataEnd &&
          (assignmentId === null || transaction.assignmentId === assignmentId),
      );
    const spend = transactions.reduce(
      (total, transaction) =>
        transaction.type === "expense"
          ? total + Number(transaction.amount || 0)
          : total,
      0,
    );
    const income = transactions.reduce(
      (total, transaction) =>
        transaction.type === "income"
          ? total + Number(transaction.amount || 0)
          : total,
      0,
    );
    const startMonth = start.slice(0, 7);
    const endMonth = end.slice(0, 7);
    const deductions =
      summary?.metrics.paycheckDeductions.months.reduce(
        (total, month) =>
          month.monthId >= startMonth && month.monthId <= endMonth
            ? total + (month.value ?? 0)
            : total,
        0,
      ) ?? 0;
    const balance = income - spend + deductions;
    const isFullYear =
      this.#rangeStart === 0 && this.#rangeEnd === series.points.length - 1;
    const startLabel = shortDate.format(new Date(`${start}T00:00:00Z`));
    const endLabel = shortDate.format(new Date(`${end}T00:00:00Z`));
    this.#totalBalance.textContent = money(balance, false);
    this.#totalBalanceCaption.textContent = isFullYear
      ? `Total balance in ${this.#selectedYear}`
      : `Total balance · ${startLabel}–${endLabel}`;
    this.#totalSpend.textContent = money(spend, false);
    this.#totalIncome.textContent = money(income, false);
    this.#totalDeductions.textContent = money(deductions, false);
    this.#metrics.setAttribute(
      "aria-label",
      `Financial totals from ${startLabel} through ${endLabel}`,
    );
  }

  #renderTrend(): void {
    const monthly = this.#period === "monthly";
    const periodNoun = monthly ? "month" : "week";
    const periodAdjective = monthly ? "monthly" : "weekly";
    const overview = appState.get("budgetOverview");
    const series =
      overview.annualSpendTrendsByYear[this.#selectedYear]?.[this.#period];
    this.#renderPeriodControl();

    if (!series) {
      this.#totalBalance.textContent = "—";
      this.#totalBalanceCaption.textContent = `Total balance in ${this.#selectedYear}`;
      this.#totalSpend.textContent = "—";
      this.#totalIncome.textContent = "—";
      this.#totalDeductions.textContent = "—";
      this.#cleanupChart?.();
      this.#cleanupChart = null;
      this.#chart.replaceChildren();
      this.#chart.hidden = true;
      this.#range.hidden = true;
      this.#legend.hidden = true;
      return;
    }

    this.#legendTotal.textContent = `${monthly ? "Monthly" : "Weekly"} spend`;
    this.#previousLegend.hidden = !series.hasPriorYearTrend;
    this.#cleanupChart?.();
    this.#cleanupChart = null;
    const empty = !series.hasExpenseHistory || series.latestTrend === null;
    this.#emptyTitle.textContent = series.hasExpenseHistory
      ? `First ${periodNoun} in progress`
      : "No spending history yet";
    this.#emptyCopy.textContent = series.hasExpenseHistory
      ? `Your first ${periodAdjective} point will appear after the current ${periodNoun} ends.`
      : `Completed ${periodNoun}s will appear here after you add expenses.`;
    this.#empty.hidden = !empty;
    this.#chart.hidden = empty;
    this.#legend.hidden = empty;
    this.#range.hidden = empty;
    this.#rangePointCount = series.points.length;
    if (
      this.#rangeEnd < 0 ||
      this.#rangeEnd >= this.#rangePointCount ||
      this.#rangeStart > this.#rangeEnd
    ) {
      this.#rangeStart = 0;
      this.#rangeEnd = Math.max(0, this.#rangePointCount - 1);
    }
    this.#rangeVisualStart = this.#rangeStart;
    this.#rangeVisualEnd = this.#rangeEnd + 1;
    this.#renderRangeSelector(series);
    this.#renderSelectedRangeTotals(series);
    if (!empty) {
      this.#cleanupChart = mountChart(
        this.#chart,
        series,
        this.#overlayManager,
        () => ({
          start: this.#rangeVisualStart,
          end: this.#rangeVisualEnd,
        }),
      );
    } else this.#chart.replaceChildren();
  }

  #renderMonthlySummary(): void {
    const summaries =
      appState.get("budgetOverview").monthlyTransactionSummaries;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const availableYears = Object.keys(summaries)
      .map(Number)
      .filter((year) => Number.isInteger(year) && year <= currentYear)
      .sort((a, b) => a - b);
    const earliestYear = availableYears[0] ?? currentYear;
    this.#selectedYear = Math.max(
      earliestYear,
      Math.min(currentYear, this.#selectedYear),
    );

    this.#monthlySummaryYear.textContent = String(this.#selectedYear);
    const comparisonLabel = `vs ${this.#selectedYear - 1}`;
    this.#monthlySummaryComparisonLabel.textContent = comparisonLabel;
    this.#topCategoriesComparisonLabel.textContent = comparisonLabel;
    this.#topVendorsComparisonLabel.textContent = comparisonLabel;
    this.#monthlySummaryCaption.textContent = `Monthly transaction summary for ${this.#selectedYear}`;
    this.#previousYearButton.disabled = this.#selectedYear <= earliestYear;
    this.#nextYearButton.disabled = this.#selectedYear >= currentYear;
    this.#previousYearButton.setAttribute(
      "aria-label",
      `Show ${this.#selectedYear - 1}`,
    );
    this.#nextYearButton.setAttribute(
      "aria-label",
      `Show ${this.#selectedYear + 1}`,
    );

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
    const fragment = document.createDocumentFragment();
    const previousYearRows = summaries[this.#selectedYear - 1];
    rows.forEach((row, index) => {
      const tableRow = document.createElement("tr");
      const isCurrentMonth =
        this.#selectedYear === currentYear && index === currentDate.getMonth();
      if (isCurrentMonth) tableRow.classList.add("is-current");

      const monthHeader = document.createElement("th");
      monthHeader.scope = "row";
      const monthLabel = document.createElement("span");
      monthLabel.textContent = monthName.format(
        new Date(`${row.monthId}-01T00:00:00Z`),
      );
      monthHeader.append(monthLabel);
      if (isCurrentMonth) {
        const progress = document.createElement("small");
        progress.textContent = "In progress";
        monthHeader.append(progress);
      }
      tableRow.append(monthHeader);

      const values = [row.spend, row.income, row.netBalance];
      values.forEach((value, valueIndex) => {
        const cell = document.createElement("td");
        cell.textContent = row.hasData && value !== null ? money(value) : "—";
        if (valueIndex === 2 && row.hasData && value !== null) {
          if (value > 0) cell.classList.add("is-positive");
          else if (value < 0) cell.classList.add("is-negative");
        }
        tableRow.append(cell);
      });
      const difference = monthlyNetDifference(row, previousYearRows?.[index]);

      const comparisonCell = document.createElement("td");

      comparisonCell.textContent =
        difference === null ? "—" : signedMoney(difference);

      comparisonCell.classList.add("comparison");

      if (difference) {
        if (difference > 0) comparisonCell.classList.add("is-positive");
        if (difference < 0) comparisonCell.classList.add("is-negative");
      }

      tableRow.append(comparisonCell);
      fragment.append(tableRow);
    });
    this.#monthlySummaryBody.replaceChildren(fragment);
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
      value.textContent = money(item.total);
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
    const budgetSavings = overview?.netBalance ?? 0;
    const paycheckDeductions = summary?.metrics.paycheckDeductions.total ?? 0;
    const breakdown = savingsRateBreakdown({
      income,
      spend: overview?.totalSpend ?? 0,
      deductions: paycheckDeductions,
    });
    const previousBreakdown =
      summary?.metrics.income.comparison !== null &&
      summary?.metrics.income.comparison !== undefined
        ? savingsRateBreakdown({
            income:
              summary.metrics.income.total - summary.metrics.income.comparison,
            spend:
              summary.metrics.spend.comparison === null
                ? 0
                : summary.metrics.spend.total -
                  summary.metrics.spend.comparison,
            deductions:
              summary.metrics.paycheckDeductions.comparison === null
                ? 0
                : summary.metrics.paycheckDeductions.total -
                  summary.metrics.paycheckDeductions.comparison,
          })
        : null;
    const rateChange = savingsRateChange(breakdown, previousBreakdown);
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
      (DONUT_SEGMENT_GAP / 2 / (Math.PI * DONUT_RADIUS)) * 100;

    positionedSegments.forEach(({ ring, length, start, end }) => {
      const visibleIndex = visibleSegments.findIndex(
        ({ ring: visibleRing }) => visibleRing === ring,
      );
      if (visibleIndex >= 0) {
        let startInset = visibleIndex > 0 ? halfGapPercent : 0;
        let endInset =
          visibleIndex < visibleSegments.length - 1 ? halfGapPercent : 0;
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
      ring.style.pointerEvents = length > 0 ? "fill" : "none";
      ring.tabIndex = length > 0 ? 0 : -1;
    });
    const semanticSegments: Array<[SVGPathElement, string, number, number]> = [
      [
        this.#savingsRateSpentRing,
        "Spend",
        overview?.totalSpend ?? 0,
        breakdown.spendPercent,
      ],
      [
        this.#savingsRatePaycheckRing,
        "Deductions",
        paycheckDeductions,
        breakdown.deductionsPercent,
      ],
      [
        this.#savingsRateBudgetRing,
        "Savings",
        Math.max(0, budgetSavings),
        breakdown.savingsPercent,
      ],
    ];
    semanticSegments.forEach(([ring, name, amount, segmentPercentage]) => {
      const formattedAmount = money(Math.abs(amount));
      const formattedPercentage = `${percentage.format(segmentPercentage)}%`;
      ring.dataset.tooltipName = name;
      ring.dataset.tooltipAmount = formattedAmount;
      ring.dataset.tooltipPercent = formattedPercentage;
      ring.setAttribute(
        "aria-label",
        `${name}: ${formattedAmount}, ${formattedPercentage}`,
      );
    });
    this.#savingsRateValue.textContent =
      breakdown.rate === null ? "—" : `${percentage.format(breakdown.rate)}%`;
    this.#savingsRateChange.hidden = rateChange === null;
    this.#savingsRateChange.classList.toggle(
      "is-negative",
      rateChange !== null && rateChange < 0,
    );
    this.#savingsRateChange.textContent =
      rateChange === null
        ? ""
        : `${rateChange > 0 ? "+" : rateChange < 0 ? "−" : ""}${percentage.format(Math.abs(rateChange))}%`;
    this.#savingsRateSubtitle.textContent =
      breakdown.rate === null
        ? "No income data"
        : `${money(Math.floor(breakdown.amountSaved), false)} of ${money(Math.floor(breakdown.totalIncome), false)} saved`;
    this.#savingsLegendRate.textContent = `${legendPercentage.format(breakdown.savingsPercent)}%`;
    this.#deductionsLegendRate.textContent = `${legendPercentage.format(breakdown.deductionsPercent)}%`;
    this.#spendLegendRate.textContent = `${legendPercentage.format(breakdown.spendPercent)}%`;
    this.#savingsRateDescription.textContent =
      breakdown.rate === null
        ? `No income data for ${this.#selectedYear}.`
        : `${percentage.format(breakdown.rate)} percent of income saved in ${this.#selectedYear}. Savings ${legendPercentage.format(breakdown.savingsPercent)} percent, deductions ${legendPercentage.format(breakdown.deductionsPercent)} percent, and spend ${legendPercentage.format(breakdown.spendPercent)} percent.`;
  }
}

if (!customElements.get("budget-overview-screen")) {
  customElements.define("budget-overview-screen", BudgetOverviewScreen);
}
