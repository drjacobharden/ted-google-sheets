import { APIs } from "../../api/api";
import { BudgetAPI } from "../../api/budget-api";
import { CustomButton } from "../../components/button/button";
import {
  Popover,
  PopoverOptions,
} from "../../components/popover-menu/popover-menu";
import { getIcon, IconKeys } from "../../icons";
import { OverlayManager } from "../overlay-manager/overlay-manager";
import NewEntityPopoverTempString from "./template.html" with { type: "text" };

const NewEntityPopoverTemp = document.createElement("template");
NewEntityPopoverTemp.innerHTML = NewEntityPopoverTempString;

export type NewEntityOptions = "category" | "vendor" | "person" | "account";

export class NewEntityPopover extends HTMLElement {
  #entity: NewEntityOptions = "category";
  #name: string = "";
  #type: "expense" | "income" = "expense";

  #backdrop!: HTMLElement;
  #popover!: Popover;

  #title!: HTMLElement;
  #subtitle!: HTMLElement;
  #icon!: HTMLElement;
  #closeButton!: CustomButton;
  #cancelButton!: CustomButton;
  #saveButton!: CustomButton;
  #input!: HTMLInputElement;
  #selector!: CustomButton;
  #overlayManager!: OverlayManager;
  #inputMessage!: HTMLElement;

  #categories = APIs.budget.listAllCategories();

  connectedCallback(): void {
    const backdrop = document.createElement("div");
    backdrop.classList.add("backdrop");
    this.append(backdrop);
    this.#backdrop = backdrop;

    const popover = document.createElement("pop-over") as Popover;
    popover.classList.add("new-entity-popover");
    this.append(popover);
    this.#popover = popover;

    this.setAttribute("role", "form");

    const clone = NewEntityPopoverTemp.content.cloneNode(
      true,
    ) as DocumentFragment;
    this.#popover.append(clone);

    this.#connectElements();
    this.#connectListeners();
  }

  disconnectedCallback() {
    this.#disconnectListeners();
  }

  #connectElements() {
    this.#title = this.querySelector("#new-entity-title")!;
    this.#subtitle = this.querySelector("#new-entity-subtitle")!;
    this.#icon = this.querySelector("#new-entity-icon")!;
    this.#closeButton = this.querySelector('[data-action="close"]')!;
    this.#cancelButton = this.querySelector('[data-action="cancel"]')!;
    this.#saveButton = this.querySelector('[data-action="save"]')!;
    this.#input = this.querySelector("input")!;
    this.#overlayManager = document.querySelector("overlay-manager")!;
    this.#selector = this.querySelector('[data-action="open-selector"]')!;
    this.#inputMessage = this.querySelector(".input-error")!;
  }

  // Add listeners to the component. MUST REMOVE THEM IN DISCONNECT BELOW!
  #connectListeners() {
    this.#closeButton.addEventListener("click", this);
    this.#cancelButton.addEventListener("click", this);
    this.#saveButton.addEventListener("click", this);
    this.#selector.addEventListener("click", this);
    this.#input.addEventListener("input", this);
    this.#backdrop.addEventListener("click", this);
  }
  // Remove listeners from the component.
  #disconnectListeners() {
    this.#closeButton.removeEventListener("click", this);
    this.#cancelButton.removeEventListener("click", this);
    this.#saveButton.removeEventListener("click", this);
    this.#selector.removeEventListener("click", this);
    this.#input.removeEventListener("input", this);
    this.#backdrop.removeEventListener("click", this);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      case "input":
        this.#handleInput();
        break;

      case "selector-menu:item-selected":
        this.#handleTypeChange(event as CustomEvent);
        break;

      case "selector-menu:menu-closed":
        this.#handleSelectorClose();
        break;

      default:
        break;
    }
  }

  #handleClick(event: Event) {
    const target = event.target as HTMLElement;
    const button = target.closest("[data-action]") as CustomButton;

    if (
      button === this.#closeButton ||
      button === this.#cancelButton ||
      target === this.#backdrop
    ) {
      this.hideForm();
      return;
    }

    if (button === this.#selector) {
      // Focus the button
      button.classList.add("is-open");

      // Show the menu
      this.#overlayManager.selectorMenu.show({
        anchor: button,
        selection: this.#type,
        data: [
          { key: "expense", title: "Expense" },
          { key: "income", title: "Income" },
        ],
        options: {
          side: "bottom",
          align: "center",
          gap: 8,
        },
        menuKey: "newEntityCategoryTypeSelector",
      });

      this.#overlayManager.addEventListener(
        "selector-menu:item-selected",
        this,
      );
      this.#overlayManager.addEventListener("selector-menu:menu-closed", this);
    }

    if (button === this.#saveButton) {
    }
  }

  #handleTypeChange(event: CustomEvent) {
    this.#type = event.detail.value;
    this.#selector.label = event.detail.title;
    this.#overlayManager.selectorMenu.hide();
  }

  #handleSelectorClose() {
    this.#selector.classList.remove("is-open");
    this.#overlayManager.removeEventListener("selector-menu:menu-closed", this);
    this.#overlayManager.removeEventListener(
      "selector-menu:item-selected",
      this,
    );
  }

  #handleInput() {
    const input = this.#input.value;
    const exists = this.#categories.some(
      (item) => item.name.toLowerCase() === input.toLowerCase().trim(),
    );

    if (exists) {
      this.#input.classList.add("error");
      this.#inputMessage.toggleAttribute("hidden", false);
    } else {
      this.#input.classList.remove("error");
      this.#inputMessage.toggleAttribute("hidden", true);
    }
  }

  showForm(
    anchor: HTMLElement,
    entity: NewEntityOptions,
    options: PopoverOptions,
  ) {
    const title = {
      category: "New category",
      vendor: "New vendor",
      person: "New person",
      account: "New invesment account",
    }[entity];

    const subtitle = {
      category: "Create a new option for categorizing transactions",
      vendor: "Create a new payor or payee",
      person: "Add a new person to your group to see who's spending what",
      account: "Track investments in a new account",
    }[entity];

    const icon: Record<NewEntityOptions, IconKeys> = {
      category: "label",
      vendor: "cart",
      person: "people",
      account: "box",
    };

    this.classList.add("is-visible");
    this.#title.textContent = title;
    this.#subtitle.textContent = subtitle;
    this.#icon.replaceChildren(getIcon(icon[entity]));
    this.#input.value = "";
    this.#input.textContent = "";
    this.#input.focus();

    this.#popover.show(anchor, options);
  }

  hideForm() {
    this.classList.remove("is-visible");
    this.#popover.hide();
  }
}

customElements.define("new-entity-popover", NewEntityPopover);
