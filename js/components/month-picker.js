const monthPickerLabelClass = "month-picker-label";
const monthPickerTriggerClass = "month-picker-trigger";
const monthPickerTriggerDisplayClass = "month-picker-display";
const monthPickerPopoverClass = "month-picker-popover";

const monthPickerTemplate = ({ alignmentClass }) => `
    <span class="month-picker-label"></span>
    <button
      class="month-picker-trigger"
      type="button"
      aria-haspopup="dialog"
      aria-expanded="false"
    >
      <span class="month-picker-display" data-month-picker-display></span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="15" rx="2"></rect>
        <path d="M7.5 3v4M16.5 3v4M3.5 9h17"></path>
      </svg>
    </button>
    <div
      class="month-picker-popover ${alignmentClass}"
      role="dialog"
      aria-label="Choose a month"
      hidden
    >
        <div class="calendar-header">
          <button class="previous-month" type="button" aria-label="Previous year" data-month-picker-previous>
            <svg width="90%" height="90%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <strong class="calendar-month" data-month-picker-year></strong>
          <button class="next-month" type="button" aria-label="Next year" data-month-picker-next>
           <svg width="90%" height="90%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      <div class="month-picker-grid" role="grid"></div>
    </div>
  `;

(function () {
  const { shortMonthNames } = window.DateUtils;

  const MONTH_VALUE_PATTERN = /^(?!0000)(\d{4})-(0[1-9]|1[0-2])$/;
  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  function normalizeMonth(value) {
    const match = String(value || "").match(MONTH_VALUE_PATTERN);
    return match ? `${match[1]}-${match[2]}` : "";
  }

  function formatMonth(value) {
    const normalized = normalizeMonth(value);
    if (!normalized) return "Select a month";
    const [year, month] = normalized.split("-").map(Number);
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  function shiftMonth(value, offset) {
    const normalized = normalizeMonth(value);
    if (!normalized || !Number.isInteger(offset)) return "";
    const [year, month] = normalized.split("-").map(Number);
    const absoluteMonth = year * 12 + month - 1 + offset;
    const nextYear = Math.floor(absoluteMonth / 12);
    const nextMonth = ((absoluteMonth % 12) + 12) % 12;
    if (nextYear < 1 || nextYear > 9999) return "";
    return `${String(nextYear).padStart(4, "0")}-${String(nextMonth + 1).padStart(2, "0")}`;
  }

  function isWithinBounds(value, min = "", max = "") {
    const normalized = normalizeMonth(value);
    if (!normalized) return false;
    const normalizedMin = normalizeMonth(min);
    const normalizedMax = normalizeMonth(max);
    return (
      (!normalizedMin || normalized >= normalizedMin) &&
      (!normalizedMax || normalized <= normalizedMax)
    );
  }

  function currentMonth() {
    const today = new Date();
    return `${String(today.getFullYear()).padStart(4, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }

  class MonthPicker extends HTMLElement {
    static get observedAttributes() {
      return ["label", "value", "min", "max", "alignment"];
    }

    // In-memory properties
    #isOpen = false;
    #visibleYear = new Date().getFullYear();

    // Elements Cache
    #label = null;
    #trigger = null;
    #display = null;
    #popover = null;
    #yearDisplay = null;
    #grid = null;
    #previous = null;
    #next = null;

    get alignment() {
      const val = this.getAttribute("alignment");
      return val === "right" ? "right" : "left";
    }

    set alignment(value) {
      if (value === "right" || value === "left")
        this.setAttribute("alignment", value);
      else this.removeAttribute("alignment");
    }

    get value() {
      return normalizeMonth(this.getAttribute("value"));
    }
    set value(value) {
      const normalized = normalizeMonth(value);
      if (normalized) this.setAttribute("value", normalized);
      else this.removeAttribute("value");
    }

    get min() {
      return normalizeMonth(this.getAttribute("min"));
    }
    set min(value) {
      const normalized = normalizeMonth(value);
      if (normalized) this.setAttribute("min", normalized);
      else this.removeAttribute("min");
    }

    get max() {
      return normalizeMonth(this.getAttribute("max"));
    }
    set max(value) {
      const normalized = normalizeMonth(value);
      if (normalized) this.setAttribute("max", normalized);
      else this.removeAttribute("max");
    }

    connectedCallback() {
      const alignmentClass =
        this.alignment === "right"
          ? "month-picker-popover-right-align"
          : "month-picker-popover-left-align";

      // Set the html to display
      this.innerHTML = monthPickerTemplate({ alignmentClass });

      // Set the references for the component
      this.#label = this.querySelector(".month-picker-label");
      this.#trigger = this.querySelector(".month-picker-trigger");
      this.#display = this.querySelector(".month-picker-display");
      this.#popover = this.querySelector(".month-picker-popover");
      this.#yearDisplay = this.querySelector(".calendar-month");
      this.#grid = this.querySelector(".month-picker-grid");
      this.#previous = this.querySelector(".previous-month");
      this.#next = this.querySelector(".next-month");

      // Create each of the buttons on the popover
      const buttons = shortMonthNames.map(() => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "gridcell");
        return button;
      });
      this.#grid.replaceChildren(...buttons);

      // Centralized router configuration to stop double triggering
      this.addEventListener("click", this);
      this.addEventListener("keydown", this);
      // document.addEventListener("click", this);

      this.#update();
    }

    disconnectedCallback() {
      this.removeEventListener("click", this);
      this.removeEventListener("keydown", this);
      document.removeEventListener("click", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      this.#update();
    }

    handleEvent(event) {
      if (event.type === "click") {
        if (event.currentTarget === document && !this.contains(event.target)) {
          console.log("do nothing");
          return;
        }
        this.#handleClick(event);
      } else if (event.type === "keydown") {
        this.#handleKeydown(event);
      }
    }

    #handleClick(event) {
      if (!this.contains(event.target)) {
        console.log("close");
        this.#closeCalendar();
        return;
      }

      if (event.target.closest(".month-picker-trigger")) {
        console.log(this.#isOpen);
        this.#popover.hidden ? this.#openCalendar() : this.#closeCalendar();
        return;
      } else if (event.target.closest("[data-month-picker-previous]")) {
        console.log("prev");
        if (this.#canShowYear(this.#visibleYear - 1)) {
          this.#visibleYear -= 1;
          this.#renderMonths();
        }
        return;
      } else if (event.target.closest("[data-month-picker-next]")) {
        console.log("next");
        if (this.#canShowYear(this.#visibleYear + 1)) {
          this.#visibleYear += 1;
          this.#renderMonths();
        }
        return;
      }

      const mtnButton = event.target.closest("[data-month-value]");
      if (mtnButton) {
        console.log("month");
        this.#select(mtnButton.dataset.monthValue);
      }
    }

    #update() {
      if (this.#label) {
        const label = this.getAttribute("label") || "Month";
        this.#label.textContent = label;
      }

      if (this.#display) {
        this.#display.textContent = formatMonth(this.value);
      }

      if (this.#isOpen) {
        this.#renderMonths();
      }
    }

    #openCalendar() {
      this.#popover.hidden = false;
      this.#isOpen = true;
      const initial = this.value || currentMonth();
      this.#visibleYear = Number(initial.slice(0, 4));
      if (!this.#canShowYear(this.#visibleYear)) {
        if (this.min) this.#visibleYear = Number(this.min.slice(0, 4));
        else if (this.max) this.#visibleYear = Number(this.max.slice(0, 4));
      }
      this.#renderMonths();

      this.#popover.style.display = "block";
      this.#trigger.setAttribute("aria-expanded", "true");

      requestAnimationFrame(() => {
        document.addEventListener("click", this);
        const preferred =
          this.#grid.querySelector(".selected") ||
          this.#grid.querySelector(".current") ||
          this.#grid.querySelector("button:not(:disabled)");
        preferred?.focus();
      });
    }

    #closeCalendar({ restoreFocus = false } = {}) {
      if (!this.#trigger || !this.#popover) return;

      this.#popover.hidden = true;
      this.#isOpen = false;
      this.#popover.style.display = "none";
      this.#trigger.setAttribute("aria-expanded", "false");

      document.removeEventListener("click", this);
      if (restoreFocus) this.#trigger.focus();
    }

    #canShowYear(year) {
      if (!Number.isInteger(year) || year < 1 || year > 9999) return false;
      const yearText = String(year).padStart(4, "0");
      return (
        (!this.min || `${yearText}-12` >= this.min) &&
        (!this.max || `${yearText}-01` <= this.max)
      );
    }

    #renderMonths() {
      const year = String(this.#visibleYear).padStart(4, "0");
      const selected = this.value;
      const today = currentMonth();
      this.#yearDisplay.textContent = year;
      this.#previous.disabled = !this.#canShowYear(this.#visibleYear - 1);
      this.#next.disabled = !this.#canShowYear(this.#visibleYear + 1);

      const buttons = this.#grid.children;

      shortMonthNames.forEach((name, index) => {
        const value = `${year}-${String(index + 1).padStart(2, "0")}`;
        const button = buttons[index];

        button.textContent = name;
        button.dataset.monthValue = value;
        button.setAttribute("aria-label", formatMonth(value));
        button.setAttribute("aria-selected", String(value === selected));
        button.disabled = !isWithinBounds(value, this.min, this.max);

        button.classList.toggle("selected", value === selected);
        if (value === today) {
          button.classList.add("current");
          button.setAttribute("aria-current", "date");
        } else {
          button.classList.remove("current");
          button.removeAttribute("aria-current");
        }
      });
    }

    #select(value) {
      if (!isWithinBounds(value, this.min, this.max)) return;
      this.value = value;
      this.#closeCalendar({ restoreFocus: true });
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }

    #focusMonth(value) {
      if (!isWithinBounds(value, this.min, this.max)) return;
      this.#visibleYear = Number(value.slice(0, 4));
      this.#renderMonths();
      this.#grid.querySelector(`[data-month-value="${value}"]`)?.focus();
    }

    #handleKeydown(event) {
      if (event.type !== "keydown") return;

      if (event.key === "Escape") {
        event.preventDefault();
        this.#closeCalendar({ restoreFocus: true });
        return;
      }

      const monthButton = event.target.closest("[data-month-value]");
      if (!monthButton) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.#select(monthButton.dataset.monthValue);
        return;
      }

      const offsets = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -4,
        ArrowDown: 4,
      };
      let destination = offsets[event.key]
        ? shiftMonth(monthButton.dataset.monthValue, offsets[event.key])
        : "";

      if (event.key === "Home")
        destination = `${monthButton.dataset.monthValue.slice(0, 4)}-01`;
      if (event.key === "End")
        destination = `${monthButton.dataset.monthValue.slice(0, 4)}-12`;

      if (!destination) return;
      event.preventDefault();
      this.#focusMonth(destination);
    }
  }

  window.MonthPickerUI = {
    normalizeMonth,
    formatMonth,
    shiftMonth,
    isWithinBounds,
  };

  customElements.define("month-picker", MonthPicker);
})();
