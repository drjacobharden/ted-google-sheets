import {
  formatTreemapCurrency,
  formatTreemapPercentage,
} from "../chart-treemap/formatters";
import type { VendorPieDatum } from "../../utilities/annual-vendor-spending";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const VIEWBOX_WIDTH = 960;
const MIN_VIEWBOX_HEIGHT = 540;
const PIE_RADIUS = 156;
const INNER_RADIUS = 42;
const LABEL_GAP = 32;
const LABEL_MARGIN = 40;
const LEADER_OFFSET = 22;
const LABEL_LINE_OFFSET = 12;
const CENTER_X = VIEWBOX_WIDTH / 2;

interface Point {
  x: number;
  y: number;
}

interface PieSlice extends VendorPieDatum {
  percentage: number;
  sizeTier: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  anchor: Point;
  outerAnchor: Point;
  labelY: number;
}

function labelSide(slice: PieSlice): "left" | "right" {
  return slice.isOther || slice.anchor.x >= CENTER_X ? "right" : "left";
}

function escapeXML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ]!,
  );
}

function pointAt(cx: number, cy: number, radius: number, angle: number): Point {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function slicePath(
  cx: number,
  cy: number,
  radius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep >= Math.PI * 2 - 0.0001) {
    const outerTop = pointAt(cx, cy, radius, -Math.PI / 2);
    const outerBottom = pointAt(cx, cy, radius, Math.PI / 2);
    const innerTop = pointAt(cx, cy, innerRadius, -Math.PI / 2);
    const innerBottom = pointAt(cx, cy, innerRadius, Math.PI / 2);
    return `M ${outerTop.x} ${outerTop.y} A ${radius} ${radius} 0 1 1 ${outerBottom.x} ${outerBottom.y} A ${radius} ${radius} 0 1 1 ${outerTop.x} ${outerTop.y} Z M ${innerTop.x} ${innerTop.y} A ${innerRadius} ${innerRadius} 0 1 0 ${innerBottom.x} ${innerBottom.y} A ${innerRadius} ${innerRadius} 0 1 0 ${innerTop.x} ${innerTop.y} Z`;
  }

  const start = pointAt(cx, cy, radius, startAngle);
  const end = pointAt(cx, cy, radius, endAngle);
  const innerStart = pointAt(cx, cy, innerRadius, startAngle);
  const innerEnd = pointAt(cx, cy, innerRadius, endAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}

function distributeLabelY(
  entries: PieSlice[],
  minY: number,
  maxY: number,
): void {
  if (!entries.length) return;
  const gap = Math.min(LABEL_GAP, (maxY - minY) / Math.max(1, entries.length - 1));
  const sorted = entries.slice().sort((left, right) => left.anchor.y - right.anchor.y);
  sorted.forEach((entry, index) => {
    const desired = Math.min(maxY, Math.max(minY, entry.anchor.y));
    entry.labelY = index === 0
      ? desired
      : Math.max(desired, sorted[index - 1]!.labelY + gap);
  });

  const overflow = sorted.at(-1)!.labelY - maxY;
  if (overflow > 0) {
    sorted.forEach((entry) => { entry.labelY -= overflow; });
  }
  const underflow = minY - sorted[0]!.labelY;
  if (underflow > 0) {
    sorted.forEach((entry) => { entry.labelY += underflow; });
  }
}

function leaderPath(slice: PieSlice, side: "left" | "right", centerY: number, radius: number, index: number): string {
  const direction = side === "left" ? -1 : 1;
  const outsideX = CENTER_X + direction * (radius + 42);
  const labelEdgeX = side === "left"
    ? outsideX - LABEL_LINE_OFFSET
    : outsideX + LABEL_LINE_OFFSET;
  const farSide = side === "left" ? slice.outerAnchor.x > CENTER_X : slice.outerAnchor.x < CENTER_X;
  const points = [`M ${slice.anchor.x} ${slice.anchor.y}`, `L ${slice.outerAnchor.x} ${slice.outerAnchor.y}`];

  if (farSide) {
    const routeY = slice.outerAnchor.y < centerY
      ? centerY - radius - LEADER_OFFSET - index * 4
      : centerY + radius + LEADER_OFFSET + index * 4;
    points.push(
      `L ${slice.outerAnchor.x} ${routeY}`,
      `L ${outsideX} ${routeY}`,
    );
  } else {
    points.push(`L ${outsideX} ${slice.outerAnchor.y}`);
  }

  points.push(`L ${outsideX} ${slice.labelY}`, `L ${labelEdgeX} ${slice.labelY}`);
  return points.join(" ");
}

export class VendorPieChart extends HTMLElement implements EventListenerObject {
  #data: readonly VendorPieDatum[] = [];
  #renderedSlices: PieSlice[] = [];
  #tooltipAnchor: HTMLElement | null = null;
  #listening = false;

  set data(value: readonly VendorPieDatum[]) {
    this.#data = Array.isArray(value) ? value.slice() : [];
    this.#render();
  }

  get data(): readonly VendorPieDatum[] {
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
    this.#render();
  }

  disconnectedCallback(): void {
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
    const slice = this.#sliceFromEvent(event);
    if (!slice) return;

    if (event.type === "pointerover" || event.type === "pointerdown" || event.type === "focusin") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (event.type !== "pointerdown" && relatedTarget instanceof Node && slice.contains(relatedTarget)) return;
      this.#setActive(slice, true);
      this.#showTooltip(slice);
      return;
    }

    if (event.type === "pointerout" || event.type === "focusout") {
      const relatedTarget = (event as PointerEvent | FocusEvent).relatedTarget;
      if (relatedTarget instanceof Node && slice.contains(relatedTarget)) return;
      this.#setActive(slice, false);
      this.#hideTooltip();
    }
  }

  #sliceFromEvent(event: Event): SVGGElement | null {
    const target = event.target;
    return target instanceof Element
      ? target.closest<SVGGElement>(".vendor-pie-chart__slice")
      : null;
  }

  #setActive(slice: SVGGElement, active: boolean): void {
    if (active) {
      this.querySelectorAll<SVGGElement>(".vendor-pie-chart__slice.is-active").forEach((item) => {
        if (item !== slice) item.classList.remove("is-active");
      });
    }
    slice.classList.toggle("is-active", active);
  }

  #showTooltip(slice: SVGGElement): void {
    const datum = this.#renderedSlices.find((item) => item.id === slice.dataset.vendorId);
    const svg = this.querySelector("svg");
    const anchor = this.#tooltipAnchor;
    if (!datum || !svg || !anchor) return;

    const svgRect = svg.getBoundingClientRect();
    const hostRect = this.getBoundingClientRect();
    const point = pointAt(CENTER_X, Number(svg.getAttribute("data-center-y")), PIE_RADIUS, datum.midAngle);
    const scaleX = svgRect.width / VIEWBOX_WIDTH;
    const scaleY = svgRect.height / Number(svg.getAttribute("viewBox")?.split(" ")[3] ?? MIN_VIEWBOX_HEIGHT);
    anchor.style.left = `${point.x * scaleX}px`;
    anchor.style.top = `${point.y * scaleY + svgRect.top - hostRect.top}px`;

    const content = document.createElement("div");
    content.className = "data-chart__tooltip vendor-pie-chart__tooltip";
    const title = document.createElement("strong");
    title.className = "data-chart__tooltip-title";
    title.textContent = datum.label;
    const row = (labelText: string, valueText: string): HTMLDivElement => {
      const item = document.createElement("div");
      item.className = "data-chart__tooltip-row";
      const spacer = document.createElement("i");
      spacer.className = "is-detail";
      spacer.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "data-chart__tooltip-label";
      label.textContent = labelText;
      const value = document.createElement("span");
      value.className = "data-chart__tooltip-value";
      value.textContent = valueText;
      item.append(spacer, label, value);
      return item;
    };
    content.append(
      title,
      row("Share of total", formatTreemapPercentage(datum.percentage)),
      row("Amount", formatTreemapCurrency(datum.amount)),
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

  #render(): void {
    this.#hideTooltip();
    const data = this.#data
      .map((item) => ({ ...item, amount: Number(item.amount) }))
      .filter((item) => Number.isFinite(item.amount) && item.amount > 0)
      .sort((left, right) => {
        if (Boolean(left.isOther) !== Boolean(right.isOther)) {
          return left.isOther ? 1 : -1;
        }
        return right.amount - left.amount || left.label.localeCompare(right.label);
      });
    const total = data.reduce((sum, item) => sum + item.amount, 0);
    if (!data.length || total <= 0) {
      this.#renderedSlices = [];
      this.#tooltipAnchor = null;
      const empty = document.createElement("p");
      empty.className = "vendor-pie-chart__empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No vendor spending for this year.";
      this.replaceChildren(empty);
      return;
    }

    const labelCount = Math.max(data.length, 1);
    const height = Math.max(MIN_VIEWBOX_HEIGHT, 96 + labelCount * LABEL_GAP);
    const centerY = height / 2;
    const otherAmount = data
      .filter((item) => item.isOther)
      .reduce((sum, item) => sum + item.amount, 0);
    const otherAngle = otherAmount > 0 ? (otherAmount / total) * Math.PI * 2 : 0;
    const topAngle = Math.PI * 2 - otherAngle;
    let angle = otherAmount > 0 ? -otherAngle / 2 - topAngle : -Math.PI / 2;
    let cumulativeAmount = 0;
    const slices: PieSlice[] = data.map((item) => {
      const startAngle = angle;
      const endAngle = startAngle + (item.amount / total) * Math.PI * 2;
      angle = endAngle;
      const midAngle = (startAngle + endAngle) / 2;
      const midpointShare = (cumulativeAmount + item.amount / 2) / total;
      cumulativeAmount += item.amount;
      return {
        ...item,
        percentage: (item.amount / total) * 100,
        sizeTier: 3 - Math.min(3, Math.floor(midpointShare * 4)),
        startAngle,
        endAngle,
        midAngle,
        anchor: pointAt(CENTER_X, centerY, PIE_RADIUS, midAngle),
        outerAnchor: pointAt(CENTER_X, centerY, PIE_RADIUS + LEADER_OFFSET, midAngle),
        labelY: centerY,
      };
    });
    distributeLabelY(
      slices.filter((slice) => labelSide(slice) === "left"),
      LABEL_MARGIN,
      height - LABEL_MARGIN,
    );
    distributeLabelY(
      slices.filter((slice) => labelSide(slice) === "right"),
      LABEL_MARGIN,
      height - LABEL_MARGIN,
    );
    this.#renderedSlices = slices;

    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("vendor-pie-chart__svg");
    svg.setAttribute("viewBox", `0 0 ${VIEWBOX_WIDTH} ${height}`);
    svg.setAttribute("data-center-y", String(centerY));
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Vendor spending, with top vendors covering three quarters of total spend");

    const markup = slices.map((slice, index) => {
      const side = labelSide(slice);
      const labelX = side === "left"
        ? CENTER_X - PIE_RADIUS - 88
        : CENTER_X + PIE_RADIUS + 56;
      const textAnchor = side === "left" ? "end" : "start";
      const label = slice.label.length > 27 ? `${slice.label.slice(0, 26)}…` : slice.label;
      return `
        <g class="vendor-pie-chart__slice is-size-${slice.sizeTier}${slice.isOther ? " is-other" : ""}" data-vendor-id="${escapeXML(slice.id)}" data-slice-index="${index}" tabindex="0" role="img" aria-label="${escapeXML(`${slice.label}, ${formatTreemapCurrency(slice.amount)}, ${formatTreemapPercentage(slice.percentage)} of total`)}">
          <path class="vendor-pie-chart__path" d="${slicePath(CENTER_X, centerY, PIE_RADIUS, INNER_RADIUS, slice.startAngle, slice.endAngle)}"></path>
          <path class="vendor-pie-chart__leader" d="${leaderPath(slice, side, centerY, PIE_RADIUS, index)}"></path>
          <text class="vendor-pie-chart__label" x="${labelX}" y="${slice.labelY}" text-anchor="${textAnchor}" dominant-baseline="middle"><tspan>${escapeXML(label)}</tspan><tspan class="vendor-pie-chart__percentage" dx="8" text-anchor="start">${escapeXML(formatTreemapPercentage(slice.percentage))}</tspan></text>
        </g>`;
      }).join("");
    svg.insertAdjacentHTML(
      "beforeend",
      `${markup}<circle class="vendor-pie-chart__center" cx="${CENTER_X}" cy="${centerY}" r="${INNER_RADIUS}" aria-hidden="true"></circle>`,
    );

    const anchor = document.createElement("span");
    anchor.className = "vendor-pie-chart__tooltip-anchor";
    anchor.setAttribute("aria-hidden", "true");
    this.replaceChildren(svg, anchor);
    this.#tooltipAnchor = anchor;
  }
}

if (!customElements.get("vendor-pie-chart")) {
  customElements.define("vendor-pie-chart", VendorPieChart);
}
