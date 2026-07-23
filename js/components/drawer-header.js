(function () {
  class DrawerHeader extends HTMLElement {
    #title = null;
    #eyebrow = null;
    #backButton = null;

    set title(value) {
      if (this.#title) {
        this.#title.textContent = value;
      }
    }

    set eyebrow(value) {
      if (this.#eyebrow) {
        this.#eyebrow.textContent = value;
      }
    }

    connectedCallback() {
      if (this.dataset.initialized) return;
      this.dataset.initialized = "true";

      const eyebrow = this.getAttribute("eyebrow");
      const title = this.getAttribute("title");

      const section = document.createElement("header");
      section.className = "transaction-drawer-header";

      const textColumn = document.createElement("div");
      section.appendChild(textColumn);

      if (eyebrow) {
        const text = document.createElement("p");
        this.#eyebrow = text;
        text.textContent = eyebrow;
        text.className = "eyebrow";
        textColumn.appendChild(text);
      }

      if (title) {
        const text = document.createElement("h2");
        this.#title = text;
        text.textContent = title;
        textColumn.appendChild(text);
      }

      const backButton = document.createElement("close-button");
      backButton.className = "drawer-close";
      section.appendChild(backButton);

      this.#backButton = backButton;
      this.#backButton.addEventListener("click", this);

      this.appendChild(section);
    }

    handleEvent(event) {
      switch (event.type) {
        case "click":
          this.#handleClose(event);
          break;

        default:
          break;
      }
    }

    #handleClose() {
      this.dispatchEvent(
        new CustomEvent("drawer:close-requested", { bubbles: true }),
      );
    }

    disconnectedCallback() {
      this.#backButton.removeEventListener("click", this);
    }
  }

  customElements.define("drawer-header", DrawerHeader);
})();
