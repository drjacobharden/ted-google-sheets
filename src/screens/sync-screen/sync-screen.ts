import { APIs } from "../../api/api";
import type { BudgetEntity, BudgetTransaction, EntityKind, SyncItem } from "../../api/budget-api";
import { appRouter, eventTargetElement } from "../../utilities/legacy-runtime";
import { registerLegacyRouteAdapter } from "../../utilities/legacy-route-adapter";
import { escapeHTML, messageFromError, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays and manages pending, retrying, and failed synchronization work. */
export class SyncScreen extends HTMLElement implements EventListenerObject {
  #list!: HTMLElement;
  #empty!: HTMLElement;
  #summary!: HTMLElement;
  #retryAll!: HTMLButtonElement;
  #countdownTimer: ReturnType<typeof setInterval> | null = null;
  #listening = false;

  /** Initializes the sync center and subscribes to connectivity and sync events. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "sync";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    if (this.#listening) return;
    this.#listening = true;
    this.#list.addEventListener("click", this);
    this.#retryAll.addEventListener("click", this);
    window.addEventListener("budget:sync-changed", this);
    window.addEventListener("online", this);
    window.addEventListener("offline", this);
    this.#render();
  }

  /** Removes sync listeners and clears the retry countdown timer. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#list.removeEventListener("click", this);
    this.#retryAll.removeEventListener("click", this);
    window.removeEventListener("budget:sync-changed", this);
    window.removeEventListener("online", this);
    window.removeEventListener("offline", this);
    if (this.#countdownTimer !== null) clearInterval(this.#countdownTimer);
    this.#countdownTimer = null;
  }

  /** Routes list, retry-all, connectivity, and sync events to screen behavior. */
  handleEvent(event: Event): void {
    if (event.type === "click" && event.currentTarget === this.#retryAll) this.#handleRetryAll();
    else if (event.type === "click") this.#handleListClick(event);
    else this.#render();
  }

  /** Captures the typed elements cloned from the sync template. */
  #captureElements(): void {
    this.#list = this.querySelector<HTMLElement>("#sync-list")!;
    this.#empty = this.querySelector<HTMLElement>("#sync-empty")!;
    this.#summary = this.querySelector<HTMLElement>("#sync-screen-summary")!;
    this.#retryAll = this.querySelector<HTMLButtonElement>("#retry-all-sync")!;
  }

  /** Returns whether the browser currently reports an offline state. */
  #browserIsOffline(): boolean {
    return navigator.onLine === false;
  }

  /** Returns a safely readable object for a sync record. */
  #record(item: SyncItem): Record<string, unknown> {
    return typeof item.record === "object" && item.record !== null ? item.record as unknown as Record<string, unknown> : {};
  }

  /** Returns a string field from an untrusted sync record. */
  #recordString(item: SyncItem, key: string): string {
    const value = this.#record(item)[key];
    return typeof value === "string" ? value : "";
  }

  /** Returns a numeric field from an untrusted sync record. */
  #recordNumber(item: SyncItem, key: string): number {
    const value = Number(this.#record(item)[key]);
    return Number.isFinite(value) ? value : 0;
  }

  /** Describes a transaction sync item using its date, payee, and amount. */
  #transactionDescription(record: BudgetTransaction): string {
    const name = record.type === "income" ? record.category : record.vendor || record.category;
    return `${record.date} · ${name || "Transaction"} · ${money(record.amount)}`;
  }

  /** Describes the remaining delay and attempt count for a retrying item. */
  #retryDescription(item: SyncItem): string {
    const seconds = Math.max(0, Math.ceil((Number(item.nextRetryAt) - Date.now()) / 1000));
    return `Couldn’t reach Google · ${seconds > 0 ? `Retrying in ${seconds}s` : "Retrying now"} · Attempt ${item.attempts}`;
  }

  /** Returns whether a sync item represents a monthly investment update. */
  #isInvestmentMonth(item: SyncItem): boolean {
    return item.source === "investmentMonth" || item.source === "investmentSnapshot";
  }

  /** Builds the legacy sync-center markup for one queued item. */
  #itemMarkup(item: SyncItem): string {
    const failed = item.status === "failed";
    const syncing = item.status === "syncing";
    const title = item.source === "transaction"
      ? `${item.operation === "update" ? "Update" : "New"} transaction`
      : item.source === "investmentAccount"
        ? "New investment account"
        : this.#isInvestmentMonth(item)
          ? "Investment monthly update"
          : `New ${item.kind ? ({ category: "category", vendor: "vendor", assignment: "assignment" } satisfies Record<EntityKind, string>)[item.kind] : "entity"}`;
    const detail = item.source === "transaction"
      ? this.#transactionDescription(item.record as BudgetTransaction)
      : this.#isInvestmentMonth(item)
        ? `${this.#recordString(item, "month")} · ${this.#recordString(item, "accountName")} · ${money(this.#recordNumber(item, "balance"))}`
        : this.#recordString(item, "name");
    const icon = item.source === "transaction" ? "$" : this.#isInvestmentMonth(item) ? "↗" : (this.#recordString(item, "name") || "?").charAt(0).toUpperCase();
    const offlineRetry = '<button class="sync-screen__retry-now" type="button" disabled title="Available when online">Retry now</button>';
    const controls = item.waitingForOnline
      ? `${offlineRetry}<button class="sync-screen__discard" type="button" data-sync-action="discard">Discard</button>`
      : item.retrying
        ? '<button class="sync-screen__retry-now" type="button" data-sync-action="retry">Retry now</button><button class="sync-screen__discard" type="button" data-sync-action="discard">Discard</button>'
        : failed
          ? `${item.failureCode === "conflict" ? '<button class="sync-screen__review" type="button" data-sync-action="review">Review</button>' : this.#browserIsOffline() ? offlineRetry : `<button class="sync-screen__retry" type="button" data-sync-action="retry" aria-label="Retry ${escapeHTML(title)}"><span class="retry-idle" aria-hidden="true">×</span><span class="retry-hover" aria-hidden="true">↻</span><span class="sr-only">Retry</span></button>`}<button class="sync-screen__discard" type="button" data-sync-action="discard">Discard</button>`
          : syncing ? '<span class="sync-screen__spinner" aria-label="Syncing"></span>' : '<span class="sync-screen__pending" aria-label="Waiting to sync"></span>';
    return `<article class="sync-screen__item ${escapeHTML(item.status)}" data-sync-key="${escapeHTML(item.key)}"><span class="sync-screen__icon" aria-hidden="true">${escapeHTML(icon)}</span><div class="sync-screen__copy">${escapeHTML(title)}<span>${escapeHTML(detail)}</span>${item.waitingForOnline ? `<small class="retry offline">Offline · Sync will attempt again when back online</small>${item.error ? `<small class="transport">${escapeHTML(item.error)}</small>` : ""}` : ""}${item.retrying ? `<small class="retry">${escapeHTML(this.#retryDescription(item))}</small><small class="transport">${escapeHTML(item.error)}</small>` : ""}${failed ? `<small class="error">Needs attention · ${escapeHTML(item.error)}</small>` : ""}</div><div class="sync-screen__actions">${controls}</div></article>`;
  }

  /** Renders every sync item and updates retry summary state. */
  #render(): void {
    const items = APIs.budget.getSyncItems();
    const failed = items.filter((item) => item.status === "failed").length;
    const retrying = items.filter((item) => item.retrying).length;
    const waiting = items.filter((item) => item.waitingForOnline).length;
    const retryable = items.filter((item) => (item.status === "failed" && item.failureCode !== "conflict") || item.retrying || item.waitingForOnline).length;
    const syncing = items.filter((item) => item.status === "syncing").length;
    this.#empty.hidden = items.length > 0;
    this.#list.innerHTML = items.map((item) => this.#itemMarkup(item)).join("");
    this.#retryAll.hidden = retryable === 0;
    this.#retryAll.disabled = this.#browserIsOffline() && retryable > 0;
    this.#retryAll.title = this.#retryAll.disabled ? "Available when online" : "";
    this.#summary.textContent = !items.length ? "All changes are saved."
      : waiting ? `Offline · Sync will attempt again when back online. ${waiting} ${waiting === 1 ? "change is" : "changes are"} waiting${failed ? ` · ${failed} ${failed === 1 ? "needs" : "need"} attention` : ""}.`
        : failed ? `${failed} ${failed === 1 ? "change needs" : "changes need"} attention · ${items.length - failed} waiting`
          : retrying ? `${retrying} ${retrying === 1 ? "change is" : "changes are"} waiting to retry.`
            : syncing ? `Syncing ${syncing} ${syncing === 1 ? "change" : "changes"}…`
              : `${items.length} ${items.length === 1 ? "change is" : "changes are"} waiting to sync.`;
    if (retrying > 0 && this.#countdownTimer === null) this.#countdownTimer = setInterval(() => this.#render(), 1000);
    else if (retrying === 0 && this.#countdownTimer !== null) {
      clearInterval(this.#countdownTimer);
      this.#countdownTimer = null;
    }
  }

  /** Handles review, retry, and discard actions for one synchronization item. */
  #handleListClick(event: Event): void {
    const target = eventTargetElement(event);
    const action = target?.closest<HTMLElement>("[data-sync-action]")?.dataset.syncAction;
    const element = target?.closest<HTMLElement>("[data-sync-key]");
    if (!action || !element?.dataset.syncKey) return;
    const item = APIs.budget.getSyncItems().find((entry) => entry.key === element.dataset.syncKey);
    if (!item) return;
    try {
      if (action === "review") this.#reviewItem(item);
      else if (action === "retry") this.#retryItem(item);
      else if (action === "discard" && window.confirm(`Discard this unsynchronized ${this.#discardLabel(item)}?`)) this.#discardItem(item);
    } catch (error: unknown) {
      console.warn(messageFromError(error));
    }
    this.#render();
  }

  /** Opens the appropriate conflict-review drawer for a sync item. */
  #reviewItem(item: SyncItem): void {
    if (item.source === "transaction") appRouter().updateParams({ drawer: "review", transactionId: item.id });
    else if (this.#isInvestmentMonth(item)) appRouter().updateParams({ drawer: "investment-month", investmentAccountId: this.#recordString(item, "accountId"), investmentMonth: this.#recordString(item, "month"), investmentReviewId: item.id });
  }

  /** Retries a transaction, investment, or entity sync item. */
  #retryItem(item: SyncItem): void {
    if (item.source === "transaction") APIs.budget.retryTransaction(item.id);
    else if (item.source === "investmentAccount" || item.source === "investmentMonth") APIs.investment.retry(item.source, item.id);
    else if (item.kind) APIs.budget.retryEntity(item.kind, item.id);
  }

  /** Discards a transaction, investment, or entity sync item. */
  #discardItem(item: SyncItem): void {
    if (item.source === "transaction") APIs.budget.discardTransactionChange(item.id);
    else if (item.source === "investmentAccount" || item.source === "investmentMonth") APIs.investment.discard(item.source, item.id);
    else if (item.kind) APIs.budget.discardEntityChange(item.kind, item.id);
  }

  /** Returns the human-readable object name used by the discard confirmation. */
  #discardLabel(item: SyncItem): string {
    if (item.source === "transaction") return "transaction change";
    if (this.#isInvestmentMonth(item)) return "investment update";
    if (item.source === "investmentAccount") return "investment account";
    return item.kind ?? "entity";
  }

  /** Retries all retryable synchronization items except unresolved conflicts. */
  #handleRetryAll(): void {
    APIs.budget.getSyncItems().filter((item) => item.retrying || item.status === "failed").forEach((item) => {
      if (item.failureCode !== "conflict") this.#retryItem(item);
    });
    this.#render();
  }
}

if (!customElements.get("sync-screen")) customElements.define("sync-screen", SyncScreen);
registerLegacyRouteAdapter("SyncRoute");
