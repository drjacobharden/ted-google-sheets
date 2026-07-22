(function () {
  class PageTitle extends HTMLElement {
    connectedCallback() {
      if (this.dataset.initialized) return;
      this.dataset.initialized = "true";

      const eyebrow = this.getAttribute("eyebrow");
      const title = this.getAttribute("title");
      const subtitle = this.getAttribute("subtitle");

      const section = document.createElement("div");
      section.className = "page-heading heading-row";

      const textColumn = document.createElement("div");
      section.appendChild(textColumn);

      if (eyebrow) {
        const text = document.createElement("p");
        text.textContent = eyebrow;
        text.className = "eyebrow";
        textColumn.appendChild(text);
      }

      if (title) {
        const text = document.createElement("h1");
        text.textContent = title;
        textColumn.appendChild(text);
      }

      if (subtitle) {
        const text = document.createElement("p");
        text.textContent = subtitle;
        text.className = "heading-copy";
        textColumn.appendChild(text);
      }

      while (this.firstChild) {
        section.appendChild(this.firstChild);
      }

      this.appendChild(section);
    }
  }

  customElements.define("page-title", PageTitle);
})();
