import type { Account } from "../api/account-api";
import type { BudgetTransaction } from "../api/budget-api";
import { reportingTransactions } from "./activity-effects";

export interface SpendingHeatmapDay {
  id: string;
  date: string;
  year: number;
  dayOfYear: number;
  week: number;
  weekday: number;
  spend: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface AnnualSpendingHeatmap {
  year: number;
  days: SpendingHeatmapDay[];
  hasData: boolean;
  variant?: "spending" | "investment";
}

const DAY_MS = 86_400_000;

function dayCount(year: number): number {
  return Math.round(
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS,
  );
}

function elapsedDayCount(year: number): number {
  const today = new Date();
  const currentYear = today.getFullYear();
  if (year < currentYear) return dayCount(year);
  if (year > currentYear) return 0;

  const start = Date.UTC(year, 0, 1);
  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return Math.floor((todayUtc - start) / DAY_MS) + 1;
}

function parseDate(value: string): Date | null {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
    ? date
    : null;
}

function quantile(values: number[], position: number): number {
  if (!values.length) return 0;
  const index = (values.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return values[lower]! + (values[upper]! - values[lower]!) * weight;
}

function levelForSpend(
  spend: number,
  thresholds: readonly [number, number, number],
): 0 | 1 | 2 | 3 | 4 {
  if (spend <= 0) return 0;
  if (spend >= thresholds[2]) return 4;
  if (spend >= thresholds[1]) return 3;
  if (spend >= thresholds[0]) return 2;
  return 1;
}

export function buildAnnualHeatmapFromDailyAmounts(
  amounts: ReadonlyArray<{ date: string; amount: number }>,
  year: number,
  variant: "spending" | "investment" = "spending",
): AnnualSpendingHeatmap {
  // The current year is intentionally limited to elapsed calendar days. This
  // keeps future dates from reading as no-spend days in both the heatmap and
  // the insight analysis that consumes the same dataset.
  const daysInYear = elapsedDayCount(year);
  const start = Date.UTC(year, 0, 1);
  const amountsByDate = new Map<string, number>();
  for (const item of amounts) {
    const date = parseDate(item.date);
    const amount = Number(item.amount);
    if (!date || date.getUTCFullYear() !== year || !Number.isFinite(amount)) continue;
    amountsByDate.set(item.date, (amountsByDate.get(item.date) ?? 0) + amount);
  }

  const positiveSpends = [...amountsByDate.values()]
    .map((value) => Math.max(0, value))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  const thresholds: [number, number, number] = [
    quantile(positiveSpends, 0.25),
    quantile(positiveSpends, 0.5),
    quantile(positiveSpends, 0.75),
  ];
  const startWeekday = new Date(start).getUTCDay();

  const days = Array.from({ length: daysInYear }, (_, index) => {
    const date = new Date(start + index * DAY_MS);
    const id = date.toISOString().slice(0, 10);
    const spend = Math.max(0, amountsByDate.get(id) ?? 0);
    return {
      id,
      date: id,
      year,
      dayOfYear: index,
      // Most years occupy 52 columns. Years whose weekday alignment needs a
      // 53rd calendar week keep it so the final week can render completely.
      week: Math.floor((index + startWeekday) / 7),
      weekday: date.getUTCDay(),
      spend,
      level: levelForSpend(spend, thresholds),
    } satisfies SpendingHeatmapDay;
  });

  return { year, days, hasData: days.some((day) => day.spend > 0), variant };
}

/** Builds one selected year's daily spending heatmap, including zero-spend days. */
export function buildAnnualSpendingHeatmap(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  year: number,
): AnnualSpendingHeatmap {
  return buildAnnualHeatmapFromDailyAmounts(
    reportingTransactions(transactions, accounts)
      .filter((transaction) => transaction.type === "expense")
      .map((transaction) => ({
        date: transaction.date,
        amount: Number(transaction.amount),
      })),
    year,
    "spending",
  );
}
