import { APIs } from "../../api/api";
import type { BudgetEntity, BudgetTransaction } from "../../api/budget-api";
import { budgetUI, eventTargetElement, appRouter } from "../../utilities/legacy-runtime";
import { registerLegacyRouteAdapter } from "../../utilities/legacy-route-adapter";
import { errorMessage } from "../../utilities/data-utilities";
import { escapeHTML, messageFromError } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays and manages the vendor route. */
export class VendorsScreen extends HTMLElement implements EventListenerObject {
  #form!: HTMLFormElement;
  #list!: HTMLElement;
  #search!: HTMLInputElement;
  #count!: HTMLElement;
  #message!: HTMLElement;
  #usage = new Map<string, number>();
  #query = "";
  #includeArchived = false;
  #listening = false;

  /** Initializes the screen and subscribes to vendor and transaction events. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "vendors";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#form.addEventListener("submit", this);
    this.#list.addEventListener("click", this);
    this.#list.addEventListener("keydown", this);
    this.#search.addEventListener("input", this);
    window.addEventListener("budget:vendors-changed", this);
    window.addEventListener("budget:entity-sync-changed", this);
    window.addEventListener("budget:transaction-sync-changed", this);
    window.addEventListener("budget:transaction-saved", this);
    this.#loadUsage();
    this.#loadArchivedEntities();
  }

  /** Removes the listeners owned by this route screen. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#form.removeEventListener("submit", this);
    this.#list.removeEventListener("click", this);
    this.#list.removeEventListener("keydown", this);
    this.#search.removeEventListener("input", this);
    window.removeEventListener("budget:vendors-changed", this);
    window.removeEventListener("budget:entity-sync-changed", this);
    window.removeEventListener("budget:transaction-sync-changed", this);
    window.removeEventListener("budget:transaction-saved", this);
  }

  /** Routes DOM and application events to the corresponding behavior. */
  handleEvent(event: Event): void {
    if (event.type === "submit") void this.#handleSubmit(event);
    else if (event.type === "click") this.#handleClick(event);
    else if (event.type === "keydown") this.#handleKeydown(event);
    else if (event.type === "input") this.#handleSearch();
    else if (event.type.includes("transaction")) this.#loadUsage();
    else this.#render();
  }

  /** Captures the typed elements cloned from the screen template. */
  #captureElements(): void {
    this.#form = this.querySelector<HTMLFormElement>("#vendor-form")!;
    this.#list = this.querySelector<HTMLElement>("#vendor-list")!;
    this.#search = this.querySelector<HTMLInputElement>("#vendor-search")!;
    this.#count = this.querySelector<HTMLElement>("#vendor-count")!;
    this.#message = this.querySelector<HTMLElement>(".vendors-screen__message")!;
  }

  /** Returns the current transaction collection from the staged UI bridge or API cache. */
  #transactions(): BudgetTransaction[] {
    return budgetUI()?.getTransactions() ?? APIs.budget.getCachedTransactions() ?? [];
  }

  /** Recalculates transaction usage counts before rendering vendors. */
  #loadUsage(): void {
    this.#usage = new Map<string, number>();
    this.#transactions()
      .filter((transaction) => transaction.type !== "income" && Boolean(transaction.vendor))
      .forEach((transaction) => {
        this.#usage.set(transaction.vendorId, (this.#usage.get(transaction.vendorId) ?? 0) + 1);
      });
    this.#render();
  }

  /** Renders the filtered vendor collection and synchronization controls. */
  #render(): void {
    const allVendors = APIs.budget
      .listAllVendors()
      .filter((vendor) => this.#includeArchived || vendor.active !== false);
    const vendors = allVendors.filter((vendor) => vendor.name.toLowerCase().includes(this.#query));
    this.#count.textContent = this.#query
      ? `${vendors.length} of ${allVendors.length} vendors`
      : `${allVendors.length} ${allVendors.length === 1 ? "vendor" : "vendors"}`;
    if (!allVendors.length) {
      this.#list.innerHTML = '<div class="vendors-screen__empty"><strong>No vendors yet</strong><span>Add your first vendor to use it on transactions.</span></div>';
      return;
    }
    if (!vendors.length) {
      this.#list.innerHTML = '<div class="vendors-screen__empty"><strong>No matching vendors</strong><span>Try a different search.</span></div>';
      return;
    }
    this.#list.replaceChildren(...vendors.map((vendor) => this.#createRow(vendor)));
  }

  /** Loads archived vendors without delaying the initial active-vendor render. */
  #loadArchivedEntities(): void {
    void APIs.budget
      .listArchivedEntities()
      .then(() => {
        if (this.isConnected) this.#render();
      })
      .catch((error: unknown) => {
        window.dispatchEvent(
          new CustomEvent("budget:api-warning", {
            detail: `Couldn’t load archived vendors: ${errorMessage(error)}`,
          }),
        );
      });
  }

  /** Creates an accessible vendor row and any pending-sync controls. */
  #createRow(vendor: BudgetEntity): HTMLElement {
    const row = document.createElement("article");
    row.className = "vendors-screen__item";
    row.dataset.entityId = vendor.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `View ${vendor.name} vendor`);
    const count = this.#usage.get(vendor.id) ?? 0;
    const sync = APIs.budget.getEntitySyncStatus("vendor", vendor.id);
    row.innerHTML = `<span class="vendors-screen__avatar" aria-hidden="true">${escapeHTML(vendor.name.charAt(0).toUpperCase())}</span><div class="vendors-screen__details"><strong>${escapeHTML(vendor.name)}</strong><span>${count} ${count === 1 ? "transaction" : "transactions"}</span></div>`;
    if (sync) row.append(this.#createSyncControls(vendor.id, sync.status));
    return row;
  }

  /** Creates retry and removal controls for a vendor awaiting synchronization. */
  #createSyncControls(id: string, status: "pending" | "syncing" | "failed"): HTMLElement {
    const controls = document.createElement("div");
    controls.className = `vendors-screen__sync ${status}`;
    const label = document.createElement("span");
    label.textContent = status === "failed" ? "Needs attention" : "Pending";
    controls.append(label);
    if (status === "failed") {
      for (const [action, text] of [["retry", "Retry"], ["remove", "Remove"]] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.entityAction = action;
        button.dataset.entityId = id;
        button.textContent = text;
        controls.append(button);
      }
    }
    return controls;
  }

  /** Adds a vendor from the form while preserving legacy validation and messaging. */
  async #handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.#message.textContent = "";
    if (!this.#form.checkValidity()) {
      this.#form.reportValidity();
      return;
    }
    const nameInput = this.#form.elements.namedItem("vendorName");
    if (!(nameInput instanceof HTMLInputElement)) return;
    try {
      const vendor = APIs.budget.addVendor({ name: nameInput.value });
      this.#form.reset();
      nameInput.focus();
      this.#setMessage(APIs.budget.getConfig().endpoint ? `${vendor.name} was added. Syncing…` : `${vendor.name} was added.`, "success");
      this.#render();
    } catch (error: unknown) {
      this.#setMessage(messageFromError(error), "error");
    }
  }

  /** Handles navigation and retry or removal actions inside the vendor list. */
  #handleClick(event: Event): void {
    const target = eventTargetElement(event);
    const action = target?.closest<HTMLButtonElement>("[data-entity-action]");
    if (action) {
      this.#handleEntityAction(action);
      return;
    }
    const row = target?.closest<HTMLElement>("[data-entity-id]");
    if (row?.dataset.entityId) this.#openVendor(row.dataset.entityId);
  }

  /** Handles keyboard activation of an accessible vendor row. */
  #handleKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " ")) return;
    const target = eventTargetElement(event);
    if (target?.closest("[data-entity-action]")) return;
    const row = target?.closest<HTMLElement>("[data-entity-id]");
    if (!row?.dataset.entityId) return;
    event.preventDefault();
    this.#openVendor(row.dataset.entityId);
  }

  /** Updates the vendor filter from the search field. */
  #handleSearch(): void {
    this.#query = this.#search.value.trim().toLowerCase();
    this.#render();
  }

  /** Executes a retry or removal action for a failed vendor change. */
  #handleEntityAction(button: HTMLButtonElement): void {
    const id = button.dataset.entityId;
    if (!id) return;
    try {
      if (button.dataset.entityAction === "retry") APIs.budget.retryEntity("vendor", id);
      else if (button.dataset.entityAction === "remove" && window.confirm("Remove this unsynced vendor from this computer?")) APIs.budget.removeFailedEntity("vendor", id);
    } catch (error: unknown) {
      this.#setMessage(messageFromError(error), "error");
    }
  }

  /** Navigates to the selected vendor detail route. */
  #openVendor(id: string): void {
    appRouter().navigate("entity-detail", { kind: "vendor", id });
  }

  /** Updates the accessible form message and its visual state. */
  #setMessage(message: string, state: "success" | "error"): void {
    this.#message.className = `vendors-screen__message ${state}`;
    this.#message.textContent = message;
  }
}

if (!customElements.get("vendors-screen")) customElements.define("vendors-screen", VendorsScreen);
registerLegacyRouteAdapter("VendorRoute");
