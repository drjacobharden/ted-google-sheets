import templateString from "./template.html" with { type: "text" };
import type { SegmentedControl } from "../../components/segmented-control/segmented-control";

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays the application settings route. */
export class SettingsScreen extends HTMLElement implements EventListenerObject {
  #sectionSelector!: SegmentedControl;
  #setupPanel!: HTMLElement;
  #syncPanel!: HTMLElement;
  #listening = false;

  /** Initializes the static settings layout. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "settings";
      this.append(template.content.cloneNode(true));
      this.#sectionSelector = this.querySelector("#settings-section-selector")!;
      this.#setupPanel = this.querySelector("#settings-setup-panel")!;
      this.#syncPanel = this.querySelector("#settings-sync-panel")!;
      this.#sectionSelector.items = [
        { key: "setup", title: "Setup", isDefaultValue: true },
        { key: "sync", title: "Sync" },
      ];
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#sectionSelector.addEventListener("segmented-control-selection", this);
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#sectionSelector?.removeEventListener(
      "segmented-control-selection",
      this,
    );
  }

  handleEvent(event: Event): void {
    if (event.type !== "segmented-control-selection") return;
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    const isSync = value === "sync";
    this.#setupPanel.hidden = isSync;
    this.#syncPanel.hidden = !isSync;
  }
}

if (!customElements.get("settings-screen")) customElements.define("settings-screen", SettingsScreen);
