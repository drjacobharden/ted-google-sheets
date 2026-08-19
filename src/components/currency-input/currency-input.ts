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
}

customElements.define("currency-input", CurrencyInput);
