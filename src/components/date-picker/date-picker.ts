// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { SelectCreateController } from "../select-create-controller/select-create-controller";
import { showToast } from "../toast-stack/toast-service";
const datePickerTemplate = () => `
  <div class="form-field">
    <span>Date</span>
    <div class="date-picker-container">
      <input type="hidden" />

      <custom-button  
        class="date-picker-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded="false"
        label="Select a date"
        leading-icon="calendar"
        trailing-icon="chevronDown"
      ></custom-button>

     
      <pop-over
        class="calendar-popover"
        role="dialog"
        aria-label="Choose a date"
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
        <p class="date-picker-selection" aria-live="polite"></p>
      </pop-over>
    </div>
  </div>
`;

(function () {
  const { toISODate, fromISODate, longDateFormatter, monthFormatter } =
    DateUtils;

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
    #selectionElement = null;

    static get observedAttributes() {
      return ["value", "name", "alignment", "variant"];
    }

    get alignment() {
      const value = this.getAttribute("alignment");
      return value === "left" || value === "center" ? value : "right";
    }

    set alignment(value) {
      if (["left", "center", "right"].includes(value)) {
        this.setAttribute("alignment", value);
      } else {
        this.removeAttribute("alignment");
      }
    }

    get value() {
      return this.#value;
    }
    set value(v) {
      this.#value = v;
      this.setAttribute("value", v);
    }

    get isOpen() {
      return this.isInline || Boolean(this.#popoverElement?.classList.contains("is-visible"));
    }

    get isInline() {
      return this.getAttribute("variant") === "inline";
    }

    reportSelectionError() {
      this.toggleAttribute("aria-invalid", true);
      this.#triggerElement?.setAttribute("aria-invalid", "true");
      (this.isInline
        ? this.#gridElement?.querySelector(".selected, button")
        : this.#triggerElement
      )?.focus();
    }

    closePopup({ focusTrigger = false } = {}) {
      if (this.isInline) return;
      this.#closeCalendar();
      if (focusTrigger) this.#triggerElement?.focus();
    }

    connectedCallback() {
      // Set the html to display
      this.innerHTML = datePickerTemplate();

      // Set references to the elements so we only query once
      this.#triggerElement = this.querySelector(".date-picker-trigger");
      this.#displayElement = this.#triggerElement.querySelector("span");
      this.#popoverElement = this.querySelector(".calendar-popover");
      this.#gridElement = this.querySelector(".calendar-grid");
      this.#monthHeaderElement = this.querySelector(".calendar-month");
      this.#prevBtn = this.querySelector(".previous-month");
      this.#nextBtn = this.querySelector(".next-month");
      this.#hiddenInput = this.querySelector('input[type="hidden"]');
      this.#selectionElement = this.querySelector(".date-picker-selection");

      // Set the date value
      if (!this.#value && !this.hasAttribute("allow-empty")) {
        this.value = toISODate(new Date()); // Call shared utility
      }

      // Set the name value on the hidden input so that the date value can be stored
      if (this.hasAttribute("name")) {
        this.#hiddenInput.name = this.getAttribute("name");
      }

      if (this.#value) {
        const date = fromISODate(this.#value);
        this.#displayElement.textContent = longDateFormatter.format(date);
        this.#selectionElement.textContent = `Selected — ${longDateFormatter.format(date)}`;
      }

      if (this.isInline) {
        this.#triggerElement.hidden = true;
        this.#popoverElement.classList.add("is-inline");
        this.#popoverElement.setAttribute("role", "group");
        this.#popoverElement.setAttribute("aria-label", "Choose a date");
        this.#renderCalendar();
      }

      // Add listeners to the elements
      this.#triggerElement.addEventListener("click", this);
      this.#prevBtn.addEventListener("click", this);
      this.#nextBtn.addEventListener("click", this);
      this.#popoverElement.addEventListener("keydown", this);
      this.#popoverElement.addEventListener("popover-dismiss", this);
      document.addEventListener("click", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;

      if (name === "value") {
        this.#value = newValue;
        this.#triggerElement?.removeAttribute("aria-invalid");
        this.removeAttribute("aria-invalid");

        if (this.#hiddenInput) {
          this.#hiddenInput.value = newValue;
        }

        const date = fromISODate(newValue); // Call shared utility

        if (date) {
          if (this.#displayElement) {
            this.#displayElement.textContent = longDateFormatter.format(date); // Call shared formatter
          }
          if (this.#selectionElement) {
            this.#selectionElement.textContent = `Selected — ${longDateFormatter.format(date)}`;
          }
          this.#visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
          if (this.isOpen) this.#renderCalendar();
        } else if (this.#displayElement) {
          this.#displayElement.textContent = "Select a date";
          if (this.#selectionElement) this.#selectionElement.textContent = "No date selected";
        }
      }

      if (name === "variant" && this.#popoverElement) {
        this.#triggerElement.hidden = this.isInline;
        this.#popoverElement.classList.toggle("is-inline", this.isInline);
        this.#popoverElement.setAttribute("role", this.isInline ? "group" : "dialog");
        if (this.isInline) this.#renderCalendar();
        else this.#closeCalendar();
      }

      if (name === "name" && this.#hiddenInput) {
        this.#hiddenInput.name = newValue;
      }
    }

    handleEvent(event) {
      if (event.type === "click") {
        // Clicked on the trigger -> Toggle open or closed
        if (event.currentTarget === this.#triggerElement) {
          this.isOpen ? this.#closeCalendar() : this.#openCalendar();
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
      } else if (event.type === "popover-dismiss") {
        this.#closeCalendar();
      }
    }

    #closeCalendar() {
      if (this.isInline) return;
      this.#popoverElement?.hide();
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

      this.#popoverElement.show(this.#triggerElement, {
        side: "bottom",
        align:
          this.alignment === "left"
            ? "start"
            : this.alignment === "center"
              ? "center"
              : "end",
        gap: 8,
      });
      this.#triggerElement.setAttribute("aria-expanded", "true");

      requestAnimationFrame(() => {
        (
          this.#gridElement.querySelector(".selected") ||
          this.#gridElement.querySelector(".today") ||
          this.#gridElement.querySelector("button")
        )?.focus({ preventScroll: true });
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
          if (!this.isInline) {
            this.#closeCalendar();
            this.#triggerElement.focus();
          }

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
      this.#popoverElement.removeEventListener("popover-dismiss", this);
      document.removeEventListener("click", this);
    }
  }

  customElements.define("date-picker", DatePicker);
})();
