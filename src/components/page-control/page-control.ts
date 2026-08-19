import { getIcon } from "../../icons";

/** Compact, accessible pagination for a screen-owned collection. */
export class PageControl extends HTMLElement {
  #currentPage = 1;
  #totalPages = 1;

  connectedCallback(): void {
    this.#render();
  }

  set currentPage(value: number) {
    this.#currentPage = Math.min(
      this.#totalPages,
      Math.max(1, Math.trunc(value) || 1),
    );
    this.#render();
  }

  get currentPage(): number {
    return this.#currentPage;
  }

  set totalPages(value: number) {
    this.#totalPages = Math.max(1, Math.trunc(value) || 1);
    this.#currentPage = Math.min(this.#currentPage, this.#totalPages);
    this.hidden = this.#totalPages <= 1;
    this.#render();
  }

  get totalPages(): number {
    return this.#totalPages;
  }

  #pageNumbers(): (number | "ellipsis")[] {
    if (this.#totalPages <= 7) {
      return Array.from({ length: this.#totalPages }, (_, index) => index + 1);
    }

    const candidates = new Set([
      1,
      this.#totalPages,
      this.#currentPage - 1,
      this.#currentPage,
      this.#currentPage + 1,
    ]);
    const pages = [...candidates]
      .filter((page) => page > 0 && page <= this.#totalPages)
      .sort((a, b) => a - b);
    const result: (number | "ellipsis")[] = [];

    pages.forEach((page, index) => {
      if (index > 0 && page - pages[index - 1] > 1) result.push("ellipsis");
      result.push(page);
    });
    return result;
  }

  #button(label: string, page: number, direction?: "previous" | "next") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = direction
      ? `page-control__direction page-control__direction--${direction}`
      : "page-control__page";
    button.dataset.page = String(page);

    if (direction) {
      const icon = getIcon(direction === "previous" ? "chevronLeft" : "chevronRight");
      icon?.setAttribute("aria-hidden", "true");
      if (direction === "previous") button.append(icon!, document.createTextNode(label));
      else button.append(document.createTextNode(label), icon!);
      button.disabled =
        direction === "previous"
          ? this.#currentPage === 1
          : this.#currentPage === this.#totalPages;
    } else {
      button.textContent = label;
      button.setAttribute("aria-label", `Page ${label}`);
      if (page === this.#currentPage) {
        button.classList.add("is-current");
        button.setAttribute("aria-current", "page");
      }
    }

    button.addEventListener("click", () => this.#selectPage(page));
    return button;
  }

  #selectPage(page: number): void {
    const nextPage = Math.min(this.#totalPages, Math.max(1, page));
    if (nextPage === this.#currentPage) return;
    this.#currentPage = nextPage;
    this.#render();
    this.dispatchEvent(
      new CustomEvent("page-change", {
        bubbles: true,
        detail: { page: this.#currentPage },
      }),
    );
  }

  #render(): void {
    if (!this.isConnected) return;
    const nav = document.createElement("nav");
    nav.className = "page-control__nav";
    nav.setAttribute("aria-label", "Table pages");
    nav.append(this.#button("Previous", this.#currentPage - 1, "previous"));

    for (const page of this.#pageNumbers()) {
      if (page === "ellipsis") {
        const ellipsis = document.createElement("span");
        ellipsis.className = "page-control__ellipsis";
        ellipsis.textContent = "…";
        ellipsis.setAttribute("aria-hidden", "true");
        nav.append(ellipsis);
      } else {
        nav.append(this.#button(String(page), page));
      }
    }

    nav.append(this.#button("Next", this.#currentPage + 1, "next"));
    this.replaceChildren(nav);
  }
}

if (!customElements.get("page-control")) {
  customElements.define("page-control", PageControl);
}
