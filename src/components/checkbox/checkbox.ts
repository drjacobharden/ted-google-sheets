import { getIcon } from "../../icons";

export class Checkbox extends HTMLElement {
  #checkmark!: HTMLElement;
  #isOn: boolean = false;

  connectedCallback(): void {
    const icon = getIcon("checkmark");
    this.#checkmark = icon;
    this.append(icon);

    this.#handleToggle();
  }

  #handleToggle() {
    this.toggleAttribute("active", this.#isOn);
    this.#checkmark.toggleAttribute("hidden", !this.#isOn);
  }

  set isOn(value: boolean) {
    this.#isOn = value;
    this.#handleToggle();
  }

  get isOn(): boolean {
    return this.#isOn;
  }
}

customElements.define("check-box", Checkbox);
