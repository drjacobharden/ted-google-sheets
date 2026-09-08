// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { SelectCreateController } from "../select-create-controller/select-create-controller";
import { showToast } from "../toast-stack/toast-service";

import CurrencyInputTempString from "./template.html" with { type: "text" };
const CurrencyInputTemp = document.createElement("template");
CurrencyInputTemp.innerHTML = CurrencyInputTempString;

class CurrencyInput extends HTMLElement {
  #label: HTMLElement;
  #input = null;

  connectedCallback() {
    this.render();
  }

  render() {
    const clone = CurrencyInputTemp.content.cloneNode(true);
    this.append(clone);
    this.#input = this.querySelector(".currency-field");

    this.classList.add("form-field");

    if (this.#input) {
      const value = this.getAttribute("value");
      const ariaLabel = this.getAttribute("aria-label");
      const label = this.getAttribute("label");
      const name = this.getAttribute("name");
      const helper = this.getAttribute("helper");

      this.#label = this.querySelector(":scope > span")!;

      if (value !== null) this.#input.value = value;
      if (ariaLabel) this.#input.setAttribute("aria-label", ariaLabel);
      if (label) this.#label.textContent = label;
      if (name) this.#input.name = name;

      const message = this.querySelector(".currency-input__message");
      if (message && helper) {
        message.textContent = helper;
        message.hidden = false;
      }

      for (const attribute of ["min", "max", "step", "inputmode"]) {
        const attributeValue = this.getAttribute(attribute);
        if (attributeValue !== null) {
          this.#input.setAttribute(attribute, attributeValue);
        }
      }

      if (this.hasAttribute("required")) this.#input.required = true;

      this.#input.addEventListener("input", this);
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
        this.#handleInput(event);
        break;

      default:
        break;
    }
  }

  // Block inputs beyond two decimals
  #handleInput = (e) => {
    const minimumValue = e.target.getAttribute("min");
    const minimum = Number(minimumValue);
    if (
      minimumValue !== null &&
      Number.isFinite(minimum) &&
      minimum >= 0 &&
      e.target.value.includes("-")
    ) {
      e.target.value = e.target.value.replaceAll("-", "");
    }
    const value = e.target.value;
    if (value.includes(".")) {
      const parts = value.split(".");
      if (parts[1].length > 2) {
        e.target.value = `${parts[0]}.${parts[1].slice(0, 2)}`;
      }
    }
  };

  // Cleans up the listeners when the input is removed from the DOM
  disconnectedCallback() {
    if (this.#input) {
      this.#input.removeEventListener("input", this);
    }
  }

  set label(text: string) {
    this.#label.textContent = text;
  }

  set helper(text: string) {
    const message = this.querySelector(".currency-input__message");
    if (!message) return;
    message.textContent = text;
    message.hidden = !text;
  }

  set min(value: string | number | null) {
    const nextValue = value === null || value === "" ? null : String(value);
    if (nextValue === null) {
      this.removeAttribute("min");
      this.#input?.removeAttribute("min");
      return;
    }
    this.setAttribute("min", nextValue);
    this.#input?.setAttribute("min", nextValue);
  }

  get value(): string {
    return this.#input?.value ?? this.getAttribute("value") ?? "";
  }

  set value(value: string | number) {
    const nextValue = String(value ?? "");
    if (this.#input) this.#input.value = nextValue;
    else this.setAttribute("value", nextValue);
  }

  focus(options?: FocusOptions): void {
    this.#input?.focus(options);
  }
}

customElements.define("currency-input", CurrencyInput);
