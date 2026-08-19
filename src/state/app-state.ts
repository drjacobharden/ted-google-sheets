import type { SpendTrendPeriod, SpendTrendSeries } from "../utilities/spend-trend";
import type { MonthlyTransactionSummaries } from "../utilities/monthly-transaction-summary";
import type { AnnualBudgetOverviews } from "../utilities/annual-budget-overview";
import type { AnnualSummaryCards } from "../utilities/annual-summary-cards";
import type { AnnualSpendTrendSeries } from "../utilities/annual-spend-trend";
import type { BudgetingRouteName } from "../router/types";

export type SpendTrendsByYear = Record<
  number,
  Record<SpendTrendPeriod, SpendTrendSeries>
>;

export type AnnualSpendTrendsByYear = Record<
  number,
  Record<SpendTrendPeriod, AnnualSpendTrendSeries>
>;

export interface BudgetOverviewDerivedState {
  assignmentId: string | null;
  annualSpendTrendsByYear: AnnualSpendTrendsByYear;
  monthlyTransactionSummaries: MonthlyTransactionSummaries;
  annualBudgetOverviews: AnnualBudgetOverviews;
  annualSummaryCards: AnnualSummaryCards;
}

export interface BudgetingContext {
  year: number;
  assignmentId: string | null;
  lastRoute: BudgetingRouteName;
  lastParams: Record<string, string>;
}

export type StorageScope = "local" | "session";

export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PersistenceRule<Value> {
  storage: StorageScope;
  key: string;
  validate(value: unknown): value is Value;
}

export type PersistenceConfig<State extends object> = {
  [Key in keyof State]?: PersistenceRule<State[Key]>;
};

export type StateListener<Value> = (value: Value, previous: Value) => void;
export type StorageResolver = (scope: StorageScope) => StateStorage | null;

function browserStorage(scope: StorageScope): StateStorage | null {
  try {
    return scope === "local"
      ? globalThis.localStorage
      : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/** A small typed observable store with opt-in, validated browser persistence. */
export class StateStore<State extends object> {
  #state: State;
  #persistence: PersistenceConfig<State>;
  #resolveStorage: StorageResolver;
  #listeners = new Map<keyof State, Set<StateListener<unknown>>>();

  constructor(
    initialState: State,
    persistence: PersistenceConfig<State> = {},
    resolveStorage: StorageResolver = browserStorage,
  ) {
    this.#state = { ...initialState };
    this.#persistence = persistence;
    this.#resolveStorage = resolveStorage;
    this.#hydrate();
  }

  get<Key extends keyof State>(key: Key): State[Key] {
    return this.#state[key];
  }

  set<Key extends keyof State>(key: Key, value: State[Key]): void {
    const previous = this.#state[key];
    if (Object.is(previous, value)) return;

    this.#state[key] = value;
    this.#persist(key, value);

    this.#listeners
      .get(key)
      ?.forEach((listener) => listener(value, previous));
  }

  subscribe<Key extends keyof State>(
    key: Key,
    listener: StateListener<State[Key]>,
  ): () => void {
    let listeners = this.#listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.#listeners.set(key, listeners);
    }

    listeners.add(listener as StateListener<unknown>);

    return () => {
      listeners?.delete(listener as StateListener<unknown>);
      if (listeners?.size === 0) this.#listeners.delete(key);
    };
  }

  #hydrate(): void {
    (Object.keys(this.#persistence) as (keyof State)[]).forEach((key) => {
      const rule = this.#persistence[key];
      if (!rule) return;

      try {
        const raw = this.#resolveStorage(rule.storage)?.getItem(rule.key);
        if (raw === null || raw === undefined) return;

        const value: unknown = JSON.parse(raw);
        if (rule.validate(value)) this.#state[key] = value;
      } catch {
        // Invalid JSON and unavailable browser storage both fall back to defaults.
      }
    });
  }

  #persist<Key extends keyof State>(key: Key, value: State[Key]): void {
    const rule = this.#persistence[key];
    if (!rule) return;

    try {
      this.#resolveStorage(rule.storage)?.setItem(
        rule.key,
        JSON.stringify(value),
      );
    } catch {
      // In-memory state remains authoritative when storage is unavailable.
    }
  }
}

export interface AppState {
  activeDropdownKey: string | null;
  spendTrends: Record<SpendTrendPeriod, SpendTrendSeries | null>;
  spendTrendsByYear: SpendTrendsByYear;
  annualSpendTrendsByYear: AnnualSpendTrendsByYear;
  monthlyTransactionSummaries: MonthlyTransactionSummaries;
  annualBudgetOverviews: AnnualBudgetOverviews;
  annualSummaryCards: AnnualSummaryCards;
  hasPaycheckDeductionHistory: boolean;
  budgetOverview: BudgetOverviewDerivedState;
  budgetingContext: BudgetingContext;
}

function isBudgetingContext(value: unknown): value is BudgetingContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<BudgetingContext>;
  return (
    Number.isInteger(context.year) &&
    (context.assignmentId === null ||
      typeof context.assignmentId === "string") &&
    typeof context.lastRoute === "string" &&
    [
      "budgeting/overview",
      "budgeting/transactions",
      "budgeting/categories",
      "budgeting/vendors",
      "budgeting/people",
      "budgeting/entity-detail",
      "budgeting/entity-archive",
    ].includes(context.lastRoute) &&
    Boolean(context.lastParams) &&
    typeof context.lastParams === "object" &&
    Object.values(context.lastParams).every(
      (item) => typeof item === "string",
    )
  );
}

const APP_STATE_PERSISTENCE: PersistenceConfig<AppState> = {
  budgetingContext: {
    storage: "session",
    key: "ted.budgeting-context",
    validate: isBudgetingContext,
  },
};

export const appState = new StateStore<AppState>(
  {
    activeDropdownKey: null,
    spendTrends: { weekly: null, monthly: null },
    spendTrendsByYear: {},
    annualSpendTrendsByYear: {},
    monthlyTransactionSummaries: {},
    annualBudgetOverviews: {},
    annualSummaryCards: {},
    hasPaycheckDeductionHistory: false,
    budgetOverview: {
      assignmentId: null,
      annualSpendTrendsByYear: {},
      monthlyTransactionSummaries: {},
      annualBudgetOverviews: {},
      annualSummaryCards: {},
    },
    budgetingContext: {
      year: new Date().getFullYear(),
      assignmentId: null,
      lastRoute: "budgeting/overview",
      lastParams: {},
    },
  },
  APP_STATE_PERSISTENCE,
);
