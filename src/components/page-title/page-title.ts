import PageTitleTempString from "./template.html" with { type: "text" };

const PageTitleTemp = document.createElement("template");
PageTitleTemp.innerHTML = PageTitleTempString;

class PageTitle extends HTMLElement {
  #title: HTMLElement | null = null;
  #eyebrow: HTMLElement | null = null;
  #subtitle: HTMLElement | null = null;

  set title(value: string) {
    if (this.#title) {
      this.#title.textContent = value;
    }
  }

  set eyebrow(value: string) {
    if (this.#eyebrow) {
      this.#eyebrow.textContent = value;
    }
  }

  set subtitle(value: string) {
    if (this.#subtitle) {
      this.#subtitle.textContent = value;
    }
  }

  connectedCallback() {
    if (this.dataset.initialized) return;
    this.dataset.initialized = "true";

    const clone = PageTitleTemp.content.cloneNode(true) as DocumentFragment;
    const container = clone.querySelector(".page-heading") as HTMLElement;

    if (!container) return;

    this.#eyebrow = container.querySelector(".eyebrow");
    this.#title = container.querySelector("h1");
    this.#subtitle = container.querySelector(".heading-copy");

    const eyebrow = this.getAttribute("eyebrow");
    const title = this.getAttribute("title");
    const subtitle = this.getAttribute("subtitle");

    if (eyebrow && this.#eyebrow) {
      this.#eyebrow.textContent = eyebrow;
    } else {
      this.#eyebrow?.remove();
    }

    if (title && this.#title) {
      this.#title.textContent = title;
    } else {
      this.#title?.remove();
    }

    if (subtitle && this.#subtitle) {
      this.#subtitle.textContent = subtitle;
    } else {
      this.#subtitle?.remove();
    }

    while (this.firstChild) {
      container.appendChild(this.firstChild);
    }

    this.appendChild(container);
  }
}

customElements.define("page-title", PageTitle);
