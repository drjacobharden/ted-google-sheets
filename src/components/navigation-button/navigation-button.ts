import { Icons } from "../../icons";
import templateString from "./template.html" with { type: "text" };

const navigationButtonTemplate = document.createElement("template");
navigationButtonTemplate.innerHTML = templateString;

class NavigationButton extends HTMLElement {
  #label: HTMLElement | null = null;
  #icon: SVGElement | null = null;

  static get observedAttributes(): string[] {
    return ["icon", "label", "class"];
  }

  connectedCallback(): void {
    const clone = navigationButtonTemplate.content.cloneNode(
      true,
    ) as DocumentFragment;
    const button = clone.querySelector("button") as HTMLElement;

    const label = this.getAttribute("label");
    const icon = this.getAttribute("icon");

    this.#label = button.querySelector("span");
    this.#icon = button.querySelector(".icon-wrapper");

    if (label && this.#label) {
      this.#label.textContent = label;
    }

    if (icon && Icons[icon] && this.#icon) {
      this.#icon.innerHTML = Icons[icon];
    }

    while (this.firstChild) {
      button.appendChild(this.firstChild);
    }

    this.appendChild(clone);
  }
}

customElements.define("navigation-button", NavigationButton);
