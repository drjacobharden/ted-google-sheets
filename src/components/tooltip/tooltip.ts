import { Popover, PopoverOptions } from "../popover-menu/popover-menu";

export class Tooltip extends Popover {
  connectedCallback(): void {
    super.connectedCallback();

    this.classList.add("tooltip");
    this.setAttribute("role", "tooltip");
  }

  showTooltip(anchor: HTMLElement, content: string | Node, options: PopoverOptions) {
    if (typeof content === "string") this.textContent = content;
    else this.replaceChildren(content);
    this.show(anchor, options);
  }
}

customElements.define("tool-tip", Tooltip);
