type PopoverSide = "top" | "right" | "bottom" | "left";
type PopoverAlign = "start" | "center" | "end";

export interface PopoverOptions {
  side?: PopoverSide;
  align?: PopoverAlign;
  gap?: number;
  offset?: number;
}

export class Popover extends HTMLElement {
  #handleScroll = () => {
    if (!this.classList.contains("is-visible")) return;

    this.hide();
    this.dispatchEvent(
      new CustomEvent("popover-dismiss", {
        bubbles: true,
        detail: { reason: "scroll" },
      }),
    );
  };

  connectedCallback(): void {
    this.classList.add("popover");

    while (this.firstChild) {
      this.appendChild(this.firstChild);
    }
  }

  disconnectedCallback(): void {
    window.removeEventListener("scroll", this.#handleScroll, true);
  }

  show(anchor: HTMLElement, options: PopoverOptions = {}) {
    const { side = "top", align = "center", gap = 8, offset = 0 } = options;

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
      offset,
    );

    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
    this.style.transformOrigin = this.getTransformOrigin(side, align);

    this.style.visibility = "";
    window.addEventListener("scroll", this.#handleScroll, true);
  }

  hide() {
    this.classList.remove("is-visible");
    window.removeEventListener("scroll", this.#handleScroll, true);
  }

  private calculatePosition(
    anchor: DOMRect,
    tooltipWidth: number,
    tooltipHeight: number,
    side: PopoverSide,
    align: PopoverAlign,
    gap: number,
    offset: number,
  ): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (side === "top" || side === "bottom") {
      y =
        side === "top" ? anchor.top - tooltipHeight - gap : anchor.bottom + gap;

      switch (align) {
        case "start":
          x = anchor.left - offset;
          break;

        case "center":
          x = anchor.left + (anchor.width - tooltipWidth) / 2;
          break;

        case "end":
          x = anchor.right - tooltipWidth + offset;
          break;
      }
    } else {
      x =
        side === "left" ? anchor.left - tooltipWidth - gap : anchor.right + gap;

      switch (align) {
        case "start":
          y = anchor.top - offset;
          break;

        case "center":
          y = anchor.top + (anchor.height - tooltipHeight) / 2;
          break;

        case "end":
          y = anchor.bottom - tooltipHeight + offset;
          break;
      }
    }

    return { x, y };
  }

  private getTransformOrigin(side: PopoverSide, align: PopoverAlign): string {
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

customElements.define("pop-over", Popover);
