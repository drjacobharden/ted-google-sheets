// HTML Template: Remove the ` ` at the start and end to edit but put them back before saving
const currencyInputTemplate = () => `
  <label class="form-field">
    <span>Amount</span>
    <div class="input-shell">
      <span class="input-prefix">$</span>
      <input
        class="currency-field"
        name="amount"
        type="number"
        inputmode="decimal"
        min="0.01"
        step="0.01"
        placeholder="0.00"
        required
      />
    </div>
  </label>
`;

(function () {
  class CurrencyInput extends HTMLElement {
    #input = null;

    connectedCallback() {
      this.render();
    }

    render() {
      this.innerHTML = currencyInputTemplate();
      this.#input = this.querySelector(".currency-field");

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
})();
