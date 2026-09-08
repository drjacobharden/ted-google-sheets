import type { BudgetTransaction } from "../api/budget-api";
import type { Account, AccountActivity } from "../api/account-api";
import { reportingTransactions } from "./activity-effects";

export function calculateInvestmentSavings(
  transactions: BudgetTransaction[],
  accounts: Account[],
  activity: AccountActivity[],
  range: { start?: string; end?: string } = {},
) {
  const start = String(range.start || "");
  const end = String(range.end || "");
  const inRange = (date: string) => (!start || date >= start) && (!end || date <= end);
  const inActivityRange = (month: string) =>
    (!start || month >= start.slice(0, 7)) &&
    (!end || month <= end.slice(0, 7));
  const report=reportingTransactions(transactions,accounts);
  const income = report.filter((item) => item.type === "income" && inRange(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const spending = report.filter((item) => item.type === "expense" && inRange(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const contributions = activity.filter((item) => item.activityType === "contribution" && inActivityRange(item.month));
  const paycheckContributions = contributions.filter((item) => item.source === "deduction").reduce((sum, item) => sum + item.amount, 0);
  const manualContributions = contributions.filter((item) => item.source !== "deduction").reduce((sum, item) => sum + item.amount, 0);
  return { income, spending, budgetSurplus: income - spending, paycheckContributions, manualContributions, totalSavings: income - spending };
}

export function calculateInvestmentGrowth(openingBalance: number | null | undefined, endingBalance: number | null | undefined, flows: Array<{ amount?: number }>): number | null {
  if (openingBalance == null || endingBalance == null) return null;
  return Number(endingBalance) - Number(openingBalance) - flows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}
