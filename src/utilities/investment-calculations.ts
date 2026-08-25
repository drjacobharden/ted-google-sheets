import type { BudgetTransaction } from "../api/budget-api";
import type { Account, AccountActivity } from "../api/account-api";

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
  const income = transactions.filter((item) => item.type === "income" && inRange(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const spending = transactions.filter((item) => item.type !== "income" && inRange(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const sources = new Map(accounts.filter((item) => item.type === "investment").map((item) => [item.id, item.source]));
  const contributions = activity.filter((item) => item.activityType === "contribution" && item.flowType !== "transfer" && inActivityRange(item.month));
  const paycheckContributions = contributions.filter((item) => sources.get(item.accountId) === "paycheck").reduce((sum, item) => sum + item.amount, 0);
  const manualContributions = contributions.filter((item) => sources.get(item.accountId) !== "paycheck").reduce((sum, item) => sum + item.amount, 0);
  return { income, spending, budgetSurplus: income - spending, paycheckContributions, manualContributions, totalSavings: income - spending + paycheckContributions };
}

export function calculateInvestmentGrowth(openingBalance: number | null | undefined, endingBalance: number | null | undefined, flows: Array<{ amount?: number }>): number | null {
  if (openingBalance == null || endingBalance == null) return null;
  return Number(endingBalance) - Number(openingBalance) - flows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}
