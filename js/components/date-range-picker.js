const dateRangeButton = ({ id, title }) =>
  `<button type="button" data-range="${id}">${title}</button>`;

const dateRangeOptions = [
  { id: "week", title: "Week" },
  { id: "month", title: "Month" },
  { id: "three-months", title: "3 months" },
  { id: "year", title: `${new Date().getFullYear()}` },
  { id: "all", title: "All time" },
]
  .map(dateRangeButton)
  .join(" ");

const dateRangePickerTemplate = () =>
  `
    <div class="date-range-presets" role="group" aria-label="Quick date ranges">
      ${dateRangeOptions}
      <button type="button" data-custom-range aria-expanded="false">
        Custom
      </button>
    </div>
    <div class="range-calendar-popover" hidden>
      <div class="calendar-header">
        <button type="button" data-range-previous aria-label="Previous month">
          <svg width="90%" height="90%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <strong data-range-month></strong>
        <button type="button" data-range-next aria-label="Next month">
          <svg width="90%" height="90%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="calendar-weekdays" aria-hidden="true">
        <span>Su</span>
        <span>Mo</span>
        <span>Tu</span>
        <span>We</span>
        <span>Th</span>
        <span>Fr</span>
        <span>Sa</span>
      </div>
      <div class="calendar-grid" data-range-grid role="grid"></div>
      <p class="range-selection" data-range-selection>
        Select a start date, then an end date.
      </p>
      <div class="range-calendar-actions">
        <button class="inline-cancel-button" type="button" data-range-cancel>
          Cancel
        </button>
        <button
          class="primary-button compact"
          type="button"
          data-range-apply
          disabled
        >
          Apply
        </button>
      </div>
    </div>
 `;

(function () {
  // State utility to compute ranges from preset strings
  function getPresetRange(preset, today = new Date()) {
    const year = today.getFullYear();

    const month = today.getMonth();

    if (preset === "week") {
      const start = new Date(year, month, today.getDate() - today.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return {
        preset,
        start: toISODate(start),
        end: toISODate(end),
        label: "Week",
      };
    }

    if (preset === "three-months") {
      return {
        preset,
        start: toISODate(new Date(year, month - 2, 1)),
        end: toISODate(new Date(year, month + 1, 0)),
        label: "3 Months",
      };
    }

    if (preset === "year") {
      return {
        preset,
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        label: String(year),
      };
    }

    if (preset === "all") {
      return { preset, start: "", end: "", label: "All time" };
    }

    return {
      preset: "month",
      start: toISODate(new Date(year, month, 1)),
      end: toISODate(new Date(year, month + 1, 0)),
      label: "Month",
    };
  }

  function resolveDraftSelection(start, end, day) {
    if (!start || end) return { start: day, end: "" };
    if (day < start) return { start: day, end: start };
    return { start, end: day };
  }

  class DateRangePicker extends HTMLElement {
    #visibleMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    // State for the currently selected data range
    #currentRange = getPresetRange("month");
    #draftStart = "";
    #draftEnd = "";

    // DOM Elements Cache
    #popover = null;
    #customButton = null;
    #grid = null;
    #selectionDisplay = null;
    #applyButton = null;
    #monthHeader = null;

    static get observedAttributes() {
      return ["preset"];
    }

    get value() {
      return this.#currentRange;
    }

    set value(range) {
      this.#currentRange = { ...range };
      this.#renderButtons();
      this.#dispatchChange();
    }

    connectedCallback() {
      this.innerHTML = dateRangePickerTemplate();

      // Assign the elements to their references
      this.#popover = this.querySelector(".range-calendar-popover");
      this.#customButton = this.querySelector("[data-custom-range]");
      this.#grid = this.querySelector("[data-range-grid]");
      this.#selectionDisplay = this.querySelector("[data-range-selection]");
      this.#applyButton = this.querySelector("[data-range-apply]");
      this.#monthHeader = this.querySelector("[data-range-month]");

      // Render the 42 individual date buttons
      const buttons = [];
      for (let index = 0; index < 42; index += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "gridcell");
        buttons.push(button);
      }
      this.#grid.replaceChildren(...buttons);

      // Initial defaults
      const initialPreset = this.getAttribute("preset") || "month";
      this.#currentRange = getPresetRange(initialPreset);

      // Event Listeners
      this.addEventListener("click", this);
      this.addEventListener("keydown", this);
      document.addEventListener("click", this);

      this.#renderButtons();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (name === "preset" && oldValue !== newValue && newValue) {
        this.value = getPresetRange(newValue);
      }
    }

    handleEvent(event) {
      if (event.type === "click") {
        if (event.currentTarget === document && this.contains(event.target)) {
          return;
        }

        this.#handleClick(event);
      } else if (event.type === "keydown") {
        this.#handleKeyDown(event);
      }
    }

    #handleClick(event) {
      // Outside element click closes popover
      if (!this.contains(event.target)) {
        this.#close();
        return;
      }

      // Clicking on a preset -> find the closest button and apply its range
      const presetBtn = event.target.closest("[data-range]");
      if (presetBtn) {
        const preset = presetBtn.dataset.range;
        this.value = getPresetRange(preset);
        this.#close();
        return;
      }

      // Clicking on the custom range -> Toggle the popover visibility
      if (event.target.closest("[data-custom-range]")) {
        this.#popover.hidden ? this.#open() : this.#close();
        return;
      }

      // Clicking on the previous month button in the popover -> Go back one month
      if (event.target.closest("[data-range-previous]")) {
        this.#visibleMonth = new Date(
          this.#visibleMonth.getFullYear(),
          this.#visibleMonth.getMonth() - 1,
          1,
        );
        this.#renderCalendar();
        return;
      }

      // Clicking on the next month button in the popover -> Go forward one month
      if (event.target.closest("[data-range-next]")) {
        this.#visibleMonth = new Date(
          this.#visibleMonth.getFullYear(),
          this.#visibleMonth.getMonth() + 1,
          1,
        );
        this.#renderCalendar();
        return;
      }

      // Clicking on on a day in the popover -> Set the date range
      const dayCell = event.target.closest("[data-date]");
      if (dayCell) {
        const day = dayCell.dataset.date;
        const selection = resolveDraftSelection(
          this.#draftStart,
          this.#draftEnd,
          day,
        );

        this.#draftStart = selection.start;
        this.#draftEnd = selection.end;
        this.#renderCalendar();
        this.#grid.querySelector(`[data-date="${day}"]`)?.focus();
        return;
      }

      // Clicking on cancel -> Close the popover
      if (event.target.closest("[data-range-cancel]")) {
        this.#close();
      }

      // Clicking apply in the popover -> Apply the range and close the popover
      if (
        event.target.closest("[data-range-apply]") &&
        this.#draftStart &&
        this.#draftEnd
      ) {
        this.value = {
          preset: "custom",
          start: this.#draftStart,
          end: this.#draftEnd,
          label: `${shortDateFormatter.format(fromISODate(this.#draftStart))} – ${shortDateFormatter.format(fromISODate(this.#draftEnd))}`,
        };
        this.#close();
      }
    }

    // Hittin escape on the keyboard -> Close the popover
    #handleKeyDown(event) {
      if (event.key === "Escape") {
        this.#close();
        this.#customButton.focus();
      }
    }

    // Open the popover and set the range to the current preset date range
    #open() {
      this.#draftStart =
        this.#currentRange.preset === "custom" ? this.#currentRange.start : "";
      this.#draftEnd =
        this.#currentRange.preset === "custom" ? this.#currentRange.end : "";

      this.#visibleMonth = fromISODate(this.#draftStart)
        ? new Date(
            fromISODate(this.#draftStart).getFullYear(),
            fromISODate(this.#draftStart).getMonth(),
            1,
          )
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      this.#renderCalendar();
      this.#popover.hidden = false;
      this.#customButton.setAttribute("aria-expanded", "true");
    }

    // Close the popover
    #close() {
      if (this.#popover) {
        this.#popover.hidden = true;
        this.#customButton.setAttribute("aria-expanded", "false");
      }
    }

    // Set the active state for each of the buttons
    #renderButtons() {
      this.querySelectorAll("[data-range]").forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.range === this.#currentRange.preset,
        );
      });
      if (this.#customButton) {
        this.#customButton.classList.toggle(
          "active",
          this.#currentRange.preset === "custom",
        );
      }
    }

    // Render the dates on the popover for the visible month
    #renderCalendar() {
      this.#monthHeader.textContent = monthFormatter.format(this.#visibleMonth);

      const first = new Date(
        this.#visibleMonth.getFullYear(),
        this.#visibleMonth.getMonth(),
        1,
      );
      const start = new Date(
        first.getFullYear(),
        first.getMonth(),
        1 - first.getDay(),
      );

      const buttons = this.#grid.children;

      for (let index = 0; index < 42; index++) {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const value = toISODate(date);

        const button = buttons[index];

        // Update properties on the existing button
        button.textContent = String(date.getDate());
        button.dataset.date = value;
        button.setAttribute("aria-label", shortDateFormatter.format(date));

        // Toggle state classes in place (this keeps DOM elements attached!)
        button.classList.toggle(
          "outside-month",
          date.getMonth() !== this.#visibleMonth.getMonth(),
        );
        button.classList.toggle("range-start", value === this.#draftStart);
        button.classList.toggle("range-end", value === this.#draftEnd);

        const isWithinRange =
          this.#draftStart &&
          this.#draftEnd &&
          value > this.#draftStart &&
          value < this.#draftEnd;

        button.classList.toggle("in-range", !!isWithinRange);
      }

      this.#selectionDisplay.textContent = this.#draftStart
        ? `${shortDateFormatter.format(fromISODate(this.#draftStart))}${this.#draftEnd ? ` – ${shortDateFormatter.format(fromISODate(this.#draftEnd))}` : " – Select an end date"}`
        : "Select a start date, then an end date.";

      this.#applyButton.disabled = !(this.#draftStart && this.#draftEnd);
    }

    // Alert other elements to the applied date range change
    #dispatchChange() {
      this.dispatchEvent(
        new CustomEvent("date-range-changed", {
          detail: this.#currentRange,
          bubbles: true,
        }),
      );
    }

    disconnectedCallback() {
      this.removeEventListener("click", this);
      this.removeEventListener("keydown", this);
      document.removeEventListener("click", this);
    }
  }

  customElements.define("date-range-picker", DateRangePicker);
  window.DateRangePickerUtils = {
    getPresetRange,
    resolveDraftSelection,
  };
})();
