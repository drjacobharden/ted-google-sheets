import { getIcon } from "../../icons";
import { createEventHandler } from "../../utilities/event-utilities";

export class Checkbox extends HTMLElement {
  #listening = false;
  #checkmark!: HTMLElement;
  #isOn: boolean = false;

  connectedCallback(): void {
    const icon = getIcon("checkmark");
    this.#checkmark = icon;
    this.append(icon);

    this.#handleToggle();

    if (!this.#listening) {
      this.addEventListener("click", this);
      this.#listening = true;
    }
  }

  diconnectedCallback() {
    if (!this.#listening) {
      this.removeEventListener("click", this);
      this.#listening = false;
    }
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.isOn = !this.isOn;
        break;

      default:
        break;
    }
  }

  #handleToggle() {
    this.toggleAttribute("active", this.#isOn);
    this.#checkmark.toggleAttribute("hidden", !this.#isOn);
  }

  set isOn(value: boolean) {
    this.#isOn = value;
    this.#handleToggle();
    this.#events.dispatch({ isOn: this.#isOn }, { bubbles: true });
  }

  get isOn(): boolean {
    return this.#isOn;
  }

  #events = createEventHandler("checkbox-selection", this);

  addListener = this.#events.addListener;
  removeListener = this.#events.removeListener;
  handleCheckboxSelection = this.#events.handleEvent;
}

customElements.define("check-box", Checkbox);
