import type { Account } from "../api/account-api";
import type { BudgetTransaction } from "../api/budget-api";
import { reportingTransactions } from "./activity-effects";

export interface SpendingCalendarMonth {
  id: string;
  year: number;
  month: number;
  label: string;
  quarter: 1 | 2 | 3 | 4;
  income: number;
  spend: number;
  savings: number;
  balance: number;
  hasData: boolean;
}

export interface SpendingCalendarQuarter {
  quarter: 1 | 2 | 3 | 4;
  total: number;
}

export interface AnnualSpendingCalendar {
  year: number;
  months: SpendingCalendarMonth[];
  quarters: SpendingCalendarQuarter[];
  hasData: boolean;
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

/** Builds selected-year monthly income, spending, and net-savings balances. */
export function buildAnnualSpendingCalendar(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  year: number,
): AnnualSpendingCalendar {
  const totals = Array.from({ length: 12 }, () => ({ income: 0, spend: 0 }));
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  for (const transaction of reportingTransactions(transactions, accounts)) {
    const date = parseDate(transaction.date);
    const amount = Number(transaction.amount);
    if (!date || date.getUTCFullYear() !== year || !Number.isFinite(amount)) continue;
    const total = totals[date.getUTCMonth()];
    if (!total) continue;
    if (transaction.type === "income") total.income += amount;
    else if (transaction.type === "expense") total.spend += amount;
  }

  const months = totals.map((total, index) => {
    const month = index + 1;
    const balance = total.income - total.spend;
    return {
      id: `${year}-${String(month).padStart(2, "0")}`,
      year,
      month,
      label: monthFormatter.format(new Date(Date.UTC(year, index, 1))),
      quarter: Math.floor(index / 3) + 1 as 1 | 2 | 3 | 4,
      income: total.income,
      spend: total.spend,
      savings: balance,
      balance,
      hasData: total.income !== 0 || total.spend !== 0,
    } satisfies SpendingCalendarMonth;
  });

  const quarters = Array.from({ length: 4 }, (_, index) => ({
    quarter: index + 1 as 1 | 2 | 3 | 4,
    total: months
      .slice(index * 3, index * 3 + 3)
      .reduce((sum, month) => sum + month.balance, 0),
  }));

  return {
    year,
    months,
    quarters,
    hasData: months.some((month) => month.hasData),
  };
}
