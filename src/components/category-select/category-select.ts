// @ts-nocheck
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { DateUtils } from "../../utilities/date-utilities";
import { SelectCreateController } from "../select-create-controller/select-create-controller";
import { showToast } from "../toast-stack/toast-service";

const categorySelectTemplate = () => `
  <div class="form-field category-form-field">
    <span class="category-select-label">Category</span>
    <div class="select-menu">
      <input class="id-input" name="categoryId" type="hidden" />
      <custom-button 
        class="category-select-trigger select-trigger" 
        label="Select a category" 
        leading-icon="label" 
        trailing-icon="chevronDown"
        aria-haspopup="listbox"
        aria-expanded="false"
        role="combobox"
        >
      </custom-button>
     
      <div class="select-popup" hidden>
        <div class="search-row">
          <input
            class="search"
            type="text"
            maxlength="50"
            autocomplete="off"
            placeholder="Search or add category"
            aria-autocomplete="list"
          />
          <button class="add" type="button" hidden>Add</button>
        </div>
        <p
          class="message"
          role="alert"
          aria-live="polite"
          hidden
        ></p>
        <div
          class="category-select-list list"
          role="listbox"
        ></div>
      </div>
    </div>
  </div>
`;

(function () {
  let nextId = 0;

  class CategorySelect extends HTMLElement {
    static get observedAttributes() {
      return ["value", "type", "create-type"];
    }

    #controller = null;
    #form = null;
    #type = "expense";
    #createType = "expense";

    get value() {
      return (
        this.#controller?.value ||
        this.querySelector(".id-input")?.value ||
        this.getAttribute("value") ||
        ""
      );
    }

    set value(categoryId) {
      const id = String(categoryId || "");

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

    get type() {
      return this.#type;
    }

    set type(value) {
      const type = value === "income" || value === "all" ? value : "expense";

      if (this.getAttribute("type") !== type) {
        this.setAttribute("type", type);
      } else if (this.#type !== type) {
        this.#type = type;
        this.#controller?.refresh(this.value, { resetSearch: true });
      }
    }

    connectedCallback() {
      const initialValue = Object.prototype.hasOwnProperty.call(this, "value")
        ? String(this.value || "")
        : this.getAttribute("value") || "";
      const initialType = Object.prototype.hasOwnProperty.call(this, "type")
        ? this.type
        : null;
      if (Object.prototype.hasOwnProperty.call(this, "value")) {
        delete this.value;
      }
      if (Object.prototype.hasOwnProperty.call(this, "type")) {
        delete this.type;
      }

      this.innerHTML = categorySelectTemplate();
      this.#form = this.closest("form");

      const controlId = `category-select-${++nextId}`;
      const labelId = `${controlId}-label`;
      const popupId = `${controlId}-popup`;
      const listId = `${controlId}-list`;
      const label = this.querySelector(".category-select-label");
      const trigger = this.querySelector(".category-select-trigger");
      const search = this.querySelector(".search");
      const popup = this.querySelector(".select-popup");
      const list = this.querySelector(".category-select-list");

      label.id = labelId;
      trigger.id = controlId;
      trigger.setAttribute("aria-labelledby", `${labelId} ${controlId}`);
      trigger.setAttribute("aria-controls", popupId);
      popup.id = popupId;
      list.id = listId;
      search.setAttribute("aria-label", "Search or add category");
      search.setAttribute("aria-controls", listId);

      this.#type =
        initialType === "income" ||
        initialType === "expense" ||
        initialType === "all"
          ? initialType
          : this.#getFormType();
      this.#createType =
        this.getAttribute("create-type") === "income" ? "income" : "expense";
      this.#controller = new SelectCreateController({
        host: this,
        idInput: this.querySelector(".id-input"),
        trigger,
        triggerText: trigger.querySelector("span"),
        popup,
        search,
        addButton: this.querySelector(".add"),
        list,
        message: this.querySelector(".message"),
        getOptions: () =>
          this.#type === "all"
            ? APIs.budget.listCategories()
            : APIs.budget.listCategories({ type: this.#type }),
        createOption: (name) =>
          APIs.budget.addCategory({
            name,
            type: this.#type === "all" ? this.#createType : this.#type,
          }),
        onSelect: (category, state) => this.#handleSelection(category, state),
        onCreate: (category) => {
          this.dispatchEvent(
            new CustomEvent("category-created", {
              bubbles: true,
              detail: { category },
            }),
          );
          showToast(
            APIs.budget.getConfig().endpoint
              ? `${category.name} was added. Syncing…`
              : `${category.name} was added.`,
          );
        },
        placeholder: "Select a category",
        entityLabel: "category",
        emptyLabel: "No matching categories",
        allowCreate: true,
      });

      this.#controller.refresh(initialValue);
      this.#controller.connect();
      this.#form?.addEventListener("change", this);
      this.#form?.addEventListener("reset", this);
      window.addEventListener("budget:categories-changed", this);
    }

    disconnectedCallback() {
      this.#controller?.disconnect();
      this.#form?.removeEventListener("change", this);
      this.#form?.removeEventListener("reset", this);
      window.removeEventListener("budget:categories-changed", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this.#controller) return;

      if (name === "value") this.#controller.setValue(newValue || "");

      if (name === "type") {
        this.#type =
          newValue === "income" || newValue === "all" ? newValue : "expense";
        this.#controller.refresh(this.value, { resetSearch: true });
      }

      if (name === "create-type")
        this.#createType = newValue === "income" ? "income" : "expense";
    }

    handleEvent(event) {
      if (event.type === "change" && event.target.name === "type") {
        this.#type = event.target.value === "income" ? "income" : "expense";
        this.#controller.refresh(this.value, { resetSearch: true });
      }

      if (event.type === "reset") {
        setTimeout(() => {
          this.#type = this.#getFormType();
          this.#controller.refresh("", { resetSearch: true });
        }, 0);
      }

      if (event.type === "budget:categories-changed") {
        this.#controller.refresh(this.value);
      }
    }

    #getFormType() {
      const selectedType = this.#form?.querySelector(
        '[name="type"]:checked',
      )?.value;
      const requestedType = this.getAttribute("type") || selectedType;
      return requestedType === "income" || requestedType === "all"
        ? requestedType
        : "expense";
    }

    #handleSelection(category, { announce }) {
      const id = String(category?.id || "");

      if (id) {
        if (this.getAttribute("value") !== id) this.setAttribute("value", id);
      } else if (this.hasAttribute("value")) {
        this.removeAttribute("value");
      }

      if (announce) {
        this.dispatchEvent(
          new CustomEvent("category-selected", {
            bubbles: true,
            detail: { category },
          }),
        );
      }
    }
  }

  customElements.define("category-select", CategorySelect);
})();
