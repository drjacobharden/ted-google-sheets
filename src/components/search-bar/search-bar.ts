import { getIcon } from "../../icons";
import SearchBarTempString from "./template.html" with { type: "text" };

const SearchBarTemp = document.createElement("template");
SearchBarTemp.innerHTML = SearchBarTempString;

export class SearchBar extends HTMLElement {
  #initialized = false;
  #input!: HTMLElement;

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#initialize();
    }
  }

  #initialize() {
    const icon = getIcon("search");
    const input = document.createElement("input");
    input.classList.add("search-input");
    input.placeholder = "Search";

    this.append(icon, input);
    this.#initialized = true;
  }

  handleEvent(event: Event) {
    switch (event.type) {
      default:
        break;
    }
  }

  disconnectedCallback() {}
}

customElements.define("search-bar", SearchBar);
