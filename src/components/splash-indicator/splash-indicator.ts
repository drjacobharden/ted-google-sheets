import SplashTempString from "./template.html" with { type: "text" };

const SplashTemp = document.createElement("template");
SplashTemp.innerHTML = SplashTempString;

export class SplashIndicator extends HTMLElement {
  #splash: HTMLElement | null = null;
  #message: HTMLElement | null = null;
  #button: HTMLElement | null = null;
  #spinner: HTMLElement | null = null;
  #mark: HTMLElement | null = null;

  // set state(value: RefreshStates) {
  //   if (!this.#refreshIndicator) return;

  //   if (value === "idle") {
  //     this.#refreshIndicator.hidden = true;
  //     return;
  //   }

  //   if (value === "inProgress") {
  //     this.#refreshIndicator.hidden = false;
  //     this.#spinner!.hidden = false;
  //     this.#button!.hidden = true;
  //     this.#message!.textContent = "Refreshing data…";
  //   }

  //   if (value === "failed") {
  //     this.#refreshIndicator.hidden = false;
  //     this.#spinner!.hidden = true;
  //     this.#button!.hidden = false;
  //     this.#label!.textContent = "Refresh failed. Showing saved data.";
  //   }
  // }

  connectedCallback(): void {
    const clone = SplashTemp.content.cloneNode(true) as DocumentFragment;
    const container = clone.querySelector("#app-loading-splash") as HTMLElement;

    this.#splash = container;
    this.#mark = container.querySelector("#app-loading-mark");
    this.#spinner = container.querySelector(".spinner");
    this.#message = container.querySelector("#app-loading-message");
    this.#button = container.querySelector("#app-loading-retry");

    this.append(container);
  }
}

customElements.define("splash-indicator", SplashIndicator);
