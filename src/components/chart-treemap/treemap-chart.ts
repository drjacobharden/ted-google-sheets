import {
  createTreemapLayout,
  type TreemapDatum,
  type TreemapNode,
} from "./treemap-layout";
import {
  formatTreemapCurrency,
  formatTreemapPercentage,
} from "./formatters";
import { treemapGrowthTone } from "./treemap-colors";

export type { TreemapDatum, TreemapNode } from "./treemap-layout";
export { createTreemapLayout } from "./treemap-layout";
export { treemapGrowthTone } from "./treemap-colors";
export {
  formatTreemapCompactCurrency,
  formatTreemapCurrency,
  formatTreemapPercentage,
} from "./formatters";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MIN_LABEL_WIDTH = 88;
const MIN_LABEL_HEIGHT = 54;
const MEDIUM_LABEL_WIDTH = 112;
const MEDIUM_LABEL_HEIGHT = 72;
const LABEL_PADDING = 10;

function escapeXML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

function labelText(value: string, width: number): string {
  const characterWidth = 7;
  const maxCharacters = Math.max(3, Math.floor((width - LABEL_PADDING * 2) / characterWidth));
  return value.length > maxCharacters
    ? `${value.slice(0, Math.max(1, maxCharacters - 1))}…`
    : value;
}

function nodeLabel(node: TreemapNode): string {
  return `${node.label}, ${formatTreemapCurrency(node.amount)}, ${formatTreemapPercentage(node.percentage)}, ${growthDescription(node.growthPercentage)}`;
}

function growthDescription(growth: number | null): string {
  return growth === null
    ? "no prior-year comparison"
    : growth === Number.POSITIVE_INFINITY
      ? "new spending"
      : `${growth >= 0 ? "up" : "down"} ${formatTreemapPercentage(Math.abs(growth))} from the prior year`;
}

function growthChange(growth: number | null): string {
  if (growth === null) return "No prior-year comparison";
  if (growth === Number.POSITIVE_INFINITY) return "New spending";
  return `${growth >= 0 ? "+" : "−"}${formatTreemapPercentage(Math.abs(growth))}`;
}

function labelMarkup(node: TreemapNode, index: number): string {
  const width = Math.max(0, node.width - LABEL_PADDING * 2);
  if (node.width < MIN_LABEL_WIDTH || node.height < MIN_LABEL_HEIGHT) return "";

  const label = labelText(node.label, width);
  const percentage = node.width >= MEDIUM_LABEL_WIDTH && node.height >= MEDIUM_LABEL_HEIGHT
    ? formatTreemapPercentage(node.percentage)
    : "";
  const clipId = `treemap-label-clip-${index}`;
  const lines = [label, percentage].filter(Boolean);
  const lineHeight = 18;
  const totalHeight = lines.length * lineHeight;
  const startY = node.y + Math.max(LABEL_PADDING, (node.height - totalHeight) / 2);

  return `
    <clipPath id="${clipId}">
      <rect x="${node.x + LABEL_PADDING}" y="${node.y + LABEL_PADDING}" width="${width}" height="${Math.max(0, node.height - LABEL_PADDING * 2)}"></rect>
    </clipPath>
    <g class="treemap-chart__label-group" clip-path="url(#${clipId})">
      <text class="treemap-chart__label" x="${node.x + LABEL_PADDING}" y="${startY}" dominant-baseline="hanging">${escapeXML(label)}</text>
      ${percentage ? `<text class="treemap-chart__percentage" x="${node.x + LABEL_PADDING}" y="${startY + lineHeight}" dominant-baseline="hanging">${escapeXML(percentage)}</text>` : ""}
    </g>`;
}

export interface TreemapCategorySelectDetail {
  id: string;
  label: string;
  amount: number;
  percentage: number;
}

export class TreemapChart extends HTMLElement implements EventListenerObject {
  #data: readonly TreemapDatum[] = [];
  #resizeObserver: ResizeObserver | null = null;
  #renderedWidth = 0;
  #renderedHeight = 0;
  #renderedNodes: TreemapNode[] = [];
  #tooltipAnchor: HTMLElement | null = null;
  #needsRender = true;
  #listening = false;

  set data(value: readonly TreemapDatum[]) {
    this.#data = Array.isArray(value) ? value.slice() : [];
    this.#needsRender = true;
    this.#render();
  }

  get data(): readonly TreemapDatum[] {
    return this.#data;
  }

  connectedCallback(): void {
    if (!this.#listening) {
      this.#listening = true;
      this.addEventListener("pointerover", this);
      this.addEventListener("pointerout", this);
      this.addEventListener("pointerdown", this);
      this.addEventListener("click", this);
      this.addEventListener("focusin", this);
      this.addEventListener("focusout", this);
      this.addEventListener("keydown", this);
    }
    this.#resizeObserver ??= new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.round(entry?.contentRect.width ?? this.getBoundingClientRect().width);
      const height = Math.round(entry?.contentRect.height ?? this.getBoundingClientRect().height);
      if (this.#needsRender || width !== this.#renderedWidth || height !== this.#renderedHeight) {
        this.#render(width, height);
      }
    });
    this.#resizeObserver.observe(this);
    this.#render();
  }

  disconnectedCallback(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("pointerover", this);
    this.removeEventListener("pointerout", this);
    this.removeEventListener("pointerdown", this);
    this.removeEventListener("click", this);
    this.removeEventListener("focusin", this);
    this.removeEventListener("focusout", this);
    this.removeEventListener("keydown", this);
  }

  handleEvent(event: Event): void {
    const category = this.#categoryFromEvent(event);
    if (!category) return;

    if (event.type === "pointerover" || event.type === "pointerdown" || event.type === "focusin") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (event.type !== "pointerdown" && relatedTarget instanceof Node && category.contains(relatedTarget)) return;
      this.#setActive(category, true);
      this.#showTooltip(category);
      return;
    }
    if (event.type === "pointerout" || event.type === "focusout") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (relatedTarget instanceof Node && category.contains(relatedTarget)) return;
      this.#setActive(category, false);
      this.#hideTooltip();
      return;
    }
    if (event.type === "click") {
      this.#dispatchSelection(category);
      return;
    }
    if (event.type === "keydown") {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
        keyboardEvent.preventDefault();
        this.#dispatchSelection(category);
      }
    }
  }

  #categoryFromEvent(event: Event): SVGGElement | null {
    const target = event.target;
    return target instanceof Element
      ? target.closest<SVGGElement>(".treemap-chart__category")
      : null;
  }

  #setActive(category: SVGGElement, active: boolean): void {
    if (active) {
      this.querySelectorAll<SVGGElement>(".treemap-chart__category.is-active").forEach((item) => {
        if (item !== category) item.classList.remove("is-active");
      });
    }
    category.classList.toggle("is-active", active);
  }

  #showTooltip(category: SVGGElement): void {
    const node = this.#renderedNodes.find((item) => item.id === category.dataset.categoryId);
    const anchor = this.#tooltipAnchor;
    const rect = category.querySelector<SVGRectElement>(".treemap-chart__rect");
    if (!node || !anchor || !rect) return;

    const svg = this.querySelector("svg");
    if (!svg) return;
    const svgRect = svg.getBoundingClientRect();
    const hostRect = this.getBoundingClientRect();
    const categoryRect = rect.getBoundingClientRect();
    anchor.style.left = `${categoryRect.left - hostRect.left + categoryRect.width / 2}px`;
    anchor.style.top = `${Math.max(svgRect.top, categoryRect.top) - hostRect.top}px`;

    const content = document.createElement("div");
    content.className = "data-chart__tooltip treemap-chart__tooltip";
    const title = document.createElement("strong");
    title.className = "data-chart__tooltip-title";
    title.textContent = node.label;
    const row = (labelTextValue: string, valueText: string): HTMLDivElement => {
      const item = document.createElement("div");
      item.className = "data-chart__tooltip-row";
      const spacer = document.createElement("i");
      spacer.className = "is-detail";
      spacer.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "data-chart__tooltip-label";
      label.textContent = labelTextValue;
      const value = document.createElement("span");
      value.className = "data-chart__tooltip-value";
      value.textContent = valueText;
      item.append(spacer, label, value);
      return item;
    };
    content.append(
      title,
      row("Share of total", formatTreemapPercentage(node.percentage)),
      row("Amount", formatTreemapCurrency(node.amount)),
      row("Change", growthChange(node.growthPercentage)),
    );

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

  #dispatchSelection(category: SVGGElement): void {
    const node = this.#renderedNodes.find((item) => item.id === category.dataset.categoryId);
    if (!node) return;

    this.dispatchEvent(new CustomEvent<TreemapCategorySelectDetail>("category-select", {
      detail: {
        id: node.id,
        label: node.label,
        amount: node.amount,
        percentage: node.percentage,
      },
      bubbles: true,
      composed: true,
    }));
  }

  #dimensions(): { width: number; height: number } {
    const bounds = this.getBoundingClientRect();
    return {
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
    };
  }

  #render(width?: number, height?: number): void {
    this.#hideTooltip();
    const dimensions = width === undefined || height === undefined
      ? this.#dimensions()
      : { width: Math.max(0, width), height: Math.max(0, height) };
    this.#renderedWidth = dimensions.width;
    this.#renderedHeight = dimensions.height;
    this.#needsRender = false;

    if (dimensions.width === 0 || dimensions.height === 0) {
      this.#renderedNodes = [];
      this.#tooltipAnchor = null;
      this.replaceChildren();
      return;
    }

    const nodes = createTreemapLayout(this.#data, dimensions.width, dimensions.height);
    if (!nodes.length) {
      this.#renderedNodes = [];
      this.#tooltipAnchor = null;
      const empty = document.createElement("p");
      empty.className = "treemap-chart__empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No spending categories for this year.";
      this.replaceChildren(empty);
      return;
    }
    this.#renderedNodes = nodes;

    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("treemap-chart__svg");
    svg.setAttribute("viewBox", `0 0 ${dimensions.width} ${dimensions.height}`);
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Spending by category");

    const description = document.createElementNS(SVG_NAMESPACE, "desc");
    description.textContent = "Category rectangles are sized in proportion to annual spending.";
    svg.append(description);

    const markup = nodes.map((node, index) => `
      <g class="treemap-chart__category is-${treemapGrowthTone(node.growthPercentage)}" data-category-id="${escapeXML(node.id)}" tabindex="0" role="button" aria-label="${escapeXML(nodeLabel(node))}">
        <rect class="treemap-chart__rect" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"></rect>
        ${labelMarkup(node, index)}
      </g>`).join("");
    svg.insertAdjacentHTML("beforeend", markup);
    const anchor = document.createElement("span");
    anchor.className = "treemap-chart__tooltip-anchor";
    anchor.setAttribute("aria-hidden", "true");
    this.replaceChildren(svg, anchor);
    this.#tooltipAnchor = anchor;
  }
}

if (!customElements.get("treemap-chart")) {
  customElements.define("treemap-chart", TreemapChart);
}
