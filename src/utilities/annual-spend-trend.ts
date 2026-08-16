import type { BudgetTransaction } from "../api/budget-api";
import type { SpendTrendPeriod } from "./spend-trend";

export interface AnnualSpendTrendPoint {
  date: string;
  periodStart: string;
  periodEnd: string;
  total: number | null;
  trend: number;
  isTrendAvailable: boolean;
  priorYearTrend: number | null;
}

export interface AnnualSpendTrendSeries {
  year: number;
  period: SpendTrendPeriod;
  points: AnnualSpendTrendPoint[];
  latestTrend: number | null;
  trendPercentChange: number | null;
  annualAverageTrend: number | null;
  priorAnnualAverageTrend: number | null;
  annualAveragePercentChange: number | null;
  comparisonPeriods: number;
  comparisonPeriodsUsed: number;
  hasExpenseHistory: boolean;
  hasPriorYearTrend: boolean;
}

export interface AnnualSpendTrendOptions {
  today?: Date;
}

const DAY_MS = 86_400_000;

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

function addDays(value: Date, amount: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function addMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function dateId(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDateId(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dateId(date) === value ? date : null;
}

function weightedAverage(values: number[]): number {
  const numerator = values.reduce((sum, value, index) => sum + value * (index + 1), 0);
  const denominator = (values.length * (values.length + 1)) / 2;
  return denominator ? numerator / denominator : 0;
}

function interpolate(values: Array<number | null>): number[] {
  const known = values.flatMap((value, index) => value === null ? [] : [{ index, value }]);
  if (!known.length) return values.map(() => 0);
  return values.map((value, index) => {
    if (value !== null) return value;
    let before: (typeof known)[number] | undefined;
    for (let knownIndex = known.length - 1; knownIndex >= 0; knownIndex -= 1) {
      if (known[knownIndex].index < index) {
        before = known[knownIndex];
        break;
      }
    }
    const after = known.find((point) => point.index > index);
    if (!before) return after!.value;
    if (!after) return before.value;
    const progress = (index - before.index) / (after.index - before.index);
    return before.value + (after.value - before.value) * progress;
  });
}

interface BasePoint {
  date: Date;
  start: Date;
  end: Date;
  total: number | null;
  trend: number;
  isTrendAvailable: boolean;
}

function buildYear(
  transactions: ReadonlyArray<BudgetTransaction>,
  year: number,
  period: SpendTrendPeriod,
  today: Date,
): { points: BasePoint[]; hasHistory: boolean } {
  const windowSize = period === "weekly" ? 12 : 6;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const isCurrentYear = year === today.getFullYear();
  const cutoff = isCurrentYear ? today : yearEnd;
  const firstPeriod = period === "weekly" ? startOfWeek(yearStart) : yearStart;
  const add = period === "weekly"
    ? (date: Date, amount: number) => addDays(date, amount * 7)
    : addMonths;
  const periodStart = period === "weekly" ? startOfWeek : startOfMonth;
  const allExpenses = transactions.flatMap((transaction) => {
    if (transaction.type !== "expense") return [];
    const date = parseDateId(transaction.date);
    const amount = Number(transaction.amount);
    return date && Number.isFinite(amount) && amount > 0 ? [{ date, amount }] : [];
  });
  const calculationStart = add(firstPeriod, -(windowSize - 1));
  const calculationPeriods: Date[] = [];
  for (let date = calculationStart; date < yearEnd; date = add(date, 1)) {
    calculationPeriods.push(date);
  }
  const totals = calculationPeriods.map(() => 0);
  const hasActual = calculationPeriods.map(() => false);
  allExpenses.forEach((expense) => {
    const start = periodStart(expense.date);
    const index = period === "weekly"
      ? Math.round((start.getTime() - calculationStart.getTime()) / (7 * DAY_MS))
      : (start.getFullYear() - calculationStart.getFullYear()) * 12
        + start.getMonth() - calculationStart.getMonth();
    if (index >= 0 && index < totals.length) {
      totals[index] += expense.amount;
      hasActual[index] = true;
    }
  });
  const trends: Array<number | null> = totals.map((_, index) => {
    const start = calculationPeriods[index];
    const end = add(start, 1);
    if (end > cutoff) return null;
    const hasHistory = hasActual.slice(0, index + 1).some(Boolean);
    if (!hasHistory) return null;
    return weightedAverage(totals.slice(Math.max(0, index - windowSize + 1), index + 1));
  });
  const visibleStartIndex = windowSize - 1;
  const visible = calculationPeriods
    .map((start, index) => ({ start, index }))
    .filter(({ start, index }) => index >= visibleStartIndex && start < yearEnd);
  const visibleTrends = interpolate(visible.map(({ index }) => trends[index]));
  const hasHistory = allExpenses.some(
    (expense) => expense.date >= yearStart && expense.date < yearEnd,
  );
  return {
    hasHistory,
    points: visible.map(({ start, index }, visibleIndex) => {
      const end = addDays(add(start, 1), -1);
      const displayDate = start < yearStart ? yearStart : start;
      return {
        date: displayDate,
        start,
        end,
        total: add(start, 1) <= cutoff && hasActual[index] ? totals[index] : null,
        trend: visibleTrends[visibleIndex],
        isTrendAvailable: hasHistory && add(start, 1) <= cutoff,
      };
    }),
  };
}

function normalizedDay(value: Date, year: number): number {
  return (value.getTime() - new Date(year, 0, 1).getTime())
    / (new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime());
}

function priorAt(points: BasePoint[], progress: number, year: number): number | null {
  if (!points.length) return null;
  const positions = points.map((point) => normalizedDay(point.date, year));
  const afterIndex = positions.findIndex((position) => position >= progress);
  if (afterIndex <= 0) return points[Math.max(0, afterIndex)].trend;
  if (afterIndex === -1) return points.at(-1)!.trend;
  const beforeIndex = afterIndex - 1;
  const span = positions[afterIndex] - positions[beforeIndex];
  const ratio = span ? (progress - positions[beforeIndex]) / span : 0;
  return points[beforeIndex].trend
    + (points[afterIndex].trend - points[beforeIndex].trend) * ratio;
}

/** Builds a full-year trend chart series with aligned prior-year trend values. */
export function buildAnnualSpendTrendSeries(
  transactions: ReadonlyArray<BudgetTransaction>,
  year: number,
  period: SpendTrendPeriod,
  options: AnnualSpendTrendOptions = {},
): AnnualSpendTrendSeries {
  const today = startOfDay(options.today ?? new Date());
  const current = buildYear(transactions, year, period, today);
  const prior = buildYear(transactions, year - 1, period, today);
  const comparisonPeriods = period === "weekly" ? 12 : 3;
  const available = current.points.filter((point) => point.isTrendAvailable);
  const observed = current.points.filter((point) => point.total !== null);
  const latest = available.at(-1);
  const latestIndex = latest ? current.points.indexOf(latest) : -1;
  const earliestIndex = observed.length
    ? current.points.indexOf(observed[0])
    : available.length
      ? current.points.indexOf(available[0])
      : -1;
  const comparisonIndex = latestIndex < 0
    ? -1
    : Math.max(earliestIndex, latestIndex - comparisonPeriods);
  const comparisonValue = comparisonIndex >= 0 ? current.points[comparisonIndex].trend : null;
  const latestTrend = latest?.trend ?? null;
  const annualAverageTrend = current.hasHistory
    ? current.points.reduce((sum, point) => sum + point.trend, 0) / current.points.length
    : null;
  const priorAnnualAverageTrend = prior.hasHistory
    ? prior.points.reduce((sum, point) => sum + point.trend, 0) / prior.points.length
    : null;
  return {
    year,
    period,
    points: current.points.map((point) => ({
      date: dateId(point.date),
      periodStart: dateId(point.start),
      periodEnd: dateId(point.end),
      total: point.total,
      trend: point.trend,
      isTrendAvailable: point.isTrendAvailable,
      priorYearTrend: prior.hasHistory
        ? priorAt(prior.points, normalizedDay(point.date, year), year - 1)
        : null,
    })),
    latestTrend,
    trendPercentChange: latestTrend !== null && comparisonValue !== null && comparisonValue !== 0
      ? ((latestTrend - comparisonValue) / comparisonValue) * 100
      : null,
    annualAverageTrend,
    priorAnnualAverageTrend,
    annualAveragePercentChange:
      annualAverageTrend !== null &&
      priorAnnualAverageTrend !== null &&
      priorAnnualAverageTrend !== 0
        ? ((annualAverageTrend - priorAnnualAverageTrend) / priorAnnualAverageTrend) * 100
        : null,
    comparisonPeriods,
    comparisonPeriodsUsed: latestIndex < 0 ? 0 : latestIndex - comparisonIndex,
    hasExpenseHistory: current.hasHistory,
    hasPriorYearTrend: prior.hasHistory,
  };
}
