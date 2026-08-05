// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { SelectCreateController } from "../select-create-controller/select-create-controller";
import { showToast } from "../toast-stack/toast-service";
const peopleSelectTemplate = () => `
  <div class="form-field people-form-field">
    <span class="people-select-label">Assignment</span>
    <div class="people-select-menu">
      <input class="assignment-id-input" name="assignmentId" type="hidden" />
      <button
        class="people-select-trigger select-create-trigger"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span>Select an assignment</span>
      </button>
      <div class="select-create-popup" hidden>
        <div class="select-create-search-row">
          <input
            class="select-create-search"
            type="search"
            maxlength="80"
            autocomplete="off"
            placeholder="Search or add person"
            aria-autocomplete="list"
          />
          <button class="select-create-add" type="button" hidden>Add</button>
        </div>
        <p
          class="select-create-message"
          role="alert"
          aria-live="polite"
          hidden
        ></p>
        <div class="people-select-list select-create-list" role="listbox"></div>
      </div>
    </div>
  </div>
`;

(function () {
  let nextId = 0;

  class PeopleSelect extends HTMLElement {
    static get observedAttributes() {
      return ["value"];
    }

    #controller = null;
    #form = null;

    get value() {
      return (
        this.#controller?.value ||
        this.querySelector(".assignment-id-input")?.value ||
        this.getAttribute("value") ||
        ""
      );
    }

    set value(personId) {
      const id = String(personId || "");

      if (!this.#controller) {
        if (id) this.setAttribute("value", id);
        else this.removeAttribute("value");
        return;
      }

      this.#controller.setValue(id);
    }

    get isOpen() {
      return this.#controller?.isOpen || false;
    }

    setFallbackSelection(selection) {
      this.#controller?.setFallbackSelection(selection);
    }

    clearFallbackSelection() {
      this.#controller?.clearFallbackSelection();
    }

    reportSelectionError(message) {
      this.#controller?.reportSelectionError(message);
    }

    closePopup(options) {
      this.#controller?.close(options);
    }

    configureOptions(options) {
      this.#controller?.configure(options);
    }

    connectedCallback() {
      const initialValue = this.hasAttribute("allow-empty")
        ? String(this.getAttribute("value") || "")
        : Object.prototype.hasOwnProperty.call(this, "value")
        ? String(this.value || "")
        : this.getAttribute("value") || APIs.budget.SHARED_ASSIGNMENT_ID;
      if (Object.prototype.hasOwnProperty.call(this, "value")) {
        delete this.value;
      }

      this.innerHTML = peopleSelectTemplate();
      this.#form = this.closest("form");

      const controlId = `people-select-${++nextId}`;
      const labelId = `${controlId}-label`;
      const popupId = `${controlId}-popup`;
      const listId = `${controlId}-list`;
      const label = this.querySelector(".people-select-label");
      const trigger = this.querySelector(".people-select-trigger");
      const search = this.querySelector(".select-create-search");
      const popup = this.querySelector(".select-create-popup");
      const list = this.querySelector(".people-select-list");

      label.id = labelId;
      trigger.id = controlId;
      trigger.setAttribute("aria-labelledby", `${labelId} ${controlId}`);
      trigger.setAttribute("aria-controls", popupId);
      popup.id = popupId;
      list.id = listId;
      search.setAttribute("aria-label", "Search or add person");
      search.setAttribute("aria-controls", listId);

      this.#controller = new SelectCreateController({
        host: this,
        idInput: this.querySelector(".assignment-id-input"),
        trigger,
        triggerText: trigger.querySelector("span"),
        popup,
        search,
        addButton: this.querySelector(".select-create-add"),
        list,
        message: this.querySelector(".select-create-message"),
        getOptions: () => APIs.budget.listPeople(),
        createOption: (name) => APIs.budget.addPerson({ name }),
        onSelect: (person, state) => this.#handleSelection(person, state),
        onCreate: (person) => {
          this.dispatchEvent(
            new CustomEvent("person-created", {
              bubbles: true,
              detail: { person },
            }),
          );
          showToast(
            APIs.budget.getConfig().endpoint
              ? `${person.name} was added. Syncing…`
              : `${person.name} was added.`,
          );
        },
        placeholder: "Select an assignment",
        entityLabel: "person",
        emptyLabel: "No matching people",
      });

      this.#controller.refresh(initialValue);
      this.#controller.connect();
      this.#form?.addEventListener("reset", this);
      window.addEventListener("budget:people-changed", this);
    }

    disconnectedCallback() {
      this.#controller?.disconnect();
      this.#form?.removeEventListener("reset", this);
      window.removeEventListener("budget:people-changed", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (name === "value" && oldValue !== newValue && this.#controller) {
        this.#controller.setValue(newValue || "");
      }
    }

    handleEvent(event) {
      if (event.type === "reset") {
        setTimeout(
          () =>
            this.#controller.refresh(APIs.budget.SHARED_ASSIGNMENT_ID, {
              resetSearch: true,
            }),
          0,
        );
      }

      if (event.type === "budget:people-changed") {
        this.#controller.refresh(this.value);
      }
    }

    #handleSelection(person, { announce }) {
      const id = String(person?.id || "");

      if (id) {
        if (this.getAttribute("value") !== id) this.setAttribute("value", id);
      } else if (this.hasAttribute("value")) {
        this.removeAttribute("value");
      }

      if (announce) {
        this.dispatchEvent(
          new CustomEvent("person-selected", {
            bubbles: true,
            detail: { person },
          }),
        );
      }
    }
  }

  customElements.define("people-select", PeopleSelect);
})();
