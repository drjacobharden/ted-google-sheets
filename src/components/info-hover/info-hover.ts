import { OverlayManager } from "../../elements/overlay-manager/overlay-manager";
import { PopoverOptions } from "../popover-menu/popover-menu";

export class InfoHover extends HTMLElement {
  #manger: OverlayManager | null = null;

  set message(text: string | undefined) {
    this.dataset.info = text;
    this.#setMessage();
  }

  connectedCallback(): void {
    this.#manger = document.querySelector("overlay-manager");
    this.innerHTML = `<custom-icon icon="info"></custom-icon>`;
    this.#setMessage();

    this.addEventListener("pointerover", this);
    this.addEventListener("pointerout", this);
    this.addEventListener("focusin", this);
    this.addEventListener("focusout", this);
  }

  #setMessage() {
    const message = this.dataset.info;

    if (message) {
      this.setAttribute("data-info-help", message);
      this.toggleAttribute("hidden", false);
    } else {
      this.removeAttribute("data-info-help");
      this.toggleAttribute("hidden", true);
    }
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "pointerover":
      case "focusin":
        const align =
          (this.dataset.align as PopoverOptions["align"]) ?? "center";
        const gap = (this.dataset.gap as PopoverOptions["gap"]) ?? 8;
        const side = (this.dataset.side as PopoverOptions["side"]) ?? "top";
        const message = this.dataset.info;

        if (message) {
          this.#manger?.showTooltip(this, message, { side, align, gap });
        }
        break;

      case "pointerout":
      case "focusout":
        this.#manger?.hideTooltip();
        break;

      default:
        break;
    }
  }

  disconnectedCallback() {
    this.removeEventListener("pointerover", this);
    this.removeEventListener("pointerout", this);
    this.removeEventListener("focusin", this);
    this.removeEventListener("focusout", this);
  }
}

customElements.define("info-hover", InfoHover);
