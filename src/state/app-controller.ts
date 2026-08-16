import { APIs } from "../api/api";
import type { BudgetTransaction } from "../api/budget-api";
import { appState, type BudgetOverviewDerivedState } from "./app-state";
import { buildSpendTrendSeries, type SpendTrendPeriod } from "../utilities/spend-trend";
import { buildMonthlyTransactionSummaries } from "../utilities/monthly-transaction-summary";
import { buildAnnualBudgetOverviews } from "../utilities/annual-budget-overview";
import { buildAnnualSummaryCards } from "../utilities/annual-summary-cards";
import { buildAnnualSpendTrendSeries } from "../utilities/annual-spend-trend";

let transactions: BudgetTransaction[] = [];
let loaded = false;
let referenceDataLoaded = false;
let appDataPromise: Promise<unknown> | null = null;
let budgetOverviewAssignmentId: string | null = null;

function emit<T>(name: string, detail?: T): void { window.dispatchEvent(new CustomEvent(name, { detail })); }
function buildBudgetOverviewState(
  sourceTransactions: BudgetTransaction[],
  assignmentId: string | null,
): BudgetOverviewDerivedState {
  const monthlyTransactionSummaries = buildMonthlyTransactionSummaries(sourceTransactions);
  const annualSummaryCards = buildAnnualSummaryCards(
    sourceTransactions,
    APIs.investment.accounts(),
    APIs.investment.contributions(),
    { assignmentId },
  );
  const years = [...new Set([
    ...Object.keys(monthlyTransactionSummaries).map(Number),
    ...Object.keys(annualSummaryCards.summaries).map(Number),
  ])].sort((a, b) => a - b);
  return {
    assignmentId,
    monthlyTransactionSummaries,
    annualSummaryCards: annualSummaryCards.summaries,
    annualSpendTrendsByYear: Object.fromEntries(years.map((year) => [
      year,
      {
        weekly: buildAnnualSpendTrendSeries(sourceTransactions, year, "weekly"),
        monthly: buildAnnualSpendTrendSeries(sourceTransactions, year, "monthly"),
      },
    ])),
    annualBudgetOverviews: buildAnnualBudgetOverviews(sourceTransactions, years),
  };
}

function updateBudgetOverviewState(): void {
  const filteredTransactions = budgetOverviewAssignmentId === null
    ? transactions
    : transactions.filter(
        (transaction) => transaction.assignmentId === budgetOverviewAssignmentId,
      );
  appState.set(
    "budgetOverview",
    buildBudgetOverviewState(filteredTransactions, budgetOverviewAssignmentId),
  );
}

function updateDerivedTransactionState(): void {
  const currentTrends = {
    weekly: buildSpendTrendSeries(transactions, "weekly"),
    monthly: buildSpendTrendSeries(transactions, "monthly"),
  };
  appState.set("spendTrends", currentTrends);
  const monthlyTransactionSummaries = buildMonthlyTransactionSummaries(transactions);
  appState.set(
    "monthlyTransactionSummaries",
    monthlyTransactionSummaries,
  );
  const currentYear = new Date().getFullYear();
  const annualSummaryCards = buildAnnualSummaryCards(
    transactions,
    APIs.investment.accounts(),
    APIs.investment.contributions(),
  );
  const years = [...new Set([
    ...Object.keys(monthlyTransactionSummaries).map(Number),
    ...Object.keys(annualSummaryCards.summaries).map(Number),
  ])].sort((a, b) => a - b);
  appState.set("spendTrendsByYear", Object.fromEntries(years.map((year) => [
    year,
    year === currentYear
      ? currentTrends
      : {
          weekly: buildSpendTrendSeries(transactions, "weekly", {
            today: new Date(year + 1, 0, 1),
          }),
          monthly: buildSpendTrendSeries(transactions, "monthly", {
            today: new Date(year + 1, 0, 1),
          }),
        },
  ])));
  appState.set("annualSpendTrendsByYear", Object.fromEntries(years.map((year) => [
    year,
    {
      weekly: buildAnnualSpendTrendSeries(transactions, year, "weekly"),
      monthly: buildAnnualSpendTrendSeries(transactions, year, "monthly"),
    },
  ])));
  appState.set(
    "annualBudgetOverviews",
    buildAnnualBudgetOverviews(transactions, years),
  );
  appState.set("annualSummaryCards", annualSummaryCards.summaries);
  appState.set(
    "hasPaycheckDeductionHistory",
    annualSummaryCards.hasPaycheckDeductionHistory,
  );
  updateBudgetOverviewState();
}
function upsert(items: BudgetTransaction[]): void {
  const incoming = new Map(items.map(item => [item.id, item]));
  transactions = transactions.filter(item => !incoming.has(item.id)).concat(items);
  updateDerivedTransactionState();
}

updateDerivedTransactionState();

export async function initializeData(options: { refresh?: boolean; startup?: boolean } = {}): Promise<unknown> {
  if (options.refresh) { appDataPromise = null; loaded = false; referenceDataLoaded = false; }
  if (appDataPromise) return appDataPromise;
  const cached = APIs.budget.getCachedTransactions();
  if (!loaded && cached) { transactions = cached; loaded = true; updateDerivedTransactionState(); emit("budget:transactions-loaded", { source: "cache" }); }
  const connected = Boolean(APIs.budget.getConfig().endpoint);
  emit("budget:data-refresh-started", { source: cached ? "cache" : "network", coldStart: Boolean(options.startup && connected && !loaded), connected });
  appDataPromise = APIs.budget.loadAppData({ refresh: options.refresh }).then(async data => {
    transactions = data.transactions ?? []; loaded = true; referenceDataLoaded = true; updateDerivedTransactionState();
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
window.addEventListener("budget:transaction-removed", (event: Event) => { transactions = transactions.filter(item => item.id !== (event as CustomEvent).detail.id); updateDerivedTransactionState(); });
window.addEventListener("budget:transaction-sync-changed", (event: Event) => {
  const queued = (event as CustomEvent).detail.transactions ?? [];
  const ids = new Set<string>(queued.map((item: BudgetTransaction) => item.id));
  transactions = transactions.filter(item => !item.syncStatus || ids.has(item.id)); upsert(queued);
});
window.addEventListener("budget:investments-changed", updateDerivedTransactionState);

export const appController = {
  initializeData,
  loadTransactions: (): Promise<unknown> => loaded ? Promise.resolve(transactions.slice()) : initializeData(),
  getTransactions: (): BudgetTransaction[] => transactions.slice(),
  getSpendTrend: (period: SpendTrendPeriod) => appState.get("spendTrends")[period],
  getSpendTrendsByYear: () => appState.get("spendTrendsByYear"),
  getAnnualSpendTrendsByYear: () => appState.get("annualSpendTrendsByYear"),
  getMonthlyTransactionSummaries: () => appState.get("monthlyTransactionSummaries"),
  getAnnualBudgetOverviews: () => appState.get("annualBudgetOverviews"),
  getAnnualSummaryCards: () => appState.get("annualSummaryCards"),
  hasPaycheckDeductionHistory: () => appState.get("hasPaycheckDeductionHistory"),
  getBudgetOverview: () => appState.get("budgetOverview"),
  getBudgetOverviewAssignments: () => {
    const assignments = new Map<string, string>();
    transactions.forEach((transaction) => {
      if (!transaction.assignmentId) return;
      assignments.set(
        transaction.assignmentId,
        transaction.assignment || transaction.assignmentId,
      );
    });
    APIs.budget.listAllPeople().forEach((assignment) => {
      if (!assignments.has(assignment.id)) assignments.set(assignment.id, assignment.name);
    });
    return [...assignments]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  setBudgetOverviewAssignment: (assignmentId: string | null): void => {
    if (budgetOverviewAssignmentId === assignmentId) return;
    budgetOverviewAssignmentId = assignmentId;
    updateBudgetOverviewState();
  },
  getTransaction: (id: string): BudgetTransaction | null => transactions.find(item => item.id === id) ?? null,
  areTransactionsLoaded: (): boolean => loaded,
  isReferenceDataLoaded: (): boolean => referenceDataLoaded,
  renameEntityTransactions(kind: "category" | "vendor" | "assignment", id: string, name: string): void {
    const idField = { category: "categoryId", vendor: "vendorId", assignment: "assignmentId" }[kind] as keyof BudgetTransaction;
    const nameField = { category: "category", vendor: "vendor", assignment: "assignment" }[kind] as keyof BudgetTransaction;
    transactions = transactions.map(item => item[idField] === id ? { ...item, [nameField]: name } : item);
    updateDerivedTransactionState();
  },
};
