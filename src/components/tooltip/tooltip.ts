import { Popover, PopoverOptions } from "../popover-menu/popover-menu";

export class Tooltip extends Popover {
  connectedCallback(): void {
    super.connectedCallback();

    this.classList.add("tooltip");
    this.setAttribute("role", "tooltip");
  }

  showTooltip(anchor: HTMLElement, text: string, options: PopoverOptions) {
    this.textContent = text;
    this.show(anchor, options);
  }
}

customElements.define("tool-tip", Tooltip);
