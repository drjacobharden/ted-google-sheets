import { getIcon } from "../../icons";
import { createEventHandler } from "../../utilities/event-utilities";

export class Checkbox extends HTMLElement {
  static observedAttributes = ["active", "disabled"];

  #checkmark: HTMLElement | null = null;
  #isOn = false;
  #listening = false;

  connectedCallback() {
    this.setAttribute("role", "checkbox");
    this.#isOn = this.hasAttribute("active");

    if (!this.#checkmark) {
      const checkmark = getIcon("checkmark");
      this.#checkmark = checkmark;
      this.append(checkmark);
    }

    if (!this.#listening) {
      this.addEventListener("click", this);
      this.addEventListener("keydown", this);
      this.#listening = true;
    }

    this.#syncPresentation();
  }

  disconnectedCallback() {
    this.removeEventListener("click", this);
    this.removeEventListener("keydown", this);
    this.#listening = false;
  }

  attributeChangedCallback(name: string) {
    if (name === "active") this.#isOn = this.hasAttribute("active");
    this.#syncPresentation();
  }

  handleEvent(event: Event) {
    if (this.disabled) return;

    if (event.type === "keydown") {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== " " && keyboardEvent.key !== "Enter") return;
      keyboardEvent.preventDefault();
    }

    this.isOn = !this.isOn;
  }

  #syncPresentation() {
    this.toggleAttribute("active", this.#isOn);
    if (this.#checkmark) this.#checkmark.toggleAttribute("hidden", !this.#isOn);
    this.setAttribute("aria-checked", String(this.#isOn));
    this.setAttribute("aria-disabled", String(this.disabled));
    this.tabIndex = this.disabled ? -1 : 0;
  }

  set isOn(value: boolean) {
    const nextValue = Boolean(value);
    if (nextValue === this.#isOn) return;
    this.#isOn = nextValue;
    this.#syncPresentation();
    this.dispatchEvent(this.checkboxSelectionEvent);
  }

  get isOn() {
    return this.#isOn;
  }

  set disabled(value: boolean) {
    this.toggleAttribute("disabled", Boolean(value));
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }

  get checkboxSelectionEvent() {
    return new CustomEvent("checkbox-selection", {
      bubbles: true,
      detail: { isOn: this.isOn },
    });
  }

  #events = createEventHandler("checkbox-selection", this);

  addListener = this.#events.addListener;
  removeListener = this.#events.removeListener;
  handleCheckboxSelection = this.#events.handleEvent;
}

customElements.define("check-box", Checkbox);
