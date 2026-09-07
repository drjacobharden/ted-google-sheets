import type {
  AnnualSpendingHeatmap,
  SpendingHeatmapDay,
} from "../../utilities/annual-spending-heatmap";
import { formatTreemapCurrency } from "../chart-treemap/formatters";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const HORIZONTAL_PADDING = 4;
const VERTICAL_PADDING = 20;
const DAY_MS = 86_400_000;
const LEFT_LABEL_WIDTH = 16;
const TOP_LABEL_HEIGHT = 34;
const CELL_GAP = 1;
const MIN_CELL_SIZE = 10;
const BASE_COLUMNS = 52;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

function escapeXML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

function dateLabel(date: string): string {
  return LONG_DATE_FORMATTER.format(new Date(`${date}T00:00:00Z`));
}

function daysInYear(year: number): number {
  return Math.round(
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000,
  );
}

function dayAriaLabel(
  day: SpendingHeatmapDay,
  variant: AnnualSpendingHeatmap["variant"] = "spending",
): string {
  return `${dateLabel(day.date)}, ${formatTreemapCurrency(day.spend)} ${variant === "investment" ? "contributed" : "spent"}`;
}

export class SpendingHeatmapChart extends HTMLElement implements EventListenerObject {
  #data: AnnualSpendingHeatmap | null = null;
  #highlightedDayIds = new Set<string>();
  #highlightZeroSpendDays = false;
  #renderedDays: SpendingHeatmapDay[] = [];
  #resizeObserver: ResizeObserver | null = null;
  #renderedWidth = 0;
  #tooltipAnchor: HTMLElement | null = null;
  #listening = false;

  set data(value: AnnualSpendingHeatmap | null) {
    this.#data = value;
    if (this.isConnected) this.#render();
  }

  get data(): AnnualSpendingHeatmap | null {
    return this.#data;
  }

  set highlightedDayIds(value: readonly string[] | null) {
    this.#highlightedDayIds = new Set(value ?? []);
    this.#updateHighlightClasses();
  }

  get highlightedDayIds(): readonly string[] {
    return [...this.#highlightedDayIds];
  }

  set highlightZeroSpendDays(value: boolean) {
    this.#highlightZeroSpendDays = value;
    this.#updateHighlightClasses();
  }

  get highlightZeroSpendDays(): boolean {
    return this.#highlightZeroSpendDays;
  }

  connectedCallback(): void {
    if (!this.#listening) {
      this.#listening = true;
      this.addEventListener("pointerover", this);
      this.addEventListener("pointerout", this);
      this.addEventListener("pointerdown", this);
      this.addEventListener("focusin", this);
      this.addEventListener("focusout", this);
    }
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
    this.#hideTooltip();
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("pointerover", this);
    this.removeEventListener("pointerout", this);
    this.removeEventListener("pointerdown", this);
    this.removeEventListener("focusin", this);
    this.removeEventListener("focusout", this);
  }

  handleEvent(event: Event): void {
    const day = this.#dayFromEvent(event);
    if (!day) return;
    if (event.type === "pointerover" || event.type === "pointerdown" || event.type === "focusin") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (event.type !== "pointerdown" && relatedTarget instanceof Node && day.contains(relatedTarget)) return;
      this.#setActive(day, true);
      this.#showTooltip(day);
      return;
    }
    const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
    if (relatedTarget instanceof Node && day.contains(relatedTarget)) return;
    this.#setActive(day, false);
    this.#hideTooltip();
  }

  #chartWidth(): number {
    return Math.max(1, Math.round(this.clientWidth || 840));
  }

  #dayFromEvent(event: Event): SVGGElement | null {
    const target = event.target;
    return target instanceof Element
      ? target.closest<SVGGElement>(".spending-heatmap-chart__day")
      : null;
  }

  #setActive(day: SVGGElement, active: boolean): void {
    if (active) {
      this.querySelectorAll<SVGGElement>(".spending-heatmap-chart__day.is-active").forEach((item) => {
        if (item !== day) item.classList.remove("is-active");
      });
    }
    day.classList.toggle("is-active", active);
  }

  #updateHighlightClasses(): void {
    const shouldDim = this.#highlightedDayIds.size > 0;
    this.querySelectorAll<SVGGElement>(".spending-heatmap-chart__day").forEach((day) => {
      const highlighted = this.#highlightedDayIds.has(day.dataset.dayId ?? "");
      const datum = this.#renderedDays.find((item) => item.id === day.dataset.dayId);
      const emphasizeZeroSpend = highlighted && this.#highlightZeroSpendDays && (datum?.spend ?? 0) <= 0;
      day.classList.toggle("is-highlighted", highlighted);
      day.classList.toggle("is-zero-spend-highlighted", emphasizeZeroSpend);
      day.classList.toggle("is-dimmed", shouldDim && !highlighted);
    });
  }

  #showTooltip(day: SVGGElement): void {
    const datum = this.#renderedDays.find((item) => item.id === day.dataset.dayId);
    const anchor = this.#tooltipAnchor;
    const rect = day.querySelector<SVGRectElement>(".spending-heatmap-chart__cell");
    if (!datum || !anchor || !rect) return;

    const hostRect = this.getBoundingClientRect();
    const cellRect = rect.getBoundingClientRect();
    anchor.style.left = `${cellRect.left - hostRect.left + cellRect.width / 2}px`;
    anchor.style.top = `${cellRect.top - hostRect.top}px`;

    const content = document.createElement("div");
    content.className = "data-chart__tooltip spending-heatmap-chart__tooltip";
    const title = document.createElement("strong");
    title.className = "data-chart__tooltip-title";
    title.textContent = dateLabel(datum.date);
    const row = document.createElement("div");
    row.className = "data-chart__tooltip-row";
    const swatch = document.createElement("i");
    swatch.className = this.#data?.variant === "investment"
      ? "is-palette-savings"
      : "is-palette-expense";
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "data-chart__tooltip-label";
    label.textContent = this.#data?.variant === "investment" ? "Contributed" : "Spend";
    const value = document.createElement("span");
    value.className = "data-chart__tooltip-value";
    value.textContent = formatTreemapCurrency(datum.spend);
    row.append(swatch, label, value);
    content.append(title, row);

    const overlay = document.querySelector<HTMLElement>("overlay-manager") as
      | (HTMLElement & { showTooltip(anchor: HTMLElement, content: Node, options: { side: "top"; align: "center"; gap: number }): void })
      | null;
    overlay?.showTooltip(anchor, content, { side: "top", align: "center", gap: 8 });
  }

  #hideTooltip(): void {
    const overlay = document.querySelector<HTMLElement>("overlay-manager") as
      | (HTMLElement & { hideTooltip(): void })
      | null;
    overlay?.hideTooltip();
  }

  #render(): void {
    this.#hideTooltip();
    const data = this.#data;
    const width = this.#chartWidth();
    this.#renderedWidth = width;
    this.dataset.variant = data?.variant ?? "spending";
    if (!data?.hasData) {
      const empty = document.createElement("p");
      empty.className = "spending-heatmap-chart__empty";
      empty.setAttribute("role", "status");
      empty.textContent = data?.variant === "investment"
        ? "No investment contributions for this year."
        : "No spending for this year.";
      this.#renderedDays = [];
      this.#tooltipAnchor = null;
      this.replaceChildren(empty);
      return;
    }

    const gridX = HORIZONTAL_PADDING + LEFT_LABEL_WIDTH;
    const gridY = VERTICAL_PADDING + TOP_LABEL_HEIGHT;
    const columnCount = Math.max(
      BASE_COLUMNS,
      ...data.days.map((day) => day.week + 1),
    );
    const chartWidth = Math.max(width, 760);
    const cellSize = Math.max(
      MIN_CELL_SIZE,
      (chartWidth - gridX - HORIZONTAL_PADDING - (columnCount - 1) * CELL_GAP) / columnCount,
    );
    const gridWidth = columnCount * cellSize + (columnCount - 1) * CELL_GAP;
    const gridHeight = DAY_LABELS.length * cellSize + (DAY_LABELS.length - 1) * CELL_GAP;
    const chartHeight = gridY + gridHeight + VERTICAL_PADDING;
    const firstWeekday = new Date(Date.UTC(data.year, 0, 1)).getUTCDay();
    const yearDayCount = daysInYear(data.year);
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("spending-heatmap-chart__svg");
    svg.setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `${data.variant === "investment" ? "Daily investment contribution" : "Daily spending"} heatmap for ${data.year}`,
    );
    const monthLabels = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = Date.UTC(data.year, monthIndex, 1);
      const dayOfYear = Math.round((monthStart - Date.UTC(data.year, 0, 1)) / DAY_MS);
      const week = Math.floor((dayOfYear + firstWeekday) / 7);
      const x = gridX + week * (cellSize + CELL_GAP) + cellSize / 2;
      return `<text class="spending-heatmap-chart__month-label" x="${x}" y="${VERTICAL_PADDING + 10}" text-anchor="middle">${MONTH_LABEL_FORMATTER.format(new Date(monthStart))}</text>`;
    })
      .join("");
    svg.insertAdjacentHTML("beforeend", monthLabels);
    svg.insertAdjacentHTML(
      "beforeend",
      DAY_LABELS.map((label, index) => `<text class="spending-heatmap-chart__day-label" x="0" y="${gridY + index * (cellSize + CELL_GAP) + cellSize - 2}" text-anchor="start">${label}</text>`).join(""),
    );

    const gridCells = Array.from({ length: columnCount * DAY_LABELS.length }, (_, index) => {
      const column = Math.floor(index / DAY_LABELS.length);
      const row = index % DAY_LABELS.length;
      const x = gridX + column * (cellSize + CELL_GAP);
      const y = gridY + row * (cellSize + CELL_GAP);
      const dayOfYear = column * DAY_LABELS.length + row - firstWeekday;
      const isCalendarDay = dayOfYear >= 0 && dayOfYear < yearDayCount;
      const className = `spending-heatmap-chart__grid-cell${isCalendarDay ? " is-calendar-day" : ""}`;
      return `<rect class="${className}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"></rect>`;
    }).join("");
    svg.insertAdjacentHTML("beforeend", gridCells);

    const byCell = new Map<string, SpendingHeatmapDay[]>();
    data.days.forEach((day) => {
      const key = `${day.week}:${day.weekday}`;
      const group = byCell.get(key) ?? [];
      group.push(day);
      byCell.set(key, group);
    });
    this.#renderedDays = data.days;
    const cells = [...byCell.values()].flatMap((days) => {
      const count = days.length;
      const segmentGap = count > 1 ? 1 : 0;
      const cellWidth = (cellSize - segmentGap * (count - 1)) / count;
      return days.map((day, index) => {
        const x = gridX + day.week * (cellSize + CELL_GAP) + index * (cellWidth + segmentGap);
        const y = gridY + day.weekday * (cellSize + CELL_GAP);
        const highlighted = this.#highlightedDayIds.has(day.id);
        const emphasizeZeroSpend = highlighted && this.#highlightZeroSpendDays && day.spend <= 0;
        const dimmed = this.#highlightedDayIds.size > 0 && !highlighted;
        const stateClasses = `${highlighted ? " is-highlighted" : ""}${emphasizeZeroSpend ? " is-zero-spend-highlighted" : ""}${dimmed ? " is-dimmed" : ""}`;
        return `<g class="spending-heatmap-chart__day is-level-${day.level}${stateClasses}" data-day-id="${escapeXML(day.id)}" tabindex="0" role="img" aria-label="${escapeXML(dayAriaLabel(day))}"><rect class="spending-heatmap-chart__cell" x="${x}" y="${y}" width="${cellWidth}" height="${cellSize}"></rect></g>`;
      });
    }).join("");
    svg.insertAdjacentHTML("beforeend", cells);

    const summary = document.createElement("ol");
    summary.className = "visually-hidden";
    summary.setAttribute("aria-label", "Daily spending summary");
    data.days.filter((day) => day.spend > 0).forEach((day) => {
      const item = document.createElement("li");
      item.textContent = dayAriaLabel(day, data.variant);
      summary.append(item);
    });
    const anchor = document.createElement("span");
    anchor.className = "spending-heatmap-chart__tooltip-anchor";
    anchor.setAttribute("aria-hidden", "true");
    this.replaceChildren(svg, summary, anchor);
    this.#tooltipAnchor = anchor;
  }
}

if (!customElements.get("spending-heatmap-chart")) {
  customElements.define("spending-heatmap-chart", SpendingHeatmapChart);
}
