import { APIs } from "../../api/api";
import type { ImportProfile } from "../../api/import-api";
import { CustomButton } from "../button/button";
import { DropdownMenu } from "../dropdown-menu/dropdown-menu";

interface Selection {
  id: string;
  name: string;
  archived: boolean;
}

const mappingSelectTemplate = () => `
  <div class="form-field mapping-form-field">
    <input class="id-input" name="mappingId" type="hidden" />
    <dropdown-menu 
      variant="editorial"
      label="Select a profile" 
      searchable
      search-placeholder="Search profiles"
      align-start
    >
    </dropdown-menu>
  </div>
`;

export class MappingSelect extends HTMLElement {
  static get observedAttributes() {
    return ["value"];
  }

  #trigger!: CustomButton;
  #dropdown!: DropdownMenu;
  #hiddenInput!: HTMLInputElement;
  #form: HTMLFormElement | null = null;
  #options: ImportProfile[] = [];
  #fallbackSelection: ImportProfile | null = null;
  #getOptions: () => ImportProfile[] = () => [];

  get value() {
    return (
      this.#dropdown?.selection ||
      this.#hiddenInput.value ||
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

  configureOptions(getOptions: () => ImportProfile[]): void {
    this.#getOptions = getOptions;
    this.#refresh(this.value);
  }

  get isOpen() {
    return this.#dropdown?.hasAttribute("is-open") || false;
  }

  reportSelectionError(message: string) {
    this.#trigger = this.#dropdown?.querySelector(".dropdown-trigger")!;
    this.#trigger?.setAttribute("aria-invalid", "true");
    this.#trigger?.setAttribute("title", message);
    this.#trigger?.focus();
  }

  closePopup({ focusTrigger = false } = {}) {
    this.#dropdown?.close();
    if (focusTrigger) this.#trigger.focus();
  }

  connectedCallback() {
    const initialValue = this.hasAttribute("allow-empty")
      ? String(this.getAttribute("value") || "")
      : Object.prototype.hasOwnProperty.call(this, "value")
        ? String(this.value || "")
        : this.getAttribute("value") || APIs.budget.SHARED_ASSIGNMENT_ID;

    if (Object.prototype.hasOwnProperty.call(this, "value")) {
      this.removeAttribute("value");
    }

    this.innerHTML = mappingSelectTemplate();
    this.#form = this.closest("form");
    this.#dropdown = this.querySelector("dropdown-menu")!;
    this.#hiddenInput = this.querySelector(".id-input")!;
    this.#dropdown.setAttribute("aria-label", "Select a profile");
    this.#refresh(initialValue);

    this.#dropdown.addListener(this);
    this.#dropdown.addSearchActionListener(this);
    this.#form?.addEventListener("reset", this);
    window.addEventListener("budget:import-mappings-changed", this);
  }

  disconnectedCallback() {
    this.#dropdown?.removeEventListener("dropdown-selection", this);
    this.#dropdown?.removeEventListener("search-action-pressed", this);
    this.#form?.removeEventListener("reset", this);
    window.removeEventListener("budget:import-mappings-changed", this);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "value" && oldValue !== newValue && this.#dropdown) {
      this.#setValue(newValue || "");
    }
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "dropdown-selection":
        this.#dropdown.handleSelection(event, ({ value }) => {
          this.#setValue(value, true);
        });
        break;

      case "reset":
        setTimeout(() => {
          const value = this.hasAttribute("allow-empty")
            ? ""
            : APIs.budget.SHARED_ASSIGNMENT_ID;
          this.#refresh(value, true);
        }, 0);

      case "budget:import-mappings-changed":
        this.#refresh(this.value);
        break;

      default:
        break;
    }
  }

  #refresh(preferredValue = this.value, resetSearch = false) {
    if (!this.#dropdown) return;
    this.#options = this.#getOptions() || [];
    const options = [...this.#options];

    this.#dropdown.items = options.map((item) => ({
      key: String(item.id),
      title: `${item.name}${!item.active ? " (archived)" : ""}`,
      isDefaultValue: String(item.id) === String(preferredValue || ""),
    }));
    this.#setValue(preferredValue);
    if (resetSearch) this.#dropdown.close();
  }

  #setValue(id: string, announce = false) {
    const value = String(id || "");
    const item =
      this.#options.find((option) => String(option.id) === value) ||
      (this.#fallbackSelection?.id === value ? this.#fallbackSelection : null);
    this.#hiddenInput.value = item ? value : "";
    this.#dropdown.selection = item ? value : null;
    if (this.getAttribute("value") !== (item ? value : "")) {
      if (item) this.setAttribute("value", value);
      else this.removeAttribute("value");
    }
    if (announce && item) {
      this.dispatchEvent(
        new CustomEvent("mapping-selected", {
          bubbles: true,
          detail: { profile: item },
        }),
      );
    }
  }
}

customElements.define("mapping-select", MappingSelect);
