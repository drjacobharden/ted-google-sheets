// @ts-nocheck
import { APIs } from "../../api/api";
import { showToast } from "../toast-stack/toast-service";

const peopleSelectTemplate = () => `
  <div class="form-field people-form-field">
    <span class="people-select-label">Assignment</span>
    <input class="id-input" name="assignmentId" type="hidden" />
    <dropdown-menu 
      class="people-select-menu" 
      variant="editorial"
      label="Select an assignment" 
      icon="people" 
      searchable search-action
      search-action-label="Add" 
      search-placeholder="Search or add person"
      align-center
    >
    </dropdown-menu>
  </div>
`;

let nextId = 0;

export class PeopleSelect extends HTMLElement {
  static get observedAttributes() {
    return ["value"];
  }

  #dropdown = null;
  #form = null;
  #options = [];
  #fallbackSelection = null;
  #getOptions = () => APIs.budget.listPeople();
  #createOption = (name) => APIs.budget.addPerson({ name });
  #onCreate = (person) => {
    this.dispatchEvent(
      new CustomEvent("person-created", {
        bubbles: true,
        detail: { person },
      }),
    );
    showToast(
      APIs.budget.getConfig().endpoint
        ? `${person.name} was added. Syncing…`
        : `${person.name} was added.`,
    );
  };

  get value() {
    return (
      this.#dropdown?.selection ||
      this.querySelector(".id-input")?.value ||
      this.getAttribute("value") ||
      ""
    );
  }

  set value(personId) {
    const id = String(personId || "");
    if (!this.#dropdown) {
      if (id) this.setAttribute("value", id);
      else this.removeAttribute("value");
      return;
    }
    this.#setValue(id);
  }

  get isOpen() {
    return this.#dropdown?.hasAttribute("is-open") || false;
  }

  setFallbackSelection(selection) {
    const id = String(selection?.id || "");
    this.#fallbackSelection = id
      ? {
          id,
          name: String(selection?.name || "Archived assignment"),
          archived: true,
        }
      : null;
    this.#refresh(this.value);
  }

  clearFallbackSelection() {
    this.#fallbackSelection = null;
    this.#refresh(this.value);
  }

  reportSelectionError(message) {
    const trigger = this.#dropdown?.querySelector(".dropdown-trigger");
    trigger?.setAttribute("aria-invalid", "true");
    trigger?.setAttribute("title", message);
    trigger?.focus();
  }

  closePopup({ focusTrigger = false } = {}) {
    this.#dropdown?.close();
    if (focusTrigger)
      this.#dropdown?.querySelector(".dropdown-trigger")?.focus();
  }

  configureOptions({ getOptions, createOption, onCreate } = {}) {
    if (typeof getOptions === "function") this.#getOptions = getOptions;
    if (typeof createOption === "function") this.#createOption = createOption;
    if (typeof onCreate === "function") this.#onCreate = onCreate;
    this.#refresh(this.value);
  }

  connectedCallback() {
    const initialValue = this.hasAttribute("allow-empty")
      ? String(this.getAttribute("value") || "")
      : Object.prototype.hasOwnProperty.call(this, "value")
        ? String(this.value || "")
        : this.getAttribute("value") || APIs.budget.SHARED_ASSIGNMENT_ID;
    if (Object.prototype.hasOwnProperty.call(this, "value")) delete this.value;

    this.innerHTML = peopleSelectTemplate();
    this.#form = this.closest("form");
    this.#dropdown = this.querySelector("dropdown-menu");
    const id = `people-select-${++nextId}`;
    this.#dropdown.id = id;
    this.#dropdown.setAttribute("aria-label", "Select an assignment");
    this.querySelector(".people-select-label").id = `${id}-label`;
    this.#dropdown.setAttribute("aria-labelledby", `${id}-label ${id}`);
    this.#dropdown.addEventListener("dropdown-selection", this);
    this.#dropdown.addEventListener("search-action-pressed", this);
    this.#refresh(initialValue);
    this.#form?.addEventListener("reset", this);
    window.addEventListener("budget:people-changed", this);
  }

  disconnectedCallback() {
    this.#dropdown?.removeEventListener("dropdown-selection", this);
    this.#dropdown?.removeEventListener("search-action-pressed", this);
    this.#form?.removeEventListener("reset", this);
    window.removeEventListener("budget:people-changed", this);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "value" && oldValue !== newValue && this.#dropdown) {
      this.#setValue(newValue || "");
    }
  }

  handleEvent(event) {
    if (event.type === "dropdown-selection") {
      this.#setValue(event.detail.value, true);
    } else if (event.type === "search-action-pressed") {
      this.#addPerson(event.detail.input);
    } else if (event.type === "reset") {
      setTimeout(() => {
        const value = this.hasAttribute("allow-empty")
          ? ""
          : APIs.budget.SHARED_ASSIGNMENT_ID;
        this.#refresh(value, true);
      }, 0);
    } else if (event.type === "budget:people-changed") {
      this.#refresh(this.value);
    }
  }

  #refresh(preferredValue = this.value, resetSearch = false) {
    if (!this.#dropdown) return;
    this.#options = this.#getOptions() || [];
    const options = [...this.#options];
    if (
      this.#fallbackSelection &&
      !options.some((item) => String(item.id) === this.#fallbackSelection.id)
    ) {
      options.push(this.#fallbackSelection);
    }
    this.#dropdown.items = options.map((item) => ({
      key: String(item.id),
      title: `${item.name}${item.archived ? " (archived)" : ""}`,
      isDefaultValue: String(item.id) === String(preferredValue || ""),
    }));
    this.#setValue(preferredValue);
    if (resetSearch) this.#dropdown.close();
  }

  #setValue(id, announce = false) {
    const value = String(id || "");
    const item =
      this.#options.find((option) => String(option.id) === value) ||
      (this.#fallbackSelection?.id === value ? this.#fallbackSelection : null);
    this.querySelector(".id-input").value = item ? value : "";
    this.#dropdown.selection = item ? value : null;
    if (this.getAttribute("value") !== (item ? value : "")) {
      if (item) this.setAttribute("value", value);
      else this.removeAttribute("value");
    }
    if (announce && item) {
      this.dispatchEvent(
        new CustomEvent("person-selected", {
          bubbles: true,
          detail: { person: item },
        }),
      );
    }
  }

  async #addPerson(input) {
    const name = String(input || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!name) return;
    const existing = this.#options.find(
      (item) =>
        item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (existing) {
      this.#setValue(existing.id, true);
      this.closePopup({ focusTrigger: true });
      return;
    }
    try {
      const person = await this.#createOption(name);
      this.#refresh(person?.id || this.value);
      this.#setValue(person?.id, true);
      this.closePopup({ focusTrigger: true });
      this.#onCreate(person);
    } catch (error) {
      this.reportSelectionError(error?.message || "Unable to add assignment");
    }
  }
}

customElements.define("people-select", PeopleSelect);
