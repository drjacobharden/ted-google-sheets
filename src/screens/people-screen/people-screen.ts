import { APIs } from "../../api/api";
import type { BudgetEntity, BudgetTransaction } from "../../api/budget-api";
import { appRouter, budgetUI, eventTargetElement } from "../../utilities/legacy-runtime";
import { registerLegacyRouteAdapter } from "../../utilities/legacy-route-adapter";
import { escapeHTML, messageFromError } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays and manages household assignment records. */
export class PeopleScreen extends HTMLElement implements EventListenerObject {
  #form!: HTMLFormElement;
  #list!: HTMLElement;
  #count!: HTMLElement;
  #message!: HTMLElement;
  #usage = new Map<string, number>();
  #listening = false;

  /** Initializes the screen and subscribes to assignment and transaction events. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "people";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#form.addEventListener("submit", this);
    this.#list.addEventListener("click", this);
    this.#list.addEventListener("keydown", this);
    window.addEventListener("budget:people-changed", this);
    window.addEventListener("budget:entity-sync-changed", this);
    window.addEventListener("budget:transaction-sync-changed", this);
    window.addEventListener("budget:transaction-saved", this);
    this.#loadUsage();
  }

  /** Removes the listeners owned by this route screen. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#form.removeEventListener("submit", this);
    this.#list.removeEventListener("click", this);
    this.#list.removeEventListener("keydown", this);
    window.removeEventListener("budget:people-changed", this);
    window.removeEventListener("budget:entity-sync-changed", this);
    window.removeEventListener("budget:transaction-sync-changed", this);
    window.removeEventListener("budget:transaction-saved", this);
  }

  /** Routes DOM and application events to the corresponding behavior. */
  handleEvent(event: Event): void {
    if (event.type === "submit") void this.#handleSubmit(event);
    else if (event.type === "click") this.#handleClick(event);
    else if (event.type === "keydown") this.#handleKeydown(event);
    else if (event.type.includes("transaction")) this.#loadUsage();
    else this.#render();
  }

  /** Captures the typed elements cloned from the screen template. */
  #captureElements(): void {
    this.#form = this.querySelector<HTMLFormElement>("#people-form")!;
    this.#list = this.querySelector<HTMLElement>("#people-list")!;
    this.#count = this.querySelector<HTMLElement>("#people-count")!;
    this.#message = this.querySelector<HTMLElement>(".people-screen__message")!;
  }

  /** Returns the current transaction collection from the staged UI bridge or API cache. */
  #transactions(): BudgetTransaction[] {
    return budgetUI()?.getTransactions() ?? APIs.budget.getCachedTransactions() ?? [];
  }

  /** Recalculates transaction usage counts before rendering assignments. */
  #loadUsage(): void {
    this.#usage = new Map<string, number>();
    this.#transactions().forEach((transaction) => {
      this.#usage.set(transaction.assignmentId, (this.#usage.get(transaction.assignmentId) ?? 0) + 1);
    });
    this.#render();
  }

  /** Renders the household assignment collection and synchronization controls. */
  #render(): void {
    const people = APIs.budget.listPeople();
    this.#count.textContent = `${people.length} ${people.length === 1 ? "assignment" : "assignments"}`;
    this.#list.replaceChildren(...people.map((person) => this.#createRow(person)));
  }

  /** Creates an accessible assignment row and any pending-sync controls. */
  #createRow(person: BudgetEntity): HTMLElement {
    const row = document.createElement("article");
    row.className = "people-screen__item";
    row.dataset.entityId = person.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `View ${person.name} assignment`);
    const count = this.#usage.get(person.id) ?? 0;
    row.innerHTML = `<span class="people-screen__avatar" aria-hidden="true">${escapeHTML(person.name.charAt(0).toUpperCase())}</span><div class="people-screen__details"><strong>${escapeHTML(person.name)}</strong><span>${count} ${count === 1 ? "transaction" : "transactions"}</span></div>${person.isDefault ? '<span class="people-screen__kind">Default</span>' : ""}`;
    const sync = APIs.budget.getEntitySyncStatus("assignment", person.id);
    if (sync) row.append(this.#createSyncControls(person.id, sync.status));
    return row;
  }

  /** Creates retry and removal controls for an assignment awaiting synchronization. */
  #createSyncControls(id: string, status: "pending" | "syncing" | "failed"): HTMLElement {
    const controls = document.createElement("div");
    controls.className = `people-screen__sync ${status}`;
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

  /** Adds a household assignment from the form. */
  async #handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.#message.textContent = "";
    if (!this.#form.checkValidity()) {
      this.#form.reportValidity();
      return;
    }
    const nameInput = this.#form.elements.namedItem("personName");
    if (!(nameInput instanceof HTMLInputElement)) return;
    try {
      const person = APIs.budget.addPerson({ name: nameInput.value });
      this.#form.reset();
      nameInput.focus();
      this.#setMessage(APIs.budget.getConfig().endpoint ? `${person.name} was added. Syncing…` : `${person.name} was added.`, "success");
      this.#render();
    } catch (error: unknown) {
      this.#setMessage(messageFromError(error), "error");
    }
  }

  /** Handles navigation and retry or removal actions inside the people list. */
  #handleClick(event: Event): void {
    const target = eventTargetElement(event);
    const action = target?.closest<HTMLButtonElement>("[data-entity-action]");
    if (action) {
      this.#handleEntityAction(action);
      return;
    }
    const row = target?.closest<HTMLElement>("[data-entity-id]");
    if (row?.dataset.entityId) this.#openPerson(row.dataset.entityId);
  }

  /** Handles keyboard activation of an accessible assignment row. */
  #handleKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " ")) return;
    const target = eventTargetElement(event);
    if (target?.closest("[data-entity-action]")) return;
    const row = target?.closest<HTMLElement>("[data-entity-id]");
    if (!row?.dataset.entityId) return;
    event.preventDefault();
    this.#openPerson(row.dataset.entityId);
  }

  /** Executes a retry or removal action for a failed assignment change. */
  #handleEntityAction(button: HTMLButtonElement): void {
    const id = button.dataset.entityId;
    if (!id) return;
    try {
      if (button.dataset.entityAction === "retry") APIs.budget.retryEntity("assignment", id);
      else if (button.dataset.entityAction === "remove" && window.confirm("Remove this unsynced assignment from this computer?")) APIs.budget.removeFailedEntity("assignment", id);
    } catch (error: unknown) {
      this.#setMessage(messageFromError(error), "error");
    }
  }

  /** Navigates to the selected assignment detail route. */
  #openPerson(id: string): void {
    appRouter().navigate("entity-detail", { kind: "assignment", id });
  }

  /** Updates the accessible form message and its visual state. */
  #setMessage(message: string, state: "success" | "error"): void {
    this.#message.className = `people-screen__message ${state}`;
    this.#message.textContent = message;
  }
}

if (!customElements.get("people-screen")) customElements.define("people-screen", PeopleScreen);
registerLegacyRouteAdapter("PeopleRoute");
