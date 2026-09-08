import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { InvestmentView } from "../../utilities/investment-view";
import { createTransactionRow } from "../../utilities/transaction-row";
import { dateRangeDetail, eventTargetElement, isInvestmentSource, type DateRangePickerElement, type DateRangeValue } from "../../utilities/ui-utilities";
import { APIs } from "../../api/api";
import type { BudgetEntity, BudgetTransaction, EntityKind, SyncItem } from "../../api/budget-api";
import { escapeHTML, messageFromError, money } from "../../utilities/view-formatters";
import templateString from "./template.html" with { type: "text" };
import type { DataTable, DataTableColumn, DataTableData } from "../../components/data-table/data-table";

const template = document.createElement("template");
template.innerHTML = templateString;

/** Displays and manages pending, retrying, and failed synchronization work. */
export class SyncScreen extends HTMLElement implements EventListenerObject {
  #table!: DataTable<SyncTableRow>;
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
    this.#table.addEventListener("click", this);
    window.addEventListener("budget:sync-changed", this);
    window.addEventListener("online", this);
    window.addEventListener("offline", this);
    this.#render();
  }

  /** Removes sync listeners and clears the retry countdown timer. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#table.removeEventListener("click", this);
    window.removeEventListener("budget:sync-changed", this);
    window.removeEventListener("online", this);
    window.removeEventListener("offline", this);
    if (this.#countdownTimer !== null) clearInterval(this.#countdownTimer);
    this.#countdownTimer = null;
  }

  /** Routes list, retry-all, connectivity, and sync events to screen behavior. */
  handleEvent(event: Event): void {
    if (event.type === "click") this.#handleListClick(event);
    else this.#render();
  }

  /** Captures the typed elements cloned from the sync template. */
  #captureElements(): void {
    this.#table = this.querySelector<DataTable<SyncTableRow>>("#sync-table")!;
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

  /** Returns whether a sync item belongs to the unified account outbox. */
  #isAccountSyncItem(item: SyncItem): boolean {
    return item.source === "account" || item.source === "accountMonth" || item.source === "accountBalance";
  }

  /** Returns the account owner for an account-month sync record when it is cached. */
  #accountForSyncItem(item: SyncItem): { name?: string; type?: string } | null {
    const accountId = this.#recordString(item, "accountId");
    return APIs.accounts.accounts().find((account) => account.id === accountId) || null;
  }

  /** Builds the legacy sync-center markup for one queued item. */
  #actionMarkup(item: SyncItem): string {
    const failed = item.status === "failed";
    const syncing = item.status === "syncing";
    const title = this.#itemTitle(item);
    const offlineRetry = '<custom-button class="secondary-button sync-screen__action" label="Retry now" disabled title="Available when online"></custom-button>';
    const controls = item.waitingForOnline
      ? `${offlineRetry}<custom-button class="secondary-button sync-screen__action sync-screen__discard" data-sync-action="discard" label="Discard"></custom-button>`
      : item.retrying
        ? '<custom-button class="secondary-button sync-screen__action" data-sync-action="retry" label="Retry now"></custom-button><custom-button class="secondary-button sync-screen__action sync-screen__discard" data-sync-action="discard" label="Discard"></custom-button>'
        : failed
          ? `${item.failureCode === "conflict" ? '<custom-button class="secondary-button sync-screen__action" data-sync-action="review" label="Review"></custom-button>' : this.#browserIsOffline() ? offlineRetry : `<custom-button class="secondary-button sync-screen__action" data-sync-action="retry" label="Retry now" aria-label="Retry ${escapeHTML(title)}"></custom-button>`}<custom-button class="secondary-button sync-screen__action sync-screen__discard" data-sync-action="discard" label="Discard"></custom-button>`
          : syncing ? '<span class="sync-screen__spinner" aria-label="Syncing"></span>' : '<span class="sync-screen__pending" aria-label="Waiting to sync"></span>';
    return controls;
  }

  /** Renders every sync item and updates retry summary state. */
  #render(): void {
    const items = APIs.getSyncItems();
    const failed = items.filter((item) => item.status === "failed").length;
    const retrying = items.filter((item) => item.retrying).length;
    const waiting = items.filter((item) => item.waitingForOnline).length;
    const retryable = items.filter((item) => (item.status === "failed" && item.failureCode !== "conflict") || item.retrying || item.waitingForOnline).length;
    const syncing = items.filter((item) => item.status === "syncing").length;
    const rows = items.map((item) => ({
      id: item.key,
      change: this.#itemTitle(item),
      detail: this.#itemDetail(item),
      status: this.#itemStatus(item),
      actions: this.#actionMarkup(item),
    }));
    const data: DataTableData<SyncTableRow> = {
      columns: this.#columns(),
      rows,
      rowKey: (row) => row.id,
    };
    this.#table.data = data;
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
    const element = target?.closest<HTMLElement>("[data-row-key]");
    if (!action || !element?.dataset.rowKey) return;
    const item = APIs.getSyncItems().find((entry) => entry.key === element.dataset.rowKey);
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
    if (item.source === "transaction") router.updateParams({ drawer: "review", transactionId: item.id });
    else if (this.#isInvestmentMonth(item)) router.updateParams({ drawer: "edit", transactionId: item.currentRecord?.id || this.#recordString(item, "id") || item.id });
  }

  /** Retries a transaction, investment, or entity sync item. */
  #retryItem(item: SyncItem): void {
    if (item.source === "transaction") APIs.budget.retryTransaction(item.id);
    else if (item.source === "investmentAccount" || item.source === "investmentMonth") APIs.accounts.retry(item.source, item.id);
    else if (this.#isAccountSyncItem(item)) APIs.accounts.retry(item.source, item.id);
    else if (item.kind) APIs.budget.retryEntity(item.kind, item.id);
  }

  /** Discards a transaction, investment, or entity sync item. */
  #discardItem(item: SyncItem): void {
    if (item.source === "transaction") APIs.budget.discardTransactionChange(item.id);
    else if (item.source === "investmentAccount" || item.source === "investmentMonth") APIs.accounts.discard(item.source, item.id);
    else if (this.#isAccountSyncItem(item)) APIs.accounts.discard(item.source, item.id);
    else if (item.kind) APIs.budget.discardEntityChange(item.kind, item.id);
  }

  /** Returns the human-readable object name used by the discard confirmation. */
  #discardLabel(item: SyncItem): string {
    if (item.source === "transaction") return "transaction change";
    if (this.#isInvestmentMonth(item)) return "investment update";
    if (this.#isAccountSyncItem(item)) return "account update";
    if (item.source === "investmentAccount") return "investment account";
    return item.kind ?? "entity";
  }

  /** Retries all retryable synchronization items except unresolved conflicts. */
  #handleRetryAll(): void {
    APIs.getSyncItems().filter((item) => item.retrying || item.status === "failed").forEach((item) => {
      if (item.failureCode !== "conflict") this.#retryItem(item);
    });
    this.#render();
  }

  #itemTitle(item: SyncItem): string {
    if (item.source === "transaction") return `${item.operation === "update" ? "Update" : item.operation === "delete" ? "Delete" : "New"} transaction`;
    if (item.source === "investmentAccount") return "New investment account";
    if (this.#isInvestmentMonth(item)) return "Investment monthly update";
    if (item.source === "accountMonth") {
      const account = this.#accountForSyncItem(item);
      return account?.type === "debt" ? "Debt monthly update" : account ? "Investment monthly update" : "Account monthly update";
    }
    if (item.source === "accountBalance") return "Delete account balance";
    if (item.source === "account") return `${item.operation === "archive" ? "Archive" : "Update"} account`;
    return `${item.operation === "archive" ? "Archive" : item.operation === "reactivate" ? "Reactivate" : "New"} ${item.kind ? ({ category: "category", vendor: "vendor", assignment: "assignment" } as Record<EntityKind, string>)[item.kind] : "entity"}`;
  }

  #itemDetail(item: SyncItem): string {
    if (item.source === "transaction") return this.#transactionDescription(item.record as BudgetTransaction);
    if (this.#isInvestmentMonth(item) || item.source === "accountMonth") {
      const accountName = this.#recordString(item, "accountName") || this.#accountForSyncItem(item)?.name || "";
      return `${this.#recordString(item, "month")} · ${accountName} · ${money(this.#recordNumber(item, "balance"))}`;
    }
    return this.#recordString(item, "name");
  }

  #itemStatus(item: SyncItem): string {
    if (item.waitingForOnline) return "Offline · Waiting to sync";
    if (item.retrying) return this.#retryDescription(item);
    if (item.status === "failed") return `Needs attention · ${item.error}`;
    if (item.status === "syncing") return "Syncing…";
    return "Waiting to sync";
  }

  #columns(): DataTableColumn<SyncTableRow>[] {
    return [
      { key: "change", title: "Change", cellClass: ["primary"], formatter: (value) => escapeHTML(value) },
      { key: "detail", title: "Details", formatter: (value) => escapeHTML(value) },
      { key: "status", title: "Status", formatter: (value) => escapeHTML(value) },
      { key: "actions", title: "Actions", formatter: (value) => String(value ?? "") },
    ];
  }
}

interface SyncTableRow {
  id: string;
  change: string;
  detail: string;
  status: string;
  actions: string;
}

if (!customElements.get("sync-screen")) customElements.define("sync-screen", SyncScreen);
