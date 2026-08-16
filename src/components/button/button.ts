import { getIcon, IconKeys } from "../../icons";

export class CustomButton extends HTMLElement {
  #label!: HTMLElement;
  #leadingIcon: HTMLElement | null = null;
  #trailingIcon: HTMLElement | null = null;

  connectedCallback(): void {
    this.setAttribute("role", "button");
    this.style.cursor = "pointer";
    this.classList.add("button");

    const label = this.getAttribute("label");
    const leadingIcon = this.getAttribute("leading-icon") as IconKeys;
    const trailingIcon = this.getAttribute("trailing-icon") as IconKeys;

    if (label) {
      this.#createLabel(label);
    }

    if (leadingIcon) {
      this.#createLeadingIcon(leadingIcon);
    }

    if (trailingIcon) {
      this.#createTrailingIcon(trailingIcon);
    }
  }

  set label(value: string) {
    if (this.#label) {
      this.#label.textContent = value;
    } else {
      this.#createLabel(value);
    }
  }

  set leadingIcon(value: IconKeys) {
    if (this.#leadingIcon) {
      this.#leadingIcon = getIcon(value);
    } else {
      this.#createLeadingIcon(value);
    }
  }

  set trailingIcon(value: IconKeys) {
    if (this.#trailingIcon) {
      this.#trailingIcon = getIcon(value);
    } else {
      this.#createTrailingIcon(value);
    }
  }

  #createLabel(label: string) {
    const span = document.createElement("span");
    span.textContent = label;
    span.setAttribute("class", "button");
    this.#label = span;
    this.append(span);
  }

  #createLeadingIcon(leadingIcon: IconKeys) {
    const icon = getIcon(leadingIcon);
    icon.setAttribute("class", "custom-button-icon");
    this.insertBefore(icon, this.firstChild);
    this.#leadingIcon = icon;
  }

  #createTrailingIcon(trailingIcon: IconKeys) {
    const icon = getIcon(trailingIcon);
    icon.setAttribute("class", "custom-button-icon");
    this.append(icon);
    this.#trailingIcon = icon;
  }
}

customElements.define("custom-button", CustomButton, { extends: "button" });
