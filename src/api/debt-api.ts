import type { BudgetAPIContract } from "./budget-api";
import { now, readStorageRecords, uuid, writeStorageArray } from "../utilities/data-utilities";
import { monthEnd } from "../utilities/investment-returns";

export interface DebtAccount {
  id: string; name: string; assignmentId: string; active: boolean;
  interestRate: number; lender: string;
  createdAt: string; updatedAt: string;
}
export interface DebtBalance {
  id: string; debtAccountId: string; month: string; asOfDate: string;
  balance: number; notes: string; createdAt: string; createdBy: string;
  updatedAt: string; updatedBy: string;
}
export interface DebtPayment {
  id: string; debtAccountId: string; date: string; month: string; amount: number;
  kind: "payment" | "borrowing";
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
}
export interface DebtData { accounts: DebtAccount[]; balances: DebtBalance[]; payments: DebtPayment[] }
export interface DebtAPIContract {
  accounts(): DebtAccount[];
  balances(): DebtBalance[];
  payments(): DebtPayment[];
  applyBootstrapData(data: unknown): DebtData;
  load(options?: { refresh?: boolean }): Promise<DebtData>;
  addAccount(input: Partial<DebtAccount> & Pick<DebtAccount, "name">): DebtAccount;
  updateAccount(input: Partial<DebtAccount> & Pick<DebtAccount, "id">): Promise<DebtAccount>;
  archiveAccount(id: string): Promise<DebtAccount>;
  saveBalance(input: Partial<DebtBalance> & Pick<DebtBalance, "debtAccountId" | "balance" | "asOfDate">): Promise<DebtBalance>;
  savePayment(input: Partial<DebtPayment> & Pick<DebtPayment, "debtAccountId" | "date" | "amount">): Promise<DebtPayment>;
  deletePayment(id: string): Promise<void>;
}

export function DebtAPI(budget: BudgetAPIContract): DebtAPIContract {
  const accountKey = "myFinance.debtAccounts.v1";
  const balanceKey = "myFinance.debtBalances.v1";
  const outboxKey = "myFinance.debtOutbox.v1";
  const paymentKey = "myFinance.debtPayments.v1";
  const shared = budget.SHARED_ASSIGNMENT_ID || "00000000-0000-4000-8000-000000000101";
  let loaded = false;
  const emit = () => window.dispatchEvent(new CustomEvent("budget:debts-changed"));
  const request = async (action: string, body: Record<string, unknown>) => {
    const endpoint = budget.getConfig().endpoint;
    if (!endpoint) return null;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...body }), redirect: "follow" });
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "Debt sync failed.");
    return payload?.data ?? payload;
  };
  const normalizeAccount = (item: any): DebtAccount => ({ id: item.id, name: String(item.name || "").trim(), assignmentId: item.assignmentId || shared, active: item.active !== false, interestRate: Number(item.interestRate || 0), lender: String(item.lender || "").trim(), createdAt: item.createdAt, updatedAt: item.updatedAt });
  const normalizeBalance = (item: any): DebtBalance => {
    const asOfDate = String(item.asOfDate || "");
    const month = String(item.month || asOfDate.slice(0, 7));
    return { id: item.id, debtAccountId: item.debtAccountId, month, asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? asOfDate : monthEnd(month), balance: Number(item.balance || 0), notes: item.notes || "", createdAt: item.createdAt, createdBy: item.createdBy, updatedAt: item.updatedAt, updatedBy: item.updatedBy };
  };
  const normalizePayment = (item: any): DebtPayment => ({ id: item.id, debtAccountId: item.debtAccountId, date: String(item.date || ""), month: String(item.month || item.date?.slice(0, 7) || ""), amount: Number(item.amount || 0), kind: item.kind === "borrowing" ? "borrowing" : "payment", createdAt: item.createdAt, createdBy: item.createdBy, updatedAt: item.updatedAt, updatedBy: item.updatedBy });
  const accounts = () => readStorageRecords(accountKey).map(normalizeAccount).sort((a, b) => a.name.localeCompare(b.name));
  const balances = () => readStorageRecords(balanceKey).map(normalizeBalance).sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const payments = () => readStorageRecords(paymentKey).map(normalizePayment).sort((a, b) => a.date.localeCompare(b.date));
  const queue = (kind: "account" | "balance" | "payment" | "paymentDelete", record: any) => { const pending = readStorageRecords(outboxKey).filter((item: any) => !(item.kind === kind && item.record.id === record.id)); writeStorageArray(outboxKey, [...pending, { kind, record }]); void flush(); };
  const flush = async () => { if (!budget.getConfig().endpoint || navigator.onLine === false) return; const pending = readStorageRecords(outboxKey) as any[]; for (const item of pending) { try { const action = item.kind === "account" ? "saveDebtAccount" : item.kind === "balance" ? "saveDebtBalance" : item.kind === "payment" ? "saveDebtPayment" : "deleteDebtPayment"; const body = item.kind === "account" ? { account: item.record } : item.kind === "balance" ? { balance: item.record } : item.kind === "payment" ? { payment: item.record } : { id: item.record.id }; await request(action, body); writeStorageArray(outboxKey, readStorageRecords(outboxKey).filter((entry: any) => !(entry.kind === item.kind && entry.record.id === item.record.id))); } catch { return; } } };
  const data = (): DebtData => ({ accounts: accounts(), balances: balances(), payments: payments() });
  const applyBootstrapData = (value: any): DebtData => {
    const pending = readStorageRecords(outboxKey);
    const pendingAccounts = new Map(pending.filter((item: any) => item.kind === "account").map((item: any) => [item.record.id, normalizeAccount(item.record)]));
    const pendingBalances = new Map(pending.filter((item: any) => item.kind === "balance").map((item: any) => [item.record.id, normalizeBalance(item.record)]));
    const pendingPayments = new Map(pending.filter((item: any) => item.kind === "payment").map((item: any) => [item.record.id, normalizePayment(item.record)]));
    const deletedPayments = new Set(pending.filter((item: any) => item.kind === "paymentDelete").map((item: any) => item.record.id));
    const unifiedAccounts = Array.isArray(value?.accounts) ? value.accounts.filter((item: any) => item?.type === "debt") : value?.debtAccounts;
    const unifiedBalances = Array.isArray(value?.accountBalances) ? value.accountBalances.filter((item: any) => (unifiedAccounts || []).some((account: any) => account.id === item.accountId)) : value?.debtBalances;
    const unifiedActivity = Array.isArray(value?.accountActivity) ? value.accountActivity.filter((item: any) => (unifiedAccounts || []).some((account: any) => account.id === item.accountId)) : value?.debtPayments;
    if (Array.isArray(unifiedAccounts)) writeStorageArray(accountKey, [...unifiedAccounts.map(normalizeAccount).filter((item: DebtAccount) => !pendingAccounts.has(item.id)), ...pendingAccounts.values()]);
    if (Array.isArray(unifiedBalances)) writeStorageArray(balanceKey, [...unifiedBalances.map(normalizeBalance).filter((item: DebtBalance) => !pendingBalances.has(item.id)), ...pendingBalances.values()]);
    if (Array.isArray(unifiedActivity)) writeStorageArray(paymentKey, [...unifiedActivity.map((item: any) => normalizePayment({ ...item, debtAccountId: item.debtAccountId || item.accountId, kind: item.kind || item.activityType })).filter((item: DebtPayment) => !pendingPayments.has(item.id) && !deletedPayments.has(item.id)), ...pendingPayments.values()]);
    loaded = true; emit(); return data();
  };
  const load = async (options: { refresh?: boolean } = {}) => {
    if (loaded && !options.refresh) return data();
    if (budget.getConfig().endpoint) {
      const [serverAccounts, serverBalances, serverActivity] = await Promise.all([request("listAccounts", {}), request("listAccountBalances", {}), request("listAccountActivity", {})]);
      applyBootstrapData({ accounts: serverAccounts, accountBalances: serverBalances, accountActivity: serverActivity });
    }
    loaded = true; emit(); return data();
  };
  const validateAccount = (input: any): DebtAccount => {
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Enter a debt name.");
    const interestRate = Number(input.interestRate || 0);
    if (!Number.isFinite(interestRate) || interestRate < 0) throw new Error("Enter a nonnegative interest rate.");
    return { id: input.id || uuid(), name, assignmentId: input.assignmentId || shared, active: input.active !== false, interestRate, lender: String(input.lender || "").trim(), createdAt: input.createdAt || now(), updatedAt: now() };
  };
  const addAccount = (input: any) => {
    const record = validateAccount(input); writeStorageArray(accountKey, [...accounts(), record]); emit();
    queue("account", record); return record;
  };
  const updateAccount = async (input: any) => {
    const existing = accounts().find((item) => item.id === input.id); if (!existing) throw new Error("Debt account not found.");
    const record = validateAccount({ ...existing, ...input });
    writeStorageArray(accountKey, accounts().map((item) => item.id === record.id ? record : item)); queue("account", record); emit(); return record;
  };
  const archiveAccount = async (id: string) => updateAccount({ id, active: false });
  const saveBalance = async (input: any) => {
    const account = accounts().find((item) => item.id === input.debtAccountId && item.active !== false); if (!account) throw new Error("Choose an active debt account.");
    const asOfDate = String(input.asOfDate || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error("Choose a balance date.");
    const amount = Number(input.balance); if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a nonnegative debt balance.");
    const month = asOfDate.slice(0, 7); const user = budget.getActiveUser(); if (!user) throw new Error("Choose an app user first.");
    const existing = balances().find((item) => item.debtAccountId === input.debtAccountId && item.month === month); const timestamp = now();
    const record = normalizeBalance({ ...existing, ...input, id: existing?.id || input.id || uuid(), month, balance: Math.round(amount * 100) / 100, createdAt: existing?.createdAt || timestamp, createdBy: existing?.createdBy || user.id, updatedAt: timestamp, updatedBy: user.id });
    writeStorageArray(balanceKey, [...balances().filter((item) => item.id !== record.id), record]); emit();
    queue("balance", record); return record;
  };
  const savePayment = async (input: any) => { const account = accounts().find((item) => item.id === input.debtAccountId && item.active !== false); if (!account) throw new Error("Choose an active debt account."); const date = String(input.date || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a payment date."); const amount = Number(input.amount); if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive payment amount."); const user = budget.getActiveUser(); if (!user) throw new Error("Choose an app user first."); const existing = payments().find((item) => item.id === input.id); const timestamp = now(); const record = normalizePayment({ ...existing, ...input, id: existing?.id || uuid(), date, month: date.slice(0, 7), amount: Math.round(amount * 100) / 100, createdAt: existing?.createdAt || timestamp, createdBy: existing?.createdBy || user.id, updatedAt: timestamp, updatedBy: user.id }); writeStorageArray(paymentKey, [...payments().filter((item) => item.id !== record.id), record]); queue("payment", record); emit(); return record; };
  const deletePayment = async (id: string) => { if (!payments().some((item) => item.id === id)) throw new Error("Debt payment not found."); writeStorageArray(paymentKey, payments().filter((item) => item.id !== id)); queue("paymentDelete", { id }); emit(); };
  window.addEventListener("online", () => { void flush(); });
  return { accounts, balances, payments, applyBootstrapData, load, addAccount, updateAccount, archiveAccount, saveBalance, savePayment, deletePayment };
}
