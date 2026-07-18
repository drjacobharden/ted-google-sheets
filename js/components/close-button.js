const closeButtonTemplate = (id) => `
  <button
    class="drawer-close"
    id="${id}"
    type="button"
    aria-label="Close drawer"
  >
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18 6L6 18M6 6L18 18"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        transform="scale(0.6)"
        transform-origin="center"
      />
    </svg>
  </button>
`;

(function () {
  class CloseButton extends HTMLElement {
    static get observedAttributes() {
      return ["id"];
    }

    get id() {
      return this.getAttribute("id");
    }

    set id(value) {
      this.setAttribute(value);
    }

    connectedCallback() {
      this.render();
    }

    render() {
      this.innerHTML = closeButtonTemplate(this.id);
    }
  }

  customElements.define("close-button", CloseButton);
})();
