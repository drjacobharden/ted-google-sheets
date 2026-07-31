import type { BudgetTransaction } from "../api/budget-api";
import type {
  InvestmentAccount,
  InvestmentBalance,
  InvestmentSource,
} from "../api/investment-api";
import type { RouteName, RouteParams } from "../router/types";

export interface DateRangeValue {
  preset?: string;
  start: string;
  end: string;
  label?: string;
}

export interface DateRangePickerElement extends HTMLElement {
  value: DateRangeValue;
}

export interface LegacyAppRouter {
  navigate(name: RouteName, params?: RouteParams): boolean;
  updateParams(changes?: Record<string, string | null | undefined>): void;
  currentRoute(): RouteName;
  currentParams(): RouteParams;
  setNavigationGuard(
    guard: ((target: { name: RouteName; params: RouteParams; hash: string }) => boolean) | null,
  ): void;
}

export interface LegacyBudgetUI {
  getTransactions(): BudgetTransaction[];
  areTransactionsLoaded(): boolean;
  isReferenceDataLoaded(): boolean;
}

export interface InvestmentMetrics {
  balance: number;
  contributions: number;
  growth: number;
  covered: number;
  stale: number;
  total: number;
}

export interface LegacyInvestmentView {
  card(label: string, value: string, hint?: string): string;
  latestByAccount(end?: string): Map<string, InvestmentBalance>;
  metrics(range: DateRangeValue): InvestmentMetrics;
  monthRangeFromDates(range: Partial<DateRangeValue>): DateRangeValue;
  mountTrend(
    container: HTMLElement,
    options: { range: Partial<DateRangeValue>; includeContributions: boolean },
  ): () => void;
  sourceLabel(source: InvestmentSource): string;
  formatMonth(month: string): string;
}

export interface LegacyTransactionRow {
  create(transaction: BudgetTransaction): HTMLTableRowElement;
}

type RuntimeWindow = Window & {
  AppRouter?: LegacyAppRouter;
  BudgetUI?: LegacyBudgetUI;
  InvestmentView?: LegacyInvestmentView;
  TransactionRow?: LegacyTransactionRow;
};

/** Returns the legacy router while routing remains hosted by the existing shell. */
export function appRouter(): LegacyAppRouter {
  const router = (window as RuntimeWindow).AppRouter;
  if (!router) throw new Error("The application router is not available.");
  return router;
}

/** Returns the legacy UI state bridge used by screens during the staged migration. */
export function budgetUI(): LegacyBudgetUI | undefined {
  return (window as RuntimeWindow).BudgetUI;
}

/** Returns the existing investment visualization helpers. */
export function investmentView(): LegacyInvestmentView {
  const view = (window as RuntimeWindow).InvestmentView;
  if (!view) throw new Error("Investment view helpers are not available.");
  return view;
}

/** Returns the existing transaction-row renderer. */
export function transactionRow(): LegacyTransactionRow {
  const renderer = (window as RuntimeWindow).TransactionRow;
  if (!renderer) throw new Error("The transaction row renderer is not available.");
  return renderer;
}

/** Returns a date-range event detail after validating its external shape. */
export function dateRangeDetail(event: Event): DateRangeValue | null {
  if (!(event instanceof CustomEvent) || typeof event.detail !== "object" || event.detail === null) {
    return null;
  }
  const detail = event.detail as Record<string, unknown>;
  if (typeof detail.start !== "string" || typeof detail.end !== "string") return null;
  return {
    start: detail.start,
    end: detail.end,
    preset: typeof detail.preset === "string" ? detail.preset : undefined,
    label: typeof detail.label === "string" ? detail.label : undefined,
  };
}

/** Narrows an event target to an element before querying ancestors. */
export function eventTargetElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

/** Narrows a route parameter to one of the supported investment sources. */
export function isInvestmentSource(value: FormDataEntryValue | null): value is InvestmentSource {
  return value === "manual" || value === "paycheck";
}

/** Keeps the investment account type referenced for strict declaration consumers. */
export function isInvestmentAccount(value: unknown): value is InvestmentAccount {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.name === "string";
}
