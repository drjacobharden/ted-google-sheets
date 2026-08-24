// @ts-nocheck
import { APIs } from "../../api/api";
import type { EntityKind, TransactionType } from "../../api/budget-api";
import type { CustomButton } from "../../components/button/button";
import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import { showToast } from "../../components/toast-stack/toast-service";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import templateString from "./template.html" with { type: "text" };

const createdDateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const CONFIG = {
  category: {
    label: "category",
    nameLabel: "Category name",
    record: (id) => APIs.budget.getEntity("category", id),
    add: (input) => APIs.budget.addCategory(input),
    update: (input) => APIs.budget.updateCategory(input),
    reactivate: (input) => APIs.budget.reactivateCategory(input),
    archive: (id) => APIs.budget.archiveCategory(id),
  },
  vendor: {
    label: "vendor",
    nameLabel: "Vendor name",
    record: (id) => APIs.budget.getEntity("vendor", id),
    add: (input) => APIs.budget.addVendor(input),
    update: (input) => APIs.budget.updateVendor(input),
    reactivate: (input) => APIs.budget.reactivateVendor(input),
    archive: (id) => APIs.budget.archiveVendor(id),
  },
  assignment: {
    label: "person",
    nameLabel: "Name",
    record: (id) => APIs.budget.getEntity("assignment", id),
    add: (input) => APIs.budget.addPerson(input),
    update: (input) => APIs.budget.updatePerson(input),
    reactivate: (input) => APIs.budget.reactivatePerson(input),
    archive: (id) => APIs.budget.archivePerson(id),
  },
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class EntityDrawerScreen
  extends HTMLElement
  implements EventListenerObject
{
  #backdrop!: HTMLElement;
  #drawer!: HTMLElement;
  #form!: HTMLFormElement;
  #header!: HTMLElement & { title: string };
  #message!: HTMLElement;
  #saveButton!: CustomButton;
  #archiveButton!: CustomButton;
  #typeField!: HTMLElement;
  #typeSelector!: DropdownMenu;
  #nameLabel!: HTMLElement;
  #metadata!: HTMLElement;
  #entityId!: HTMLElement;
  #createdFootnote!: HTMLElement;
  #appShell: HTMLElement | null = null;
  #opened: {
    mode: "create" | "edit";
    kind: EntityKind;
    id: string | null;
    archived: boolean;
    isDefault: boolean;
  } | null = null;
  #openedName = "";
  #openedType: TransactionType = "expense";
  #categoryType: TransactionType = "expense";
  #openedRouteKey = "";
  #returnFocus: HTMLElement | null = null;
  #closing = false;
  #closeTimer = 0;
  #closeAnimationHandler: ((event: TransitionEvent) => void) | null = null;
  #initialized = false;
  #listening = false;

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#initialized = true;
      this.innerHTML = templateString;
      this.#captureElements();
      this.#resetCategoryTypeSelector();
    }
    if (!this.#listening) {
      this.#listening = true;
      this.#typeSelector.addListener(this);
      this.#form.addEventListener("submit", this);
      this.#saveButton.addEventListener("click", this);
      this.#archiveButton.addEventListener("click", this);
      this.#backdrop.addEventListener("click", this);
      this.addEventListener("drawer:close-requested", this);
      document.addEventListener("keydown", this);
      window.addEventListener("app:route-changed", this);
      window.addEventListener("budget:reference-data-changed", this);
    }
    this.#openFromRoute();
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#typeSelector.removeListener(this);
    this.#form.removeEventListener("submit", this);
    this.#saveButton.removeEventListener("click", this);
    this.#archiveButton.removeEventListener("click", this);
    this.#backdrop.removeEventListener("click", this);
    this.removeEventListener("drawer:close-requested", this);
    document.removeEventListener("keydown", this);
    window.removeEventListener("app:route-changed", this);
    window.removeEventListener("budget:reference-data-changed", this);
  }

  handleEvent(event: Event): void {
    if (
      event.type === "dropdown-selection" &&
      event.currentTarget === this.#typeSelector
    ) {
      this.#categoryType =
        (event as DropdownSelectionEvent).detail.value === "income"
          ? "income"
          : "expense";
      return;
    }
    if (event.type === "submit") {
      void this.#save(event);
      return;
    }
    if (event.type === "click") {
      if (event.currentTarget === this.#saveButton) {
        if (!this.#saveButton.hasAttribute("disabled"))
          this.#form.requestSubmit();
      } else if (event.currentTarget === this.#archiveButton) {
        void this.#archive();
      } else if (event.target === this.#backdrop) {
        this.#close();
      }
      return;
    }
    if (event.type === "drawer:close-requested") {
      event.stopPropagation();
      this.#close();
      return;
    }
    if (event.type === "keydown") {
      this.#handleKeydown(event as KeyboardEvent);
      return;
    }
    this.#openFromRoute();
  }

  #captureElements(): void {
    this.#backdrop = this.querySelector("drawer-overlay")!;
    this.#drawer = this.querySelector(".side-drawer")!;
    this.#form = this.querySelector("#entity-edit-form")!;
    this.#header = this.querySelector("drawer-header")!;
    this.#message = this.querySelector(".form-message")!;
    this.#saveButton = this.querySelector("#save-entity")!;
    this.#archiveButton = this.querySelector("#archive-entity")!;
    this.#typeField = this.querySelector("#entity-category-type-field")!;
    this.#typeSelector = this.querySelector("#entity-category-type-selector")!;
    this.#nameLabel = this.querySelector("#entity-name-label")!;
    this.#metadata = this.querySelector("#entity-metadata")!;
    this.#entityId = this.querySelector("#entity-edit-id")!;
    this.#createdFootnote = this.querySelector("#entity-created-footnote")!;
    this.#header.querySelector("h2")?.setAttribute("id", "entity-drawer-title");
    this.#header
      .querySelector("custom-button")
      ?.setAttribute("aria-label", "Close");
  }

  #dirty(): boolean {
    if (!this.#opened) return false;
    const nameChanged =
      this.#form.elements.name.value.trim() !== this.#openedName;
    const typeChanged =
      this.#opened.mode === "create" &&
      this.#opened.kind === "category" &&
      this.#categoryType !== this.#openedType;
    return nameChanged || typeChanged;
  }

  #resetCategoryTypeSelector(): void {
    this.#typeSelector.items = [
      { key: "expense", title: "Expense", isDefaultValue: true },
      { key: "income", title: "Income" },
    ];
  }

  #show(): void {
    this.#message.textContent = "";
    this.#message.className = "form-message";
    if (this.#closeTimer) window.clearTimeout(this.#closeTimer);
    if (this.#closeAnimationHandler) {
      this.#drawer.removeEventListener(
        "transitionend",
        this.#closeAnimationHandler,
      );
    }
    this.#closing = false;
    this.#closeTimer = 0;
    this.#closeAnimationHandler = null;
    this.#backdrop.classList.remove("is-closing", "is-open");
    this.#backdrop.hidden = false;
    void this.#drawer.offsetWidth;
    this.#backdrop.classList.add("is-open");
    document.body.classList.add("drawer-open");
    this.#appShell = document.querySelector(".app-shell");
    if (this.#appShell) this.#appShell.inert = true;
    window.setTimeout(() => this.#form.elements.name.select(), 370);
  }

  #openCreate(kind: EntityKind): boolean {
    const settings = CONFIG[kind];
    if (!settings) return false;
    this.#opened = {
      mode: "create",
      kind,
      id: null,
      archived: false,
      isDefault: false,
    };
    this.#returnFocus = document.activeElement as HTMLElement | null;
    this.#openedName = "";
    this.#categoryType = "expense";
    this.#openedType = "expense";
    this.#header.title = `New ${settings.label}`;
    this.#nameLabel.textContent = settings.nameLabel;
    this.#form.elements.name.maxLength = kind === "category" ? 50 : 80;
    this.#form.elements.name.value = "";
    this.#typeField.hidden = kind !== "category";
    this.#resetCategoryTypeSelector();
    this.#saveButton.label = `Add ${settings.label}`;
    this.#saveButton.removeAttribute("disabled");
    this.#archiveButton.hidden = true;
    this.#metadata.hidden = true;
    this.#show();
    return true;
  }

  #openEdit(kind: EntityKind, id: string): boolean {
    const settings = CONFIG[kind];
    const entity = settings?.record(id);
    if (!entity) throw new Error("That item could not be found.");
    if (APIs.budget.getEntitySyncStatus(kind, id)) {
      showToast("This item can be edited after it finishes syncing.", {
        type: "error",
        sticky: true,
      });
      return false;
    }

    this.#opened = {
      mode: "edit",
      kind,
      id,
      archived: entity.active === false,
      isDefault: entity.isDefault === true,
    };
    this.#returnFocus = document.activeElement as HTMLElement | null;
    this.#openedName = entity.name;
    this.#openedType = entity.type === "income" ? "income" : "expense";
    this.#categoryType = this.#openedType;
    this.#header.title =
      entity.active === false
        ? `Reactivate ${settings.label}`
        : `Edit ${settings.label}`;
    this.#nameLabel.textContent = settings.nameLabel;
    this.#form.elements.name.maxLength = kind === "category" ? 50 : 80;
    this.#form.elements.name.value = entity.name;
    this.#typeField.hidden = true;
    this.#saveButton.label =
      entity.active === false ? "Reactivate" : "Save changes";
    this.#saveButton.removeAttribute("disabled");
    this.#archiveButton.label = `Archive ${settings.label}`;
    this.#archiveButton.hidden =
      entity.active === false || entity.isDefault === true;
    this.#metadata.hidden = false;
    this.#entityId.textContent = entity.id;
    const created = new Date(entity.createdAt);
    this.#createdFootnote.textContent = Number.isNaN(created.getTime())
      ? `Created ${entity.createdAt}`
      : `Created ${createdDateTime.format(created)}`;
    this.#show();
    return true;
  }

  async #save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.#opened || !this.#form.checkValidity()) {
      this.#form.reportValidity();
      return;
    }
    const name = this.#form.elements.name.value.trim();
    if (!name) return;
    const current = { ...this.#opened };
    const settings = CONFIG[current.kind];
    this.#saveButton.setAttribute("disabled", "");
    this.#saveButton.label = "Saving…";
    this.#message.textContent = "";

    try {
      if (current.mode === "create") {
        settings.add({
          name,
          ...(current.kind === "category" ? { type: this.#categoryType } : {}),
        });
        this.#close(true);
        showToast(`${titleCase(settings.label)} added.`);
        return;
      }

      const action = current.archived ? settings.reactivate : settings.update;
      const saved = await action({ id: current.id, name });
      appController.renameEntityTransactions(
        current.kind,
        current.id,
        saved.name,
      );
      this.#close(true);
      showToast(
        current.archived
          ? `${titleCase(settings.label)} reactivated.`
          : `${titleCase(settings.label)} updated.`,
      );
    } catch (error) {
      this.#message.className = "form-message error";
      this.#message.textContent =
        error instanceof Error ? error.message : String(error);
      this.#saveButton.removeAttribute("disabled");
      this.#saveButton.label =
        current.mode === "create"
          ? `Add ${settings.label}`
          : current.archived
            ? "Reactivate"
            : "Save changes";
    }
  }

  async #archive(): Promise<void> {
    if (
      !this.#opened ||
      this.#opened.mode !== "edit" ||
      !this.#opened.id ||
      this.#opened.archived ||
      this.#opened.isDefault
    )
      return;
    const current = { ...this.#opened };
    const settings = CONFIG[current.kind];
    if (!window.confirm(`Archive this ${settings.label}?`)) return;
    this.#archiveButton.setAttribute("disabled", "");
    this.#message.textContent = "";
    try {
      await settings.archive(current.id);
      this.#close(true);
      showToast(`${titleCase(settings.label)} archived.`);
    } catch (error) {
      this.#message.className = "form-message error";
      this.#message.textContent =
        error instanceof Error ? error.message : String(error);
    } finally {
      this.#archiveButton.removeAttribute("disabled");
    }
  }

  #close(force = false, { updateRoute = true } = {}): boolean {
    if (this.#closing || this.#backdrop.hidden) return true;
    if (
      !force &&
      this.#dirty() &&
      !window.confirm("Discard your unsaved changes?")
    ) {
      return false;
    }
    this.#closing = true;
    this.#backdrop.classList.remove("is-open");
    this.#backdrop.classList.add("is-closing");
    this.#closeAnimationHandler = (event) => {
      if (event.target === this.#drawer && event.propertyName === "transform") {
        this.#finishClose();
      }
    };
    this.#drawer.addEventListener("transitionend", this.#closeAnimationHandler);
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    this.#closeTimer = window.setTimeout(
      () => this.#finishClose(),
      reducedMotion ? 0 : 320,
    );
    if (updateRoute) this.#clearRoute();
    return true;
  }

  #finishClose(): void {
    if (!this.#closing) return;
    this.#closing = false;
    if (this.#closeTimer) window.clearTimeout(this.#closeTimer);
    if (this.#closeAnimationHandler) {
      this.#drawer.removeEventListener(
        "transitionend",
        this.#closeAnimationHandler,
      );
    }
    this.#closeTimer = 0;
    this.#closeAnimationHandler = null;
    this.#backdrop.hidden = true;
    this.#backdrop.classList.remove("is-closing", "is-open");
    document.body.classList.remove("drawer-open");
    if (this.#appShell) this.#appShell.inert = false;
    this.#opened = null;
    this.#openedName = "";
    this.#openedRouteKey = "";
    this.#returnFocus?.focus();
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (this.#backdrop.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.#close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      this.#drawer.querySelectorAll<HTMLElement>(
        'custom-button:not([disabled]), button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  #clearRoute(): void {
    router.updateParams({ drawer: null, entityKind: null, entityId: null });
  }

  #openFromRoute(): void {
    const params = router.currentParams();
    const action = params.drawer;
    const kind = params.entityKind;
    const id = params.entityId;
    const routeKey = `${action || ""}:${kind || ""}:${id || ""}`;

    if (action !== "entity-new" && action !== "entity-edit") {
      this.#openedRouteKey = "";
      if (!this.#backdrop.hidden) this.#close(true, { updateRoute: false });
      return;
    }
    if (routeKey === this.#openedRouteKey && !this.#backdrop.hidden) return;
    if (!kind || !CONFIG[kind]) {
      this.#clearRoute();
      return;
    }
    if (action === "entity-edit" && !id) {
      this.#clearRoute();
      return;
    }
    if (
      action === "entity-edit" &&
      !CONFIG[kind].record(id) &&
      !appController.isReferenceDataLoaded()
    )
      return;

    try {
      const opened =
        action === "entity-new"
          ? this.#openCreate(kind)
          : this.#openEdit(kind, id);
      if (opened) this.#openedRouteKey = routeKey;
      else this.#clearRoute();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), {
        type: "error",
      });
      this.#clearRoute();
    }
  }
}

if (!customElements.get("entity-drawer-screen")) {
  customElements.define("entity-drawer-screen", EntityDrawerScreen);
}
