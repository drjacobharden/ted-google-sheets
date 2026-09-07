import { createEventHandler, addListener, removeListener, handleCustomEvent } from "../../utilities/event-utilities";
import type { DropdownMenu, DropdownSelectionEvent, DropdownMenuItem } from "../dropdown-menu/dropdown-menu";
import { CustomButton } from "../button/button";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

export interface YearSelectionChangedEvent extends CustomEvent {
  detail: { year: string };
}

export class YearSelector extends HTMLElement implements EventListenerObject {
  #dropdown!: DropdownMenu;
  #previous!: CustomButton;
  #next!: CustomButton;
  #years: number[] = [];
  #selectedYear: string | null = null;
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.append(template.content.cloneNode(true));
      this.#dropdown = this.querySelector("dropdown-menu")!;
      this.#previous = this.querySelector('[data-year-step="previous"]')!;
      this.#next = this.querySelector('[data-year-step="next"]')!;
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#dropdown.addListener(this);
    addListener("click", this.#previous, this);
    addListener("click", this.#next, this);
    this.#render();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#dropdown.removeListener(this);
    removeListener("click", this.#previous, this);
    removeListener("click", this.#next, this);
  }

  set years(years: number[]) {
    this.#years = [...years];
    this.#render();
  }

  set selectedYear(year: string) {
    this.#selectedYear = year;
    this.#render();
  }

  get selectedYear(): string | null {
    return this.#selectedYear;
  }

  handleEvent(event: Event): void {
    if (event.type === "dropdown-selection") {
      handleCustomEvent("dropdown-selection", event, ({ value }) => {
        this.#select(value);
      });
      return;
    }
    if (event.type === "click") {
      const button = event.currentTarget as HTMLElement;
      const direction = button.dataset.yearStep;
      const currentIndex = this.#years.indexOf(Number(this.#selectedYear));
      const nextIndex = direction === "previous" ? currentIndex + 1 : currentIndex - 1;
      const year = this.#years[nextIndex];
      if (year !== undefined) this.#select(String(year));
    }
  }

  #select(year: string): void {
    if (!this.#years.includes(Number(year))) return;
    this.#selectedYear = year;
    this.#render();
    this.#selectionEvents.dispatch({ year }, { bubbles: true });
  }

  #render(): void {
    if (!this.#dropdown || !this.#previous || !this.#next) return;
    const items: DropdownMenuItem[] = this.#years.map((year) => ({
      key: String(year),
      title: String(year),
      isDefaultValue: String(year) === this.#selectedYear,
    }));
    this.#dropdown.items = items;
    this.#dropdown.selection = this.#selectedYear;
    const currentIndex = this.#years.indexOf(Number(this.#selectedYear));
    this.#setStep(this.#previous, this.#years[currentIndex + 1], "Previous");
    this.#setStep(this.#next, this.#years[currentIndex - 1], "Next");
  }

  #setStep(button: CustomButton, year: number | undefined, direction: string): void {
    if (year === undefined) delete button.dataset.year;
    else button.dataset.year = String(year);
    button.toggleAttribute("disabled", year === undefined);
    button.setAttribute("aria-disabled", String(year === undefined));
    button.setAttribute(
      "aria-label",
      year === undefined ? `No ${direction.toLowerCase()} year available` : `${direction} year, ${year}`,
    );
  }

  #selectionEvents = createEventHandler("year-selection-changed", this);
  addListener = this.#selectionEvents.addListener;
  removeListener = this.#selectionEvents.removeListener;
}

if (!customElements.get("year-selector")) {
  customElements.define("year-selector", YearSelector);
}
