import { getIcon } from "../../icons";
import SearchBarTempString from "./template.html" with { type: "text" };

const SearchBarTemp = document.createElement("template");
SearchBarTemp.innerHTML = SearchBarTempString;

export class SearchBar extends HTMLElement {
  #initialized = false;
  #input!: HTMLInputElement;

  get value(): string {
    return this.#input?.value ?? "";
  }

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#initialize();
    }
  }

  #initialize() {
    const icon = getIcon("search");
    const input = document.createElement("input");
    input.classList.add("search-input");
    input.type = "search";
    input.placeholder = this.getAttribute("placeholder") ?? "Search";
    input.setAttribute(
      "aria-label",
      this.getAttribute("aria-label") ?? input.placeholder,
    );
    input.addEventListener("input", () => {
      this.dispatchEvent(
        new CustomEvent("search-changed", {
          bubbles: true,
          detail: { value: input.value },
        }),
      );
    });

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

if (!customElements.get("search-bar")) customElements.define("search-bar", SearchBar);
