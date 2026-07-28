import { Tooltip, TooltipOptions } from "../../components/tooltip/tooltip";

export class OverlayManager extends HTMLElement {
  #tooltip!: Tooltip;

  static get observedAttributes(): string[] {
    return [];
  }

  connectedCallback(): void {
    const manager = document.createElement("div");
    manager.id = "overlay-manager";

    // Add the tooltip to the manager layer
    const tooltip = document.createElement("tooltip-overlay") as Tooltip;
    manager.append(tooltip);
    this.#tooltip = tooltip;

    this.append(manager);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      default:
        break;
    }
  }

  showTooltip(anchor: HTMLElement, text: string, options: TooltipOptions) {
    this.#tooltip.show(anchor, text, options);
  }

  hideTooltip() {
    this.#tooltip.hide();
  }

  disconnectedCallback() {}
}

customElements.define("overlay-manager", OverlayManager);
