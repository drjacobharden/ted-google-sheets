import { getIcon, IconKeys } from "../../icons";
import { CustomButton } from "../button/button";
import { Popover, PopoverOptions } from "../popover-menu/popover-menu";

export interface SelectorMenuProps {
  anchor: HTMLElement;
  data: { key: string; title: string; icon?: IconKeys }[];
  options: PopoverOptions;
  menuKey: string;
  selection: string | null;
}

export class SelectorMenu extends HTMLElement {
  #menuKey: string | null = null;
  #menu!: Popover;
  #backdrop!: HTMLElement;

  #currentSelection: HTMLElement | null = null;

  connectedCallback(): void {
    const backdrop = document.createElement("div");
    backdrop.classList.add("backdrop");
    this.#backdrop = backdrop;

    const popover = document.createElement("pop-over") as Popover;
    popover.classList.add("selector-menu", "vertical");
    this.#menu = popover;

    this.append(backdrop, popover);

    this.addEventListener("click", this);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      default:
        break;
    }
  }

  disconnectedCallback() {}

  #handleClick(event: Event) {
    const target = event.target as HTMLElement;
    const selection = target.closest("[data-selection-value]") as HTMLElement;

    if (selection) {
      this.dispatchEvent(
        new CustomEvent("selector-menu:item-selected", {
          detail: {
            value: selection.dataset.selectionValue,
            title: selection.dataset.title,
          },
          bubbles: true,
        }),
      );
    } else {
      this.hideMenu();
    }
  }

  showMenu(props: SelectorMenuProps) {
    const { anchor, data, options, menuKey, selection } = props;

    this.classList.add("is-visible");

    if (menuKey !== this.#menuKey) {
      let children = [];

      for (let i = 0, l = data.length; i < l; i++) {
        const { key, title, icon } = data[i];

        const option = document.createElement("div");
        option.classList.add("selector-menu-item");
        option.dataset.selectionValue = key;
        option.dataset.title = title;

        if (icon) {
          option.append(icon);
        }

        const label = document.createElement("span");
        label.textContent = data[i].title;
        option.append(label);

        const checkmark = getIcon("checkmark");
        checkmark.classList.add("selection-indicator");
        option.append(checkmark);

        children.push(option);
      }

      this.#menu.replaceChildren(...children);
    }

    const buttons = this.querySelectorAll<HTMLElement>(
      "[data-selection-value]",
    );

    buttons.forEach((item) => {
      if (item.dataset.selectionValue === selection) {
        this.#currentSelection = item;
        item.classList.add("is-selected");
      } else {
        item.classList.remove("is-selected");
      }
    });

    this.#menu.show(anchor, options);
  }

  hideMenu() {
    this.#menu.hide();
    this.dispatchEvent(
      new CustomEvent("selector-menu:menu-closed", { bubbles: true }),
    );
    this.classList.remove("is-visible");
  }
}

customElements.define("selector-menu", SelectorMenu);
