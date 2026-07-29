import RefreshTempString from "./template.html" with { type: "text" };

const RefreshTemp = document.createElement("template");
RefreshTemp.innerHTML = RefreshTempString;

class RefreshIndicator extends HTMLElement {
  #elementName: HTMLElement | null = null;

  connectedCallback(): void {
    const clone = RefreshTemp.content.cloneNode(true) as DocumentFragment;
    const container = clone.querySelector(
      ".app-refresh-indicator",
    ) as HTMLElement;

    this.append(container);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      default:
        break;
    }
  }

  disconnectedCallback() {}
}

customElements.define("reshresh-indicator", RefreshIndicator);
