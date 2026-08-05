import RefreshTempString from "./template.html" with { type: "text" };

export type RefreshStates = "inProgress" | "retrying" | "idle" | "failed";

const RefreshTemp = document.createElement("template");
RefreshTemp.innerHTML = RefreshTempString;

export class RefreshIndicator extends HTMLElement {
  #refreshIndicator: HTMLElement | null = null;
  #label: HTMLElement | null = null;
  #button: HTMLElement | null = null;
  #spinner: HTMLElement | null = null;

  set state(value: RefreshStates) {
    if (!this.#refreshIndicator) return;

    if (value === "idle") {
      this.#refreshIndicator.hidden = true;
      return;
    }

    if (value === "inProgress") {
      this.#refreshIndicator.hidden = false;
      this.#spinner!.hidden = false;
      this.#button!.hidden = true;
      this.#label!.textContent = "Refreshing data…";
    }

    if (value === "retrying") {
      this.#refreshIndicator.hidden = false;
      this.#spinner!.hidden = false;
      this.#button!.hidden = true;
      this.#label!.textContent = "Google didn’t return the data. Retrying…";
    }

    if (value === "failed") {
      this.#refreshIndicator.hidden = false;
      this.#spinner!.hidden = true;
      this.#button!.hidden = false;
      this.#label!.textContent = "Refresh failed. Showing saved data.";
    }
  }

  connectedCallback(): void {
    const clone = RefreshTemp.content.cloneNode(true) as DocumentFragment;
    const container = clone.querySelector(
      ".app-refresh-indicator",
    ) as HTMLElement;

    this.#refreshIndicator = container;
    this.#spinner = container.querySelector(".spinner");
    this.#label = container.querySelector("#app-refresh-text");
    this.#button = container.querySelector("#app-refresh-retry");

    this.append(container);
  }
}

customElements.define("reshresh-indicator", RefreshIndicator);
