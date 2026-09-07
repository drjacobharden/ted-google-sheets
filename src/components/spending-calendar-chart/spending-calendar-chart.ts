import type {
  AnnualSpendingCalendar,
  SpendingCalendarMonth,
} from "../../utilities/annual-spending-calendar";
import {
  formatTreemapCurrency,
} from "../chart-treemap/formatters";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const PADDING = 24;
const MONTH_GAP = 16;
const MONTH_HEIGHT = 82;
const MONTH_HEADER_HEIGHT = 28;
const QUARTER_LABEL_WIDTH = 150;
const NARROW_BREAKPOINT = 620;

interface MonthLayout extends SpendingCalendarMonth {
  x: number;
  y: number;
  width: number;
  height: number;
}

function escapeXML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

function monthAriaLabel(month: SpendingCalendarMonth): string {
  return `${month.label} ${month.year}, balance ${formatTreemapCurrency(month.balance)}, income ${formatTreemapCurrency(month.income)}, spend ${formatTreemapCurrency(month.spend)}, savings ${formatTreemapCurrency(month.savings)}`;
}

export class SpendingCalendarChart extends HTMLElement implements EventListenerObject {
  #data: AnnualSpendingCalendar | null = null;
  #renderedMonths: MonthLayout[] = [];
  #resizeObserver: ResizeObserver | null = null;
  #renderedWidth = 0;
  #tooltipAnchor: HTMLElement | null = null;
  #listening = false;

  set data(value: AnnualSpendingCalendar | null) {
    this.#data = value;
    if (this.isConnected) this.#render();
  }

  get data(): AnnualSpendingCalendar | null {
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
    const month = this.#monthFromEvent(event);
    if (!month) return;
    if (event.type === "pointerover" || event.type === "pointerdown" || event.type === "focusin") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (event.type !== "pointerdown" && relatedTarget instanceof Node && month.contains(relatedTarget)) return;
      this.#setActive(month, true);
      this.#showTooltip(month);
      return;
    }
    const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
    if (relatedTarget instanceof Node && month.contains(relatedTarget)) return;
    this.#setActive(month, false);
    this.#hideTooltip();
  }

  #chartWidth(): number {
    return Math.max(1, Math.round(this.clientWidth || 760));
  }

  #monthFromEvent(event: Event): SVGGElement | null {
    const target = event.target;
    return target instanceof Element
      ? target.closest<SVGGElement>(".spending-calendar-chart__month")
      : null;
  }

  #setActive(month: SVGGElement, active: boolean): void {
    if (active) {
      this.querySelectorAll<SVGGElement>(".spending-calendar-chart__month.is-active").forEach((item) => {
        if (item !== month) item.classList.remove("is-active");
      });
    }
    month.classList.toggle("is-active", active);
  }

  #showTooltip(month: SVGGElement): void {
    const datum = this.#renderedMonths.find((item) => item.id === month.dataset.monthId);
    const anchor = this.#tooltipAnchor;
    const rect = month.querySelector<SVGRectElement>(".spending-calendar-chart__balance");
    const svg = this.querySelector("svg");
    if (!datum || !anchor || !rect || !svg) return;

    const hostRect = this.getBoundingClientRect();
    const blockRect = rect.getBoundingClientRect();
    anchor.style.left = `${blockRect.left - hostRect.left + blockRect.width / 2}px`;
    anchor.style.top = `${blockRect.top - hostRect.top}px`;

    const content = document.createElement("div");
    content.className = "data-chart__tooltip spending-calendar-chart__tooltip";
    const title = document.createElement("strong");
    title.className = "data-chart__tooltip-title";
    title.textContent = `${datum.label} ${datum.year}`;

    const row = (labelText: string, value: number, swatchClass: string): HTMLDivElement => {
      const item = document.createElement("div");
      item.className = "data-chart__tooltip-row";
      const swatch = document.createElement("i");
      swatch.className = swatchClass;
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "data-chart__tooltip-label";
      label.textContent = labelText;
      const amount = document.createElement("span");
      amount.className = "data-chart__tooltip-value";
      amount.textContent = formatTreemapCurrency(value);
      item.append(swatch, label, amount);
      return item;
    };

    content.append(
      title,
      row("Total income", datum.income, "is-palette-income"),
      row("Total spend", datum.spend, "is-palette-expense"),
      row("Total savings", datum.savings, "is-palette-savings"),
    );
    this.#overlay()?.showTooltip(anchor, content, { side: "top", align: "center", gap: 8 });
  }

  #overlay(): (HTMLElement & { showTooltip(anchor: HTMLElement, content: Node, options: { side: "top"; align: "center"; gap: number }): void }) | null {
    return document.querySelector<HTMLElement>("overlay-manager") as
      | (HTMLElement & { showTooltip(anchor: HTMLElement, content: Node, options: { side: "top"; align: "center"; gap: number }): void })
      | null;
  }

  #hideTooltip(): void {
    const overlay = document.querySelector<HTMLElement>("overlay-manager") as
      | (HTMLElement & { hideTooltip(): void })
      | null;
    overlay?.hideTooltip();
  }

  #layout(data: AnnualSpendingCalendar, width: number): { width: number; height: number; months: MonthLayout[]; showQuarterLabels: boolean } {
    const showQuarterLabels = width >= NARROW_BREAKPOINT;
    const quarterWidth = showQuarterLabels ? QUARTER_LABEL_WIDTH : 0;
    const contentWidth = Math.max(1, width - PADDING * 2 - quarterWidth);
    const monthWidth = Math.max(1, (contentWidth - MONTH_GAP * 2) / 3);
    const rowHeight = MONTH_HEADER_HEIGHT + MONTH_HEIGHT + MONTH_GAP * 2;
    const months = data.months.map((month, index) => {
      const row = Math.floor(index / 3);
      const column = index % 3;
      return {
        ...month,
        x: PADDING + column * (monthWidth + MONTH_GAP),
        y: PADDING + row * rowHeight + MONTH_HEADER_HEIGHT,
        width: monthWidth,
        height: MONTH_HEIGHT,
      };
    });
    return {
      width,
      height: PADDING * 2 + rowHeight * 4,
      months,
      showQuarterLabels,
    };
  }

  #render(): void {
    this.#hideTooltip();
    const data = this.#data;
    const width = this.#chartWidth();
    this.#renderedWidth = width;
    if (!data?.hasData) {
      const empty = document.createElement("p");
      empty.className = "spending-calendar-chart__empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No monthly income or spending for this year.";
      this.#renderedMonths = [];
      this.#tooltipAnchor = null;
      this.replaceChildren(empty);
      return;
    }

    const layout = this.#layout(data, width);
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("spending-calendar-chart__svg");
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Monthly income, spending, and savings for ${data.year}`);

    const quarterMarkup = layout.showQuarterLabels
      ? data.quarters.map((quarter, index) => {
          const rowY = PADDING + index * (MONTH_HEADER_HEIGHT + MONTH_HEIGHT + MONTH_GAP * 2);
          const x = layout.width - PADDING - QUARTER_LABEL_WIDTH + 12;
          return `<g class="spending-calendar-chart__quarter-label"><text x="${x}" y="${rowY + 54}">Q${quarter.quarter} total: <tspan class="spending-calendar-chart__quarter-value">${escapeXML(formatTreemapCurrency(quarter.total))}</tspan></text></g>`;
        }).join("")
      : "";

    svg.insertAdjacentHTML("beforeend", quarterMarkup);
    this.#renderedMonths = layout.months;
    svg.insertAdjacentHTML("beforeend", layout.months.map((month) => {
      const tone = month.balance > 0 ? "positive" : month.balance < 0 ? "negative" : "neutral";
      const shortLabel = month.label.slice(0, 3);
      return `<g class="spending-calendar-chart__month is-${tone}" data-month-id="${escapeXML(month.id)}" tabindex="0" role="img" aria-label="${escapeXML(monthAriaLabel(month))}"><text class="spending-calendar-chart__month-label" x="${month.x}" y="${month.y - 10}">${shortLabel}</text><rect class="spending-calendar-chart__balance" x="${month.x}" y="${month.y}" width="${month.width}" height="${month.height}"></rect><text class="spending-calendar-chart__balance-value" x="${month.x + month.width / 2}" y="${month.y + month.height / 2 + 7}" text-anchor="middle">${escapeXML(formatTreemapCurrency(month.balance))}</text></g>`;
    }).join(""));

    const summary = document.createElement("ol");
    summary.className = "visually-hidden";
    summary.setAttribute("aria-label", "Monthly balance summary");
    layout.months.forEach((month) => {
      const item = document.createElement("li");
      item.textContent = monthAriaLabel(month);
      summary.append(item);
    });
    const anchor = document.createElement("span");
    anchor.className = "spending-calendar-chart__tooltip-anchor";
    anchor.setAttribute("aria-hidden", "true");
    this.replaceChildren(svg, summary, anchor);
    this.#tooltipAnchor = anchor;
  }
}

if (!customElements.get("spending-calendar-chart")) {
  customElements.define("spending-calendar-chart", SpendingCalendarChart);
}
