import { APIs } from "../../api/api";
import type { BudgetEntity, BudgetTransaction, EntityKind } from "../../api/budget-api";
import type { RouteName } from "../../router/types";
import { appRouter, budgetUI, dateRangeDetail, eventTargetElement, transactionRow, type DateRangePickerElement, type DateRangeValue } from "../../utilities/legacy-runtime";
import { registerLegacyRouteAdapter } from "../../utilities/legacy-route-adapter";
import { money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface MutablePageTitle extends HTMLElement { title: string; eyebrow: string; }
interface EntityDetailSettings { label: string; route: RouteName; records(): BudgetEntity[]; }
interface SelectedEntity { kind: EntityKind; id: string; }

const ENTITY_DETAIL_CONFIG: Record<EntityKind, EntityDetailSettings> = {
  category: { label: "category", route: "categories", records: () => APIs.budget.listCategories({ type: "expense" }) },
  vendor: { label: "vendor", route: "vendors", records: () => APIs.budget.listVendors() },
  assignment: { label: "person", route: "people", records: () => APIs.budget.listPeople() },
};

const RENDER_EVENTS = [
  "budget:transaction-queued", "budget:transaction-saved", "budget:transaction-sync-changed",
  "budget:transaction-restored", "budget:transaction-removed", "budget:transactions-loaded",
  "budget:reference-data-changed", "budget:categories-changed", "budget:vendors-changed",
  "budget:people-changed", "budget:entity-sync-changed",
] as const;

/** Displays one budget entity and its transaction activity. */
export class EntityDetailScreen extends HTMLElement implements EventListenerObject {
  #selected: SelectedEntity | null = null;
  #header!: MutablePageTitle;
  #editButton!: HTMLButtonElement;
  #rangePicker!: DateRangePickerElement;
  #summary!: HTMLElement;
  #count!: HTMLElement;
  #list!: HTMLTableSectionElement;
  #table!: HTMLElement;
  #empty!: HTMLElement;
  #range: DateRangeValue = { start: "", end: "" };
  #listening = false;

  /** Initializes the detail screen from the current route parameters. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "entity-detail";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    const { kind, id } = appRouter().currentParams();
    this.#selected = this.#isEntityKind(kind) && id ? { kind, id } : null;
    if (!this.#selected) {
      appRouter().navigate("transactions");
      return;
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#range = this.#rangePicker.value;
    this.addEventListener("date-range-changed", this);
    this.#editButton.addEventListener("click", this);
    this.#list.addEventListener("click", this);
    this.#list.addEventListener("keydown", this);
    RENDER_EVENTS.forEach((name) => window.addEventListener(name, this));
    this.#render();
  }

  /** Removes every listener owned by the entity detail screen. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("date-range-changed", this);
    this.#editButton.removeEventListener("click", this);
    this.#list.removeEventListener("click", this);
    this.#list.removeEventListener("keydown", this);
    RENDER_EVENTS.forEach((name) => window.removeEventListener(name, this));
  }

  /** Routes date, edit, row, keyboard, and budget events to screen behavior. */
  handleEvent(event: Event): void {
    if (event.type === "date-range-changed") this.#handleDateRangeChange(event);
    else if (event.type === "click" && event.currentTarget === this.#editButton) this.#handleEdit();
    else if (event.type === "click") this.#handleListClick(event);
    else if (event.type === "keydown") this.#handleListKeydown(event);
    else this.#render();
  }

  /** Captures the typed elements cloned from the detail template. */
  #captureElements(): void {
    this.#header = this.querySelector<MutablePageTitle>("page-title")!;
    this.#editButton = this.querySelector<HTMLButtonElement>("#edit-entity")!;
    this.#rangePicker = this.querySelector<DateRangePickerElement>("date-range-picker")!;
    this.#summary = this.querySelector<HTMLElement>("#entity-summary-grid")!;
    this.#count = this.querySelector<HTMLElement>("#entity-transaction-count")!;
    this.#list = this.querySelector<HTMLTableSectionElement>("#entity-transaction-list")!;
    this.#table = this.querySelector<HTMLElement>("#entity-transaction-table-wrap")!;
    this.#empty = this.querySelector<HTMLElement>("#entity-transaction-state")!;
  }

  /** Narrows a route parameter to a supported entity kind. */
  #isEntityKind(value: string | undefined): value is EntityKind {
    return value === "category" || value === "vendor" || value === "assignment";
  }

  /** Updates the active date range and rerenders the activity list. */
  #handleDateRangeChange(event: Event): void {
    const range = dateRangeDetail(event);
    if (!range) return;
    this.#range = range;
    this.#render();
  }

  /** Returns the entity selected by the current route. */
  #record(): BudgetEntity | undefined {
    if (!this.#selected) return undefined;
    return ENTITY_DETAIL_CONFIG[this.#selected.kind].records().find((item) => item.id === this.#selected?.id);
  }

  /** Returns matching transactions inside the selected date range. */
  #transactions(): BudgetTransaction[] {
    if (!this.#selected) return [];
    const field: Record<EntityKind, "categoryId" | "vendorId" | "assignmentId"> = {
      category: "categoryId", vendor: "vendorId", assignment: "assignmentId",
    };
    const selected = this.#selected;
    const transactions = budgetUI()?.getTransactions() ?? APIs.budget.getCachedTransactions() ?? [];
    return transactions
      .filter((item) => item[field[selected.kind]] === selected.id)
      .filter((item) => selected.kind === "assignment" || item.type !== "income")
      .filter((item) => (!this.#range.start || item.date >= this.#range.start) && (!this.#range.end || item.date <= this.#range.end))
      .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt));
  }

  /** Builds one summary card using the legacy route markup. */
  #card(label: string, value: string, extra = ""): string {
    return `<article class="summary-card"><div><p>${label}</p><strong class="${extra}">${value}</strong></div></article>`;
  }

  /** Renders entity metadata, summary metrics, and matching transactions. */
  #render(): void {
    if (!this.#selected) return;
    const entity = this.#record();
    if (!entity) {
      if (!budgetUI()?.isReferenceDataLoaded()) {
        this.#header.title = "Loading details…";
        this.#editButton.disabled = true;
        this.#summary.replaceChildren();
        this.#table.hidden = true;
        this.#empty.hidden = false;
        this.#empty.innerHTML = '<div class="spinner" aria-hidden="true"></div><p>Loading details…</p>';
        return;
      }
      appRouter().navigate(ENTITY_DETAIL_CONFIG[this.#selected.kind].route);
      return;
    }
    const items = this.#transactions();
    const settings = ENTITY_DETAIL_CONFIG[this.#selected.kind];
    this.#header.title = entity.name;
    this.#header.eyebrow = `${settings.label} details`;
    this.#editButton.textContent = `Edit ${settings.label}`;
    const sync = APIs.budget.getEntitySyncStatus(this.#selected.kind, this.#selected.id);
    this.#editButton.disabled = Boolean(sync);
    this.#editButton.title = sync ? "Available after sync completes" : "";
    if (this.#selected.kind === "assignment") {
      const income = items.filter((item) => item.type === "income").reduce((total, item) => total + Number(item.amount || 0), 0);
      const expenses = items.filter((item) => item.type !== "income").reduce((total, item) => total + Number(item.amount || 0), 0);
      this.#summary.innerHTML = this.#card("Income", money(income), "amount-income") + this.#card("Expenses", money(expenses), "amount-expense") + this.#card("Net activity", money(income - expenses));
    } else {
      const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      this.#summary.innerHTML = this.#card("Total spent", money(total), "amount-expense") + this.#card("Transactions", String(items.length)) + this.#card("Average transaction", money(items.length ? total / items.length : 0));
    }
    this.#count.textContent = `${items.length} ${items.length === 1 ? "transaction" : "transactions"}`;
    if (!items.length) {
      this.#table.hidden = true;
      this.#empty.hidden = false;
      this.#empty.innerHTML = '<div class="empty-symbol" aria-hidden="true">$</div><h3>No activity in this range</h3><p>Choose another date range to see more transactions.</p>';
    } else {
      this.#list.replaceChildren(...items.map((item) => transactionRow().create(item)));
      this.#empty.hidden = true;
      this.#table.hidden = false;
    }
  }

  /** Opens the selected entity in the editor drawer. */
  #handleEdit(): void {
    if (!this.#selected) return;
    appRouter().updateParams({ drawer: "entity-edit", entityKind: this.#selected.kind, entityId: this.#selected.id });
  }

  /** Opens a clicked transaction in the editor drawer. */
  #handleListClick(event: Event): void {
    const row = eventTargetElement(event)?.closest<HTMLElement>("tr[data-transaction-id]");
    if (row?.dataset.transactionId) appRouter().updateParams({ drawer: "edit", transactionId: row.dataset.transactionId });
  }

  /** Opens a keyboard-activated transaction in the editor drawer. */
  #handleListKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " ")) return;
    const row = eventTargetElement(event)?.closest<HTMLElement>("tr[data-transaction-id]");
    if (!row?.dataset.transactionId) return;
    event.preventDefault();
    appRouter().updateParams({ drawer: "edit", transactionId: row.dataset.transactionId });
  }
}

if (!customElements.get("entity-detail-screen")) customElements.define("entity-detail-screen", EntityDetailScreen);
registerLegacyRouteAdapter("EntityRoute");
