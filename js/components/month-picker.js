const monthPickerTemplate = ({ labelId, displayId, alignmentClass }) => `
    <span class="month-picker-label" id="${labelId}"></span>
    <button
      class="month-picker-trigger"
      type="button"
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-labelledby="${labelId} ${displayId}"
    >
      <span id="${displayId}" data-month-picker-display></span>
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
  const SHORT_MONTH_NAMES = MONTH_NAMES.map((name) => name.slice(0, 3));
  let pickerIndex = 0;

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

    constructor() {
      super();
      this._initialized = false;
      this._visibleYear = new Date().getFullYear();
      this._handleDocumentClick = this._handleDocumentClick.bind(this);
    }

    connectedCallback() {
      if (!this._initialized) this._initialize();
      document.addEventListener("click", this._handleDocumentClick);
      this._update();
    }

    disconnectedCallback() {
      document.removeEventListener("click", this._handleDocumentClick);
    }

    attributeChangedCallback() {
      if (this._initialized) this._update();
    }

    // 3. Javascript property getter
    get alignment() {
      // Default to 'left' if the attribute is missing or invalid
      const val = this.getAttribute("alignment");
      return val === "right" ? "right" : "left";
    }

    // 4. Javascript property setter
    set alignment(value) {
      if (value === "right" || value === "left") {
        this.setAttribute("alignment", value);
      } else {
        this.removeAttribute("alignment");
      }
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

    _initialize() {
      pickerIndex += 1;
      const labelId = `month-picker-label-${pickerIndex}`;
      const displayId = `month-picker-display-${pickerIndex}`;
      const alignmentClass =
        this.alignment === "right"
          ? "month-picker-popover-right-align"
          : "month-picker-popover-left-align";

      this.classList.add("month-picker");
      this.innerHTML = monthPickerTemplate({
        labelId,
        displayId,
        alignmentClass,
      });

      this._label = this.querySelector(".month-picker-label");
      this._trigger = this.querySelector(".month-picker-trigger");
      this._display = this.querySelector("[data-month-picker-display]");
      this._popover = this.querySelector(".month-picker-popover");
      this._yearDisplay = this.querySelector("[data-month-picker-year]");
      this._grid = this.querySelector(".month-picker-grid");
      this._previous = this.querySelector("[data-month-picker-previous]");
      this._next = this.querySelector("[data-month-picker-next]");

      this._trigger.addEventListener("click", () => {
        if (this._popover.hidden) this._open();
        else this._close();
      });
      this._previous.addEventListener("click", () => {
        if (this._canShowYear(this._visibleYear - 1)) {
          this._visibleYear -= 1;
          this._renderMonths();
        }
      });
      this._next.addEventListener("click", () => {
        if (this._canShowYear(this._visibleYear + 1)) {
          this._visibleYear += 1;
          this._renderMonths();
        }
      });
      this._popover.addEventListener("keydown", (event) =>
        this._handlePopoverKeydown(event),
      );
      this._initialized = true;
    }

    _update() {
      const label = this.getAttribute("label") || "Month";
      this._label.textContent = label;
      this._display.textContent = formatMonth(this.value);
      this._popover.setAttribute("aria-label", `Choose ${label.toLowerCase()}`);
      if (!this._popover.hidden) this._renderMonths();
    }

    _open() {
      const initial = this.value || currentMonth();
      this._visibleYear = Number(initial.slice(0, 4));
      if (!this._canShowYear(this._visibleYear)) {
        if (this.min) this._visibleYear = Number(this.min.slice(0, 4));
        else if (this.max) this._visibleYear = Number(this.max.slice(0, 4));
      }
      this._renderMonths();
      this._popover.hidden = false;
      this._trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        const preferred =
          this._grid.querySelector(".selected") ||
          this._grid.querySelector(".current") ||
          this._grid.querySelector("button:not(:disabled)");
        preferred?.focus();
      });
    }

    _close({ restoreFocus = false } = {}) {
      if (!this._initialized) return;
      this._popover.hidden = true;
      this._trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) this._trigger.focus();
    }

    _canShowYear(year) {
      if (!Number.isInteger(year) || year < 1 || year > 9999) return false;
      const yearText = String(year).padStart(4, "0");
      return (
        (!this.min || `${yearText}-12` >= this.min) &&
        (!this.max || `${yearText}-01` <= this.max)
      );
    }

    _renderMonths() {
      const year = String(this._visibleYear).padStart(4, "0");
      const selected = this.value;
      const today = currentMonth();
      this._yearDisplay.textContent = year;
      this._previous.disabled = !this._canShowYear(this._visibleYear - 1);
      this._next.disabled = !this._canShowYear(this._visibleYear + 1);

      const buttons = SHORT_MONTH_NAMES.map((name, index) => {
        const value = `${year}-${String(index + 1).padStart(2, "0")}`;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = name;
        button.dataset.monthValue = value;
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-label", formatMonth(value));
        button.setAttribute("aria-selected", String(value === selected));
        button.disabled = !isWithinBounds(value, this.min, this.max);
        if (value === selected) button.classList.add("selected");
        if (value === today) {
          button.classList.add("current");
          button.setAttribute("aria-current", "date");
        }
        button.addEventListener("click", () => this._select(value));
        return button;
      });
      this._grid.replaceChildren(...buttons);
    }

    _select(value) {
      if (!isWithinBounds(value, this.min, this.max)) return;
      this.value = value;
      this._close({ restoreFocus: true });
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }

    _focusMonth(value) {
      if (!isWithinBounds(value, this.min, this.max)) return;
      this._visibleYear = Number(value.slice(0, 4));
      this._renderMonths();
      this._grid.querySelector(`[data-month-value="${value}"]`)?.focus();
    }

    _handlePopoverKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        this._close({ restoreFocus: true });
        return;
      }
      const monthButton = event.target.closest("[data-month-value]");
      if (!monthButton) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this._select(monthButton.dataset.monthValue);
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
      this._focusMonth(destination);
    }

    _handleDocumentClick(event) {
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];
      const occurredWithin = path.length
        ? path.includes(this)
        : this.contains(event.target);
      if (!occurredWithin) this._close();
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
