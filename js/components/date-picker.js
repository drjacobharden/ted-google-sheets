const datePickerTemplate = () => `
  <div class="form-field">
    <span>Date</span>
    <div class="date-picker-container">
      <input type="hidden" />
      <button
        class="date-picker-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded="false"
      >
        <span class="date-display">Select a date</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M7.5 3v4M16.5 3v4M3.5 9h17" />
        </svg>
      </button>
      <div
        class="calendar-popover"
        role="dialog"
        aria-label="Choose a date"
        hidden
      >
        <div class="calendar-header">
          <button class="previous-month" type="button" aria-label="Previous month">
            <svg width="90%" height="90%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <strong class="calendar-month"></strong>
          <button class="next-month" type="button" aria-label="Next month">
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
        <div class="calendar-grid" role="grid"></div>
      </div>
    </div>
  </div>
`;

(function () {
  const { toISODate, fromISODate, longDateFormatter, monthFormatter } =
    window.DateUtils;

  class DatePicker extends HTMLElement {
    #value = "";
    #visibleMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    // Scoped element references
    #triggerElement = null;
    #displayElement = null;
    #popoverElement = null;
    #gridElement = null;
    #monthHeaderElement = null;
    #prevBtn = null;
    #nextBtn = null;
    #hiddenInput = null;

    static get observedAttributes() {
      return ["value", "name"];
    }

    get value() {
      return this.#value;
    }
    set value(v) {
      this.#value = v;
      this.setAttribute("value", v);
    }

    get isOpen() {
      return Boolean(this.#popoverElement && !this.#popoverElement.hidden);
    }

    reportSelectionError() {
      this.#triggerElement?.setAttribute("aria-invalid", "true");
      this.#triggerElement?.focus();
    }

    closePopup({ focusTrigger = false } = {}) {
      this.#closeCalendar();
      if (focusTrigger) this.#triggerElement?.focus();
    }

    connectedCallback() {
      // Set the html to display
      this.innerHTML = datePickerTemplate();

      // Set references to the elements so we only query once
      this.#triggerElement = this.querySelector(".date-picker-trigger");
      this.#displayElement = this.querySelector(".date-display");
      this.#popoverElement = this.querySelector(".calendar-popover");
      this.#gridElement = this.querySelector(".calendar-grid");
      this.#monthHeaderElement = this.querySelector(".calendar-month");
      this.#prevBtn = this.querySelector(".previous-month");
      this.#nextBtn = this.querySelector(".next-month");
      this.#hiddenInput = this.querySelector('input[type="hidden"]');

      // Set the date value
      if (!this.#value && !this.hasAttribute("allow-empty")) {
        this.value = toISODate(new Date()); // Call shared utility
      }

      // Set the name value on the hidden input so that the date value can be stored
      if (this.hasAttribute("name")) {
        this.#hiddenInput.name = this.getAttribute("name");
      }

      // Add listeners to the elements
      this.#triggerElement.addEventListener("click", this);
      this.#prevBtn.addEventListener("click", this);
      this.#nextBtn.addEventListener("click", this);
      this.#popoverElement.addEventListener("keydown", this);
      document.addEventListener("click", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;

      if (name === "value") {
        this.#value = newValue;
        this.#triggerElement?.removeAttribute("aria-invalid");

        if (this.#hiddenInput) {
          this.#hiddenInput.value = newValue;
        }

        const date = fromISODate(newValue); // Call shared utility

        if (date) {
          if (this.#displayElement) {
            this.#displayElement.textContent = longDateFormatter.format(date); // Call shared formatter
          }
          this.#visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
          if (this.#popoverElement && !this.#popoverElement.hidden)
            this.#renderCalendar();
        } else if (this.#displayElement) {
          this.#displayElement.textContent = "Select a date";
        }
      }

      if (name === "name" && this.#hiddenInput) {
        this.#hiddenInput.name = newValue;
      }
    }

    handleEvent(event) {
      if (event.type === "click") {
        // Clicked on the trigger -> Toggle open or closed
        if (event.currentTarget === this.#triggerElement) {
          this.#popoverElement.hidden
            ? this.#openCalendar()
            : this.#closeCalendar();
        }
        // Clicked on the previous month button -> Go back one month
        else if (event.currentTarget === this.#prevBtn) {
          this.#visibleMonth = new Date(
            this.#visibleMonth.getFullYear(),
            this.#visibleMonth.getMonth() - 1,
            1,
          );
          this.#renderCalendar();
        }
        // Clicked on the next month button -> Go forward one month
        else if (event.currentTarget === this.#nextBtn) {
          this.#visibleMonth = new Date(
            this.#visibleMonth.getFullYear(),
            this.#visibleMonth.getMonth() + 1,
            1,
          );
          this.#renderCalendar();
        }
        // Clicked outside the popover -> Close the popover
        else if (!this.contains(event.target)) {
          this.#closeCalendar();
        }
      }
      // Hit the escape key on the keyboard -> Close the popover
      else if (event.type === "keydown" && event.key === "Escape") {
        this.#closeCalendar();
        this.#triggerElement.focus();
      }
    }

    #closeCalendar() {
      this.#popoverElement.hidden = true;
      this.#triggerElement.setAttribute("aria-expanded", "false");
    }

    #openCalendar() {
      const selected = fromISODate(this.#value);

      // Sets the visible data as the selected month
      if (selected)
        this.#visibleMonth = new Date(
          selected.getFullYear(),
          selected.getMonth(),
          1,
        );

      // Renders the grid for the calendar popover
      this.#renderCalendar();

      // Unhides the popover
      this.#popoverElement.hidden = false;
      this.#triggerElement.setAttribute("aria-expanded", "true");

      requestAnimationFrame(() => {
        (
          this.#gridElement.querySelector(".selected") ||
          this.#gridElement.querySelector(".today") ||
          this.#gridElement.querySelector("button")
        )?.focus();
      });
    }

    #renderCalendar() {
      const year = this.#visibleMonth.getFullYear();
      const month = this.#visibleMonth.getMonth();
      const firstDay = new Date(year, month, 1);
      const startDate = new Date(year, month, 1 - firstDay.getDay());
      const selected = this.#value;

      const today = toISODate(new Date()); // Call shared utility

      this.#monthHeaderElement.textContent = monthFormatter.format(
        this.#visibleMonth,
      ); // Call shared formatter

      const days = [];

      for (let index = 0; index < 42; index += 1) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        const value = toISODate(date); // Call shared utility
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(date.getDate());
        button.dataset.date = value;
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-label", longDateFormatter.format(date)); // Call shared formatter
        button.setAttribute("aria-selected", String(value === selected));
        if (date.getMonth() !== month) button.classList.add("outside-month");
        if (value === today) {
          button.classList.add("today");
          button.setAttribute("aria-current", "date");
        }
        if (value === selected) button.classList.add("selected");

        button.addEventListener("click", () => {
          this.value = value;
          this.#closeCalendar();
          this.#triggerElement.focus();

          this.dispatchEvent(
            new CustomEvent("date-change", {
              detail: { value },
              bubbles: true,
            }),
          );
        });
        days.push(button);
      }
      this.#gridElement.replaceChildren(...days);
    }

    disconnectedCallback() {
      this.#triggerElement.removeEventListener("click", this);
      this.#prevBtn.removeEventListener("click", this);
      this.#nextBtn.removeEventListener("click", this);
      this.#popoverElement.removeEventListener("keydown", this);
      document.removeEventListener("click", this);
    }
  }

  customElements.define("date-picker", DatePicker);
})();
