import type { CategoryScatterDatum } from "../../utilities/annual-category-spending";
import {
  formatTreemapCompactCurrency,
  formatTreemapCurrency,
} from "../chart-treemap/formatters";
import {
  calculateBubbleRadius,
  calculateMean,
  generateLinearTicks,
  mapLinearValue,
  PLOT_INSET_PERCENT,
} from "./category-scatter-layout";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CHART_ASPECT_RATIO = 0.58;
const MARGIN = { top: 34, right: 18, bottom: 58, left: 62 };
const MIN_BUBBLE_RADIUS = 6;
const MAX_BUBBLE_RADIUS = 24;
const HIT_RADIUS_PADDING = 7;

interface RenderedPoint extends CategoryScatterDatum {
  x: number;
  y: number;
  quadrant: string;
  radius: number;
}

function escapeXML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

function pointLabel(point: CategoryScatterDatum): string {
  return `${point.label}, ${point.transactionCount} transactions, average ${formatTreemapCurrency(point.averageTransaction)}, total spend ${formatTreemapCurrency(point.totalSpend)}`;
}

function quadrantLabel(point: RenderedPoint): string {
  const frequency = point.quadrant.includes("high-frequency")
    ? "high frequency"
    : "low frequency";
  const average = point.quadrant.includes("high-average")
    ? "high average transaction"
    : "low average transaction";
  return `${frequency}, ${average}`;
}

export class CategoryScatterChart extends HTMLElement implements EventListenerObject {
  #data: readonly CategoryScatterDatum[] = [];
  #renderedData: RenderedPoint[] = [];
  #resizeObserver: ResizeObserver | null = null;
  #renderedWidth = 0;
  #tooltipAnchor: HTMLElement | null = null;
  #listening = false;

  set data(value: readonly CategoryScatterDatum[]) {
    this.#data = Array.isArray(value) ? value.slice() : [];
    if (this.isConnected) this.#render();
  }

  get data(): readonly CategoryScatterDatum[] {
    return this.#data;
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
    const point = this.#pointFromEvent(event);
    if (!point) return;

    if (
      event.type === "pointerover" ||
      event.type === "pointerdown" ||
      event.type === "focusin"
    ) {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (
        event.type !== "pointerdown" &&
        relatedTarget instanceof Node &&
        point.contains(relatedTarget)
      ) {
        return;
      }
      this.#setActive(point, true);
      this.#showTooltip(point);
      return;
    }

    if (event.type === "pointerout" || event.type === "focusout") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (relatedTarget instanceof Node && point.contains(relatedTarget)) return;
      this.#setActive(point, false);
      this.#hideTooltip();
    }
  }

  #chartWidth(): number {
    return Math.max(1, Math.round(this.clientWidth || 720));
  }

  #chartHeight(width: number): number {
    return Math.max(260, Math.round(width * CHART_ASPECT_RATIO));
  }

  #pointFromEvent(event: Event): SVGGElement | null {
    const target = event.target;
    return target instanceof Element
      ? target.closest<SVGGElement>(".category-scatter-chart__point")
      : null;
  }

  #setActive(point: SVGGElement, active: boolean): void {
    if (active) {
      this.querySelectorAll<SVGGElement>(".category-scatter-chart__point.is-active").forEach(
        (item) => {
          if (item !== point) item.classList.remove("is-active");
        },
      );
    }
    point.classList.toggle("is-active", active);
  }

  #showTooltip(point: SVGGElement): void {
    const datum = this.#renderedData.find((item) => item.id === point.dataset.categoryId);
    const anchor = this.#tooltipAnchor;
    const circle = point.querySelector<SVGCircleElement>(
      ".category-scatter-chart__point-dot",
    );
    const svg = this.querySelector("svg");
    if (!datum || !anchor || !circle || !svg) return;

    const svgRect = svg.getBoundingClientRect();
    const hostRect = this.getBoundingClientRect();
    const circleRect = circle.getBoundingClientRect();
    anchor.style.left = `${circleRect.left - hostRect.left + circleRect.width / 2}px`;
    anchor.style.top = `${Math.max(svgRect.top, circleRect.top) - hostRect.top}px`;

    const content = document.createElement("div");
    content.className = "data-chart__tooltip category-scatter-chart__tooltip";
    const title = document.createElement("strong");
    title.className = "data-chart__tooltip-title";
    title.textContent = datum.label;

    const row = (labelText: string, valueText: string): HTMLDivElement => {
      const item = document.createElement("div");
      item.className = "data-chart__tooltip-row";
      const swatch = document.createElement("i");
      swatch.className = "is-bar is-palette-expense";
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "data-chart__tooltip-label";
      label.textContent = labelText;
      const value = document.createElement("span");
      value.className = "data-chart__tooltip-value";
      value.textContent = valueText;
      item.append(swatch, label, value);
      return item;
    };

    content.append(
      title,
      row("Transactions", String(datum.transactionCount)),
      row("Average transaction", formatTreemapCurrency(datum.averageTransaction)),
      row("Total spend", formatTreemapCurrency(datum.totalSpend)),
    );

    const overlay = document.querySelector<HTMLElement>("overlay-manager") as
      | (HTMLElement & {
          showTooltip(
            anchor: HTMLElement,
            content: Node,
            options: { side: "top"; align: "center"; gap: number },
          ): void;
        })
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
    const width = this.#chartWidth();
    this.#renderedWidth = width;
    const data = this.#data
      .map((item) => ({
        ...item,
        transactionCount: Number(item.transactionCount),
        averageTransaction: Number(item.averageTransaction),
        totalSpend: Number(item.totalSpend),
      }))
      .filter(
        (item) =>
          item.label &&
          Number.isFinite(item.transactionCount) &&
          item.transactionCount >= 0 &&
          Number.isFinite(item.averageTransaction) &&
          item.averageTransaction >= 0 &&
          Number.isFinite(item.totalSpend) &&
          item.totalSpend > 0,
      );

    if (!data.length) {
      const empty = document.createElement("p");
      empty.className = "category-scatter-chart__empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No category spending for this year.";
      this.#renderedData = [];
      this.#tooltipAnchor = null;
      this.replaceChildren(empty);
      return;
    }

    const minSpend = Math.min(...data.map((item) => item.totalSpend));
    const maxSpend = Math.max(...data.map((item) => item.totalSpend));
    const maximumTransactionCount = Math.max(
      ...data.map((item) => item.transactionCount),
    );
    const maximumAverageTransaction = Math.max(
      ...data.map((item) => item.averageTransaction),
    );
    const transactionTicks = generateLinearTicks(maximumTransactionCount);
    const averageTicks = generateLinearTicks(maximumAverageTransaction);
    const transactionDomainMax = transactionTicks.at(-1) ?? maximumTransactionCount;
    const averageDomainMax = averageTicks.at(-1) ?? maximumAverageTransaction;
    const meanTransactionCount = calculateMean(
      data.map((item) => item.transactionCount),
    );
    const meanAverageTransaction = calculateMean(
      data.map((item) => item.averageTransaction),
    );
    const flatFrequency = data.every(
      (item) => item.transactionCount === data[0]?.transactionCount,
    );
    const flatAverage = data.every(
      (item) => item.averageTransaction === data[0]?.averageTransaction,
    );
    const height = this.#chartHeight(width);
    const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
    const plotHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);
    const plotRight = width - MARGIN.right;
    const plotBottom = height - MARGIN.bottom;
    const maxRenderableRadius = Math.max(
      3,
      Math.min(MAX_BUBBLE_RADIUS, Math.min(plotWidth, plotHeight) / 2 - 2),
    );
    const minRenderableRadius = Math.min(MIN_BUBBLE_RADIUS, maxRenderableRadius);
    const positionInsetPercent = Math.min(
      49,
      Math.max(
        PLOT_INSET_PERCENT,
        ((maxRenderableRadius + HIT_RADIUS_PADDING) / Math.min(plotWidth, plotHeight)) * 100,
      ),
    );
    const xScale = (value: number): number =>
      mapLinearValue(
        value,
        transactionDomainMax,
        MARGIN.left,
        plotWidth,
        false,
        flatFrequency,
        positionInsetPercent,
      );
    const yScale = (value: number): number =>
      mapLinearValue(
        value,
        averageDomainMax,
        MARGIN.top,
        plotHeight,
        true,
        flatAverage,
        positionInsetPercent,
      );
    const meanX = xScale(meanTransactionCount);
    const meanY = yScale(meanAverageTransaction);

    const renderedData: RenderedPoint[] = data.map((item) => {
      const highFrequency = item.transactionCount >= meanTransactionCount;
      const highAverage = item.averageTransaction >= meanAverageTransaction;
      return {
        ...item,
        x: xScale(item.transactionCount),
        y: yScale(item.averageTransaction),
        quadrant: `${highFrequency ? "high-frequency" : "low-frequency"}-${highAverage ? "high-average" : "low-average"}`,
        radius: calculateBubbleRadius(
          item.totalSpend,
          minSpend,
          maxSpend,
          minRenderableRadius,
          maxRenderableRadius,
        ),
      };
    });
    this.#renderedData = renderedData;

    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("category-scatter-chart__svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Category spending by transaction frequency and average transaction value, with circle size representing total spend",
    );

    const desc = document.createElementNS(SVG_NAMESPACE, "desc");
    desc.textContent = `Category positions use raw transaction frequency and average transaction value. The reference lines mark the arithmetic mean of ${meanTransactionCount} transactions and ${formatTreemapCurrency(meanAverageTransaction)} average transaction value. Circle size represents total spend.`;
    svg.append(desc);

    const xTickMarkup = transactionTicks.map((tick) => {
      const x = xScale(tick);
      return `
        <line class="category-scatter-chart__tick-mark" x1="${x}" y1="${plotBottom}" x2="${x}" y2="${plotBottom + 4}"></line>
        <text class="category-scatter-chart__tick" x="${x}" y="${plotBottom + 18}" text-anchor="middle">${Math.round(tick)}</text>`;
    }).join("");
    const yTickMarkup = averageTicks.map((tick) => {
      const y = yScale(tick);
      return `
        <line class="category-scatter-chart__tick-mark" x1="${MARGIN.left - 4}" y1="${y}" x2="${MARGIN.left}" y2="${y}"></line>
        <text class="category-scatter-chart__tick" x="${MARGIN.left - 10}" y="${y}" text-anchor="end" dominant-baseline="middle">${formatTreemapCompactCurrency(tick)}</text>`;
    }).join("");

    const quadrantMarkup = width >= 520
      ? `
      <text class="category-scatter-chart__quadrant-label" x="${MARGIN.left + 8}" y="${MARGIN.top + 14}">BIG HITS</text>
      <text class="category-scatter-chart__quadrant-label" x="${Math.min(meanX + 8, plotRight - 92)}" y="${MARGIN.top + 14}">HEAVY HITTERS</text>
      <text class="category-scatter-chart__quadrant-label" x="${MARGIN.left + 8}" y="${plotBottom - 10}">OCCASIONAL</text>
      <text class="category-scatter-chart__quadrant-label" x="${Math.min(meanX + 8, plotRight - 56)}" y="${plotBottom - 10}">THE DRIP</text>`
      : "";
    const markup = `
      <line class="category-scatter-chart__gridline" x1="${meanX}" y1="${MARGIN.top}" x2="${meanX}" y2="${plotBottom}"></line>
      <line class="category-scatter-chart__gridline" x1="${MARGIN.left}" y1="${meanY}" x2="${plotRight}" y2="${meanY}"></line>
      <line class="category-scatter-chart__axis" x1="${MARGIN.left}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}"></line>
      <line class="category-scatter-chart__axis" x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${plotBottom}"></line>
      ${quadrantMarkup}
      ${xTickMarkup}
      ${yTickMarkup}
      <text class="category-scatter-chart__axis-title" x="${MARGIN.left + plotWidth / 2}" y="${height - 12}" text-anchor="middle">TOTAL TRANSACTIONS</text>
      <text class="category-scatter-chart__axis-title" transform="translate(15 ${MARGIN.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">AVERAGE TRANSACTION</text>`;
    svg.insertAdjacentHTML("beforeend", markup);

    renderedData.forEach((point) => {
      const group = document.createElementNS(SVG_NAMESPACE, "g");
      group.classList.add("category-scatter-chart__point", point.quadrant);
      group.dataset.categoryId = point.id;
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "img");
      group.setAttribute("aria-label", pointLabel(point));

      const hit = document.createElementNS(SVG_NAMESPACE, "circle");
      hit.classList.add("category-scatter-chart__point-hit");
      hit.setAttribute("cx", String(point.x));
      hit.setAttribute("cy", String(point.y));
      hit.setAttribute("r", String(point.radius + HIT_RADIUS_PADDING));

      const dot = document.createElementNS(SVG_NAMESPACE, "circle");
      dot.classList.add("category-scatter-chart__point-dot");
      dot.setAttribute("cx", String(point.x));
      dot.setAttribute("cy", String(point.y));
      dot.setAttribute("r", String(point.radius));

      group.append(hit, dot);
      svg.append(group);
    });

    const summary = document.createElement("ol");
    summary.className = "visually-hidden";
    summary.setAttribute("aria-label", "Category spending scatter plot summary");
    renderedData.forEach((point) => {
      const item = document.createElement("li");
      item.textContent = `${pointLabel(point)}; ${quadrantLabel(point)}.`;
      summary.append(item);
    });

    const anchor = document.createElement("span");
    anchor.className = "category-scatter-chart__tooltip-anchor";
    anchor.setAttribute("aria-hidden", "true");
    this.replaceChildren(svg, summary, anchor);
    this.#tooltipAnchor = anchor;
  }
}

if (!customElements.get("category-scatter-chart")) {
  customElements.define("category-scatter-chart", CategoryScatterChart);
}
