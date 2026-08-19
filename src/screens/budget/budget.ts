class Budget extends HTMLElement {
  #elementName: HTMLElement | null = null;

  connectedCallback(): void {
    this.#setup.create();
  }

  handleEvent(event: Event) {
    switch (event.type) {
      default:
        break;
    }
  }

  disconnectedCallback() {}

  #setup = {
    create: () => {
      const template = `
            <section class="page-section container">
                <h1>$13,485</h1>
            </section>
        `;

      this.innerHTML = template;
    },
  };
}

customElements.define("budget-screen", Budget);
