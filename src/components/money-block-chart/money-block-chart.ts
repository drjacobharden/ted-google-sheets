import type {
  AnnualSpendingBlocks,
  MoneyBlockDatum,
} from "../../utilities/annual-spending-blocks";
import {
  formatTreemapCurrency,
  formatTreemapPercentage,
} from "../chart-treemap/formatters";
import {
  layoutMoneyBlocks,
  type MoneyBlockLayout,
} from "./money-block-layout";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CHART_BREAKPOINT = 720;
const CHART_ASPECT_RATIO = 0.52;
const PADDING = 24;
const BLOCK_GAP = 8;
const SECTION_GAP = 28;
const LABEL_HEIGHT = 42;
const ARROW_GAP = 52;
const RESULT_HEIGHT_MIN = 108;
const RESULT_HEIGHT_MAX = 168;
const INCOME_HEIGHT_RATIO = 2;
const MIN_RENDERED_DIMENSION = 1;

interface ChartLayout {
  width: number;
  height: number;
  income: { blocks: MoneyBlockLayout[]; x: number; y: number; width: number; height: number };
  spent: { blocks: MoneyBlockLayout[]; x: number; y: number; width: number; height: number };
  saved: { blocks: MoneyBlockLayout[]; x: number; y: number; width: number; height: number };
  orientation: "horizontal" | "vertical";
}

function escapeXML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

function sectionLabel(section: "income" | "spent" | "saved"): string {
  return section === "income" ? "INCOME" : section === "spent" ? "SPENT" : "SAVED";
}

function sectionBasis(section: MoneyBlockDatum["section"]): string {
  return section === "income" ? "income" : section === "spent" ? "spending" : "saved income";
}

function blockAriaLabel(block: MoneyBlockLayout): string {
  if (block.actualContribution !== undefined) {
    return `${block.label}, ${formatTreemapCurrency(block.actualContribution)} contributed, ${formatTreemapCurrency(block.amount)} attributed from current saved income`;
  }
  return `${block.label}, ${formatTreemapCurrency(block.amount)}, ${formatTreemapPercentage(block.percentage)} of ${sectionBasis(block.section)}`;
}

export class MoneyBlockChart extends HTMLElement implements EventListenerObject {
  #data: AnnualSpendingBlocks | null = null;
  #renderedBlocks: MoneyBlockLayout[] = [];
  #resizeObserver: ResizeObserver | null = null;
  #renderedWidth = 0;
  #tooltipAnchor: HTMLElement | null = null;
  #listening = false;

  set data(value: AnnualSpendingBlocks | null) {
    this.#data = value;
    if (this.isConnected) this.#render();
  }

  get data(): AnnualSpendingBlocks | null {
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
    const block = this.#blockFromEvent(event);
    if (!block) return;

    if (
      event.type === "pointerover" ||
      event.type === "pointerdown" ||
      event.type === "focusin"
    ) {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (
        event.type !== "pointerdown" &&
        relatedTarget instanceof Node &&
        block.contains(relatedTarget)
      ) return;
      this.#setActive(block, true);
      this.#showTooltip(block);
      return;
    }

    if (event.type === "pointerout" || event.type === "focusout") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (relatedTarget instanceof Node && block.contains(relatedTarget)) return;
      this.#setActive(block, false);
      this.#hideTooltip();
    }
  }

  #chartWidth(): number {
    return Math.max(1, Math.round(this.clientWidth || 960));
  }

  #chartHeight(width: number): number {
    return Math.max(280, Math.round(width * CHART_ASPECT_RATIO));
  }

  #blockFromEvent(event: Event): SVGGElement | null {
    const target = event.target;
    return target instanceof Element
      ? target.closest<SVGGElement>(".money-block-chart__block")
      : null;
  }

  #setActive(block: SVGGElement, active: boolean): void {
    if (active) {
      this.querySelectorAll<SVGGElement>(".money-block-chart__block.is-active").forEach(
        (item) => {
          if (item !== block) item.classList.remove("is-active");
        },
      );
    }
    block.classList.toggle("is-active", active);
  }

  #showTooltip(block: SVGGElement): void {
    const datum = this.#renderedBlocks.find((item) => item.id === block.dataset.blockId);
    const anchor = this.#tooltipAnchor;
    const rect = block.querySelector<SVGRectElement>(".money-block-chart__rect");
    const svg = this.querySelector("svg");
    if (!datum || !anchor || !rect || !svg) return;

    const svgRect = svg.getBoundingClientRect();
    const hostRect = this.getBoundingClientRect();
    const blockRect = rect.getBoundingClientRect();
    anchor.style.left = `${blockRect.left - hostRect.left + blockRect.width / 2}px`;
    anchor.style.top = `${Math.max(svgRect.top, blockRect.top) - hostRect.top}px`;

    const content = document.createElement("div");
    content.className = "data-chart__tooltip money-block-chart__tooltip";
    const title = document.createElement("strong");
    title.className = "data-chart__tooltip-title";
    title.textContent = datum.label;

    const row = (labelText: string, valueText: string): HTMLDivElement => {
      const item = document.createElement("div");
      item.className = "data-chart__tooltip-row";
      const swatch = document.createElement("i");
      swatch.className = `money-block-chart__tooltip-swatch is-${datum.section}`;
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

    content.append(title);
    if (datum.actualContribution !== undefined) {
      content.append(
        row("Contributed", formatTreemapCurrency(datum.actualContribution)),
        row("Investment share", formatTreemapPercentage(datum.contributionPercentage ?? 0)),
        row("Attributed from income", formatTreemapCurrency(datum.amount)),
      );
    } else {
      content.append(row("Amount", formatTreemapCurrency(datum.amount)));
      const detail = document.createElement("div");
      detail.className = "money-block-chart__tooltip-detail";
      detail.textContent = `${formatTreemapPercentage(datum.percentage)} of ${sectionBasis(datum.section)}`;
      content.append(detail);
    }

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

  #layout(data: AnnualSpendingBlocks, width: number): ChartLayout {
    const orientation = width >= CHART_BREAKPOINT ? "horizontal" : "vertical";
    const incomeAmount = Math.max(0, data.income);
    const resultAmount = Math.max(data.spent, data.saved);
    const height = this.#chartHeight(width);
    const contentWidth = Math.max(1, width - PADDING * 2);
    const resultHeight = Math.max(
      RESULT_HEIGHT_MIN,
      Math.min(RESULT_HEIGHT_MAX, width * 0.16),
    );
    const incomeHeight = resultHeight * INCOME_HEIGHT_RATIO;
    if (orientation === "horizontal") {
      const incomeRegionWidth = contentWidth * 0.39;
      const resultX = PADDING + incomeRegionWidth + ARROW_GAP;
      const resultWidth = Math.max(1, width - resultX - PADDING);
      const spendGapWidth = Math.max(
        1,
        resultWidth - Math.max(0, data.spentBlocks.length - 1) * BLOCK_GAP,
      );
      const desiredAreaScale = resultAmount > 0
        ? Math.min(
            (resultWidth * resultHeight * 0.86) / resultAmount,
            data.spentBlocks.length > 0
              ? (spendGapWidth * resultHeight * 0.86) / Math.max(1, data.spent)
              : Number.POSITIVE_INFINITY,
          )
        : 1;
      const areaScale = incomeAmount > 0
        ? Math.min(
            desiredAreaScale,
            (incomeRegionWidth * incomeHeight * 0.86) / incomeAmount,
          )
        : desiredAreaScale;
      const incomeY = PADDING + LABEL_HEIGHT;
      const resultY = PADDING + LABEL_HEIGHT;
      const income = layoutMoneyBlocks(data.incomeBlocks, {
        x: PADDING,
        y: incomeY,
        maxWidth: incomeRegionWidth,
        targetHeight: incomeHeight,
        areaScale,
        orientation,
        gap: BLOCK_GAP,
      });
      const spent = layoutMoneyBlocks(data.spentBlocks, {
        x: resultX,
        y: resultY,
        maxWidth: resultWidth,
        targetHeight: resultHeight,
        areaScale,
        orientation,
        gap: BLOCK_GAP,
        singleRow: true,
      });
      const savedY = resultY + Math.max(resultHeight, spent.height) + SECTION_GAP + LABEL_HEIGHT;
      const saved = layoutMoneyBlocks(data.savedBlocks, {
        x: resultX,
        y: savedY,
        maxWidth: resultWidth,
        targetHeight: resultHeight,
        areaScale,
        orientation,
        gap: BLOCK_GAP,
      });
      return {
        width,
        height: Math.max(height, savedY + saved.height + PADDING),
        income: { blocks: income.blocks, x: PADDING, y: incomeY, width: income.width, height: income.height },
        spent: { blocks: spent.blocks, x: resultX, y: resultY, width: spent.width, height: spent.height },
        saved: { blocks: saved.blocks, x: resultX, y: savedY, width: saved.width, height: saved.height },
        orientation,
      };
    }

    const sectionWidth = contentWidth;
    const mobileResultHeight = Math.max(100, Math.min(150, width * 0.32));
    const mobileIncomeHeight = mobileResultHeight * INCOME_HEIGHT_RATIO;
    const mobileAreaScale = incomeAmount > 0
      ? Math.min(
          (sectionWidth * mobileResultHeight * 0.9) / Math.max(1, resultAmount),
          (sectionWidth * mobileIncomeHeight * 0.9) / incomeAmount,
        )
      : 1;
    const incomeY = PADDING + LABEL_HEIGHT;
    const income = layoutMoneyBlocks(data.incomeBlocks, {
      x: PADDING,
      y: incomeY,
      maxWidth: sectionWidth,
      targetHeight: mobileIncomeHeight,
      areaScale: mobileAreaScale,
      orientation,
      gap: BLOCK_GAP,
    });
    const spentLabelY = incomeY + income.height + SECTION_GAP;
    const spentY = spentLabelY + LABEL_HEIGHT;
    const spent = layoutMoneyBlocks(data.spentBlocks, {
      x: PADDING,
      y: spentY,
      maxWidth: sectionWidth,
      targetHeight: mobileResultHeight,
      areaScale: mobileAreaScale,
      orientation,
      gap: BLOCK_GAP,
    });
    const savedLabelY = spentY + spent.height + SECTION_GAP;
    const savedY = savedLabelY + LABEL_HEIGHT;
    const saved = layoutMoneyBlocks(data.savedBlocks, {
      x: PADDING,
      y: savedY,
      maxWidth: sectionWidth,
      targetHeight: mobileResultHeight,
      areaScale: mobileAreaScale,
      orientation,
      gap: BLOCK_GAP,
    });
    return {
      width,
      height: savedY + saved.height + PADDING,
      income: { blocks: income.blocks, x: PADDING, y: incomeY, width: income.width, height: income.height },
      spent: { blocks: spent.blocks, x: PADDING, y: spentY, width: spent.width, height: spent.height },
      saved: { blocks: saved.blocks, x: PADDING, y: savedY, width: saved.width, height: saved.height },
      orientation,
    };
  }

  #sectionLabelMarkup(
    section: "income" | "spent" | "saved",
    x: number,
    y: number,
    data: AnnualSpendingBlocks,
  ): string {
    const amount = section === "income" ? data.income : section === "spent" ? data.spent : data.saved;
    const rate = section === "spent" ? data.spendRate : section === "saved" ? data.savingsRate : null;
    return `
      <text class="money-block-chart__section-label" x="${x}" y="${y}">
        <tspan class="money-block-chart__section-title">${sectionLabel(section)}</tspan>${rate === null ? "" : `<tspan class="money-block-chart__section-rate" dx="8">${escapeXML(formatTreemapPercentage(rate))}</tspan>`}
        <tspan class="money-block-chart__section-amount" x="${x}" dy="24">${escapeXML(formatTreemapCurrency(amount))}</tspan>
      </text>`;
  }

  #arrowMarkup(layout: ChartLayout): string {
    const income = layout.income;
    const spent = layout.spent;
    const saved = layout.saved;
    if (!income.blocks.length) return "";

    if (layout.orientation === "vertical") {
      const centerX = income.x + Math.max(income.width / 2, 1);
      const sourceY = income.y + income.height + 8;
      const arrow = (
        target: { y: number; height: number },
        sourceX: number,
        targetX: number,
      ): string => {
        const targetY = target.y - 10;
        const midY = (sourceY + targetY) / 2;
        return `<path class="money-block-chart__arrow" d="M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}" marker-end="url(#money-block-arrowhead)"></path>`;
      };
      const savedRouteX = layout.width - PADDING / 2;
      const savedArrow = saved.blocks.length
        ? `<path class="money-block-chart__arrow" d="M ${centerX + 8} ${sourceY} C ${savedRouteX} ${sourceY}, ${savedRouteX} ${saved.y - 10}, ${saved.x + saved.width / 2 + 8} ${saved.y - 10}" marker-end="url(#money-block-arrowhead)"></path>`
        : "";
      return `${spent.blocks.length ? arrow(spent, centerX - 8, centerX - 8) : ""}${savedArrow}`;
    }

    const sourceX = income.x + income.width + 12;
    const targetX = spent.x - 10;
    const sourceY = income.y + Math.max(1, income.height * 0.5);
    const spendY = spent.y + Math.max(1, spent.height * 0.5);
    const savedY = saved.y + Math.max(1, saved.height * 0.5);
    const arrow = (targetY: number, fromY: number): string => {
      const curve = Math.max(18, (targetX - sourceX) * 0.45);
      return `<path class="money-block-chart__arrow" d="M ${sourceX} ${fromY} C ${sourceX + curve} ${fromY}, ${targetX - curve} ${targetY}, ${targetX} ${targetY}" marker-end="url(#money-block-arrowhead)"></path>`;
    };
    return `${arrow(spendY, sourceY - 14)}${saved.blocks.length ? arrow(savedY, sourceY + 14) : ""}`;
  }

  #render(): void {
    this.#hideTooltip();
    const width = this.#chartWidth();
    this.#renderedWidth = width;
    const data = this.#data;
    if (!data?.hasData) {
      const empty = document.createElement("p");
      empty.className = "money-block-chart__empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No income, spending, or savings for this year.";
      this.#renderedBlocks = [];
      this.#tooltipAnchor = null;
      this.replaceChildren(empty);
      return;
    }

    const layout = this.#layout(data, width);
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("money-block-chart__svg");
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Annual income separated into spending and savings");
    svg.insertAdjacentHTML(
      "beforeend",
      `<defs><marker id="money-block-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 8 4 L 0 8 Z"></path></marker></defs>`,
    );

    const labelY = (section: { y: number }): number => section.y - 12;
    svg.insertAdjacentHTML(
      "beforeend",
      `${this.#sectionLabelMarkup("income", layout.income.x, labelY(layout.income), data)}${this.#sectionLabelMarkup("spent", layout.spent.x, labelY(layout.spent), data)}${this.#sectionLabelMarkup("saved", layout.saved.x, labelY(layout.saved), data)}<g class="money-block-chart__arrows">${this.#arrowMarkup(layout)}</g>`,
    );

    const allBlocks = [
      ...layout.income.blocks,
      ...layout.spent.blocks,
      ...layout.saved.blocks,
    ];
    this.#renderedBlocks = allBlocks;
    const markup = allBlocks.map((block) => `
      <g class="money-block-chart__block is-${block.section}" data-block-id="${escapeXML(block.id)}" tabindex="0" role="img" aria-label="${escapeXML(blockAriaLabel(block))}">
        <rect class="money-block-chart__rect" x="${block.x}" y="${block.y}" width="${Math.max(MIN_RENDERED_DIMENSION, block.width)}" height="${Math.max(MIN_RENDERED_DIMENSION, block.height)}"></rect>
      </g>`).join("");
    svg.insertAdjacentHTML("beforeend", markup);

    const summary = document.createElement("ol");
    summary.className = "visually-hidden";
    summary.setAttribute("aria-label", "Income, spending, and savings summary");
    allBlocks.forEach((block) => {
      const item = document.createElement("li");
      item.textContent = blockAriaLabel(block);
      summary.append(item);
    });

    const anchor = document.createElement("span");
    anchor.className = "money-block-chart__tooltip-anchor";
    anchor.setAttribute("aria-hidden", "true");
    this.replaceChildren(svg, summary, anchor);
    this.#tooltipAnchor = anchor;
  }
}

if (!customElements.get("money-block-chart")) {
  customElements.define("money-block-chart", MoneyBlockChart);
}
