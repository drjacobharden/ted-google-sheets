import { Icons } from "../../icons";

class Breadcrumbs extends HTMLElement {
  #elementName: HTMLElement | null = null;

  static get observedAttributes(): string[] {
    return [];
  }

  connectedCallback(): void {
    this.setAttribute("class", "breadcrumb-wrapper");

    const path = JSON.parse(this.dataset.path ?? "[]");

    for (let i = 0, l = path.length; i < l; i++) {
      const item = path[i];
      let element: HTMLElement;

      if (i > 0) {
        const next = document.createElement("div");
        next.innerHTML = Icons.chevronRight;
        next.setAttribute("class", "breadcrumb-slash");
        this.append(next);
      }

      if (item.key) {
        element = document.createElement("button");
        element.textContent = item.title;
        element.dataset.tab = item.key;
      } else {
        element = document.createElement("span");
        element.textContent = item.title;
      }

      this.append(element);
    }
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
      default:
        break;
    }
  }

  disconnectedCallback() {}
}

customElements.define("breadcrumbs-header", Breadcrumbs);
