import type { DebtAPIContract } from "./debt-api";
import type { InvestmentAPIContract } from "./investment-api";

export type AccountType = "investment" | "debt";
export type AccountActivityType = "contribution" | "payment" | "borrowing";

export interface Account { id: string; name: string; type: AccountType; assignmentId: string; active: boolean; source?: "manual" | "paycheck"; interestRate?: number; lender?: string; createdAt: string; updatedAt: string; }
export interface AccountBalance { id: string; accountId: string; month: string; asOfDate: string; balance: number; notes: string; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string; }
export interface AccountActivity { id: string; accountId: string; date: string; month: string; amount: number; activityType: AccountActivityType; flowType?: "external" | "transfer"; transferId?: string; counterpartyAccountId?: string; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string; }

/**
 * The normalized account read model. Investment and debt APIs remain temporary
 * UI adapters; both are hydrated from the same server bootstrap payload.
 */
export interface AccountAPIContract {
  accounts(): Account[];
  balances(): AccountBalance[];
  activity(): AccountActivity[];
  applyBootstrapData(data: unknown): void;
}

export function AccountAPI(investment: InvestmentAPIContract, debt: DebtAPIContract): AccountAPIContract {
  const accounts = (): Account[] => [
    ...investment.accounts().map((item) => ({ ...item, type: "investment" as const })),
    ...debt.accounts().map((item) => ({ ...item, type: "debt" as const })),
  ];
  const balances = (): AccountBalance[] => [
    ...investment.balances(),
    ...debt.balances().map((item) => ({ ...item, accountId: item.debtAccountId })),
  ];
  const activity = (): AccountActivity[] => [
    ...investment.contributions().map((item) => ({ ...item, activityType: "contribution" as const })),
    ...debt.payments().map((item) => ({ ...item, accountId: item.debtAccountId, activityType: item.kind })),
  ];
  return { accounts, balances, activity, applyBootstrapData: (data) => { investment.applyBootstrapData(data); debt.applyBootstrapData(data); } };
}
