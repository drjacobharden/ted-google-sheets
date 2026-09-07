import {
  formatTreemapCurrency,
  formatTreemapPercentage,
} from "../chart-treemap/formatters";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const BAR_HEIGHT = 24;
const BAR_GAP = 4;
const CHART_TOP = 8;
const CHART_BOTTOM = 8;
const LABEL_GAP = 16;
const MIN_LABEL_WIDTH = 120;
const MAX_LABEL_WIDTH = 220;

export interface HorizontalBarDatum {
  id: string;
  label: string;
  value: number;
  tooltipAmount?: number;
  isInterval?: boolean;
  sizeTier?: number;
  tooltipPercentage?: number;
}

function escapeXML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

function labelText(value: string, width: number): string {
  const maxCharacters = Math.max(8, Math.floor(width / 7));
  return value.length > maxCharacters
    ? `${value.slice(0, Math.max(1, maxCharacters - 1))}…`
    : value;
}

export class HorizontalBarChart extends HTMLElement implements EventListenerObject {
  #data: readonly HorizontalBarDatum[] = [];
  #resizeObserver: ResizeObserver | null = null;
  #renderedWidth = 0;
  #renderedData: HorizontalBarDatum[] = [];
  #tooltipAnchor: HTMLElement | null = null;
  #listening = false;

  set data(value: readonly HorizontalBarDatum[]) {
    this.#data = Array.isArray(value) ? value.slice() : [];
    this.#render();
  }

  get data(): readonly HorizontalBarDatum[] {
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
    const bar = this.#barFromEvent(event);
    if (!bar) return;

    if (event.type === "pointerover" || event.type === "pointerdown" || event.type === "focusin") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (event.type !== "pointerdown" && relatedTarget instanceof Node && bar.contains(relatedTarget)) return;
      this.#setActive(bar, true);
      this.#showTooltip(bar);
      return;
    }

    if (event.type === "pointerout" || event.type === "focusout") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (relatedTarget instanceof Node && bar.contains(relatedTarget)) return;
      this.#setActive(bar, false);
      this.#hideTooltip();
    }
  }

  #chartWidth(): number {
    return Math.max(1, Math.round(this.clientWidth || 680));
  }

  #barFromEvent(event: Event): SVGGElement | null {
    const target = event.target;
    return target instanceof Element
      ? target.closest<SVGGElement>(".horizontal-bar-chart__bar-row")
      : null;
  }

  #setActive(bar: SVGGElement, active: boolean): void {
    if (active) {
      this.querySelectorAll<SVGGElement>(".horizontal-bar-chart__bar-row.is-active").forEach((item) => {
        if (item !== bar) item.classList.remove("is-active");
      });
    }
    bar.classList.toggle("is-active", active);
  }

  #showTooltip(bar: SVGGElement): void {
    const datum = this.#renderedData.find((item) => item.id === bar.dataset.barId);
    const anchor = this.#tooltipAnchor;
    const barRect = bar.querySelector<SVGRectElement>(".horizontal-bar-chart__bar");
    const svg = this.querySelector("svg");
    if (!datum || !anchor || !barRect || !svg) return;

    const svgRect = svg.getBoundingClientRect();
    const hostRect = this.getBoundingClientRect();
    const rect = barRect.getBoundingClientRect();
    anchor.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    anchor.style.top = `${Math.max(svgRect.top, rect.top) - hostRect.top}px`;

    const content = document.createElement("div");
    content.className = "data-chart__tooltip horizontal-bar-chart__tooltip";
    const title = document.createElement("strong");
    title.className = "data-chart__tooltip-title";
    title.textContent = datum.label;
    const row = document.createElement("div");
    row.className = "data-chart__tooltip-row";
    const swatch = document.createElement("i");
    swatch.className = "is-bar is-palette-expense";
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "data-chart__tooltip-label";
    label.textContent = "Total spend";
    const value = document.createElement("span");
    value.className = "data-chart__tooltip-value";
    value.textContent = formatTreemapCurrency(datum.tooltipAmount ?? datum.value);
    row.append(swatch, label, value);
    const percentage = document.createElement("div");
    percentage.className = "horizontal-bar-chart__tooltip-percentage";
    percentage.textContent = `${formatTreemapPercentage(datum.tooltipPercentage ?? 0)} of total spend`;
    content.append(title, row, percentage);

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
    const width = this.#chartWidth();
    this.#renderedWidth = width;
    const rankedData = this.#data
      .map((item) => ({ ...item, value: Number(item.value) }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0)
      .sort((left, right) => {
        if (Boolean(left.isInterval) !== Boolean(right.isInterval)) {
          return left.isInterval ? 1 : -1;
        }
        return right.value - left.value || left.label.localeCompare(right.label);
      });
    const totalValue = rankedData.reduce(
      (sum, item) => sum + (item.tooltipAmount ?? item.value),
      0,
    );
    let cumulativeValue = 0;
    const data = rankedData.map((item) => {
      const tooltipValue = item.tooltipAmount ?? item.value;
      const midpointShare = (cumulativeValue + tooltipValue / 2) / totalValue;
      cumulativeValue += tooltipValue;
      return {
        ...item,
        sizeTier: item.isInterval
          ? 0
          : midpointShare < 0.33
            ? 2
            : midpointShare < 0.67
              ? 1
              : 0,
        tooltipPercentage: (tooltipValue / totalValue) * 100,
      };
    });
    this.#renderedData = data;

    if (!data.length) {
      const empty = document.createElement("p");
      empty.className = "horizontal-bar-chart__empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No vendor spending for this year.";
      this.#tooltipAnchor = null;
      this.replaceChildren(empty);
      return;
    }

    const labelWidth = Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, Math.round(width * 0.3)));
    const plotLeft = labelWidth + LABEL_GAP;
    const plotRight = 4;
    const plotWidth = Math.max(1, width - plotLeft - plotRight);
    const maxValue = data[0]?.value ?? 0;
    const rowHeight = BAR_HEIGHT + BAR_GAP;
    const height = CHART_TOP + data.length * rowHeight - BAR_GAP + CHART_BOTTOM;

    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("horizontal-bar-chart__svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Annual spending by vendor, ranked by amount");

    const markup = data.map((item, index) => {
      const y = CHART_TOP + index * rowHeight;
      const barWidth = Math.max(1, (item.value / maxValue) * plotWidth);
      return `
        <g class="horizontal-bar-chart__bar-row is-size-${item.sizeTier}" data-bar-id="${escapeXML(item.id)}" tabindex="0" role="img" aria-label="${escapeXML(`${item.label}, ${formatTreemapCurrency(item.tooltipAmount ?? item.value)}`)}">
          <text class="horizontal-bar-chart__label" x="0" y="${y + BAR_HEIGHT / 2}" dominant-baseline="middle">${escapeXML(labelText(item.label, labelWidth))}</text>
          <rect class="horizontal-bar-chart__track" x="${plotLeft}" y="${y}" width="${plotWidth}" height="${BAR_HEIGHT}"></rect>
          <rect class="horizontal-bar-chart__bar" x="${plotLeft}" y="${y}" width="${barWidth}" height="${BAR_HEIGHT}"></rect>
        </g>`;
    }).join("");
    svg.insertAdjacentHTML("beforeend", markup);

    const anchor = document.createElement("span");
    anchor.className = "horizontal-bar-chart__tooltip-anchor";
    anchor.setAttribute("aria-hidden", "true");
    this.replaceChildren(svg, anchor);
    this.#tooltipAnchor = anchor;
  }
}

if (!customElements.get("horizontal-bar-chart")) {
  customElements.define("horizontal-bar-chart", HorizontalBarChart);
}
