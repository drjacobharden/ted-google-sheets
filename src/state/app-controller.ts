import { APIs } from "../api/api";
import type { BudgetTransaction } from "../api/budget-api";

let transactions: BudgetTransaction[] = [];
let loaded = false;
let referenceDataLoaded = false;
let appDataPromise: Promise<unknown> | null = null;

function emit<T>(name: string, detail?: T): void { window.dispatchEvent(new CustomEvent(name, { detail })); }
function upsert(items: BudgetTransaction[]): void {
  const incoming = new Map(items.map(item => [item.id, item]));
  transactions = transactions.filter(item => !incoming.has(item.id)).concat(items);
}

export async function initializeData(options: { refresh?: boolean; startup?: boolean } = {}): Promise<unknown> {
  if (options.refresh) { appDataPromise = null; loaded = false; referenceDataLoaded = false; }
  if (appDataPromise) return appDataPromise;
  const cached = APIs.budget.getCachedTransactions();
  if (!loaded && cached) { transactions = cached; loaded = true; emit("budget:transactions-loaded", { source: "cache" }); }
  const connected = Boolean(APIs.budget.getConfig().endpoint);
  emit("budget:data-refresh-started", { source: cached ? "cache" : "network", coldStart: Boolean(options.startup && connected && !loaded), connected });
  appDataPromise = APIs.budget.loadAppData({ refresh: options.refresh }).then(async data => {
    transactions = data.transactions ?? []; loaded = true; referenceDataLoaded = true;
    await APIs.investment.load();
    emit("budget:transactions-loaded", { source: "server" });
    emit("budget:data-refresh-complete", { source: "server" });
    return data;
  }).catch((error: unknown) => {
    appDataPromise = null;
    if (!loaded) emit("budget:transactions-load-error", { error });
    emit("budget:data-refresh-failed", { error, showingCachedData: loaded, connected });
    emit("budget:api-warning", loaded ? "Showing saved data. Couldn’t refresh Google Sheets." : "Couldn’t load app data.");
    throw error;
  });
  return appDataPromise;
}

window.addEventListener("budget:reference-data-changed", () => { referenceDataLoaded = true; });
window.addEventListener("budget:transaction-queued", (event: Event) => upsert([(event as CustomEvent).detail.transaction]));
window.addEventListener("budget:transactions-queued", (event: Event) => upsert((event as CustomEvent).detail.transactions ?? []));
window.addEventListener("budget:transaction-saved", (event: Event) => upsert((event as CustomEvent).detail.saved ?? []));
window.addEventListener("budget:transaction-restored", (event: Event) => upsert([(event as CustomEvent).detail.transaction]));
window.addEventListener("budget:transaction-removed", (event: Event) => { transactions = transactions.filter(item => item.id !== (event as CustomEvent).detail.id); });
window.addEventListener("budget:transaction-sync-changed", (event: Event) => {
  const queued = (event as CustomEvent).detail.transactions ?? [];
  const ids = new Set<string>(queued.map((item: BudgetTransaction) => item.id));
  transactions = transactions.filter(item => !item.syncStatus || ids.has(item.id)); upsert(queued);
});

export const appController = {
  initializeData,
  loadTransactions: (): Promise<unknown> => loaded ? Promise.resolve(transactions.slice()) : initializeData(),
  getTransactions: (): BudgetTransaction[] => transactions.slice(),
  getTransaction: (id: string): BudgetTransaction | null => transactions.find(item => item.id === id) ?? null,
  areTransactionsLoaded: (): boolean => loaded,
  isReferenceDataLoaded: (): boolean => referenceDataLoaded,
  renameEntityTransactions(kind: "category" | "vendor" | "assignment", id: string, name: string): void {
    const idField = { category: "categoryId", vendor: "vendorId", assignment: "assignmentId" }[kind] as keyof BudgetTransaction;
    const nameField = { category: "category", vendor: "vendor", assignment: "assignment" }[kind] as keyof BudgetTransaction;
    transactions = transactions.map(item => item[idField] === id ? { ...item, [nameField]: name } : item);
  },
};
