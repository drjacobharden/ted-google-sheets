import type { ActivitySource } from "../../api/budget-api";
import { DropdownMenu } from "../dropdown-menu/dropdown-menu";
import { InfoHover } from "../info-hover/info-hover";

const SOURCE_OPTIONS = [
  { key: "manual", title: "Manual", isDefaultValue: true },
  { key: "deduction", title: "Paycheck deduction" },
];

export class SourceSelect extends HTMLElement {
  static get observedAttributes() {
    return ["value"];
  }

  #dropdown!: DropdownMenu;
  #hiddenInput!: HTMLInputElement;
  #infoHover!: InfoHover;
  #label!: HTMLElement;

  get value(): ActivitySource {
    return (this.#dropdown?.selection || "manual") as ActivitySource;
  }

  set value(source: ActivitySource | string) {
    const nextValue = source === "deduction" ? "deduction" : "manual";
    if (!this.#dropdown) {
      this.setAttribute("value", nextValue);
      return;
    }
    this.#dropdown.selection = nextValue;
    this.#hiddenInput.value = nextValue;
  }

  connectedCallback() {
    const initialValue =
      (this.getAttribute("value") as ActivitySource) || "manual";
    this.innerHTML = `
      <div class="form-field source-form-field">
        <div class="horizontal-center justify-between">
          <span class="form-field-label">Source</span>
          <info-hover></info-hover>
        </div>
        <input class="id-input" name="source" type="hidden" />
        <dropdown-menu
          class="source-select-menu"
          variant="editorial"
          label="Select a source"
          align-start
        ></dropdown-menu>
      </div>
    `;
    this.#dropdown = this.querySelector("dropdown-menu")!;
    this.#hiddenInput = this.querySelector(".id-input")!;

    this.#dropdown.setAttribute("aria-label", "Select a source");
    this.#dropdown.items = SOURCE_OPTIONS;
    this.#dropdown.addEventListener("dropdown-selection", this);
    this.#infoHover = this.querySelector("info-hover")!;
    this.#label = this.querySelector(".form-field-label")!;

    this.#infoHover.message =
      this.dataset.info ??
      "Paycheck deductions are counted as income that is invested directly. Manual transfers pull from your existing savings and are not counted as additional income.";

    this.#label.textContent =
      this.getAttribute("label") ?? this.#label.textContent;

    this.#setValue(initialValue);
    this.closest("form")?.addEventListener("reset", this);
  }

  disconnectedCallback() {
    this.#dropdown?.removeEventListener("dropdown-selection", this);
    this.closest("form")?.removeEventListener("reset", this);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "value" && oldValue !== newValue && this.#dropdown) {
      const source = newValue as ActivitySource;
      this.#setValue(source || "manual");
    }
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "dropdown-selection":
        this.#dropdown.handleSelection(event, ({ value }) => {
          this.#setValue(value as ActivitySource, true);
        });
        break;

      case "reset":
        setTimeout(() => this.#setValue("manual"), 0);
        break;

      default:
        break;
    }
  }

  #setValue(source: ActivitySource, announce = false) {
    const value = source === "deduction" ? "deduction" : "manual";
    this.#dropdown.selection = value;
    this.#hiddenInput.value = value;
    if (this.getAttribute("value") !== value) this.setAttribute("value", value);
    if (announce) {
      this.dispatchEvent(
        new CustomEvent("source-selected", {
          bubbles: true,
          detail: { source: value },
        }),
      );
    }
  }

  set tooltip(message: string | undefined) {
    this.#infoHover.message = message;
  }
}

customElements.define("source-select", SourceSelect);
