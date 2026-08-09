import { createEventHandler } from "../../utilities/event-utilities";

export interface SegmentedControlItem {
  key: string;
  title: string;
}

export interface SegmentedControlSelectionEvent extends CustomEvent {
  detail: {
    value: string;
    title: string;
  };
}

/** Displays a variable-width set of mutually exclusive choices. */
export class SegmentedControl
  extends HTMLElement
  implements EventListenerObject
{
  #items: SegmentedControlItem[] = [];
  #selection: string | null = null;
  #initialized = false;
  #listening = false;
  #indicatorFrame = 0;
  #list!: HTMLElement;
  #indicator!: HTMLElement;
  #resizeObserver: ResizeObserver | null = null;

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#initialized = true;
      this.setAttribute("role", "radiogroup");
      this.setAttribute("aria-orientation", "horizontal");

      this.#indicator = document.createElement("span");
      this.#indicator.className = "segmented-control__indicator";
      this.#indicator.setAttribute("aria-hidden", "true");

      this.#list = document.createElement("div");
      this.#list.className = "segmented-control__list";

      this.#list.append(this.#indicator);
      this.append(this.#list);
    }

    this.#renderItems();

    if (this.#listening) return;
    this.#listening = true;
    this.#list.addEventListener("click", this);
    this.#list.addEventListener("keydown", this);

    if (typeof ResizeObserver !== "undefined") {
      this.#resizeObserver ??= new ResizeObserver(() => {
        this.#scheduleIndicatorUpdate();
      });
      this.#resizeObserver.observe(this.#list);
    }
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#list.removeEventListener("click", this);
    this.#list.removeEventListener("keydown", this);
    this.#resizeObserver?.disconnect();
    cancelAnimationFrame(this.#indicatorFrame);
    this.#indicatorFrame = 0;
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      case "keydown":
        this.#handleKeydown(event as KeyboardEvent);
        break;

      default:
        break;
    }
  }

  set items(items: SegmentedControlItem[]) {
    this.#items = items.map(({ key, title }) => ({ key, title }));

    if (!this.#items.some((item) => item.key === this.#selection)) {
      this.#selection = this.#items[0]?.key ?? null;
    }

    if (this.isConnected) this.#renderItems();
  }

  get items(): SegmentedControlItem[] {
    return this.#items.map(({ key, title }) => ({ key, title }));
  }

  set selection(key: string | null) {
    if (key !== null && !this.#items.some((item) => item.key === key)) return;
    if (this.#selection === key) return;

    this.#selection = key;
    if (this.isConnected) this.#renderSelection();
  }

  get selection(): string | null {
    return this.#selection;
  }

  #renderItems(): void {
    const buttons = this.#items.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "segmented-control__item";
      button.dataset.segmentKey = item.key;
      button.textContent = item.title;
      button.setAttribute("role", "radio");
      return button;
    });

    this.#list.replaceChildren(this.#indicator, ...buttons);
    this.#renderSelection();
  }

  #renderSelection(): void {
    const buttons = this.#buttons();

    buttons.forEach((button) => {
      const selected = button.dataset.segmentKey === this.#selection;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });

    if (this.#selection === null && buttons[0]) buttons[0].tabIndex = 0;
    this.#scheduleIndicatorUpdate();
  }

  #scheduleIndicatorUpdate(): void {
    cancelAnimationFrame(this.#indicatorFrame);
    this.#indicatorFrame = requestAnimationFrame(() => {
      this.#indicatorFrame = 0;
      const selected = this.#selectedButton();

      if (!selected) {
        this.removeAttribute("indicator-ready");
        this.#indicator.style.width = "0px";
        return;
      }

      this.#indicator.style.width = `${selected.offsetWidth}px`;
      this.#indicator.style.transform = `translateX(${selected.offsetLeft}px)`;

      if (!this.hasAttribute("indicator-ready")) {
        requestAnimationFrame(() => this.setAttribute("indicator-ready", ""));
      }
    });
  }

  #handleClick(event: Event): void {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      ".segmented-control__item",
    );

    if (!button || !this.#list.contains(button)) return;

    this.#select(button.dataset.segmentKey ?? null, true);
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    const buttons = this.#buttons();
    if (buttons.length === 0) return;

    event.preventDefault();
    const currentIndex = Math.max(
      0,
      buttons.findIndex(
        (button) => button.dataset.segmentKey === this.#selection,
      ),
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (currentIndex +
              (event.key === "ArrowRight" ? 1 : -1) +
              buttons.length) %
            buttons.length;
    const nextButton = buttons[nextIndex];

    this.#select(nextButton.dataset.segmentKey ?? null, true);
    nextButton.focus();
  }

  #select(key: string | null, emit: boolean): void {
    const item = this.#items.find((candidate) => candidate.key === key);
    if (!item || item.key === this.#selection) return;

    this.#selection = item.key;
    this.#renderSelection();
    if (emit) {
      this.#selectionHandler.dispatch({ value: item.key, title: item.title });
    }
  }

  #buttons(): HTMLButtonElement[] {
    return Array.from(
      this.#list.querySelectorAll<HTMLButtonElement>(
        ".segmented-control__item",
      ),
    );
  }

  #selectedButton(): HTMLButtonElement | null {
    return (
      this.#buttons().find(
        (button) => button.dataset.segmentKey === this.#selection,
      ) ?? null
    );
  }

  #selectionHandler = createEventHandler("segmented-control-selection", this);

  addListener = this.#selectionHandler.addListener;
  removeListener = this.#selectionHandler.removeListener;
  handleSelection = this.#selectionHandler.handleEvent;
}

customElements.define("segmented-control", SegmentedControl);
