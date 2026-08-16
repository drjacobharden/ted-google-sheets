import type { BudgetTransaction } from "../api/budget-api";

export interface MonthlyTransactionSummaryRow {
  monthId: string;
  spend: number | null;
  income: number | null;
  netBalance: number | null;
  hasData: boolean;
}

export type MonthlyTransactionSummaries = Record<
  number,
  MonthlyTransactionSummaryRow[]
>;

export interface MonthlyTransactionSummaryOptions {
  today?: Date;
}

/** Returns the signed dollar change in net balance when both months have data. */
export function monthlyNetDifference(
  current: MonthlyTransactionSummaryRow,
  previous: MonthlyTransactionSummaryRow | undefined,
): number | null {
  return current.hasData
    && previous?.hasData
    && current.netBalance !== null
    && previous.netBalance !== null
    ? current.netBalance - previous.netBalance
    : null;
}

interface MonthlyAccumulator {
  spend: number;
  income: number;
  hasExpense: boolean;
  hasIncome: boolean;
}

function parseDateId(value: string): { year: number; month: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;

  return { year, month };
}

function monthId(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Builds complete January–December transaction summaries through the current year. */
export function buildMonthlyTransactionSummaries(
  transactions: ReadonlyArray<BudgetTransaction>,
  options: MonthlyTransactionSummaryOptions = {},
): MonthlyTransactionSummaries {
  const currentYear = (options.today ?? new Date()).getFullYear();
  const monthly = new Map<string, MonthlyAccumulator>();
  let earliestYear = currentYear;

  transactions.forEach((transaction) => {
    const date = parseDateId(transaction.date);
    const amount = Number(transaction.amount);
    if (!date || date.year > currentYear || !Number.isFinite(amount)) return;

    earliestYear = Math.min(earliestYear, date.year);
    const id = monthId(date.year, date.month);
    const accumulator = monthly.get(id) ?? {
      spend: 0,
      income: 0,
      hasExpense: false,
      hasIncome: false,
    };

    if (transaction.type === "expense") {
      accumulator.spend += amount;
      accumulator.hasExpense = true;
    } else if (transaction.type === "income") {
      accumulator.income += amount;
      accumulator.hasIncome = true;
    } else {
      return;
    }
    monthly.set(id, accumulator);
  });

  const summaries: MonthlyTransactionSummaries = {};
  for (let year = earliestYear; year <= currentYear; year += 1) {
    summaries[year] = Array.from({ length: 12 }, (_, index) => {
      const id = monthId(year, index + 1);
      const accumulator = monthly.get(id);
      if (!accumulator) {
        return {
          monthId: id,
          spend: null,
          income: null,
          netBalance: null,
          hasData: false,
        };
      }

      const spend = accumulator.hasExpense ? accumulator.spend : 0;
      const income = accumulator.hasIncome ? accumulator.income : 0;
      return {
        monthId: id,
        spend,
        income,
        netBalance: income - spend,
        hasData: true,
      };
    });
  }

  return summaries;
}
