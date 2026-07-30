import { getIcon, IconKeys } from "../../icons";

class NavigationButton extends HTMLElement {
  #button!: HTMLElement;
  #label!: HTMLElement;
  #icon!: SVGElement;

  static get observedAttributes(): string[] {
    return ["icon", "label", "class"];
  }

  connectedCallback(): void {
    const label = this.getAttribute("label");
    const icon = this.getAttribute("icon") as IconKeys;

    this.#button = document.createElement("button");
    this.#button.setAttribute("class", "navigation-button");
    this.#button.setAttribute("type", "button");
    this.#button.setAttribute("aria-current", "page");

    if (label) {
      this.#label = document.createElement("span");
      this.#label.textContent = label;
      this.#button.append(this.#label);
    }

    if (icon) {
      this.#icon = getIcon(icon);
      this.#button.insertBefore(this.#icon, this.#label);
    }

    while (this.firstChild) {
      this.#button.appendChild(this.firstChild);
    }

    this.appendChild(this.#button);
  }
}

customElements.define("navigation-button", NavigationButton);
