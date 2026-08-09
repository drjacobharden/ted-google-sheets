import DatePickerTempString from "./template.html" with { type: "text" };
import {
  DatePickerStep,
  DateRange,
  DateUtils,
} from "../../utilities/date-utilities";
import { CustomButton } from "../button/button";
import {
  addListener,
  createEventHandler,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import { SegmentedControl } from "../segmented-control/segmented-control";

export interface DateRangeChangedEvent extends CustomEvent {
  detail: {
    range: DateRange;
    step: DatePickerStep;
  };
}

const DatePickerTemp = document.createElement("template");
DatePickerTemp.innerHTML = DatePickerTempString;

export class DatePicker extends HTMLElement {
  #step: DatePickerStep = "year";
  #range: DateRange = DateUtils.defaultRange;

  #segmentedControl!: SegmentedControl;
  #stepButtons!: NodeListOf<CustomButton>;
  #display!: CustomButton;
  #nextButton!: CustomButton;
  #prevButton!: CustomButton;

  connectedCallback(): void {
    const clone = DatePickerTemp.content.cloneNode(true) as DocumentFragment;
    this.append(clone);

    this.#display = this.querySelector<CustomButton>(".control-display")!;
    this.#nextButton = this.querySelector<CustomButton>(
      '[data-date-action="next"]',
    )!;
    this.#prevButton = this.querySelector<CustomButton>(
      '[data-date-action="prev"]',
    )!;

    this.#segmentedControl = this.querySelector("segmented-control")!;
    this.#segmentedControl.items = [
      { key: "week", title: "Weekly" },
      { key: "month", title: "Monthly" },
      { key: "year", title: "Yearly", isDefaultValue: true },
    ];

    this.#stepButtons =
      this.querySelectorAll<CustomButton>("[data-range-step]");

    this.#handleStepChange();

    this.addEventListener("click", this);

    addListener("segmented-control-selection", this.#segmentedControl, this);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      case "segmented-control-selection":
        this.#handleStepSelection(event);
        break;

      default:
        break;
    }
  }

  #handleClick(event: Event) {
    const target = event.target as CustomButton;

    const actionButton = target.closest("[data-date-action]") as HTMLElement;
    if (actionButton) {
      event.preventDefault();
      const amount = actionButton.dataset.dateAction === "prev" ? -1 : 1;
      this.#handleStep(amount);
      return;
    }

    const stepButton = target.closest("[data-range-step]") as HTMLElement;
    if (stepButton) {
      event.preventDefault();
      const step = stepButton.dataset.rangeStep as DatePickerStep;
      this.#step = step;
      this.#handleStepChange();
      return;
    }
  }

  #handleStepSelection(event: Event) {
    handleCustomEvent("segmented-control-selection", event, ({ value }) => {
      this.#step = value as DatePickerStep;
      this.#handleStepChange();
    });
  }

  #handleStepChange() {
    const current = this.#range.start;
    const step = this.#step;

    const util = {
      week: { start: DateUtils.startOfWeek, end: DateUtils.endOfWeek },
      month: { start: DateUtils.startOfMonth, end: DateUtils.endOfMonth },
      year: { start: DateUtils.startOfYear, end: DateUtils.endOfYear },
    }[step];

    this.#range = {
      start: util.start(current),
      end: util.end(current),
    };

    // this.#formatDisplay();
    this.#emitRangeChangeEvent();

    for (let i = 0, l = this.#stepButtons.length; i < l; i++) {
      const item = this.#stepButtons[i];

      if (step === item.dataset.rangeStep) {
        item.toggleAttribute("active", true);
      } else {
        item.toggleAttribute("active", false);
      }
    }
  }

  #handleStep(amount: 1 | -1) {
    const range = this.#range;
    const step = this.#step;

    const util = {
      week: (d: Date): DateRange => {
        const _date = DateUtils.addWeeks(d, amount);
        return {
          start: DateUtils.startOfWeek(_date),
          end: DateUtils.endOfWeek(_date),
        };
      },
      month: (d: Date): DateRange => {
        const _date = DateUtils.addMonths(d, amount);
        return {
          start: DateUtils.startOfMonth(_date),
          end: DateUtils.endOfMonth(_date),
        };
      },
      year: (d: Date): DateRange => {
        const _date = DateUtils.addYears(d, amount);
        return {
          start: DateUtils.startOfYear(_date),
          end: DateUtils.endOfYear(_date),
        };
      },
    }[step];

    this.#range = util(range.start);
    // this.#formatDisplay();
    this.#emitRangeChangeEvent();
  }

  // #formatDisplay() {
  //   this.#display.label = DateUtils.formatDateRange(
  //     this.#range.start,
  //     this.#range.end,
  //     {
  //       showDays: this.#step === "week",
  //       showMonth: this.#step !== "year",
  //       monthFormat: "short",
  //     },
  //   );
  // }

  #emitRangeChangeEvent() {
    this.#events.dispatch(
      { range: this.#range, step: this.#step },
      { bubbles: true },
    );
  }

  disconnectedCallback() {
    this.removeEventListener("click", this);
    removeListener("segmented-control-selection", this.#segmentedControl, this);
  }

  #events = createEventHandler("date-range-changed", this);

  addListener = this.#events.addListener;
  removeListener = this.#events.removeListener;
  handleDateRangeChange = this.#events.handleEvent;
}

customElements.define("date-range-picker-2", DatePicker);
