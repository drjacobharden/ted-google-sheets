import { getIcon, IconKeys } from "../../icons";
import { appState } from "../../state/app-state";
import { uuid } from "../../utilities/data-utilities";
import { createEventHandler } from "../../utilities/event-utilities";
import { CustomButton } from "../button/button";
import { Popover } from "../popover-menu/popover-menu";
import DropdownMenuTempString from "./template.html" with { type: "text" };

const DropdownMenuTemp = document.createElement("template");
DropdownMenuTemp.innerHTML = DropdownMenuTempString;

export interface DropdownMenuItem {
  key: string;
  title: string;
  icon?: IconKeys;
}

export interface DropdownSelectionEvent extends CustomEvent {
  detail: {
    value: string;
    title: string;
  };
}

export class DropdownMenu extends HTMLElement {
  #trigger!: CustomButton;
  #menu!: Popover;
  #menuKey = "";
  #listening = false;
  #unsubscribeFromState: (() => void) | null = null;
  #value: string | null = null;

  /**
   *
   * Connections
   *
   */

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      const clone = DropdownMenuTemp.content.cloneNode(
        true,
      ) as DocumentFragment;
      this.append(clone);
      this.#trigger = this.querySelector(".dropdown-trigger")!;
      this.#menu = this.querySelector("pop-over")!;
      this.#menu.classList.add("dropdown-menu-list");
      this.#menuKey = this.id || uuid();

      this.#renderTrigger();
      this.#renderItems([]);
      this.#trigger.setAttribute("aria-haspopup", "menu");
      this.#trigger.setAttribute("aria-expanded", "false");
    }

    if (this.#listening) return;
    this.#listening = true;

    this.#trigger.addEventListener("click", this);
    this.#menu.addEventListener("click", this);
    this.#unsubscribeFromState = appState.subscribe(
      "activeDropdownKey",
      (activeKey) => {
        if (activeKey !== this.#menuKey) this.#hideMenu();
      },
    );
  }

  disconnectedCallback() {
    if (!this.#listening) return;
    this.#listening = false;
    this.#trigger.removeEventListener("click", this);
    this.#menu.removeEventListener("click", this);
    this.#unsubscribeFromState?.();
    this.#unsubscribeFromState = null;
    if (appState.get("activeDropdownKey") === this.#menuKey) {
      appState.set("activeDropdownKey", null);
    }
  }

  /**
   *
   * Rendering
   *
   */

  #renderTrigger() {
    const label = this.getAttribute("label")!;
    const icon = this.getAttribute("icon")! as IconKeys;

    this.#trigger.label = label;
    this.#trigger.trailingIcon = "chevronDown";

    if (icon) {
      this.#trigger.leadingIcon = icon;
    }
  }

  #renderItems(items: DropdownMenuItem[]) {
    let children = [];

    for (let i = 0, l = items.length; i < l; i++) {
      const { key, title, icon } = items[i];

      const option = document.createElement("div");
      option.classList.add("dropdown-menu-item");
      option.dataset.value = key;
      option.dataset.title = title;

      if (icon) {
        option.append(getIcon(icon));
      }

      const label = document.createElement("span");
      label.textContent = title;
      option.append(label);

      const checkmark = getIcon("checkmark");
      checkmark.classList.add("selection-indicator");
      option.append(checkmark);

      children.push(option);
    }

    this.#menu.replaceChildren(...children);
  }

  /**
   *
   * Event handling
   *
   */

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      default:
        break;
    }
  }

  #handleClick(event: Event) {
    const target = event.target as HTMLElement;

    // Clicked the trigger
    const trigger = target.closest('[data-action="toggle-dropdown"]');
    if (trigger) {
      const visible = this.#menu.classList.contains("is-visible");
      if (visible) {
        this.close();
      } else {
        appState.set("activeDropdownKey", this.#menuKey);
        this.#menu.show(this.#trigger, { side: "bottom", align: "end" });
        this.toggleAttribute("is-open", true);
        this.#trigger.setAttribute("aria-expanded", "true");
      }
    }

    // Clicked an item
    const item = target.closest(".dropdown-menu-item") as HTMLElement;
    if (item) {
      this.#handleSelection(item);
    }
  }

  //   Emit an event to alert an item was selected and pass along its data
  #handleSelection(item: HTMLElement) {
    this.#value = item.dataset.value ?? null;
    this.#selectionListener.dispatch({
      value: item.dataset.value!,
      title: item.dataset.title!,
    });
    this.close();
  }

  /**
   *
   * Setters
   *
   */

  set items(array: DropdownMenuItem[]) {
    this.#renderItems(array);
  }

  set label(text: string) {
    this.#trigger.label = text;
  }

  set icon(icon: IconKeys) {
    this.#trigger.leadingIcon = icon;
  }

  close() {
    if (appState.get("activeDropdownKey") === this.#menuKey) {
      appState.set("activeDropdownKey", null);
    } else {
      this.#hideMenu();
    }
  }

  #hideMenu() {
    this.#menu.hide();
    this.#trigger.setAttribute("aria-expanded", "false");
    this.toggleAttribute("is-open", false);
  }

  #selectionListener = createEventHandler<DropdownSelectionEvent>(
    "dropdown-selection",
    this,
  );

  addListener = this.#selectionListener.addListener;
  removeListener = this.#selectionListener.removeListener;
  handleSelection = this.#selectionListener.handleEvent;
}

customElements.define("dropdown-menu", DropdownMenu);
