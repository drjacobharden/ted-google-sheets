import { getIcon, IconKeys } from "../../icons";

class Icon extends HTMLElement {
  connectedCallback(): void {
    this.#render();
  }

  #render() {
    const iconKey = this.getAttribute("icon") as IconKeys;
    const icon = getIcon(iconKey);
    this.replaceChildren(icon);
  }

  set icon(icon: IconKeys) {
    this.setAttribute("icon", icon);
    this.#render();
  }
}

customElements.define("custom-icon", Icon);
