const vendorInputTemplate = () => `
<div class="form-field vendor-form-field">
    <span class="vendor-label">Vendor</span>
    <div class="vendor-combobox">
        <input class="vendor-id-input" name="vendorId" type="hidden" />
        <input
            class="vendor-combobox-input"
            type="text"
            maxlength="80"
            autocomplete="off"
            placeholder="Type a vendor name"
            role="combobox"
            aria-labelledby="vendor-combobox-label"
            aria-autocomplete="list"
            aria-expanded="false"
            aria-controls="vendor-combobox-list"
        />
        <div
            class="vendor-combobox-list"
            role="listbox"
            hidden
        ></div>
    </div>
    <p class="inline-vendor-message" aria-live="polite" hidden></p>
</div>
`;

(function () {
  class VendorInput extends HTMLElement {
    static get observedAttributes() {
      return ["value"];
    }

    #isFocused = false;
    #vendors = [];
    #vendorsByName = new Map();
    #vendorsById = new Map();

    // Elements Cache
    #idInput = null;
    #displayInput = null;
    #list = null;
    #message = null;

    get value() {
      return this.#idInput?.value || "";
    }

    set value(vendorId) {
      const id = String(vendorId || "");

      if (!this.#idInput) {
        this.setAttribute("value", id);
        return;
      }

      if (!id) {
        this.#clear();
        return;
      }

      const vendor = this.#vendorsById.get(item.id);

      if (vendor) {
        this.#selectVendor(vendor);
      } else {
        this.#clear();
      }
    }

    #clear() {
      this.#idInput.value = "";
      this.#displayInput.value = "";
      this.#message.textContent = "";
      this.#closeVendorList();
    }

    connectedCallback() {
      this.innerHTML = vendorInputTemplate();

      this.#refreshVendors();

      this.#idInput = this.querySelector(".vendor-id-input");
      this.#displayInput = this.querySelector(".vendor-combobox-input");
      this.#list = this.querySelector(".vendor-combobox-list");
      this.#message = this.querySelector(".inline-vendor-message");

      this.#displayInput.addEventListener("input", this);
      this.#displayInput.addEventListener("focus", this);
      this.#displayInput.addEventListener("blur", this);
      this.#list.addEventListener("pointerdown", this);
      this.#list.addEventListener("click", this);
      window.addEventListener("budget:vendors-changed", this);
    }

    disconnectedCallback() {
      this.#displayInput.removeEventListener("input", this);
      this.#displayInput.removeEventListener("focus", this);
      this.#displayInput.removeEventListener("blur", this);
      this.#list.removeEventListener("pointerdown", this);
      this.#list.removeEventListener("click", this);
      window.removeEventListener("budget:vendors-changed", this);
    }

    handleEvent(event) {
      switch (event.type) {
        case "input":
          this.#handleInput(event);
          break;

        case "focus":
          this.#handleFocus(event);
          break;

        case "blur":
          this.#handleBlur(event);
          break;

        case "pointerdown":
          this.#handleListPointerDown(event);
          break;

        case "click":
          this.#handleListClick(event);
          break;

        case "budget:vendors-changed":
          this.#handleVendorsChanged(event);
          break;

        default:
          break;
      }
    }

    //
    //  Prevents the list from closing when the pointer initially goes down
    #handleListPointerDown(event) {
      const option = event.target.closest('button[role="option"]');

      if (!option || !this.#list.contains(option)) {
        return;
      }

      event.preventDefault();
    }

    //
    //  Handle clicks inside the vendor list
    //      -   Find the closest button inside the list
    //          -   If the button is not in the list, return
    //      -   If the button is the "add-vendor" button, attempt to add the new vendor
    //      -   If the button is assigned to a current vendor, select that vendor
    async #handleListClick(event) {
      const option = event.target.closest('button[role="option"]');

      if (!option || !this.#list.contains(option)) {
        return;
      }

      if (option.dataset.action === "add-vendor") {
        await this.#addTypedVendor(option);
        return;
      }

      const vendorId = option.dataset.vendorId;
      const vendor = this.#vendorsById.get(vendorId);

      if (vendor) {
        this.#selectVendor(vendor);
      }
    }

    //
    //  Closes the vendor list
    #closeVendorList() {
      this.#list.hidden = true;
      this.#displayInput.setAttribute("aria-expanded", "false");
    }

    //
    //  Opens the vendor list
    #openVendorList() {
      this.#list.hidden = false;
      this.#displayInput.setAttribute("aria-expanded", "true");
    }

    //
    //  Checks to see if a typed value is an exact match to a vendor that already exists
    //      -   Calls the normalizeVendorName to account for spacing and capitalization differences
    //      -   Returns the vendor if it exists
    #exactMatch() {
      const key = this.#normalizeVendorName(this.#displayInput.value);
      if (!key) return null;
      return this.#vendorsByName.get(key) ?? null;
    }

    //
    //  Handles changing the vendor id to the matched id or to nothing if there is no match
    //      -   In the event that we want it to overwrite the name input as well, it will populate that too
    //      -   Clears any error messages if a match is found
    //      -   Will send out a custom event alerting any listeners that the vendor id changed
    #resolveExactMatch({ announce = true, canonicalizeDisplay = false } = {}) {
      const previousId = this.#idInput.value;
      const vendor = this.#exactMatch();

      this.#idInput.value = vendor?.id || "";

      if (vendor && canonicalizeDisplay) {
        this.#displayInput.value = vendor.name;
      }

      if (vendor) {
        this.#clearError();
      }

      if (announce && this.#idInput.value !== previousId) {
        this.dispatchEvent(
          new CustomEvent("vendor-resolved", {
            bubbles: true,
            detail: { vendor },
          }),
        );
      }

      return vendor;
    }

    //
    //  Renders the list of vendor names with an "Add vendor" button at the top for any new ones
    //      -   Filters vendors via a relevance based scoring system where exact matches show first
    //      -   Returns a list of buttons for each vendor who fits the search criteria
    #renderList() {
      const allVendors = this.#vendors;
      const query = this.#displayInput.value.trim().toLowerCase();

      const options = [];
      const filtered = [];

      if (query.length === 0 || !this.#isFocused) {
        this.#closeVendorList();
        return;
      }

      for (let i = 0; i < allVendors.length; i++) {
        let score = 0;
        const vendor = allVendors[i];
        const name = vendor.name.toLowerCase();
        const isInQuery = !query || vendor.name.toLowerCase().includes(query);

        switch (true) {
          case !isInQuery:
            break;

          case name === query:
            score = 4;
            break;

          case name.startsWith(query):
            score = 3;
            break;

          case name.includes(" " + query):
            score = 2;
            break;

          case name.includes(query):
            score = 1;
            break;

          default:
            score = 0;
            break;
        }

        if (score === 0) continue;

        filtered.push({ score, ...vendor });
      }

      filtered.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.name.localeCompare(b.name);
      });

      for (let i = 0; i < filtered.length; i++) {
        const vendor = filtered[i];
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "option");
        button.id = `vendor-option-${vendor.id}`;
        button.dataset.vendorId = vendor.id;
        button.textContent = vendor.name;
        options.push(button);
      }

      if (query && filtered[0]?.score !== 4) {
        const add = document.createElement("button");
        add.type = "button";
        add.setAttribute("role", "option");
        add.className = "add-option";
        add.id = "vendor-option-add";
        add.dataset.action = "add-vendor";
        add.textContent = `Add “${this.#displayInput.value.trim()}”`;
        options.unshift(add);
      }

      this.#list.replaceChildren(...options);
      this.#openVendorList();
    }

    //
    //  Handles text input changes as users type the name of the vendor
    //      -   If the user types the name of an existing vendor, the id will auto-add
    //      -   Will also clear an existing id if no match is set
    //      -   Changes the search text to the inputted text and re-renders the vendor list to match
    #handleInput(event) {
      this.#resolveExactMatch({
        canonicalizeDisplay: false,
      });

      this.#renderList();
    }

    //
    //  Sets focus of the text input
    #handleFocus(event) {
      this.#isFocused = true;
      this.#renderList();
    }

    //  Removed focus of the text input so that the list doesn't show when you're not typing
    #handleBlur(event) {
      this.#isFocused = false;
      this.#renderList();
    }

    //
    //  If the list of vendors changes, this will re-render the vendor list to make sure it matches
    #handleVendorsChanged() {
      this.#refreshVendors();
      this.#resolveExactMatch({ announce: false });

      if (!this.#list.hidden) {
        this.#renderList();
      }
    }

    //
    //  Handles selection of a vendor from the vendor list
    //      -   Set the id to the selected vendor id
    //      -   Sets the name text to the selected name
    //      -   Clears any error messages and closes the list
    //      -   Sends out a custom event alerting that a vendor was selected
    #selectVendor(vendor) {
      this.#idInput.value = vendor.id;
      this.#displayInput.value = vendor.name;

      this.#closeVendorList();
      this.#clearError();

      this.dispatchEvent(
        new CustomEvent("vendor-selected", {
          bubbles: true,
          detail: { vendor },
        }),
      );
    }

    //
    //  Adds a new vendor to the spreadsheet
    //      -   First checks to make sure that no vendor already exists with that name
    //      -   If the vendor already exists, it will just select them instead
    //      -   If it's a new vendor, it will begin syncing it to the backend and return the id for the form.
    async #addTypedVendor(button) {
      const name = this.#displayInput.value.trim();

      if (!name) {
        this.#showError("Enter a vendor name.");
        return;
      }

      const existing = this.#vendorsByName.get(this.#normalizeVendorName(name));

      if (existing) {
        this.#selectVendor(existing);
        return;
      }

      button.disabled = true;
      button.textContent = `Adding “${name}”…`;
      this.#clearError();

      try {
        const vendor = await window.BudgetAPI.addVendor({ name });

        this.#selectVendor(vendor);

        this.dispatchEvent(
          new CustomEvent("vendor-created", {
            bubbles: true,
            detail: { vendor },
          }),
        );
      } catch (error) {
        this.#showError(error.message || "Could not add the vendor.");

        if (button.isConnected) {
          button.disabled = false;
          button.textContent = `Add “${name}”`;
        }
      }
    }

    //
    //  Displays an error message under the input
    #showError(text) {
      this.#message.className = "inline-vendor-message error";
      this.#message.textContent = text;
      this.#message.hidden = false;
    }

    //
    //  Clear any error messages that have occurred
    #clearError() {
      this.#message.className = "inline-vendor-message";
      this.#message.textContent = "";
      this.#message.hidden = true;
    }

    //
    //  Removes spaces and capitalization form vendor names to avoid duplicates
    #normalizeVendorName(value) {
      return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en-US");
    }

    //
    //  Resets the vendor list anytime the vendors change
    #refreshVendors() {
      this.#vendors = window.BudgetAPI.listVendors();
      this.#vendorsByName = new Map();
      this.#vendorsById = new Map();

      for (let i = 0, l = this.#vendors.length; i < l; i++) {
        const vendor = this.#vendors[i];
        const key = this.#normalizeVendorName(vendor.name);
        this.#vendorsByName.set(key, vendor);
        this.#vendorsById.set(vendor.id, vendor);
      }
    }
  }

  customElements.define("vendor-input", VendorInput);
})();
