import { RefreshStates } from "../refresh-indicator/refresh-indicator";
import { appController } from "../../state/app-controller";
import SplashTempString from "./template.html" with { type: "text" };

const SplashTemp = document.createElement("template");
SplashTemp.innerHTML = SplashTempString;

export class SplashIndicator extends HTMLElement {
  #splash: HTMLElement | null = null;
  #message: HTMLElement | null = null;
  #button: HTMLElement | null = null;
  #spinner: HTMLElement | null = null;

  set state(value: RefreshStates) {
    if (!this.#splash) return;

    if (value === "idle") {
      this.#splash.hidden = true;
      return;
    }

    if (value === "inProgress") {
      this.#splash.hidden = false;
      this.#spinner!.hidden = false;
      this.#button!.hidden = true;
      this.#message!.textContent = "Loading your budget…";
    }

    if (value === "retrying") {
      this.#splash.hidden = false;
      this.#spinner!.hidden = false;
      this.#button!.hidden = true;
      this.#message!.textContent =
        "Google didn’t return the data. Retrying…";
    }

    if (value === "failed") {
      this.#splash.hidden = false;
      this.#spinner!.hidden = true;
      this.#button!.hidden = false;
      this.#message!.textContent =
        "We couldn't load your budget. Check your connection and try again.";
    }
  }

  connectedCallback(): void {
    const clone = SplashTemp.content.cloneNode(true) as DocumentFragment;
    const container = clone.querySelector("#app-loading-splash") as HTMLElement;

    this.#splash = container;
    this.#spinner = container.querySelector(".spinner");
    this.#message = container.querySelector("#app-loading-message");
    this.#button = container.querySelector("#app-loading-retry");
    this.#button?.addEventListener("click", this);

    this.append(container);
  }

  handleEvent(event: Event): void {
    if (event.type === "click" && event.currentTarget === this.#button)
      void appController.initializeData({ refresh: true }).catch(() => {});
  }

  disconnectedCallback(): void {
    this.#button?.removeEventListener("click", this);
  }
}

customElements.define("splash-indicator", SplashIndicator);
