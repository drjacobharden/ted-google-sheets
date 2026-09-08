import { buildDataChartScale } from "../../utilities/data-chart-scale";

export type DataChartType = "bar" | "stacked-bar" | "value-marker" | "line";
export type DataChartVariant = "primary" | "secondary";
export type DataChartPalette = "income" | "expense" | "expense-muted" | "expense-debt" | "expense-lightest" | "savings" | "comparison" | "neutral";
export type DataChartFormat = "monthly" | string;

export interface DataChartPoint {
  date: string;
  value: number;
  label?: string;
}

export interface DataChartSeries {
  type: DataChartType;
  points: readonly DataChartPoint[];
  variant?: DataChartVariant;
  palette?: DataChartPalette;
  /** Width multiplier for bar and stacked-bar plots. */
  barWidthScale?: number;
  /** Groups bar series into one x-position without stacking their values. */
  overlay?: string;
  label?: string;
  /**
   * For stacked bars, series with the same name share one bar. Omit the name
   * for a single default stack; use different names for side-by-side stacks.
   */
  stack?: string;
}

export interface DataChartData {
  year?: number;
  format?: DataChartFormat;
  series: readonly DataChartSeries[];
  ariaLabel?: string;
  valueFormatter?: (value: number) => string;
}

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, index, 1)),
  ),
);
const LONG_MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, index, 1))),
);

const axisMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function monthIndex(date: string): number {
  const match = String(date).match(/(?:^|[-/])(0?[1-9]|1[0-2])(?:[-/]|$)/);
  return match ? Number(match[1]) - 1 : -1;
}

function yearFromDate(date: string): number | null {
  const year = Number(String(date).slice(0, 4));
  return Number.isInteger(year) ? year : null;
}


function escapeXML(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

interface BarPlot {
  stacked: boolean;
  series: DataChartSeries[];
}

interface DataChartPeak {
  index: number;
  kind: "bar" | "line";
  palette: DataChartPalette;
  plotIndex?: number;
  series?: DataChartSeries;
  value: number;
}

function barPlots(series: readonly DataChartSeries[]): BarPlot[] {
  const plots = new Map<string, BarPlot>();
  series.forEach((item, index) => {
    if (item.type === "bar") {
      const key = item.overlay ? `overlay-${item.overlay}` : `bar-${index}`;
      const plot = plots.get(key);
      if (plot) plot.series.push(item);
      else plots.set(key, { stacked: false, series: [item] });
      return;
    }
    if (item.type !== "stacked-bar") return;
    const key = `stack-${item.stack ?? "default"}`;
    const plot = plots.get(key);
    if (plot) plot.series.push(item);
    else plots.set(key, { stacked: true, series: [item] });
  });
  return [...plots.values()];
}

function scaleValues(
  series: readonly DataChartSeries[],
  plots: readonly BarPlot[],
): number[] {
  const values = series
    .filter((item) => item.type === "line" || item.type === "value-marker")
    .flatMap((item) =>
      item.points.map((point) => Number(point.value)).filter(Number.isFinite),
    );

  plots.forEach((plot) => {
    if (!plot.stacked) {
      values.push(
        ...plot.series.flatMap((item) =>
          item.points
            .map((point) => Number(point.value))
            .filter(Number.isFinite),
        ),
      );
      return;
    }
    for (let index = 0; index < 12; index += 1) {
      let positive = 0;
      let negative = 0;
      plot.series.forEach((item) => {
        const point = item.points.find(
          (candidate) => monthIndex(candidate.date) === index,
        );
        const value = Number(point?.value);
        if (!Number.isFinite(value)) return;
        if (value >= 0) positive += value;
        else negative += value;
      });
      values.push(positive, negative);
    }
  });
  return values;
}

export class DataChart extends HTMLElement {
  #data: DataChartData = { series: [] };
  #cleanupInteraction: (() => void) | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #renderedWidth = 0;

  set data(value: DataChartData) {
    this.#data = value;
    this.#render();
  }

  get data(): DataChartData {
    return this.#data;
  }

  connectedCallback(): void {
    this.#resizeObserver ??= new ResizeObserver(() => {
      const width = this.#chartWidth();
      if (width !== this.#renderedWidth) this.#render();
    });
    this.#resizeObserver.observe(this);
    this.#render();
  }

  disconnectedCallback(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#cleanupInteraction?.();
    this.#cleanupInteraction = null;
  }

  #chartWidth(): number {
    return Math.max(1, Math.round(this.clientWidth || 680));
  }

  #render(): void {
    this.#cleanupInteraction?.();
    this.#cleanupInteraction = null;
    const width = this.#chartWidth();
    this.#renderedWidth = width;
    const series = this.#data.series ?? [];
    const firstPoint = series.flatMap((item) => item.points)[0];
    const year = this.#data.year ?? (firstPoint ? yearFromDate(firstPoint.date) : null);
    const rawValues = series.flatMap((item) =>
      item.points.map((point) => Number(point.value)).filter(Number.isFinite),
    );
    if (
      !rawValues.length ||
      rawValues.every((value) => value === 0) ||
      year === null
    ) {
      const emptyState = document.createElement("p");
      emptyState.className = "data-chart__empty";
      emptyState.setAttribute("role", "status");
      emptyState.textContent =
        "No data exists for the selected time range.";
      this.replaceChildren(emptyState);
      return;
    }

    const height = 300;
    const plot = { top: 24, right: 12, bottom: 48, left: 48 };
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    const intervalWidth = plotWidth / 12;
    const plots = barPlots(series);
    const values = scaleValues(series, plots);
    const scale = buildDataChartScale(values);
    const span = Math.max(scale.max - scale.min, 1);
    const x = (index: number) =>
      plot.left + intervalWidth * (index + 0.5);
    const y = (value: number) =>
      plot.top + ((scale.max - value) / span) * plotHeight;
    const formatter = this.#data.valueFormatter ?? ((value: number) => axisMoney.format(value));
    const valueAt = (item: DataChartSeries, index: number): DataChartPoint | undefined =>
      item.points.find((point) => monthIndex(point.date) === index);
    const zeroY = y(0);
    const plotGap = Math.min(4, intervalWidth * 0.06);
    const barAreaWidth = intervalWidth * 0.82;
    const barWidth = Math.max(
      0,
      Math.min(
        56,
        (barAreaWidth - plotGap * Math.max(plots.length - 1, 0)) /
          Math.max(plots.length, 1),
      ),
    );
    const plotWidths = plots.map((plot) =>
      barWidth * Math.max(0.1, Math.min(1, plot.series[0]?.barWidthScale ?? 1)),
    );
    const barGroupWidth =
      plotWidths.reduce((total, width) => total + width, 0) +
      Math.max(plots.length - 1, 0) * plotGap;
    const plotCenterX = (plotIndex: number, index: number) => {
      const priorWidths = plotWidths
        .slice(0, plotIndex)
        .reduce((total, plotWidth) => total + plotWidth, 0);
      return x(index) - barGroupWidth / 2 + priorWidths +
        plotIndex * plotGap + plotWidths[plotIndex] / 2;
    };
    const peakState: { current: DataChartPeak | null } = { current: null };
    const considerPeak = (candidate: DataChartPeak): void => {
      if (!Number.isFinite(candidate.value) || candidate.value === 0) return;
      if (!peakState.current || candidate.value > peakState.current.value) {
        peakState.current = candidate;
      }
    };
    plots.forEach((barPlot, plotIndex) => {
      if (barPlot.series.some((item) => item.variant === "secondary")) return;
      if (!barPlot.stacked) {
        const item = barPlot.series[0];
        item.points.forEach((point) => {
          const index = monthIndex(point.date);
          if (index >= 0) considerPeak({
            index,
            kind: "bar",
            palette: item.palette ?? "savings",
            plotIndex,
            value: Number(point.value),
          });
        });
        return;
      }
      for (let index = 0; index < 12; index += 1) {
        const positiveTotal = barPlot.series.reduce((total, item) => {
          const value = Number(valueAt(item, index)?.value);
          return Number.isFinite(value) && value > 0 ? total + value : total;
        }, 0);
        considerPeak({
          index,
          kind: "bar",
          palette: barPlot.series[0]?.palette ?? "savings",
          plotIndex,
          value: positiveTotal,
        });
      }
    });
    series
      .filter((item) => item.type === "line" && item.variant !== "secondary")
      .forEach((item) => item.points.forEach((point) => {
        const index = monthIndex(point.date);
        if (index >= 0) considerPeak({
          index,
          kind: "line",
          palette: item.palette ?? "income",
          series: item,
          value: Number(point.value),
        });
      }));
    const peak = peakState.current;

    const grid = scale.ticks
      .map(
        (tick) =>
          `<line class="data-chart__gridline" x1="${plot.left}" y1="${y(tick)}" x2="${width - plot.right}" y2="${y(tick)}"><title>${escapeXML(formatter(tick))}</title></line><text class="data-chart__axis-label" x="0" y="${y(tick) + 4}" text-anchor="start">${escapeXML(formatter(tick))}</text>`,
      )
      .join("");

    const renderedBars = plots
      .map((barPlot, plotIndex) => {
        const currentBarWidth = plotWidths[plotIndex];
        const barX = (index: number) => plotCenterX(plotIndex, index);
        if (!barPlot.stacked) {
          return barPlot.series
            .map((item) => {
              const variant = item.variant ?? "primary";
              return item.points
                .map((point) => {
                  const index = monthIndex(point.date);
                  if (index < 0) return "";
                  const valueY = y(point.value);
                  const top = Math.min(valueY, zeroY);
                  const barHeight =
                    point.value === 0 ? 0 : Math.abs(valueY - zeroY);
                  return `<rect class="data-chart__bar is-${variant} is-palette-${item.palette ?? "savings"}" data-month-index="${index}" x="${barX(index) - currentBarWidth / 2}" y="${point.value === 0 ? zeroY : top}" width="${currentBarWidth}" height="${barHeight}" />`;
                })
                .join("");
            })
            .join("");
        }

        const offsets = Array.from({ length: 12 }, () => ({
          positive: 0,
          negative: 0,
        }));
        return barPlot.series
          .map((item, stackLevel) =>
            item.points
              .map((point) => {
                const index = monthIndex(point.date);
                const value = Number(point.value);
                if (index < 0 || !Number.isFinite(value)) return "";
                const direction = value >= 0 ? "positive" : "negative";
                const start = offsets[index][direction];
                const end = start + value;
                offsets[index][direction] = end;
                const startY = y(start);
                const endY = y(end);
                const top = Math.min(startY, endY);
                const barHeight = value === 0 ? 0 : Math.abs(endY - startY);
                return `<rect class="data-chart__bar is-stacked is-stack-level-${Math.min(stackLevel, 2)} is-palette-${item.palette ?? "savings"}" data-month-index="${index}" x="${barX(index) - currentBarWidth / 2}" y="${value === 0 ? startY : top}" width="${currentBarWidth}" height="${barHeight}" />`;
              })
              .join(""),
          )
          .join("");
      })
      .join("");

    const renderedLines = series
      .filter((item) => item.type === "line")
      .map((item) => {
        const variant = item.variant ?? "primary";
        const points = Array.from({ length: 12 }, (_, index) => valueAt(item, index));
        const path = points
          .map((point, index) => (point ? `${index === 0 || !points[index - 1] ? "M" : "L"}${x(index)},${y(point.value)}` : ""))
          .join(" ");
        const dots = this.#data.format === "monthly"
          ? points
              .map((point, index) => {
                if (!point) return "";
                const labeled = peak?.kind === "line" &&
                  peak.series === item && peak.index === index;
                return `<circle class="data-chart__point is-${variant} is-palette-${item.palette ?? "income"}${labeled ? " is-labeled" : ""}" data-month-index="${index}" cx="${x(index)}" cy="${y(point.value)}" r="${labeled ? 4 : 3}" />`;
              })
              .join("")
          : "";
        return `<path class="data-chart__line is-${variant} is-palette-${item.palette ?? "income"}" d="${path}" />${dots}`;
      })
      .join("");

    const renderedMarkers = series
      .filter((item) => item.type === "value-marker")
      .map((item) => {
        const markerWidth = plotWidths[0] ?? barWidth;
        return item.points
          .map((point) => {
            const index = monthIndex(point.date);
            const value = Number(point.value);
            if (index < 0 || !Number.isFinite(value)) return "";
            const centerX = x(index);
            const valueY = y(value);
            const top = Math.min(valueY, zeroY);
            const markerHeight = value === 0 ? 0 : Math.abs(valueY - zeroY);
            return `<rect class="data-chart__bar data-chart__value-marker is-secondary is-palette-${item.palette ?? "savings"}" data-month-index="${index}" x="${centerX - markerWidth / 2}" y="${value === 0 ? zeroY : top}" width="${markerWidth}" height="${markerHeight}" />`;
          })
          .join("");
      })
      .join("");

    const renderedPeakLabel = peak
      ? `<text class="data-chart__value-label is-palette-${peak.palette}" x="${peak.kind === "line" ? x(peak.index) : plotCenterX(peak.plotIndex ?? 0, peak.index)}" y="${Math.max(12, y(peak.value) - 9)}" text-anchor="middle">${escapeXML(formatter(peak.value))}</text>`
      : "";

    const labelStep = width < 480 ? 3 : width < 680 ? 2 : 1;
    const labels = MONTHS.map((label, index) =>
      index % labelStep === 0
        ? `<text class="data-chart__month-label" x="${x(index)}" y="${height - 14}" text-anchor="middle">${label}</text>`
        : "",
    ).join("");
    const ariaLabel = this.#data.ariaLabel ?? `Chart for ${year}`;
    this.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXML(ariaLabel)}"><g aria-hidden="true">${grid}<line class="data-chart__zero" x1="${plot.left}" y1="${zeroY}" x2="${width - plot.right}" y2="${zeroY}" /><g class="data-chart__scrub-layer" data-scrub-layer hidden><line class="data-chart__scrub-guide" data-scrub-guide x1="${x(0)}" y1="${plot.top}" x2="${x(0)}" y2="${height - plot.bottom}" /></g>${renderedMarkers}${renderedBars}${renderedLines}${renderedPeakLabel}${labels}</g><rect class="data-chart__hitbox" data-scrub-hitbox x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" tabindex="0" role="slider" aria-label="Explore ${year} data by month" aria-valuemin="1" aria-valuemax="12" aria-valuenow="1" /></svg>`;
    this.#cleanupInteraction = this.#mountInteraction({
      formatter,
      height,
      intervalWidth,
      plot,
      series,
      width,
      x,
      year,
    });
  }

  #mountInteraction(options: {
    formatter: (value: number) => string;
    height: number;
    intervalWidth: number;
    plot: { top: number; right: number; bottom: number; left: number };
    series: readonly DataChartSeries[];
    width: number;
    x: (index: number) => number;
    year: number;
  }): () => void {
    const { formatter, height, intervalWidth, plot, series, width, x, year } =
      options;
    const svg = this.querySelector<SVGSVGElement>("svg")!;
    const hitbox = svg.querySelector<SVGRectElement>("[data-scrub-hitbox]")!;
    const layer = svg.querySelector<SVGGElement>("[data-scrub-layer]")!;
    const guide = svg.querySelector<SVGLineElement>("[data-scrub-guide]")!;
    const marks = Array.from(
      svg.querySelectorAll<SVGGraphicsElement>("[data-month-index]"),
    );
    const overlayManager = document.querySelector<HTMLElement>(
      "overlay-manager",
    ) as (HTMLElement & {
      showTooltip: (
        anchor: HTMLElement,
        content: Node,
        options: { side: "top"; align: "center"; gap: number },
      ) => void;
      hideTooltip: () => void;
    }) | null;
    const tooltipAnchor = document.createElement("span");
    tooltipAnchor.className = "data-chart__tooltip-anchor";
    tooltipAnchor.setAttribute("aria-hidden", "true");
    this.append(tooltipAnchor);
    let activeIndex = 0;
    let dragging = false;

    const valueAt = (
      item: DataChartSeries,
      index: number,
    ): DataChartPoint | undefined =>
      item.points.find((point) => monthIndex(point.date) === index);
    const stackLevels = new Map<DataChartSeries, number>();
    barPlots(series)
      .filter((plot) => plot.stacked)
      .forEach((plot) =>
        plot.series.forEach((item, index) => stackLevels.set(item, index)),
      );

    const tooltipContent = (index: number): HTMLDivElement => {
      const content = document.createElement("div");
      content.className = "data-chart__tooltip";
      const title = document.createElement("strong");
      title.className = "data-chart__tooltip-title";
      title.textContent = `${LONG_MONTHS[index]} ${year}`;
      content.append(title);
      series.forEach((item) => {
        const point = valueAt(item, index);
        if (!point || point.value === 0) return;
        const row = document.createElement("div");
        row.className = "data-chart__tooltip-row";
        const swatch = document.createElement("i");
        const stackLevel = stackLevels.get(item);
        const swatchType = item.type === "value-marker" ? "bar" : item.type;
        swatch.className = stackLevel === undefined
          ? `is-${swatchType} is-${item.type === "value-marker" ? "secondary" : item.variant ?? "primary"} is-palette-${item.palette ?? (item.type === "value-marker" ? "savings" : "income")}`
          : `is-bar is-stack-level-${Math.min(stackLevel, 2)} is-palette-${item.palette ?? "savings"}`;
        swatch.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "data-chart__tooltip-label";
        label.textContent = item.label ?? "Value";
        const value = document.createElement("span");
        value.className = "data-chart__tooltip-value";
        value.textContent = point ? formatter(point.value) : "—";
        row.append(swatch, label, value);
        content.append(row);
      });
      return content;
    };

    const show = (index: number): void => {
      activeIndex = Math.max(0, Math.min(11, index));
      const pointX = x(activeIndex);
      guide.setAttribute("x1", String(pointX));
      guide.setAttribute("x2", String(pointX));
      marks.forEach((mark) =>
        mark.classList.toggle(
          "is-active",
          mark.dataset.monthIndex === String(activeIndex),
        ),
      );
      layer.removeAttribute("hidden");
      hitbox.setAttribute("aria-valuenow", String(activeIndex + 1));
      const values = series
        .map((item) => {
          const point = valueAt(item, activeIndex);
          return point && point.value !== 0
            ? `${item.label ?? "Value"} ${formatter(point.value)}`
            : null;
        })
        .filter((value): value is string => value !== null)
        .join(", ");
      hitbox.setAttribute(
        "aria-valuetext",
        `${LONG_MONTHS[activeIndex]} ${year}, ${values}`,
      );
      if (!overlayManager) return;
      const svgBounds = svg.getBoundingClientRect();
      const hostBounds = this.getBoundingClientRect();
      tooltipAnchor.style.left = `${svgBounds.left - hostBounds.left + (pointX / width) * svgBounds.width}px`;
      tooltipAnchor.style.top = `${svgBounds.top - hostBounds.top + (plot.top / height) * svgBounds.height}px`;
      overlayManager.showTooltip(tooltipAnchor, tooltipContent(activeIndex), {
        side: "top",
        align: "center",
        gap: 8,
      });
    };

    const chartPointFromPointer = (
      event: PointerEvent,
    ): { x: number; y: number } => {
      const bounds = svg.getBoundingClientRect();
      return {
        x: ((event.clientX - bounds.left) / bounds.width) * width,
        y: ((event.clientY - bounds.top) / bounds.height) * height,
      };
    };
    const indexFromX = (svgX: number): number => {
      return Math.max(
        0,
        Math.min(11, Math.floor((svgX - plot.left) / intervalWidth)),
      );
    };
    const handlePointerDown = (event: PointerEvent): void => {
      dragging = true;
      hitbox.setPointerCapture?.(event.pointerId);
      show(indexFromX(chartPointFromPointer(event).x));
    };
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch" && !dragging) return;
      const point = chartPointFromPointer(event);
      const insidePlot =
        point.x >= plot.left &&
        point.x <= width - plot.right &&
        point.y >= plot.top &&
        point.y <= height - plot.bottom;
      if (!insidePlot) {
        hide();
        return;
      }
      show(indexFromX(point.x));
    };
    const handlePointerUp = (event: PointerEvent): void => {
      dragging = false;
      hitbox.releasePointerCapture?.(event.pointerId);
    };
    const hide = (): void => {
      if (dragging) return;
      overlayManager?.hideTooltip();
      layer.setAttribute("hidden", "");
      marks.forEach((mark) => mark.classList.remove("is-active"));
    };
    const handleKeydown = (event: KeyboardEvent): void => {
      const next = (
        {
          ArrowLeft: activeIndex - 1,
          ArrowDown: activeIndex - 1,
          ArrowRight: activeIndex + 1,
          ArrowUp: activeIndex + 1,
          Home: 0,
          End: 11,
        } as Partial<Record<string, number>>
      )[event.key];
      if (next === undefined) return;
      event.preventDefault();
      show(next);
    };
    const handleFocus = (): void => show(activeIndex);

    hitbox.addEventListener("pointerdown", handlePointerDown);
    hitbox.addEventListener("pointerup", handlePointerUp);
    hitbox.addEventListener("pointercancel", handlePointerUp);
    hitbox.addEventListener("focus", handleFocus);
    hitbox.addEventListener("blur", hide);
    hitbox.addEventListener("keydown", handleKeydown);
    this.addEventListener("pointermove", handlePointerMove);
    this.addEventListener("pointerleave", hide);
    return () => {
      hitbox.removeEventListener("pointerdown", handlePointerDown);
      hitbox.removeEventListener("pointerup", handlePointerUp);
      hitbox.removeEventListener("pointercancel", handlePointerUp);
      hitbox.removeEventListener("focus", handleFocus);
      hitbox.removeEventListener("blur", hide);
      hitbox.removeEventListener("keydown", handleKeydown);
      this.removeEventListener("pointermove", handlePointerMove);
      this.removeEventListener("pointerleave", hide);
      overlayManager?.hideTooltip();
      tooltipAnchor.remove();
    };
  }
}

if (!customElements.get("data-chart")) {
  customElements.define("data-chart", DataChart);
}
