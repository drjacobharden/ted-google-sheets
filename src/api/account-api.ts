import type { BudgetAPIContract, SyncItem } from "./budget-api";
import type { DebtAPIContract } from "./debt-api";
import type { InvestmentAPIContract, InvestmentMonthInput } from "./investment-api";
import { monthEnd } from "../utilities/investment-returns";

export type AccountType = "investment" | "debt";
export type AccountActivityType = "contribution" | "payment" | "borrowing";
export interface Account { id: string; name: string; type: AccountType; assignmentId: string; active: boolean; source?: "manual" | "paycheck"; interestRate?: number; lender?: string; createdAt: string; updatedAt: string; }
export interface AccountBalance { id: string; accountId: string; month: string; asOfDate: string; balance: number; notes: string; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string; }
export interface AccountActivity { id: string; accountId: string; date: string; month: string; amount: number; activityType: AccountActivityType; flowType?: "external" | "transfer"; transferId?: string; counterpartyAccountId?: string; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string; }
export interface AccountMonth { accountId: string; month: string; balance: AccountBalance | null; activity: AccountActivity[]; }
export interface AccountMonthInput { accountId: string; month: string; balance: number | string; notes?: string; balanceId?: string; asOfDate?: string; existingActivity?: AccountActivity[]; activity?: Array<Partial<AccountActivity> & Pick<AccountActivity, "amount" | "activityType">>; }

export interface AccountAPIContract {
  accounts(): Account[]; balances(): AccountBalance[]; activity(): AccountActivity[];
  monthData(accountId: string, month: string): AccountMonth | null;
  load(options?: { refresh?: boolean }): Promise<void>;
  saveAccount(input: Partial<Account> & Pick<Account, "name" | "type">): Promise<Account>;
  archiveAccount(id: string): Promise<Account>; saveMonth(input: AccountMonthInput): Promise<AccountMonth | null>;
  queueImportedMonths(inputs: AccountMonthInput[]): unknown[]; awaitImportedMonths(ids: string[], onProgress?: (progress: { completed: number; total: number }) => void): Promise<string[]>;
  deleteActivity(id: string): Promise<void>; applyBootstrapData(data: unknown): void;
  getSyncItems(): SyncItem[]; retry(source: string, id: string): void; discard(source: string, id: string): void;
}

/** Shared UI-facing account contract. Legacy APIs are transitional persistence adapters only. */
export function AccountAPI(investment: InvestmentAPIContract, debt: DebtAPIContract, _budget: BudgetAPIContract): AccountAPIContract {
  const accounts = (): Account[] => [...investment.accounts().map((item) => ({ ...item, type: "investment" as const })), ...debt.accounts().map((item) => ({ ...item, type: "debt" as const }))].sort((a, b) => a.name.localeCompare(b.name));
  const balances = (): AccountBalance[] => [...investment.balances(), ...debt.balances().map((item) => ({ ...item, accountId: item.debtAccountId }))].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const activity = (): AccountActivity[] => [...investment.contributions().map((item) => ({ ...item, activityType: "contribution" as const })), ...debt.payments().map((item) => ({ ...item, accountId: item.debtAccountId, activityType: item.kind }))].sort((a, b) => a.date.localeCompare(b.date));
  const accountFor = (id: string) => accounts().find((item) => item.id === id) || null;
  const monthData = (accountId: string, month: string): AccountMonth | null => accountFor(accountId) ? { accountId, month, balance: balances().find((item) => item.accountId === accountId && item.month === month) || null, activity: activity().filter((item) => item.accountId === accountId && item.month === month) } : null;
  const load = async (options = {}) => { await Promise.all([investment.load(options), debt.load(options)]); };
  const saveAccount = async (input: Partial<Account> & Pick<Account, "name" | "type">): Promise<Account> => {
    if (input.type === "debt") { const record = input.id ? await debt.updateAccount({ ...input, id: input.id }) : debt.addAccount(input); return { ...record, type: "debt" }; }
    const record = input.id ? await investment.updateAccount({ ...input, id: input.id }) : investment.addAccount({ ...input, source: input.source || "manual" }); return { ...record, type: "investment" };
  };
  const archiveAccount = async (id: string): Promise<Account> => { const account = accountFor(id); if (!account) throw new Error("Account not found."); return account.type === "debt" ? { ...(await debt.archiveAccount(id)), type: "debt" } : { ...(await investment.archiveAccount(id)), type: "investment" }; };
  const saveMonth = async (input: AccountMonthInput): Promise<AccountMonth | null> => {
    const account = accountFor(input.accountId); if (!account) throw new Error("Choose an account.");
    if (account.type === "investment") {
      const existing = investment.monthData(input.accountId, input.month);
      const contributions = (input.activity || []).filter((item) => item.activityType === "contribution").map((item) => ({ id: item.id, amount: item.amount, date: item.date, flowType: item.flowType, transferId: item.transferId, counterpartyAccountId: item.counterpartyAccountId }));
      investment.queueMonth({ ...input as InvestmentMonthInput, existingContributions: existing?.contributions, contributions });
      const value = investment.monthData(input.accountId, input.month); return value ? { ...value, activity: value.contributions.map((item) => ({ ...item, activityType: "contribution" as const })) } : null;
    }
    const balance = await debt.saveBalance({ debtAccountId: input.accountId, balance: Number(input.balance), asOfDate: input.asOfDate || monthEnd(input.month), notes: input.notes, id: input.balanceId });
    const next = input.activity || [];
    await Promise.all((input.existingActivity || []).filter((item) => !next.some((nextItem) => nextItem.id === item.id)).map((item) => debt.deletePayment(item.id)));
    await Promise.all(next.map((item) => debt.savePayment({ ...item, debtAccountId: input.accountId, kind: item.activityType === "borrowing" ? "borrowing" : "payment", date: item.date || `${input.month}-15` })));
    return { accountId: input.accountId, month: input.month, balance: { ...balance, accountId: input.accountId }, activity: activity().filter((item) => item.accountId === input.accountId && item.month === input.month) };
  };
  const deleteActivity = async (id: string) => { const record = activity().find((item) => item.id === id); if (!record) return; if (record.activityType === "contribution") throw new Error("Investment activity is saved as part of its reporting month."); await debt.deletePayment(id); };
  const applyBootstrapData = (data: unknown) => { investment.applyBootstrapData(data); debt.applyBootstrapData(data); };
  const queueImportedMonths = (inputs: AccountMonthInput[]) => investment.queueImportedMonths(inputs.map((input) => ({ ...input as InvestmentMonthInput, existingContributions: (input.existingActivity || []).filter((item) => item.activityType === "contribution"), contributions: (input.activity || []).filter((item) => item.activityType === "contribution") })) as any);
  return { accounts, balances, activity, monthData, load, saveAccount, archiveAccount, saveMonth, queueImportedMonths, awaitImportedMonths: (ids, progress) => investment.awaitImportedMonths(ids, progress), deleteActivity, applyBootstrapData, getSyncItems: () => investment.getSyncItems(), retry: (source, id) => investment.retry(source as "investmentAccount" | "investmentMonth", id), discard: (source, id) => investment.discard(source as "investmentAccount" | "investmentMonth", id) };
}
