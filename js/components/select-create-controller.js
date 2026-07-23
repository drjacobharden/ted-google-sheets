(function () {
  function normalizeName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en-US");
  }

  function cleanName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function scoreOption(name, query) {
    const normalizedName = normalizeName(name);
    const normalizedQuery = normalizeName(query);

    if (!normalizedQuery) return 1;
    if (normalizedName === normalizedQuery) return 4;
    if (normalizedName.startsWith(normalizedQuery)) return 3;
    if (normalizedName.includes(` ${normalizedQuery}`)) return 2;
    if (normalizedName.includes(normalizedQuery)) return 1;
    return 0;
  }

  function filterOptions(options, query) {
    return options
      .map((option) => ({ option, score: scoreOption(option.name, query) }))
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.option.name.localeCompare(b.option.name),
      )
      .map((entry) => entry.option);
  }

  class SelectCreateController {
    #addButton;
    #allowCreate;
    #createOption;
    #emptyLabel;
    #entityLabel;
    #fallbackSelection = null;
    #getOptions;
    #host;
    #idInput;
    #isAdding = false;
    #list;
    #message;
    #onCreate;
    #onSelect;
    #options = [];
    #optionsById = new Map();
    #placeholder;
    #popup;
    #search;
    #trigger;
    #triggerText;

    constructor({
      host,
      idInput,
      trigger,
      triggerText,
      popup,
      search,
      addButton,
      list,
      message,
      getOptions,
      createOption,
      onSelect,
      onCreate,
      placeholder,
      entityLabel,
      emptyLabel,
      allowCreate = true,
    }) {
      this.#host = host;
      this.#idInput = idInput;
      this.#trigger = trigger;
      this.#triggerText = triggerText;
      this.#popup = popup;
      this.#search = search;
      this.#addButton = addButton;
      this.#list = list;
      this.#message = message;
      this.#getOptions = getOptions;
      this.#createOption = createOption;
      this.#onSelect = onSelect;
      this.#onCreate = onCreate;
      this.#placeholder = placeholder;
      this.#entityLabel = entityLabel;
      this.#emptyLabel = emptyLabel;
      this.#allowCreate = allowCreate;
    }

    get value() {
      return this.#idInput.value;
    }

    get isOpen() {
      return !this.#popup.hidden;
    }

    setFallbackSelection(selection) {
      const id = String(selection?.id || "");
      this.#fallbackSelection = id
        ? {
            id,
            name: String(selection?.name || "Archived item"),
            archived: true,
          }
        : null;
      this.refresh(id || this.value);
    }

    clearFallbackSelection() {
      this.#fallbackSelection = null;
      this.refresh(this.value);
    }

    reportSelectionError(text) {
      this.#trigger.setAttribute("aria-invalid", "true");
      this.#showError(text);
      this.#trigger.focus();
    }

    connect() {
      this.#trigger.addEventListener("pointerdown", this);
      this.#trigger.addEventListener("click", this);
      this.#trigger.addEventListener("keydown", this);
      this.#search.addEventListener("input", this);
      this.#search.addEventListener("keydown", this);
      this.#addButton.addEventListener("pointerdown", this);
      this.#addButton.addEventListener("click", this);
      this.#list.addEventListener("pointerdown", this);
      this.#list.addEventListener("click", this);
      this.#list.addEventListener("keydown", this);
      this.#host.addEventListener("focusout", this);
      document.addEventListener("click", this);
    }

    disconnect() {
      this.#trigger.removeEventListener("pointerdown", this);
      this.#trigger.removeEventListener("click", this);
      this.#trigger.removeEventListener("keydown", this);
      this.#search.removeEventListener("input", this);
      this.#search.removeEventListener("keydown", this);
      this.#addButton.removeEventListener("pointerdown", this);
      this.#addButton.removeEventListener("click", this);
      this.#list.removeEventListener("pointerdown", this);
      this.#list.removeEventListener("click", this);
      this.#list.removeEventListener("keydown", this);
      this.#host.removeEventListener("focusout", this);
      document.removeEventListener("click", this);
    }

    configure({ getOptions, createOption, onCreate } = {}) {
      if (typeof getOptions === "function") this.#getOptions = getOptions;
      if (typeof createOption === "function") this.#createOption = createOption;
      if (typeof onCreate === "function") this.#onCreate = onCreate;
      this.refresh(this.value);
    }

    handleEvent(event) {
      if (event.type === "click") this.#handleClick(event);
      if (event.type === "input") this.#renderOptions();
      if (event.type === "keydown") this.#handleKeydown(event);
      if (event.type === "pointerdown") this.#handlePointerDown(event);
      if (event.type === "focusout") this.#handleFocusOut();
    }

    refresh(preferredValue = this.value, { resetSearch = false } = {}) {
      this.#options = this.#getOptions();
      this.#optionsById = new Map(
        this.#options.map((option) => [String(option.id), option]),
      );
      if (
        this.#fallbackSelection &&
        !this.#optionsById.has(this.#fallbackSelection.id)
      ) {
        this.#optionsById.set(
          this.#fallbackSelection.id,
          this.#fallbackSelection,
        );
      }

      if (resetSearch) this.#resetSearch();
      this.setValue(preferredValue);
      this.#renderOptions();
    }

    setValue(optionId, { announce = false } = {}) {
      const option = this.#optionsById.get(String(optionId || "")) || null;
      const nextValue = option ? String(option.id) : "";
      const changed = this.#idInput.value !== nextValue;

      this.#idInput.value = nextValue;
      this.#triggerText.textContent = option
        ? `${option.name}${option.archived ? " (archived)" : ""}`
        : this.#placeholder;
      this.#trigger.classList.toggle("placeholder", !option);
      this.#trigger.removeAttribute("aria-invalid");
      this.#clearError();
      this.#syncSelectedOptions();
      this.#onSelect?.(option, { announce, changed });

      if (announce && changed) {
        this.#idInput.dispatchEvent(new Event("input", { bubbles: true }));
        this.#idInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    open() {
      if (this.isOpen) return;
      this.#resetSearch();
      this.#popup.hidden = false;
      this.#trigger.setAttribute("aria-expanded", "true");
      this.#renderOptions();
      this.#search.focus();
    }

    close({ focusTrigger = false } = {}) {
      if (!this.isOpen) return;
      this.#popup.hidden = true;
      this.#trigger.setAttribute("aria-expanded", "false");
      this.#resetSearch();
      if (focusTrigger) this.#trigger.focus();
    }

    #handleClick(event) {
      if (event.currentTarget === this.#trigger) {
        this.isOpen ? this.close() : this.open();
        return;
      }

      if (event.currentTarget === this.#addButton) {
        this.#addTypedOption();
        return;
      }

      if (event.currentTarget === document) {
        if (!this.#host.contains(event.target)) this.close();
        return;
      }

      const optionButton = event.target.closest("button[data-option-id]");
      if (!optionButton || !this.#list.contains(optionButton)) return;
      this.setValue(optionButton.dataset.optionId, { announce: true });
      this.close({ focusTrigger: true });
    }

    #handlePointerDown(event) {
      if (event.currentTarget === this.#trigger && this.isOpen) {
        // Keep focus inside the popup until the trigger's click closes it.
        // Otherwise focusout closes on pointerdown and click reopens on release.
        event.preventDefault();
        return;
      }

      if (
        event.currentTarget === this.#addButton ||
        event.target.closest("button[data-option-id]")
      ) {
        event.preventDefault();
      }
    }

    #handleKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close({ focusTrigger: true });
        return;
      }

      if (event.currentTarget === this.#trigger) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
          event.preventDefault();
          this.open();
        }
        return;
      }

      if (event.currentTarget === this.#search) {
        if (event.key === "Enter") {
          event.preventDefault();
          return;
        }

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const options = this.#optionButtons();
          const target = event.key === "ArrowUp" ? options.at(-1) : options[0];
          target?.focus();
        }
        return;
      }

      const options = this.#optionButtons();
      const index = options.indexOf(event.target);
      if (index === -1) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.target.click();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const offset = event.key === "ArrowDown" ? 1 : -1;
        options[(index + offset + options.length) % options.length]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        options[event.key === "Home" ? 0 : options.length - 1]?.focus();
      }
    }

    #handleFocusOut() {
      setTimeout(() => {
        if (!this.#host.contains(document.activeElement)) this.close();
      }, 0);
    }

    async #addTypedOption() {
      if (this.#isAdding || !this.#allowCreate) return;

      const name = cleanName(this.#search.value);
      if (!name) return;

      this.refresh(this.value);
      const existing = this.#exactMatch(name);
      if (existing) {
        this.setValue(existing.id, { announce: true });
        this.close({ focusTrigger: true });
        return;
      }

      this.#isAdding = true;
      this.#clearError();
      this.#renderAddButton();

      try {
        const option = await this.#createOption(name);
        this.refresh(this.value);
        this.setValue(option.id, { announce: true });
        this.#onCreate?.(option);
        this.close({ focusTrigger: true });
      } catch (error) {
        this.refresh(this.value);
        const racedOption = this.#exactMatch(name);

        if (racedOption) {
          this.setValue(racedOption.id, { announce: true });
          this.close({ focusTrigger: true });
        } else {
          this.#showError(
            error.message || `Could not add the ${this.#entityLabel}.`,
          );
        }
      } finally {
        this.#isAdding = false;
        this.#renderAddButton();
      }
    }

    #renderOptions() {
      const filtered = filterOptions(this.#options, this.#search.value);
      const buttons = filtered.map((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.tabIndex = -1;
        button.setAttribute("role", "option");
        button.dataset.optionId = option.id;
        button.textContent = option.name;
        return button;
      });

      if (buttons.length) {
        this.#list.replaceChildren(...buttons);
      } else {
        const empty = document.createElement("p");
        empty.className = "select-create-empty";
        empty.setAttribute("role", "presentation");
        empty.textContent = this.#emptyLabel;
        this.#list.replaceChildren(empty);
      }

      this.#syncSelectedOptions();
      this.#clearError();
      this.#renderAddButton();
    }

    #renderAddButton() {
      const query = cleanName(this.#search.value);
      const canAdd = Boolean(query) && !this.#exactMatch(query);

      this.#addButton.hidden = !this.#allowCreate || (!canAdd && !this.#isAdding);
      this.#addButton.disabled = this.#isAdding;
      this.#addButton.textContent = this.#isAdding ? "Adding…" : "Add";
      this.#addButton.setAttribute(
        "aria-label",
        this.#isAdding
          ? `Adding ${this.#entityLabel}`
          : `Add “${query}” as a ${this.#entityLabel}`,
      );
    }

    #syncSelectedOptions() {
      for (const button of this.#optionButtons()) {
        const selected = button.dataset.optionId === this.value;
        button.setAttribute("aria-selected", String(selected));
        button.classList.toggle("active", selected);
      }
    }

    #optionButtons() {
      return [...this.#list.querySelectorAll("button[data-option-id]")];
    }

    #exactMatch(value) {
      const key = normalizeName(value);
      if (!key) return null;
      return (
        this.#options.find((option) => normalizeName(option.name) === key) ||
        null
      );
    }

    #resetSearch() {
      this.#search.value = "";
      this.#clearError();
      this.#renderAddButton();
    }

    #showError(text) {
      this.#message.textContent = text;
      this.#message.hidden = false;
    }

    #clearError() {
      this.#message.textContent = "";
      this.#message.hidden = true;
    }
  }

  window.SelectCreateUtils = {
    cleanName,
    filterOptions,
    normalizeName,
    scoreOption,
  };
  window.SelectCreateController = SelectCreateController;
})();
