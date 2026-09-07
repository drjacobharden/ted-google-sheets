import type { Account } from "../api/account-api";
import type { BudgetEntity, BudgetTransaction } from "../api/budget-api";
import { reportingTransactions } from "./activity-effects";

export interface CategorySpendingDatum {
  id: string;
  label: string;
  amount: number;
  previousAmount?: number | null;
}

export interface CategoryScatterDatum {
  id: string;
  label: string;
  transactionCount: number;
  averageTransaction: number;
  totalSpend: number;
}

function transactionYear(value: string): number | null {
  const match = String(value).match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? year
    : null;
}

/** Builds all selected-year expense totals, including categories below the top five. */
export function buildAnnualCategorySpending(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  categories: ReadonlyArray<BudgetEntity>,
  year: number,
): CategorySpendingDatum[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, CategorySpendingDatum>();
  const previousTotals = new Map<string, number>();

  for (const transaction of reportingTransactions(transactions, accounts)) {
    if (transaction.type !== "expense") continue;

    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount)) continue;
    const transactionYearValue = transactionYear(transaction.date);
    if (transactionYearValue !== year && transactionYearValue !== year - 1) continue;

    const id = String(transaction.categoryId || "uncategorized").trim() || "uncategorized";
    const label = categoryById.get(id)?.name?.trim() ||
      String(transaction.category || "").trim() ||
      "Uncategorized";
    if (transactionYearValue === year - 1) {
      previousTotals.set(id, (previousTotals.get(id) ?? 0) + amount);
      continue;
    }

    const current = totals.get(id);
    if (current) {
      current.amount += amount;
    } else {
      totals.set(id, { id, label, amount });
    }
  }

  return [...totals.values()].map((item) => ({
    ...item,
    // A new category has positive infinite growth from a zero prior-year base.
    previousAmount: previousTotals.get(item.id) ?? 0,
  })).sort((left, right) =>
    right.amount - left.amount ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id),
  );
}

/** Builds selected-year category totals for the spending behavior scatter chart. */
export function buildAnnualCategoryScatter(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  categories: ReadonlyArray<BudgetEntity>,
  year: number,
): CategoryScatterDatum[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, CategoryScatterDatum>();

  for (const transaction of reportingTransactions(transactions, accounts)) {
    if (transaction.type !== "expense") continue;

    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (transactionYear(transaction.date) !== year) continue;

    const id = String(transaction.categoryId || "uncategorized").trim() || "uncategorized";
    const label = categoryById.get(id)?.name?.trim() ||
      String(transaction.category || "").trim() ||
      "Uncategorized";
    const current = totals.get(id);
    if (current) {
      current.totalSpend += amount;
      current.transactionCount += 1;
      current.averageTransaction = current.totalSpend / current.transactionCount;
    } else {
      totals.set(id, {
        id,
        label,
        transactionCount: 1,
        averageTransaction: amount,
        totalSpend: amount,
      });
    }
  }

  return [...totals.values()].sort(
    (left, right) =>
      right.totalSpend - left.totalSpend ||
      right.transactionCount - left.transactionCount ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id),
  );
}
