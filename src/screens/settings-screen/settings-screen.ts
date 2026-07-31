import { registerLegacyRouteAdapter } from "../../utilities/legacy-route-adapter";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays the application settings route. */
export class SettingsScreen extends HTMLElement {
  /** Initializes the static settings layout. */
  connectedCallback(): void {
    if (this.dataset.initialized) return;
    this.dataset.initialized = "true";
    this.classList.add("screen");
    this.dataset.screen = "settings";
    this.append(template.content.cloneNode(true));
  }
}

if (!customElements.get("settings-screen")) customElements.define("settings-screen", SettingsScreen);
registerLegacyRouteAdapter("SettingsRoute");
