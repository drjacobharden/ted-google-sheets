import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { createEventHandler } from "../../utilities/event-utilities";
import { CustomButton } from "../button/button";
import { SelectCreateController } from "../select-create-controller/select-create-controller";
import { showToast } from "../toast-stack/toast-service";

class DrawerHeader extends HTMLElement {
  #initialized = false;

  #title: HTMLElement | null = null;
  #backButton!: CustomButton;

  set title(value: string) {
    if (this.#title) {
      this.#title.textContent = value;
    }
  }

  connectedCallback() {
    if (this.#initialized) return;

    const title = this.getAttribute("title");

    const section = document.createElement("header");
    section.classList.add("horizontal-center", "justify-between", "width-100");

    if (title) {
      const text = document.createElement("h2");
      this.#title = text;
      text.textContent = title;
      text.classList.add("text-300");
      section.appendChild(text);
    }

    const backButton = document.createElement("custom-button") as CustomButton;
    this.#backButton = backButton;
    backButton.classList.add("tertiary", "circle");
    backButton.leadingIcon = "close";
    section.appendChild(backButton);

    this.#backButton.addEventListener("click", this);

    this.appendChild(section);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.#handleClose();
        break;

      default:
        break;
    }
  }

  #handleClose() {
    this.#events.dispatch({}, { bubbles: true });
  }

  disconnectedCallback() {
    this.#backButton.removeEventListener("click", this);
  }

  #events = createEventHandler("drawer:close-requested", this);
}

customElements.define("drawer-header", DrawerHeader);
