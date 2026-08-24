// @ts-nocheck
import { APIs } from "../../api/api";
import { showToast } from "../toast-stack/toast-service";

const categorySelectTemplate = () => `
  <div class="form-field category-form-field">
    <span class="category-select-label">Category</span>
    <input class="id-input" name="categoryId" type="hidden" />
    <dropdown-menu class="category-select-menu" variant="editorial"
      label="Select a category" icon="label" searchable search-action
      search-action-label="Add" search-placeholder="Search or add category" align-center>
    </dropdown-menu>
  </div>
`;

(function () {
  let nextId = 0;

  class CategorySelect extends HTMLElement {
    static get observedAttributes() {
      return ["value", "type", "create-type"];
    }

    #dropdown = null;
    #form = null;
    #type = "expense";
    #createType = "expense";
    #options = [];
    #fallbackSelection = null;
    #getOptions = () =>
      this.#type === "all"
        ? APIs.budget.listCategories()
        : APIs.budget.listCategories({ type: this.#type });
    #createOption = (name) =>
      APIs.budget.addCategory({
        name,
        type: this.#type === "all" ? this.#createType : this.#type,
      });
    #onCreate = (category) => {
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
    };

    get value() {
      return (
        this.#dropdown?.selection ||
        this.querySelector(".id-input")?.value ||
        this.getAttribute("value") ||
        ""
      );
    }

    set value(categoryId) {
      const id = String(categoryId || "");
      if (!this.#dropdown) {
        if (id) this.setAttribute("value", id);
        else this.removeAttribute("value");
        return;
      }
      this.#setValue(id);
    }

    get isOpen() {
      return this.#dropdown?.hasAttribute("is-open") || false;
    }

    setFallbackSelection(selection) {
      const id = String(selection?.id || "");
      this.#fallbackSelection = id
        ? {
            id,
            name: String(selection?.name || "Archived category"),
            archived: true,
          }
        : null;
      this.#refresh(this.value);
    }

    clearFallbackSelection() {
      this.#fallbackSelection = null;
      this.#refresh(this.value);
    }

    reportSelectionError(message) {
      const trigger = this.#dropdown?.querySelector(".dropdown-trigger");
      trigger?.setAttribute("aria-invalid", "true");
      trigger?.setAttribute("title", message);
      trigger?.focus();
    }

    closePopup({ focusTrigger = false } = {}) {
      this.#dropdown?.close();
      if (focusTrigger)
        this.#dropdown?.querySelector(".dropdown-trigger")?.focus();
    }

    configureOptions({ getOptions, createOption, onCreate } = {}) {
      if (typeof getOptions === "function") this.#getOptions = getOptions;
      if (typeof createOption === "function") this.#createOption = createOption;
      if (typeof onCreate === "function") this.#onCreate = onCreate;
      this.#refresh(this.value);
    }

    get type() {
      return this.#type;
    }

    set type(value) {
      const type = value === "income" || value === "all" ? value : "expense";
      if (this.getAttribute("type") !== type) this.setAttribute("type", type);
      else if (this.#type !== type) {
        this.#type = type;
        this.#refresh(this.value);
      }
    }

    connectedCallback() {
      const initialValue = Object.prototype.hasOwnProperty.call(this, "value")
        ? String(this.value || "")
        : this.getAttribute("value") || "";
      const initialType = Object.prototype.hasOwnProperty.call(this, "type")
        ? this.type
        : null;
      if (Object.prototype.hasOwnProperty.call(this, "value"))
        delete this.value;
      if (Object.prototype.hasOwnProperty.call(this, "type")) delete this.type;

      this.innerHTML = categorySelectTemplate();
      this.#form = this.closest("form");
      this.#dropdown = this.querySelector("dropdown-menu");
      const id = `category-select-${++nextId}`;
      this.#dropdown.id = id;
      this.#dropdown.setAttribute("aria-label", "Select a category");
      this.querySelector(".category-select-label").id = `${id}-label`;
      this.#dropdown.setAttribute("aria-labelledby", `${id}-label ${id}`);
      this.#type = ["income", "expense", "all"].includes(initialType)
        ? initialType
        : this.#getFormType();
      this.#createType =
        this.getAttribute("create-type") === "income" ? "income" : "expense";
      this.#dropdown.addEventListener("dropdown-selection", this);
      this.#dropdown.addEventListener("search-action-pressed", this);
      this.#refresh(initialValue);
      this.#form?.addEventListener("change", this);
      this.#form?.addEventListener("reset", this);
      window.addEventListener("budget:categories-changed", this);
    }

    disconnectedCallback() {
      this.#dropdown?.removeEventListener("dropdown-selection", this);
      this.#dropdown?.removeEventListener("search-action-pressed", this);
      this.#form?.removeEventListener("change", this);
      this.#form?.removeEventListener("reset", this);
      window.removeEventListener("budget:categories-changed", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this.#dropdown) return;
      if (name === "value") this.#setValue(newValue || "");
      if (name === "type") {
        this.#type =
          newValue === "income" || newValue === "all" ? newValue : "expense";
        this.#refresh(this.value);
      }
      if (name === "create-type") {
        this.#createType = newValue === "income" ? "income" : "expense";
      }
    }

    handleEvent(event) {
      if (event.type === "dropdown-selection") {
        this.#setValue(event.detail.value, true);
      } else if (event.type === "search-action-pressed") {
        this.#addCategory(event.detail.input);
      } else if (event.type === "change" && event.target.name === "type") {
        this.#type = event.target.value === "income" ? "income" : "expense";
        this.#refresh(this.value);
      } else if (event.type === "reset") {
        setTimeout(() => {
          this.#type = this.#getFormType();
          this.#refresh("", true);
        }, 0);
      } else if (event.type === "budget:categories-changed") {
        this.#refresh(this.value);
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

    #refresh(preferredValue = this.value, resetSearch = false) {
      if (!this.#dropdown) return;
      this.#options = this.#getOptions() || [];
      const options = [...this.#options];
      if (
        this.#fallbackSelection &&
        !options.some((item) => String(item.id) === this.#fallbackSelection.id)
      ) {
        options.push(this.#fallbackSelection);
      }
      this.#dropdown.items = options.map((item) => ({
        key: String(item.id),
        title: `${item.name}${item.archived ? " (archived)" : ""}`,
        isDefaultValue: String(item.id) === String(preferredValue || ""),
      }));
      this.#setValue(preferredValue);
      if (resetSearch) this.#dropdown.close();
    }

    #setValue(id, announce = false) {
      const value = String(id || "");
      const item =
        this.#options.find((option) => String(option.id) === value) ||
        (this.#fallbackSelection?.id === value
          ? this.#fallbackSelection
          : null);
      this.querySelector(".id-input").value = item ? value : "";
      this.#dropdown.selection = item ? value : null;
      if (this.getAttribute("value") !== (item ? value : "")) {
        if (item) this.setAttribute("value", value);
        else this.removeAttribute("value");
      }
      if (announce && item) {
        this.dispatchEvent(
          new CustomEvent("category-selected", {
            bubbles: true,
            detail: { category: item },
          }),
        );
      }
    }

    async #addCategory(input) {
      const name = String(input || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!name) return;
      const existing = this.#options.find(
        (item) =>
          item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      if (existing) {
        this.#setValue(existing.id, true);
        this.closePopup({ focusTrigger: true });
        return;
      }
      try {
        const category = await this.#createOption(name);
        this.#refresh(category?.id || this.value);
        this.#setValue(category?.id, true);
        this.closePopup({ focusTrigger: true });
        this.#onCreate(category);
      } catch (error) {
        this.reportSelectionError(error?.message || "Unable to add category");
      }
    }
  }

  customElements.define("category-select", CategorySelect);
})();
