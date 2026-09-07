import { Icon } from "../icon/icon";
import { appState } from "../../state/app-state";
import AccordionTempString from "./template.html" with { type: "text" };

const AccordionTemp = document.createElement("template");
AccordionTemp.innerHTML = AccordionTempString;

class Accordion extends HTMLElement {
  #header!: HTMLElement;
  #title!: HTMLElement;
  #subtitle!: HTMLElement;
  #icon!: Icon;
  #contentWrapper!: HTMLElement;
  #unsubscribeFromAccordionState: (() => void) | null = null;

  get isOpen() {
    return this.hasAttribute("is-open");
  }

  set isOpen(value: boolean) {
    this.toggleAttribute("is-open", value);
  }

  connectedCallback(): void {
    this.#setup.captureElements();
    this.#setup.setInitialValues();
    this.#setup.addListeners();
  }

  #setup = {
    captureElements: () => {
      const clone = AccordionTemp.content.cloneNode(true) as DocumentFragment;

      this.#header = clone.querySelector(".accordion-title-section")!;
      this.#title = this.#header.querySelector("h3")!;
      this.#subtitle = this.#header.querySelector("span")!;
      this.#icon = this.#header.querySelector("custom-icon")!;
      this.#contentWrapper = clone.querySelector(".accordion-content")!;

      const contentNodes = Array.from(this.childNodes);

      for (let i = 0, l = contentNodes.length; i < l; i++) {
        const node = contentNodes[i];
        this.#contentWrapper.append(node);
      }

      this.append(clone);
    },
    setInitialValues: () => {
      const title = this.getAttribute("title");
      this.#title.textContent = title;
      // The attribute supplies the component's visible heading; keeping it on
      // the host also creates an unwanted native browser hover tooltip.
      this.removeAttribute("title");

      const subtitle = this.getAttribute("subtitle");
      if (subtitle) {
        this.#subtitle.textContent = subtitle;
        this.#subtitle.hidden = false;
      } else {
        this.#subtitle.hidden = true;
      }

      const openAccordionId = appState.get("openAccordionId");
      const shouldOpen = this.id !== ""
        ? openAccordionId === null
          ? this.isOpen
          : openAccordionId === this.id
        : this.isOpen;
      this.#setOpen(shouldOpen);
      if (this.id && shouldOpen && openAccordionId !== this.id) {
        appState.set("openAccordionId", this.id);
      }
    },
    addListeners: () => {
      this.#header.addEventListener("click", this);
      if (this.id) {
        this.#unsubscribeFromAccordionState = appState.subscribe(
          "openAccordionId",
          (openAccordionId) => this.#setOpen(openAccordionId === this.id),
        );
      }
    },
    removeListeners: () => {
      this.#header.removeEventListener("click", this);
      this.#unsubscribeFromAccordionState?.();
      this.#unsubscribeFromAccordionState = null;
    },
  };

  #setOpen(value: boolean): void {
    if (this.isOpen === value) {
      this.#icon.icon = value ? "minus" : "plus";
      return;
    }

    this.style.setProperty("--transition-speed", "0ms");
    const contentHeight = this.#contentWrapper?.scrollHeight ?? 0;
    const calculatedDuration = Math.max(300, contentHeight * 0.5);
    this.style.setProperty("--transition-speed", `${calculatedDuration}ms`);

    this.isOpen = value;
    this.#icon.icon = value ? "minus" : "plus";
  }

  #handleEvents = {
    toggleOpen: () => {
      if (!this.id) {
        this.#setOpen(!this.isOpen);
        return;
      }
      appState.set("openAccordionId", this.isOpen ? null : this.id);
    },
  };

  #update = {};

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        const target = event.currentTarget as HTMLElement;
        if (target === this.#header) this.#handleEvents.toggleOpen();
        break;

      default:
        break;
    }
  }

  disconnectedCallback() {
    this.#setup.removeListeners();
  }
}

customElements.define("accordion-element", Accordion);
