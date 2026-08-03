import { OverlayManager } from "../../elements/overlay-manager/overlay-manager";
import { CustomButton } from "../button/button";

import RefreshButtonTempString from "./template.html" with { type: "text" };

const RefreshButtonTemp = document.createElement("template");
RefreshButtonTemp.innerHTML = RefreshButtonTempString;

export class RefreshButton extends CustomButton {
  #overlayManager!: OverlayManager;
  #button!: HTMLElement;

  connectedCallback(): void {
    this.setAttribute("leading-icon", "sync");
    this.setAttribute("class", "secondary-button square");

    super.connectedCallback();

    this.#overlayManager = document.querySelector("overlay-manager")!;

    this.addEventListener("click", this);
    this.addEventListener("pointerenter", this);
    this.addEventListener("pointerleave", this);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      case "pointerenter":
        this.#pointerEnter(event);
        break;

      case "pointerleave":
        this.#pointerLeave(event);
        break;

      default:
        break;
    }
  }

  #handleClick(event: Event) {
    const target = event.target as HTMLElement;
    const button = target.closest("#app-refresh-button");
  }

  #pointerEnter(event: Event) {
    const target = event.target as HTMLElement;
    const button = target.closest("refresh-button") as HTMLElement;

    this.#overlayManager.showTooltip(button, "Refresh Data", {
      side: "bottom",
      align: "center",
      gap: 8,
    });
  }

  #pointerLeave(event: Event) {
    this.#overlayManager.hideTooltip();
  }

  disconnectedCallback() {
    this.removeEventListener("click", this);
  }
}

customElements.define("refresh-button", RefreshButton);
