import type { BudgetTransaction } from "../api/budget-api";

export type SpendTrendPeriod = "weekly" | "monthly";

export interface SpendTrendPoint {
  periodStart: string;
  periodEnd: string;
  total: number;
  weightedAverage: number;
  sampleSize: number;
}

export interface SpendTrendSeries {
  period: SpendTrendPeriod;
  points: SpendTrendPoint[];
  currentPeriodStart: string;
  currentPeriodSpend: number;
  latestWeightedAverage: number | null;
  weightedAverageChange: number | null;
  hasExpenseHistory: boolean;
}

export interface SpendTrendOptions {
  today?: Date;
}

interface PeriodConfig {
  visiblePeriods: number;
  windowSize: number;
  start(value: Date): Date;
  add(value: Date, amount: number): Date;
  offset(start: Date, end: Date): number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfWeek(value: Date): Date {
  const date = startOfDay(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addWeeks(value: Date, amount: number): Date {
  return addDays(value, amount * 7);
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function dateId(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateId(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dateId(date) === value ? date : null;
}

function weightedAverage(values: number[]): number {
  const weightedTotal = values.reduce((sum, value, index) => sum + value * (index + 1), 0);
  const weightTotal = (values.length * (values.length + 1)) / 2;
  return weightTotal ? weightedTotal / weightTotal : 0;
}

const PERIODS: Record<SpendTrendPeriod, PeriodConfig> = {
  weekly: {
    visiblePeriods: 12,
    windowSize: 12,
    start: startOfWeek,
    add: addWeeks,
    offset: (start, end) => Math.round(
      (startOfDay(end).getTime() - startOfDay(start).getTime()) / (7 * DAY_MS),
    ),
  },
  monthly: {
    visiblePeriods: 6,
    windowSize: 6,
    start: startOfMonth,
    add: addMonths,
    offset: (start, end) =>
      (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth(),
  },
};

/** Builds completed-period spending totals and a recent-biased rolling average. */
export function buildSpendTrendSeries(
  transactions: ReadonlyArray<BudgetTransaction>,
  period: SpendTrendPeriod,
  options: SpendTrendOptions = {},
): SpendTrendSeries {
  const config = PERIODS[period];
  const today = startOfDay(options.today ?? new Date());
  const currentPeriod = config.start(today);
  const currentPeriodId = dateId(currentPeriod);
  const todayId = dateId(today);
  const expenses = transactions.flatMap((transaction) => {
    if (transaction.type !== "expense") return [];
    const date = parseDateId(transaction.date);
    const amount = Number(transaction.amount);
    return date && Number.isFinite(amount) && amount > 0
      ? [{ date, dateId: transaction.date, amount }]
      : [];
  });
  const currentPeriodSpend = expenses
    .filter((expense) => expense.dateId >= currentPeriodId && expense.dateId <= todayId)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const completedExpenses = expenses.filter((expense) => expense.date < currentPeriod);
  const result: SpendTrendSeries = {
    period,
    points: [],
    currentPeriodStart: currentPeriodId,
    currentPeriodSpend,
    latestWeightedAverage: null,
    weightedAverageChange: null,
    hasExpenseHistory: expenses.length > 0,
  };
  if (!completedExpenses.length) return result;

  const firstExpensePeriod = config.start(
    completedExpenses.reduce(
      (earliest, expense) => expense.date < earliest ? expense.date : earliest,
      completedExpenses[0].date,
    ),
  );
  const lastCompletedPeriod = config.add(currentPeriod, -1);
  const desiredVisibleStart = config.add(
    lastCompletedPeriod,
    -(config.visiblePeriods - 1),
  );
  const visibleStart = firstExpensePeriod > desiredVisibleStart
    ? firstExpensePeriod
    : desiredVisibleStart;
  const desiredCalculationStart = config.add(
    visibleStart,
    -(config.windowSize - 1),
  );
  const calculationStart = firstExpensePeriod > desiredCalculationStart
    ? firstExpensePeriod
    : desiredCalculationStart;
  const numberOfPeriods = config.offset(calculationStart, lastCompletedPeriod) + 1;
  const totals = Array.from({ length: numberOfPeriods }, () => 0);

  completedExpenses.forEach((expense) => {
    const index = config.offset(calculationStart, config.start(expense.date));
    if (index >= 0 && index < totals.length) totals[index] += expense.amount;
  });

  const allPoints = totals.map((total, index) => {
    const start = config.add(calculationStart, index);
    const sample = totals.slice(Math.max(0, index - config.windowSize + 1), index + 1);
    return {
      periodStart: dateId(start),
      periodEnd: dateId(addDays(config.add(start, 1), -1)),
      total,
      weightedAverage: weightedAverage(sample),
      sampleSize: sample.length,
    } satisfies SpendTrendPoint;
  });

  result.points = allPoints.slice(-config.visiblePeriods);
  result.latestWeightedAverage = result.points.at(-1)?.weightedAverage ?? null;
  result.weightedAverageChange = result.points.length > 1
    ? result.points.at(-1)!.weightedAverage - result.points.at(-2)!.weightedAverage
    : null;
  return result;
}
