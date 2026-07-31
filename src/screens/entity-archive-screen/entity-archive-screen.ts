import { APIs } from "../../api/api";
import type { BudgetEntity, EntityKind } from "../../api/budget-api";
import type { RouteName } from "../../router/types";
import { appRouter, eventTargetElement } from "../../utilities/legacy-runtime";
import { registerLegacyRouteAdapter } from "../../utilities/legacy-route-adapter";
import { escapeHTML, messageFromError } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

type ArchiveCollection = "categories" | "vendors" | "assignments";
type ArchivedCollections = Record<ArchiveCollection, BudgetEntity[]>;
interface ArchiveSettings { collection: ArchiveCollection; singular: string; plural: string; route: RouteName; }

const SETTINGS_BY_KIND: Record<EntityKind, ArchiveSettings> = {
  category: { collection: "categories", singular: "category", plural: "categories", route: "categories" },
  vendor: { collection: "vendors", singular: "vendor", plural: "vendors", route: "vendors" },
  assignment: { collection: "assignments", singular: "person", plural: "people", route: "people" },
};

/** Displays archived budget entities and opens them for reactivation. */
export class EntityArchiveScreen extends HTMLElement implements EventListenerObject {
  #kind: EntityKind = "category";
  #settings: ArchiveSettings = SETTINGS_BY_KIND.category;
  #title!: HTMLElement;
  #count!: HTMLElement;
  #search!: HTMLInputElement;
  #list!: HTMLElement;
  #back!: HTMLButtonElement;
  #collections: ArchivedCollections = { categories: [], vendors: [], assignments: [] };
  #query = "";
  #listening = false;
  #loadGeneration = 0;

  /** Initializes the screen using the current route parameters. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "entity-archive";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    const requestedKind = appRouter().currentParams().kind;
    this.#kind = requestedKind === "vendor" || requestedKind === "assignment" ? requestedKind : "category";
    this.#settings = SETTINGS_BY_KIND[this.#kind];
    this.#title.textContent = `Archived ${this.#settings.plural}`;
    this.#search.placeholder = `Search archived ${this.#settings.plural}`;
    if (this.#listening) return;
    this.#listening = true;
    this.#back.addEventListener("click", this);
    this.#search.addEventListener("input", this);
    this.#list.addEventListener("click", this);
    this.#list.addEventListener("keydown", this);
    window.addEventListener(this.#changedEventName(), this);
    void this.#load();
  }

  /** Removes listeners and invalidates any pending archive request. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#loadGeneration += 1;
    this.#back.removeEventListener("click", this);
    this.#search.removeEventListener("input", this);
    this.#list.removeEventListener("click", this);
    this.#list.removeEventListener("keydown", this);
    window.removeEventListener(this.#changedEventName(), this);
  }

  /** Routes DOM and budget events to archive screen behavior. */
  handleEvent(event: Event): void {
    if (event.type === "click") this.#handleClick(event);
    else if (event.type === "keydown") this.#handleKeydown(event);
    else if (event.type === "input") this.#handleSearch();
    else this.#handleChanged();
  }

  /** Captures the typed elements cloned from the route template. */
  #captureElements(): void {
    this.#title = this.querySelector<HTMLElement>("[data-archive-title]")!;
    this.#count = this.querySelector<HTMLElement>("[data-archive-count]")!;
    this.#search = this.querySelector<HTMLInputElement>("[data-archive-search]")!;
    this.#list = this.querySelector<HTMLElement>("[data-archive-list]")!;
    this.#back = this.querySelector<HTMLButtonElement>("[data-archive-back]")!;
  }

  /** Returns the budget event name associated with the selected collection. */
  #changedEventName(): string {
    return `budget:${this.#settings.collection === "assignments" ? "people" : this.#settings.collection}-changed`;
  }

  /** Loads archived entities and ignores responses after the screen disconnects. */
  async #load(options: { refresh?: boolean } = {}): Promise<void> {
    const generation = ++this.#loadGeneration;
    this.#list.innerHTML = '<div class="entity-archive-screen__empty"><span class="spinner" aria-hidden="true"></span><span>Loading archived items…</span></div>';
    try {
      const collections = await APIs.budget.listArchivedEntities(options);
      if (!this.#listening || generation !== this.#loadGeneration) return;
      this.#collections = collections;
      this.#render();
    } catch (error: unknown) {
      if (!this.#listening || generation !== this.#loadGeneration) return;
      this.#list.innerHTML = `<div class="entity-archive-screen__empty"><strong>Couldn’t load archived items</strong><span>${escapeHTML(messageFromError(error))}</span></div>`;
    }
  }

  /** Renders archived records matching the current search query. */
  #render(): void {
    const all = this.#collections[this.#settings.collection] ?? [];
    const items = all.filter((item) => item.name.toLowerCase().includes(this.#query));
    this.#count.textContent = this.#query
      ? `${items.length} of ${all.length} archived ${this.#settings.plural}`
      : `${all.length} archived ${all.length === 1 ? this.#settings.singular : this.#settings.plural}`;
    if (!all.length) {
      this.#list.innerHTML = `<div class="entity-archive-screen__empty"><strong>No archived ${escapeHTML(this.#settings.plural)}</strong><span>Archived items will appear here.</span></div>`;
      return;
    }
    if (!items.length) {
      this.#list.innerHTML = '<div class="entity-archive-screen__empty"><strong>No matching items</strong><span>Try a different search.</span></div>';
      return;
    }
    this.#list.replaceChildren(...items.map((item) => this.#createRow(item)));
  }

  /** Creates an accessible row for an archived entity. */
  #createRow(item: BudgetEntity): HTMLElement {
    const row = document.createElement("article");
    row.className = "entity-archive-screen__item";
    row.dataset.entityId = item.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Edit archived ${item.name}`);
    row.innerHTML = `<span class="entity-archive-screen__avatar" aria-hidden="true">${escapeHTML(item.name.charAt(0).toUpperCase())}</span><div class="entity-archive-screen__details"><strong>${escapeHTML(item.name)}</strong><span>Archived</span></div><span class="entity-archive-screen__kind">Reactivate</span>`;
    return row;
  }

  /** Handles back navigation and archived-row activation. */
  #handleClick(event: Event): void {
    const target = eventTargetElement(event);
    if (target?.closest("[data-archive-back]")) {
      appRouter().navigate(this.#settings.route);
      return;
    }
    const row = target?.closest<HTMLElement>("[data-entity-id]");
    if (row?.dataset.entityId) this.#openItem(row.dataset.entityId);
  }

  /** Handles keyboard activation of archived entity rows. */
  #handleKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " ")) return;
    const row = eventTargetElement(event)?.closest<HTMLElement>("[data-entity-id]");
    if (!row?.dataset.entityId) return;
    event.preventDefault();
    this.#openItem(row.dataset.entityId);
  }

  /** Updates the archived-entity search query. */
  #handleSearch(): void {
    this.#query = this.#search.value.trim().toLowerCase();
    this.#render();
  }

  /** Removes entities that are no longer archived from the visible collection. */
  #handleChanged(): void {
    this.#collections = {
      ...this.#collections,
      [this.#settings.collection]: this.#collections[this.#settings.collection].filter((item) => APIs.budget.getEntity(this.#kind, item.id)?.active === false),
    };
    this.#render();
  }

  /** Opens the entity editor drawer for an archived item. */
  #openItem(id: string): void {
    appRouter().updateParams({ drawer: "entity-edit", entityKind: this.#kind, entityId: id });
  }
}

if (!customElements.get("entity-archive-screen")) customElements.define("entity-archive-screen", EntityArchiveScreen);
registerLegacyRouteAdapter("EntityArchiveRoute");
