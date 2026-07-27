import NavBarTempString from "./template.html" with { type: "text" };

const NavBarTemp = document.createElement("template");
NavBarTemp.innerHTML = NavBarTempString;

class NavBar extends HTMLElement {
  #wrapper: HTMLElement | null = null;

  connectedCallback(): void {
    const clone = NavBarTemp.content.cloneNode(true) as DocumentFragment;
    const container = clone.querySelector("nav") as HTMLElement;

    this.#wrapper = container;

    this.append(container);

    this.#wrapper.addEventListener("click", this);
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue) return;
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.handleClick(event);
      default:
        break;
    }
  }

  private handleClick(event: Event) {
    const target = event?.target as HTMLElement;
    const item = target.closest("[data-tab]");
    if (!item) return;
    event.preventDefault();
    console.log((item as any).dataset.tab);
  }

  disconnectedCallback() {
    this.#wrapper?.removeEventListener("click", this);
  }
}

customElements.define("navigation-bar", NavBar);
