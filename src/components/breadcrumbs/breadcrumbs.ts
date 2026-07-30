import { getIcon } from "../../icons";

export interface BreadcrumbPath {
  title: string;
  key?: string;
}

export class Breadcrumbs extends HTMLElement {
  #pathWrapper!: HTMLElement;
  #buttonWrapper!: HTMLElement;

  connectedCallback(): void {
    this.setAttribute("class", "breadcrumb-wrapper");

    const existingChildren = Array.from(this.childNodes);

    this.#pathWrapper = document.createElement("div");
    this.#pathWrapper.setAttribute("class", "breadcrumb-path-wrapper");

    this.#buttonWrapper = document.createElement("div");
    this.#buttonWrapper.append(...existingChildren);

    const path = JSON.parse(this.dataset.path ?? "[]");
    this.#renderPath(path, this.#pathWrapper);

    this.replaceChildren(this.#pathWrapper, this.#buttonWrapper);
  }

  #renderPath(path: BreadcrumbPath[], pathWrapper: HTMLElement) {
    let children: HTMLElement[] = [];

    for (let i = 0, l = path.length; i < l; i++) {
      const item = path[i];
      let element: HTMLElement;

      if (i > 0) {
        const next = document.createElement("div");
        next.append(getIcon("chevronRight"));
        next.setAttribute("class", "breadcrumb-slash");
        children.push(next);
      }

      if (item.key) {
        element = document.createElement("button");
        element.textContent = item.title;
        element.dataset.tab = item.key;
      } else {
        element = document.createElement("span");
        element.textContent = item.title;
      }

      children.push(element);
    }

    pathWrapper.replaceChildren(...children);
  }

  setPath(path: BreadcrumbPath[]) {
    this.#renderPath(path, this.#pathWrapper);
  }
}

customElements.define("breadcrumbs-header", Breadcrumbs);
