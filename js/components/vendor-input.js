const vendorSelectTemplate = () => `
  <div class="form-field vendor-form-field">
    <span class="vendor-select-label">Vendor</span>
    <div class="vendor-select-menu">
      <input class="vendor-id-input" name="vendorId" type="hidden" />
      <button
        class="vendor-select-trigger select-create-trigger"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span>Select a vendor</span>
      </button>
      <div class="select-create-popup" hidden>
        <div class="select-create-search-row">
          <input
            class="select-create-search"
            type="search"
            maxlength="80"
            autocomplete="off"
            placeholder="Search or add vendor"
            aria-autocomplete="list"
          />
          <button class="select-create-add" type="button" hidden>Add</button>
        </div>
        <p
          class="select-create-message"
          role="alert"
          aria-live="polite"
          hidden
        ></p>
        <div class="vendor-select-list select-create-list" role="listbox"></div>
      </div>
    </div>
  </div>
`;

(function () {
  let nextId = 0;

  class VendorInput extends HTMLElement {
    static get observedAttributes() {
      return ["value"];
    }

    #controller = null;
    #form = null;

    get value() {
      return (
        this.#controller?.value ||
        this.querySelector(".vendor-id-input")?.value ||
        this.getAttribute("value") ||
        ""
      );
    }

    set value(vendorId) {
      const id = String(vendorId || "");

      if (!this.#controller) {
        if (id) this.setAttribute("value", id);
        else this.removeAttribute("value");
        return;
      }

      this.#controller.setValue(id);
    }

    get isOpen() {
      return this.#controller?.isOpen || false;
    }

    setFallbackSelection(selection) {
      this.#controller?.setFallbackSelection(selection);
    }

    clearFallbackSelection() {
      this.#controller?.clearFallbackSelection();
    }

    reportSelectionError(message) {
      this.#controller?.reportSelectionError(message);
    }

    closePopup(options) {
      this.#controller?.close(options);
    }

    configureOptions(options) {
      this.#controller?.configure(options);
    }

    connectedCallback() {
      const initialValue = Object.prototype.hasOwnProperty.call(this, "value")
        ? String(this.value || "")
        : this.getAttribute("value") || "";
      if (Object.prototype.hasOwnProperty.call(this, "value")) {
        delete this.value;
      }

      this.innerHTML = vendorSelectTemplate();
      this.#form = this.closest("form");

      const controlId = `vendor-select-${++nextId}`;
      const labelId = `${controlId}-label`;
      const popupId = `${controlId}-popup`;
      const listId = `${controlId}-list`;
      const label = this.querySelector(".vendor-select-label");
      const trigger = this.querySelector(".vendor-select-trigger");
      const search = this.querySelector(".select-create-search");
      const popup = this.querySelector(".select-create-popup");
      const list = this.querySelector(".vendor-select-list");

      label.id = labelId;
      trigger.id = controlId;
      trigger.setAttribute("aria-labelledby", `${labelId} ${controlId}`);
      trigger.setAttribute("aria-controls", popupId);
      popup.id = popupId;
      list.id = listId;
      search.setAttribute("aria-label", "Search or add vendor");
      search.setAttribute("aria-controls", listId);

      this.#controller = new window.SelectCreateController({
        host: this,
        idInput: this.querySelector(".vendor-id-input"),
        trigger,
        triggerText: trigger.querySelector("span"),
        popup,
        search,
        addButton: this.querySelector(".select-create-add"),
        list,
        message: this.querySelector(".select-create-message"),
        getOptions: () => window.BudgetAPI.listVendors(),
        createOption: (name) => window.BudgetAPI.addVendor({ name }),
        onSelect: (vendor, state) => this.#handleSelection(vendor, state),
        onCreate: (vendor) => {
          this.dispatchEvent(
            new CustomEvent("vendor-created", {
              bubbles: true,
              detail: { vendor },
            }),
          );
          window.ToastUI?.show(
            window.BudgetAPI.getConfig().endpoint
              ? `${vendor.name} was added. Syncing…`
              : `${vendor.name} was added.`,
          );
        },
        placeholder: "Select a vendor",
        entityLabel: "vendor",
        emptyLabel: "No matching vendors",
      });

      this.#controller.refresh(initialValue);
      this.#controller.connect();
      this.#form?.addEventListener("reset", this);
      window.addEventListener("budget:vendors-changed", this);
    }

    disconnectedCallback() {
      this.#controller?.disconnect();
      this.#form?.removeEventListener("reset", this);
      window.removeEventListener("budget:vendors-changed", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (name === "value" && oldValue !== newValue && this.#controller) {
        this.#controller.setValue(newValue || "");
      }
    }

    handleEvent(event) {
      if (event.type === "reset") {
        setTimeout(() => this.#controller.refresh("", { resetSearch: true }), 0);
      }

      if (event.type === "budget:vendors-changed") {
        this.#controller.refresh(this.value);
      }
    }

    #handleSelection(vendor, { announce }) {
      const id = String(vendor?.id || "");

      if (id) {
        if (this.getAttribute("value") !== id) this.setAttribute("value", id);
      } else if (this.hasAttribute("value")) {
        this.removeAttribute("value");
      }

      if (announce) {
        this.dispatchEvent(
          new CustomEvent("vendor-selected", {
            bubbles: true,
            detail: { vendor },
          }),
        );
      }
    }
  }

  customElements.define("vendor-input", VendorInput);
})();
