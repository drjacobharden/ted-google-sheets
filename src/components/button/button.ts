import { getIcon, IconKeys } from "../../icons";

export class CustomButton extends HTMLElement {
  #label!: HTMLElement;

  connectedCallback(): void {
    this.setAttribute("role", "button");
    this.classList.add("custom-button");
    this.style.cursor = "pointer";

    const label = this.getAttribute("label");
    const leadingIcon = this.getAttribute("leading-icon") as IconKeys;
    const trailingIcon = this.getAttribute("trailing-icon") as IconKeys;

    if (label) {
      const span = document.createElement("span");
      span.textContent = label;
      span.setAttribute("class", "custom-button-label");
      this.#label = span;
      this.append(span);
    }

    if (leadingIcon) {
      const icon = getIcon(leadingIcon);
      icon.setAttribute("class", "custom-button-icon");
      this.insertBefore(icon, this.firstChild);
    }

    if (trailingIcon) {
      const icon = getIcon(leadingIcon);
      icon.setAttribute("class", "custom-button-icon");
      this.append(icon);
    }
  }

  set label(value: string) {
    this.#label.textContent = value;
  }
}

customElements.define("custom-button", CustomButton, { extends: "button" });
