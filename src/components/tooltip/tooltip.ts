type TooltipSide = "top" | "right" | "bottom" | "left";
type TooltipAlign = "start" | "center" | "end";

export interface TooltipOptions {
  side?: TooltipSide;
  align?: TooltipAlign;
  gap?: number;
}
export class Tooltip extends HTMLElement {
  connectedCallback(): void {
    this.setAttribute("class", "tooltip");
    this.setAttribute("role", "tooltip");
  }

  show(anchor: HTMLElement, text: string, options: TooltipOptions = {}) {
    const { side = "top", align = "center", gap = 8 } = options;

    this.textContent = text;
    this.dataset.side = side;
    this.dataset.align = align;

    // Make it measurable, but not yet visibly animated.
    this.style.visibility = "hidden";
    this.classList.add("is-visible");

    const anchorRect = anchor.getBoundingClientRect();

    const { x, y } = this.calculatePosition(
      anchorRect,
      this.offsetWidth,
      this.offsetHeight,
      side,
      align,
      gap,
    );

    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
    this.style.transformOrigin = this.getTransformOrigin(side, align);

    this.style.visibility = "";
  }

  hide() {
    this.classList.remove("is-visible");
  }

  private calculatePosition(
    anchor: DOMRect,
    tooltipWidth: number,
    tooltipHeight: number,
    side: TooltipSide,
    align: TooltipAlign,
    gap: number,
  ): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (side === "top" || side === "bottom") {
      y =
        side === "top" ? anchor.top - tooltipHeight - gap : anchor.bottom + gap;

      switch (align) {
        case "start":
          x = anchor.left;
          break;

        case "center":
          x = anchor.left + (anchor.width - tooltipWidth) / 2;
          break;

        case "end":
          x = anchor.right - tooltipWidth;
          break;
      }
    } else {
      x =
        side === "left" ? anchor.left - tooltipWidth - gap : anchor.right + gap;

      switch (align) {
        case "start":
          y = anchor.top;
          break;

        case "center":
          y = anchor.top + (anchor.height - tooltipHeight) / 2;
          break;

        case "end":
          y = anchor.bottom - tooltipHeight;
          break;
      }
    }

    return { x, y };
  }

  private getTransformOrigin(side: TooltipSide, align: TooltipAlign): string {
    const alignment = {
      start: "0%",
      center: "50%",
      end: "100%",
    }[align];

    switch (side) {
      case "top":
        return `${alignment} 100%`;

      case "bottom":
        return `${alignment} 0%`;

      case "left":
        return `100% ${alignment}`;

      case "right":
        return `0% ${alignment}`;
    }
  }
}

customElements.define("tooltip-overlay", Tooltip);
