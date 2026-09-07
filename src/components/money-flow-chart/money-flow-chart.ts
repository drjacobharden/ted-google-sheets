import type {
  AnnualMoneyFlow,
  MoneyFlowLink,
  MoneyFlowNode,
  MoneyFlowPalette,
} from "../../utilities/annual-money-flow";
import { escapeHTML, money } from "../../utilities/view-formatters";

export interface LayoutNode extends MoneyFlowNode {
  x: number;
  y: number;
  height: number;
}

export interface LayoutLink extends MoneyFlowLink {
  sourceNode: LayoutNode;
  targetNode: LayoutNode;
  sourceY: number;
  targetY: number;
  sourceHeight: number;
  targetHeight: number;
}

const WIDTH = 1260;
const NODE_WIDTH = 14;
const STAGE_X = [176, 382, 612, 838, 1062] as const;
const TOP = 42;
const BOTTOM = 42;
const GAP = 30;
const GROUP_GAP = 34;
const LABEL_HEIGHT = 58;
const SPINE_HEIGHT = 360;
const MIN_FLOW_HEIGHT = 5;
const RIBBON_BAR_OVERLAP = 0.75;

const percentage = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function percent(value: number, total: number): string {
  return `${percentage.format(total > 0 ? (value / total) * 100 : 0)}%`;
}

function percentageBasis(node: MoneyFlowNode, flow: AnnualMoneyFlow): {
  value: number;
  label: string;
} {
  if (node.palette === "savings" && (node.stage === 0 || node.stage >= 3)) {
    const aggregate = flow.nodes.find((item) => item.id === "total-savings");
    return {
      value: aggregate?.value ?? flow.totalInflows,
      label: aggregate?.name ?? "Total savings",
    };
  }
  return {
    value: flow.nodes.find((item) => item.id === "spendable-cash")?.value ?? flow.totalInflows,
    label: "spendable cash",
  };
}

function displayedPercent(node: MoneyFlowNode, flow: AnnualMoneyFlow): string {
  const basis = percentageBasis(node, flow);
  if (basis.value <= 0 && node.palette === "expense" && node.value > 0) {
    return ">100%";
  }
  return percent(node.value, basis.value);
}

function relationshipBasis(node: MoneyFlowNode, flow: AnnualMoneyFlow): {
  value: number;
  label: string;
} {
  const incoming = flow.links.filter((link) => link.target === node.id);
  if (incoming.length === 1) {
    const parent = flow.nodes.find((item) => item.id === incoming[0].source);
    if (parent) return { value: parent.value, label: parent.name };
  }
  if (incoming.length > 1) {
    return {
      value: incoming.reduce((total, link) => total + link.value, 0),
      label: "combined incoming flow",
    };
  }

  const outgoing = flow.links.filter((link) => link.source === node.id);
  if (outgoing.length === 1) {
    const destination = flow.nodes.find((item) => item.id === outgoing[0].target);
    if (destination) return { value: destination.value, label: destination.name };
  }
  return percentageBasis(node, flow);
}

function relationshipPercent(node: MoneyFlowNode, flow: AnnualMoneyFlow): string {
  const basis = relationshipBasis(node, flow);
  if (basis.value <= 0 && node.palette === "expense" && node.value > 0) {
    return ">100%";
  }
  return percent(node.value, basis.value);
}

function isCombinedFlowNode(node: MoneyFlowNode): boolean {
  return node.id === "spendable-cash" || node.id === "total-savings";
}

function isSpendCategory(node: MoneyFlowNode): boolean {
  return node.stage === 3 && node.palette === "expense";
}

function chartSubtitle(node: MoneyFlowNode, flow: AnnualMoneyFlow): string {
  if (isCombinedFlowNode(node)) return money(node.value, false);
  if (isSpendCategory(node)) return relationshipPercent(node, flow);
  return displayedPercent(node, flow);
}

function labelPlacement(node: LayoutNode): {
  x: number;
  width: number;
  align: "left" | "right";
} {
  if (node.stage === 0) return { x: 22, width: 142, align: "right" };
  if (node.stage === 2) return { x: 432, width: 166, align: "right" };
  if (node.stage === 1) return { x: 200, width: 168, align: "right" };
  if (node.stage === 3) return { x: 864, width: 180, align: "left" };
  return { x: 1086, width: 166, align: "left" };
}

function paletteClass(palette: MoneyFlowPalette): string {
  return `is-palette-${palette}`;
}

function linkPath(link: LayoutLink): string {
  // Let ribbons sit just beneath each bar to prevent subpixel seams where
  // independently antialiased SVG shapes meet.
  const x0 = link.sourceNode.x + NODE_WIDTH - RIBBON_BAR_OVERLAP;
  const x1 = link.targetNode.x + RIBBON_BAR_OVERLAP;
  const curve = Math.max(36, (x1 - x0) * 0.48);
  const sourceTop = link.sourceY;
  const sourceBottom = link.sourceY + link.sourceHeight;
  const targetTop = link.targetY;
  const targetBottom = link.targetY + link.targetHeight;
  return [
    `M ${x0} ${sourceTop}`,
    `C ${x0 + curve} ${sourceTop}, ${x1 - curve} ${targetTop}, ${x1} ${targetTop}`,
    `L ${x1} ${targetBottom}`,
    `C ${x1 - curve} ${targetBottom}, ${x0 + curve} ${sourceBottom}, ${x0} ${sourceBottom}`,
    "Z",
  ].join(" ");
}

/** Places the dominant route on a flat top edge and only fans output downward. */
export function layoutMoneyFlow(flow: AnnualMoneyFlow): {
  height: number;
  nodes: LayoutNode[];
  links: LayoutLink[];
} {
  const visualValue = (item: MoneyFlowNode | MoneyFlowLink): number =>
    item.displayValue ?? item.value;
  const scale = SPINE_HEIGHT / Math.max(
    1,
    flow.totalInflows,
    ...flow.nodes.map(visualValue),
  );
  const linkHeightById = new Map(
    flow.links.map((link) => [
      link.id,
      Math.max(MIN_FLOW_HEIGHT, visualValue(link) * scale),
    ]),
  );
  const incomingHeight = new Map<string, number>();
  const outgoingHeight = new Map<string, number>();
  for (const link of flow.links) {
    const height = linkHeightById.get(link.id) ?? MIN_FLOW_HEIGHT;
    incomingHeight.set(link.target, (incomingHeight.get(link.target) ?? 0) + height);
    outgoingHeight.set(link.source, (outgoingHeight.get(link.source) ?? 0) + height);
  }
  const nodeHeight = (node: MoneyFlowNode): number => Math.max(
    MIN_FLOW_HEIGHT,
    visualValue(node) * scale,
    incomingHeight.get(node.id) ?? 0,
    outgoingHeight.get(node.id) ?? 0,
  );
  const nodes: LayoutNode[] = [];
  const source = flow.nodes.filter((node) => node.stage === 0);
  const spendableCash = flow.nodes.find((node) => node.id === "spendable-cash");
  const spend = flow.nodes.find((node) => node.id === "spend");
  const savings = flow.nodes.find((node) => node.id === "savings");
  const totalSavings = flow.nodes.find((node) => node.id === "total-savings");
  const cash = flow.nodes.find((node) => node.id === "cash");
  const investmentAccounts = flow.nodes.filter((node) =>
    node.stage === 4 && node.id.startsWith("investment:"),
  );
  const spendCategories = flow.nodes.filter((node) =>
    node.stage === 3 && (node.id.startsWith("expense:") || node.id.startsWith("income-reversal:")),
  );
  const stage = (node: MoneyFlowNode, y: number): LayoutNode => {
    const positioned = {
      ...node,
      x: STAGE_X[node.stage],
      y,
      height: nodeHeight(node),
    };
    nodes.push(positioned);
    return positioned;
  };
  const estimatedLabelHeight = (node: MoneyFlowNode): number =>
    node.name.length > 17 ? 48 : 32;
  const nodeGap = (current: MoneyFlowNode, next: MoneyFlowNode): number => {
    const currentHeight = nodeHeight(current);
    const nextHeight = nodeHeight(next);
    const collisionSafeGap = (
      estimatedLabelHeight(current) + estimatedLabelHeight(next) -
      currentHeight - nextHeight
    ) / 2 + 2;
    return Math.max(GAP, collisionSafeGap);
  };

  let sourceY = TOP;
  for (const [index, node] of source.entries()) {
    const positioned = stage(node, sourceY);
    const next = source[index + 1];
    sourceY = positioned.y + positioned.height + (next ? nodeGap(node, next) : GAP);
  }

  const directSavingsHeight = flow.links
    .filter((link) => link.target === "total-savings" && link.source !== "savings")
    .reduce((total, link) => total + (linkHeightById.get(link.id) ?? 0), 0);
  const topSource = source[0];
  const topSourceFeedsSpendable = topSource
    ? flow.links.some((link) => link.source === topSource.id && link.target === "spendable-cash") &&
      !flow.links.some((link) => link.source === topSource.id && link.target === "total-savings")
    : true;
  const stageOneY = topSourceFeedsSpendable
    ? TOP
    : TOP + directSavingsHeight + GROUP_GAP;
  let positionedSpendableCash: LayoutNode | undefined;
  if (spendableCash) {
    positionedSpendableCash = stage(spendableCash, stageOneY);
  }

  const stageTwoY = positionedSpendableCash?.y ?? TOP;
  const positionedSavings = savings ? stage(savings, stageTwoY) : undefined;
  const positionedSpend = spend
    ? stage(
      spend,
      positionedSavings
        ? positionedSavings.y + Math.max(1, positionedSavings.height) + GROUP_GAP
        : stageTwoY,
    )
    : undefined;

  let savingsBottom = TOP;
  if (totalSavings) {
    const positioned = stage(totalSavings, TOP);
    savingsBottom = positioned.y + positioned.height;
  }

  let investmentAccountsBottom = TOP;
  let investmentAccountY = TOP;
  for (const [index, node] of investmentAccounts.entries()) {
    const positioned = stage(node, investmentAccountY);
    const next = investmentAccounts[index + 1] ?? cash;
    investmentAccountY = positioned.y + positioned.height + (next ? nodeGap(node, next) : GAP);
    investmentAccountsBottom = positioned.y + positioned.height;
  }
  if (cash) {
    const positioned = stage(cash, investmentAccountY);
    investmentAccountsBottom = positioned.y + positioned.height;
  }

  const stageFourByParent = new Map<string, MoneyFlowNode[]>();
  for (const link of flow.links) {
    const target = flow.nodes.find((node) => node.id === link.target);
    if (!target || target.stage !== 4 || target.id.startsWith("investment:")) continue;
    const current = stageFourByParent.get(link.source) ?? [];
    current.push(target);
    stageFourByParent.set(link.source, current);
  }
  for (const children of stageFourByParent.values()) {
    children.sort((left, right) =>
      right.value - left.value || left.name.localeCompare(right.name),
    );
  }

  let categoryY = positionedSpend
    ? Math.max(
      positionedSpend.y,
      savingsBottom + GROUP_GAP,
      investmentAccountsBottom + GROUP_GAP,
    )
    : Math.max(savingsBottom, investmentAccountsBottom);
  for (const [categoryIndex, category] of spendCategories.entries()) {
    const positioned = stage(category, categoryY);
    const children = stageFourByParent.get(category.id) ?? [];
    let childY = categoryY;
    let childBottom = categoryY;
    for (const [index, child] of children.entries()) {
      const positionedChild = stage(child, childY);
      const next = children[index + 1];
      childY = positionedChild.y + positionedChild.height + (next ? nodeGap(child, next) : GAP);
      childBottom = positionedChild.y + positionedChild.height;
    }
    const nextCategory = spendCategories[categoryIndex + 1];
    categoryY = Math.max(
      positioned.y + positioned.height,
      childBottom,
    ) + (nextCategory ? nodeGap(category, nextCategory) : GAP);
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sourceOffsets = new Map<string, number>();
  const targetOffsets = new Map<string, number>();
  const orderedLinks = [...flow.links].sort((left, right) => {
    const leftSource = byId.get(left.source)!;
    const rightSource = byId.get(right.source)!;
    const leftTarget = byId.get(left.target)!;
    const rightTarget = byId.get(right.target)!;
    return leftSource.stage - rightSource.stage ||
      leftSource.y - rightSource.y ||
      leftTarget.y - rightTarget.y ||
      left.id.localeCompare(right.id);
  });

  const links = orderedLinks.map((link): LayoutLink => {
    const sourceNode = byId.get(link.source)!;
    const targetNode = byId.get(link.target)!;
    const baseHeight = linkHeightById.get(link.id) ?? MIN_FLOW_HEIGHT;
    const sourceHeight = baseHeight * sourceNode.height /
      Math.max(MIN_FLOW_HEIGHT, outgoingHeight.get(link.source) ?? baseHeight);
    const targetHeight = baseHeight * targetNode.height /
      Math.max(MIN_FLOW_HEIGHT, incomingHeight.get(link.target) ?? baseHeight);
    const sourceY = sourceNode.y + (sourceOffsets.get(link.source) ?? 0);
    const targetY = targetNode.y + (targetOffsets.get(link.target) ?? 0);
    sourceOffsets.set(link.source, sourceY - sourceNode.y + sourceHeight);
    targetOffsets.set(link.target, targetY - targetNode.y + targetHeight);
    return {
      ...link,
      sourceNode,
      targetNode,
      sourceY,
      targetY,
      sourceHeight,
      targetHeight,
    };
  });

  const bottom = Math.max(
    TOP + SPINE_HEIGHT,
    sourceY - GAP,
    categoryY - GAP,
    investmentAccountsBottom,
    savingsBottom,
  );
  return { height: Math.max(560, bottom + BOTTOM), nodes, links };
}

export class MoneyFlowChart extends HTMLElement implements EventListenerObject {
  #data: AnnualMoneyFlow | null = null;
  #tooltipAnchor: HTMLElement | null = null;

  set data(value: AnnualMoneyFlow | null) {
    this.#data = value;
    if (this.isConnected) this.#render();
  }

  get data(): AnnualMoneyFlow | null {
    return this.#data;
  }

  connectedCallback(): void {
    this.#render();
  }

  disconnectedCallback(): void {
    this.#hideTooltip();
  }

  handleEvent(event: Event): void {
    const target = event.currentTarget as SVGRectElement;
    const nodeId = target.dataset.nodeId;
    if (!nodeId) return;
    if (event.type === "pointerenter" || event.type === "focus" || event.type === "pointerdown") {
      this.#showNode(nodeId);
    } else if (event.type === "pointerleave" || event.type === "blur") {
      this.#clearNode();
    }
  }

  #render(): void {
    this.#hideTooltip();
    const flow = this.#data;
    if (!flow?.hasData) {
      this.replaceChildren();
      return;
    }

    const diagram = layoutMoneyFlow(flow);
    const links = diagram.links.map((link) => `
      <path
        class="money-flow-chart__link ${paletteClass(link.palette)}"
        data-flow-source="${escapeHTML(link.source)}"
        data-flow-target="${escapeHTML(link.target)}"
        d="${linkPath(link)}"
      ></path>`).join("");
    const nodes = diagram.nodes.map((node) => {
      const label = labelPlacement(node);
      const center = node.y + node.height / 2;
      const labelHeight = LABEL_HEIGHT;
      const hitHeight = Math.max(30, node.height);
      const hitY = center - hitHeight / 2;
      const relationship = relationshipBasis(node, flow);
      return `
        <g class="money-flow-chart__node ${paletteClass(node.palette)}" data-flow-node="${escapeHTML(node.id)}">
          <rect class="money-flow-chart__node-bar" x="${node.x}" y="${node.y}" width="${NODE_WIDTH}" height="${Math.max(0.75, node.height)}"></rect>
          <rect
            class="money-flow-chart__node-hit"
            data-node-id="${escapeHTML(node.id)}"
            x="${node.x - 8}"
            y="${hitY}"
            width="${NODE_WIDTH + 16}"
            height="${hitHeight}"
            tabindex="0"
            role="img"
            aria-label="${escapeHTML(`${node.name}, ${money(node.value, false)}, ${relationshipPercent(node, flow)} of ${relationship.label}`)}"
          ></rect>
          <foreignObject x="${label.x}" y="${center - labelHeight / 2}" width="${label.width}" height="${labelHeight}" aria-hidden="true">
            <div class="money-flow-chart__label is-${label.align}">
              <strong>${escapeHTML(node.name)}</strong>
              <span>${escapeHTML(chartSubtitle(node, flow))}</span>
            </div>
          </foreignObject>
        </g>`;
    }).join("");
    const summary = diagram.nodes.map((node) =>
      `<li>${escapeHTML(node.name)}: ${escapeHTML(money(node.value, false))}, ${relationshipPercent(node, flow)} of ${escapeHTML(relationshipBasis(node, flow).label)}.</li>`,
    ).join("");

    this.innerHTML = `
      <svg viewBox="0 0 ${WIDTH} ${diagram.height}" role="img" aria-label="Money flow for ${flow.year}" aria-describedby="money-flow-chart-description">
        <desc id="money-flow-chart-description">Annual categorized income and paycheck deductions become spendable cash, spending, and total savings, with investment and debt destinations.</desc>
        <g class="money-flow-chart__links" aria-hidden="true">${links}</g>
        <g class="money-flow-chart__nodes">${nodes}</g>
      </svg>
      <ol class="visually-hidden" aria-label="Money flow summary">${summary}</ol>
      <span class="money-flow-chart__tooltip-anchor" aria-hidden="true"></span>`;
    this.#tooltipAnchor = this.querySelector(".money-flow-chart__tooltip-anchor");
    this.querySelectorAll<SVGRectElement>(".money-flow-chart__node-hit").forEach((node) => {
      node.addEventListener("pointerenter", this);
      node.addEventListener("pointerleave", this);
      node.addEventListener("pointerdown", this);
      node.addEventListener("focus", this);
      node.addEventListener("blur", this);
    });
  }

  #showNode(nodeId: string): void {
    const flow = this.#data;
    const node = flow?.nodes.find((item) => item.id === nodeId);
    const anchor = this.#tooltipAnchor;
    const hit = [...this.querySelectorAll<SVGRectElement>(".money-flow-chart__node-hit")]
      .find((item) => item.dataset.nodeId === nodeId);
    if (!flow || !node || !anchor || !hit) return;

    this.querySelectorAll<SVGElement>("[data-flow-node], [data-flow-source], [data-flow-target]").forEach((item) => {
      const connected = item.getAttribute("data-flow-node") === nodeId ||
        item.getAttribute("data-flow-source") === nodeId ||
        item.getAttribute("data-flow-target") === nodeId;
      item.classList.toggle("is-active", connected);
      item.classList.toggle("is-muted", !connected);
    });

    const svg = this.querySelector("svg")!;
    const svgRect = svg.getBoundingClientRect();
    const hostRect = this.getBoundingClientRect();
    const hitRect = hit.getBoundingClientRect();
    anchor.style.left = `${hitRect.left - hostRect.left + hitRect.width / 2}px`;
    anchor.style.top = `${Math.max(svgRect.top, hitRect.top) - hostRect.top}px`;

    const content = document.createElement("div");
    content.className = "data-chart__tooltip money-flow-chart__tooltip";
    const title = document.createElement("strong");
    title.className = "data-chart__tooltip-title";
    title.textContent = node.name;
    const relationship = relationshipBasis(node, flow);
    const row = (
      labelText: string,
      valueText: string,
      swatchClass: string,
    ): HTMLDivElement => {
      const item = document.createElement("div");
      item.className = "data-chart__tooltip-row";
      const swatch = document.createElement("i");
      swatch.className = swatchClass;
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
      row("Amount", money(node.value, false), `is-bar is-palette-${node.palette}`),
    );
    if (!isCombinedFlowNode(node)) {
      const item = document.createElement("div");
      item.className = "data-chart__tooltip-row money-flow-chart__tooltip-relationship";
      const spacer = document.createElement("i");
      spacer.className = "is-detail";
      spacer.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.className = "data-chart__tooltip-label";
      text.textContent = `${relationshipPercent(node, flow)} of ${relationship.label}`;
      item.append(spacer, text);
      content.append(item);
    }

    const overlay = document.querySelector<HTMLElement>("overlay-manager") as
      | (HTMLElement & { showTooltip(anchor: HTMLElement, content: Node, options: { side: "top"; align: "center"; gap: number }): void })
      | null;
    overlay?.showTooltip(anchor, content, { side: "top", align: "center", gap: 8 });
  }

  #clearNode(): void {
    this.querySelectorAll<SVGElement>(".is-active, .is-muted").forEach((item) =>
      item.classList.remove("is-active", "is-muted"),
    );
    this.#hideTooltip();
  }

  #hideTooltip(): void {
    const overlay = document.querySelector<HTMLElement>("overlay-manager") as
      | (HTMLElement & { hideTooltip(): void })
      | null;
    overlay?.hideTooltip();
  }
}

if (!customElements.get("money-flow-chart")) {
  customElements.define("money-flow-chart", MoneyFlowChart);
}
