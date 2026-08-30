import { buildCurrencyAxisScale } from "../../utilities/currency-axis-scale";

export type DataChartType = "bar" | "line";
export type DataChartVariant = "primary" | "secondary";
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
  label?: string;
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

function niceScale(values: readonly number[]): {
  min: number;
  max: number;
  ticks: number[];
} {
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  if (minimum === maximum) {
    const scale = buildCurrencyAxisScale(Math.abs(maximum) || 1);
    return { min: 0, max: scale.maximum, ticks: scale.ticks };
  }

  const roughStep = (maximum - minimum) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude;
  const min = Math.floor(minimum / step) * step;
  const max = Math.ceil(maximum / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.push(Math.abs(value) < step / 1000 ? 0 : value);
  }
  return { min, max, ticks };
}

function escapeXML(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
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
    const values = series.flatMap((item) =>
      item.points.map((point) => Number(point.value)).filter(Number.isFinite),
    );
    if (
      !values.length ||
      values.every((value) => value === 0) ||
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
    const scale = niceScale(values);
    const span = Math.max(scale.max - scale.min, 1);
    const x = (index: number) =>
      plot.left + intervalWidth * (index + 0.5);
    const y = (value: number) =>
      plot.top + ((scale.max - value) / span) * plotHeight;
    const formatter = this.#data.valueFormatter ?? ((value: number) => axisMoney.format(value));
    const valueAt = (item: DataChartSeries, index: number): DataChartPoint | undefined =>
      item.points.find((point) => monthIndex(point.date) === index);
    const zeroY = y(0);
    const bars = series.filter((item) => item.type === "bar");
    const barWidth = Math.max(
      5,
      Math.min(56, intervalWidth / Math.max(bars.length, 1) - 4),
    );

    const grid = scale.ticks
      .map(
        (tick) =>
          `<line class="data-chart__gridline" x1="${plot.left}" y1="${y(tick)}" x2="${width - plot.right}" y2="${y(tick)}"><title>${escapeXML(formatter(tick))}</title></line><text class="data-chart__axis-label" x="0" y="${y(tick) + 4}" text-anchor="start">${escapeXML(formatter(tick))}</text>`,
      )
      .join("");

    const renderedBars = bars
      .map((item, seriesIndex) => {
        const variant = item.variant ?? "primary";
        return item.points
          .map((point) => {
            const index = monthIndex(point.date);
            if (index < 0) return "";
            const valueY = y(point.value);
            const top = Math.min(valueY, zeroY);
            const barHeight = point.value === 0 ? 0 : Math.abs(valueY - zeroY);
            const offset = (seriesIndex - (bars.length - 1) / 2) * (barWidth + 2);
            return `<rect class="data-chart__bar is-${variant}" data-month-index="${index}" x="${x(index) - barWidth / 2 + offset}" y="${point.value === 0 ? zeroY : top}" width="${barWidth}" height="${barHeight}" />`;
          })
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
                return `<circle class="data-chart__point is-${variant}" data-month-index="${index}" cx="${x(index)}" cy="${y(point.value)}" r="3" />`;
              })
              .join("")
          : "";
        return `<path class="data-chart__line is-${variant}" d="${path}" />${dots}`;
      })
      .join("");

    const labelStep = width < 480 ? 3 : width < 680 ? 2 : 1;
    const labels = MONTHS.map((label, index) =>
      index % labelStep === 0
        ? `<text class="data-chart__month-label" x="${x(index)}" y="${height - 14}" text-anchor="middle">${label}</text>`
        : "",
    ).join("");
    const ariaLabel = this.#data.ariaLabel ?? `Chart for ${year}`;
    this.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXML(ariaLabel)}"><g aria-hidden="true">${grid}<line class="data-chart__zero" x1="${plot.left}" y1="${zeroY}" x2="${width - plot.right}" y2="${zeroY}" /><g class="data-chart__scrub-layer" data-scrub-layer hidden><line class="data-chart__scrub-guide" data-scrub-guide x1="${x(0)}" y1="${plot.top}" x2="${x(0)}" y2="${height - plot.bottom}" /></g>${renderedBars}${renderedLines}${labels}</g><rect class="data-chart__hitbox" data-scrub-hitbox x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" tabindex="0" role="slider" aria-label="Explore ${year} data by month" aria-valuemin="1" aria-valuemax="12" aria-valuenow="1" /></svg>`;
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

    const tooltipContent = (index: number): HTMLDivElement => {
      const content = document.createElement("div");
      content.className = "data-chart__tooltip";
      const title = document.createElement("strong");
      title.className = "data-chart__tooltip-title";
      title.textContent = `${LONG_MONTHS[index]} ${year}`;
      content.append(title);
      series.forEach((item) => {
        const point = valueAt(item, index);
        const row = document.createElement("div");
        row.className = "data-chart__tooltip-row";
        const swatch = document.createElement("i");
        swatch.className = `is-${item.type} is-${item.variant ?? "primary"}`;
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
          return `${item.label ?? "Value"} ${point ? formatter(point.value) : "unavailable"}`;
        })
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
