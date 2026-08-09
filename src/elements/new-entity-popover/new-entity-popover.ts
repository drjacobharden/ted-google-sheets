import { APIs } from "../../api/api";
import { TransactionType } from "../../api/budget-api";
import { CustomButton } from "../../components/button/button";
import {
  Popover,
  PopoverOptions,
} from "../../components/popover-menu/popover-menu";
import { SegmentedControl } from "../../components/segmented-control/segmented-control";
import { getIcon, IconKeys } from "../../icons";
import { OverlayManager } from "../overlay-manager/overlay-manager";
import NewEntityPopoverTempString from "./template.html" with { type: "text" };

const NewEntityTemp = document.createElement("template");
NewEntityTemp.innerHTML = NewEntityPopoverTempString;

export type NewEntityOptions = "category" | "vendor" | "person" | "account";

export class NewEntityPopover extends HTMLElement {
  #form!: HTMLFormElement;
  #typeSelector: SegmentedControl | null = null;

  #entity: NewEntityOptions = "category";
  #name: string = "";
  #type: TransactionType = "expense";

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
    const clone = NewEntityTemp.content.cloneNode(true) as HTMLTemplateElement;

    const backdrop = document.createElement("div");
    backdrop.classList.add("backdrop");
    this.append(backdrop);
    this.#backdrop = backdrop;

    const popover = document.createElement("pop-over") as Popover;
    popover.classList.add("new-entity-popover");
    this.append(popover);
    this.#popover = popover;

    this.setAttribute("role", "form");

    this.#popover.append(clone);
    this.#form = this.#popover.querySelector("form")!;

    this.#connectElements();
    this.#renderForm("category");
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
    this.#overlayManager = document.querySelector("overlay-manager")!;
  }

  // Add listeners to the component. MUST REMOVE THEM IN DISCONNECT BELOW!
  #connectListeners() {
    this.#closeButton.addEventListener("click", this);
    this.#cancelButton.addEventListener("click", this);
    this.#saveButton.addEventListener("click", this);
    this.#backdrop.addEventListener("click", this);
    this.#popover.addEventListener("popover-dismiss", this);
  }
  // Remove listeners from the component.
  #disconnectListeners() {
    this.#closeButton.removeEventListener("click", this);
    this.#cancelButton.removeEventListener("click", this);
    this.#saveButton.removeEventListener("click", this);
    this.#backdrop.removeEventListener("click", this);
    this.#popover.removeEventListener("popover-dismiss", this);

    this.#disconnectFormListeners();
  }

  /** Connects listeners owned by controls that are recreated for each form. */
  #connectFormListeners() {
    this.#input.addEventListener("input", this);

    if (this.#typeSelector) {
      this.#typeSelector.addListener(this);
    }
  }

  /** Disconnects listeners before their form controls are replaced. */
  #disconnectFormListeners() {
    if (this.#input) {
      this.#input.removeEventListener("input", this);
    }

    if (this.#typeSelector) {
      this.#typeSelector.removeListener(this);
    }
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      case "input":
        this.#handleInput();
        break;

      case "segmented-control-selection":
        this.#handleTypeChange(event);
        break;

      case "popover-dismiss":
        this.hideForm();
        break;

      default:
        break;
    }
  }

  #handleClick(event: Event) {
    const target = event.target as HTMLElement;
    const button = target.closest("[data-action]") as CustomButton;

    // Close the form
    if (
      button === this.#closeButton ||
      button === this.#cancelButton ||
      target === this.#backdrop
    ) {
      this.hideForm();
      return;
    }

    // Submit the form
    if (button === this.#saveButton) {
      this.#handleSubmit(event);
    }
  }

  async #handleSubmit(event: Event) {
    event.preventDefault();

    const name = this.#input.value.trim();
    const type = this.#type;

    try {
      APIs.budget.addCategory({ name, type });
      this.#input.value = "";
    } catch (error: unknown) {
      this.#inputMessage.textContent = error as string;
    } finally {
      this.hideForm();
    }
  }

  #handleTypeChange(event: Event) {
    this.#typeSelector?.handleSelection(event, (e) => {
      this.#type = e.detail.value as TransactionType;
    });
  }

  #handleInput() {
    const input = this.#input.value.toLowerCase().trim();
    const exists = this.#categories.some(
      (item) => item.name.toLowerCase() === input,
    );

    if (exists) {
      this.#input.classList.add("error");
      this.#inputMessage.toggleAttribute("hidden", false);
    } else {
      this.#input.classList.remove("error");
      this.#inputMessage.toggleAttribute("hidden", true);
    }

    this.#saveButton.toggleAttribute("disabled", exists || input.length === 0);
  }

  #renderForm(entity: NewEntityOptions) {
    this.#disconnectFormListeners();
    this.#typeSelector = null;

    const { title, subtitle, icon, inputLabel, inputPlaceholder } =
      newEntityData[entity];

    this.#title.textContent = title;
    this.#subtitle.textContent = subtitle;
    this.#icon.replaceChildren(getIcon(icon as IconKeys));

    const label = document.createElement("label");
    const labelText = document.createElement("span");
    const input = document.createElement("input");
    const inputMessage = document.createElement("span");

    label.classList.add("form-field-new");
    label.setAttribute("for", "name");
    labelText.classList.add("form-field-label");
    labelText.textContent = inputLabel;
    input.name = "name";
    input.placeholder = `enter the name of the ${entity}`;
    input.toggleAttribute("required", true);
    inputMessage.classList.add("input-error");
    inputMessage.textContent = `This ${entity} already exists.`;
    inputMessage.toggleAttribute("hidden", true);

    label.append(labelText, input, inputMessage);
    this.#form.replaceChildren(label);

    this.#input = input;
    this.#inputMessage = inputMessage;

    if (entity === "category") {
      const label = document.createElement("label");
      const labelText = document.createElement("span");
      const typeSelector = document.createElement(
        "segmented-control",
      ) as SegmentedControl;

      label.classList.add("form-field-label");
      label.setAttribute("for", "type");
      label.classList.add("form-field-new");
      labelText.textContent = "Type";
      labelText.classList.add("form-field-label");
      typeSelector.setAttribute("name", "type");

      label.append(labelText, typeSelector);
      this.#form.append(label);
      this.#typeSelector = typeSelector;
      this.#typeSelector.items = [
        { key: "expense", title: "Expense" },
        { key: "income", title: "Income" },
      ];
      this.#typeSelector.selection = this.#type;
    }

    this.#connectFormListeners();
  }

  showForm(
    anchor: HTMLElement,
    entity: NewEntityOptions,
    options: PopoverOptions,
  ) {
    this.#entity = entity;
    this.#renderForm(entity);
    this.classList.add("is-visible");
    this.#popover.show(anchor, options);
  }

  hideForm() {
    this.classList.remove("is-visible");
    this.#popover.hide();
  }

  /** Whether an event originated within the interactive form panel. */
  containsFormInteraction(event: Event): boolean {
    return event.composedPath().includes(this.#popover);
  }
}

customElements.define("new-entity-popover", NewEntityPopover);

const newEntityData = {
  category: {
    title: "New category",
    subtitle: "Create a new option for categorizing transactions",
    icon: "label",
    inputLabel: "Category name",
    inputPlaceholder: "enter the name of the category",
  },

  vendor: {
    title: "New vendor",
    subtitle: "Create a new payor or payee",
    icon: "cart",
    inputLabel: "Vendor name",
    inputPlaceholder: "enter the name of the vendor",
  },

  person: {
    title: "New person",
    subtitle: "Add a new person to your group to see who's spending what",
    icon: "people",
    inputLabel: "Name",
    inputPlaceholder: "enter the name of the person",
  },

  account: {
    title: "New invesment account",
    subtitle: "Track investments in a new account",
    icon: "box",
    inputLabel: "Account name",
    inputPlaceholder: "enter the name of the account",
  },
};
