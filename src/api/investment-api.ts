// @ts-nocheck
import {
  now,
  readStorageRecords,
  uuid,
  writeStorageArray,
} from "../utilities/data-utilities";

import type { BudgetTransaction } from "./budget-api";

export type InvestmentSource = "manual" | "paycheck";

export interface InvestmentAccount {
  id: string;
  name: string;
  source: InvestmentSource;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentBalance {
  id: string;
  accountId: string;
  month: string;
  balance: number;
  notes: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  accountName?: string;
  source?: InvestmentSource;
  createdByName?: string;
}

export interface InvestmentContribution {
  id: string;
  accountId: string;
  month: string;
  amount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  accountName?: string;
  source?: InvestmentSource;
}

export interface InvestmentMonth {
  accountId: string;
  month: string;
  balance: InvestmentBalance | null;
  contributions: InvestmentContribution[];
  accountName?: string;
  source?: InvestmentSource;
  syncOperationId?: string;
}

export interface InvestmentMonthInput {
  accountId: string;
  month: string;
  balance: number | string;
  notes?: string;
  balanceId?: string;
  existingContributions?: InvestmentContribution[];
  contributions?: Array<{ id?: string; amount: number | string }>;
}

export interface InvestmentData {
  accounts: InvestmentAccount[];
  balances: InvestmentBalance[];
  contributions: InvestmentContribution[];
}

export interface SavingsCalculation {
  income: number;
  spending: number;
  budgetSurplus: number;
  paycheckContributions: number;
  manualContributions: number;
  totalSavings: number;
}

export interface InvestmentConflict {
  id: string;
  draft: InvestmentMonth | null;
  current: InvestmentMonth | null;
  base: InvestmentMonth | null;
}

export interface InvestmentAPIContract {
  accounts(): InvestmentAccount[];
  balances(): InvestmentBalance[];
  contributions(): InvestmentContribution[];
  snapshots(): Array<InvestmentBalance & { contribution: number }>;
  monthData(accountId: string, month: string): InvestmentMonth | null;
  load(options?: { refresh?: boolean }): Promise<InvestmentData>;
  isLoaded(): boolean;
  applyBootstrapData(data: unknown): InvestmentData;
  addAccount(
    input: Partial<InvestmentAccount> & Pick<InvestmentAccount, "name" | "source">,
  ): InvestmentAccount;
  updateAccount(
    input: Partial<InvestmentAccount> & Pick<InvestmentAccount, "id">,
  ): Promise<InvestmentAccount>;
  archiveAccount(id: string): Promise<InvestmentAccount>;
  queueMonth(input: InvestmentMonthInput): InvestmentMonth | null;
  queueImportedMonths(inputs: InvestmentMonthInput[]): InvestmentMonth[];
  awaitImportedMonths(
    ids: string[],
    onProgress?: (progress: { completed: number; total: number }) => void,
  ): Promise<string[]>;
  queueSnapshots(
    inputs: Array<
      InvestmentMonthInput & { contribution?: number | string; id?: string }
    >,
  ): Array<InvestmentMonth | null>;
  getConflict(id: string): InvestmentConflict | null;
  resolveConflict(
    id: string,
    input: InvestmentMonthInput,
  ): InvestmentMonth | null;
  calculate(
    transactions: BudgetTransaction[],
    range?: { start?: string; end?: string },
  ): SavingsCalculation;
  calculateGrowth(
    openingBalance: number | null | undefined,
    endingBalance: number | null | undefined,
    periodFlows: Array<{ amount?: number; contribution?: number }>,
  ): number | null;
  hasUnsynced(): boolean;
  sync(): Promise<void> | null;
  retry(source: "investmentAccount" | "investmentMonth", id: string): void;
  discard(source: "investmentAccount" | "investmentMonth", id: string): void;
  getSyncItems(): import("./budget-api").SyncItem[];
}

/** Builds the investment API and initializes its local persistence and sync state. */
export function InvestmentAPI(budget: import("./budget-api").BudgetAPIContract): InvestmentAPIContract {
  const KEYS = Object.freeze({
    accounts: "myFinance.investmentAccounts.v1",
    balances: "myFinance.investmentBalances.v1",
    contributions: "myFinance.investmentContributions.v1",
    monthOutbox: "myFinance.investmentMonthOutbox.v1",
    accountOutbox: "myFinance.investmentAccountOutbox.v1",
    legacySnapshotsV2: "myFinance.investmentSnapshots.v2",
    legacySnapshotsV1: "myFinance.investmentSnapshots.v1",
    legacyOutboxV2: "myFinance.investmentSnapshotOutbox.v2",
    legacyOutboxV1: "myFinance.investmentSnapshotOutbox.v1",
  });
  const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];
  let syncPromise = null;
  let retryTimer = null;
  let bootstrapped = false;
  let loaded = false;
  let loadPromise = null;

  /** Handles the read operation for the investment data layer. */
  const read = (key) => readStorageRecords(key);
  /** Handles the write operation for the investment data layer. */
  const write = (key, value) => writeStorageArray(key, value);
  /** Handles the offline operation for the investment data layer. */
  const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  /** Handles the emit operation for the investment data layer. */
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  /** Handles the activeUser operation for the investment data layer. */
  const activeUser = () => budget.getActiveUser();
  /** Handles the endpoint operation for the investment data layer. */
  const endpoint = () => budget.getConfig().endpoint;
  /** Handles the monthKey operation for the investment data layer. */
  const monthKey = (accountId, month) => `${accountId}|${month}`;

  /** Handles the canonicalMonth operation for the investment data layer. */
  function canonicalMonth(value) {
    const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])/);
    return match ? `${match[1]}-${match[2]}` : "";
  }

  /** Handles the request operation for the investment data layer. */
  async function request(action, body) {
    const url = endpoint();
    if (!url) throw new Error("No Apps Script URL is configured.");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...body }), redirect: "follow" });
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    const payload = await response.json();
    if (payload?.ok === false) { const error = new Error(payload.error || "The Sheet returned an error."); error.isApiError = true; throw error; }
    return payload?.data ?? payload;
  }

  /** Handles the migrateAccount operation for the investment data layer. */
  function migrateAccount(account) {
    return { id: account.id, name: account.name, source: ["paycheck", "manual"].includes(account.source) ? account.source : "manual", active: account.active !== false, createdAt: account.createdAt, updatedAt: account.updatedAt };
  }
  /** Handles the migrateBalance operation for the investment data layer. */
  function migrateBalance(record) {
    return { id: record.id, accountId: record.accountId, month: canonicalMonth(record.month), balance: Number(record.balance || 0), notes: record.notes || "", createdAt: record.createdAt, createdBy: record.createdBy, updatedAt: record.updatedAt, updatedBy: record.updatedBy };
  }
  /** Handles the migrateContribution operation for the investment data layer. */
  function migrateContribution(record) {
    return { id: record.id, accountId: record.accountId, month: canonicalMonth(record.month), amount: Number(record.amount || 0), createdAt: record.createdAt, createdBy: record.createdBy, updatedAt: record.updatedAt, updatedBy: record.updatedBy };
  }
  /** Handles the legacyContribution operation for the investment data layer. */
  function legacyContribution(snapshot) {
    if (snapshot.contribution !== undefined) return Number(snapshot.contribution || 0);
    return Number(snapshot.employeeContribution || 0) + Number(snapshot.employerContribution || 0) + Number(snapshot.manualContribution || 0) - Number(snapshot.withdrawals || 0);
  }
  /** Handles the derivedContributionId operation for the investment data layer. */
  function derivedContributionId(id) {
    const compact = String(id).replace(/-/g, "").split("");
    if (compact.length !== 32) return uuid();
    compact[0] = ((parseInt(compact[0], 16) + 1) % 16).toString(16); compact[12] = "4"; compact[16] = "8";
    return `${compact.slice(0, 8).join("")}-${compact.slice(8, 12).join("")}-${compact.slice(12, 16).join("")}-${compact.slice(16, 20).join("")}-${compact.slice(20).join("")}`;
  }
  /** Handles the monthFromSnapshot operation for the investment data layer. */
  function monthFromSnapshot(snapshot) {
    if (!snapshot) return null;
    const balance = migrateBalance(snapshot);
    const amount = legacyContribution(snapshot);
    const contributions = amount === 0 ? [] : [migrateContribution({ ...snapshot, id: derivedContributionId(snapshot.id), amount })];
    return { accountId: snapshot.accountId, month: snapshot.month, balance, contributions };
  }
  /** Handles the migrateAccountOutbox operation for the investment data layer. */
  function migrateAccountOutbox(items) {
    return items.map((item) => ({ ...item, status: item.status === "syncing" ? "pending" : item.status, nextRetryAt: item.status === "syncing" ? 0 : item.nextRetryAt, record: migrateAccount(item.record) }));
  }
  /** Handles the migrateMonthOutbox operation for the investment data layer. */
  function migrateMonthOutbox(items) {
    return items.map((item) => ({ ...item, status: item.status === "syncing" ? "pending" : item.status, nextRetryAt: item.status === "syncing" ? 0 : item.nextRetryAt, revision: Math.max(1, Number(item.revision) || 1), draft: normalizeMonth(item.draft), base: normalizeMonth(item.base), current: normalizeMonth(item.current) }));
  }
  /** Handles the normalizeMonth operation for the investment data layer. */
  function normalizeMonth(value) {
    if (!value) return null;
    return { accountId: value.accountId, month: value.month, balance: value.balance ? migrateBalance(value.balance) : null, contributions: (value.contributions || []).map(migrateContribution) };
  }
  /** Handles the migrateLocalStorage operation for the investment data layer. */
  function migrateLocalStorage() {
    if (localStorage.getItem(KEYS.balances) === null) {
      const snapshots = read(KEYS.legacySnapshotsV2).length ? read(KEYS.legacySnapshotsV2) : read(KEYS.legacySnapshotsV1);
      write(KEYS.balances, snapshots.map(migrateBalance));
      write(KEYS.contributions, snapshots.flatMap((snapshot) => monthFromSnapshot(snapshot).contributions));
    }
    if (localStorage.getItem(KEYS.contributions) === null) write(KEYS.contributions, []);
    if (localStorage.getItem(KEYS.monthOutbox) === null) {
      const legacy = read(KEYS.legacyOutboxV2).length ? read(KEYS.legacyOutboxV2) : read(KEYS.legacyOutboxV1);
      const migrated = legacy.map((item) => ({
        id: item.record.id, accountId: item.record.accountId, month: item.record.month,
        draft: monthFromSnapshot(item.record), base: monthFromSnapshot(item.base), current: monthFromSnapshot(item.current),
        status: item.status === "syncing" ? "pending" : item.status, attempts: item.attempts || 0,
        nextRetryAt: item.status === "syncing" ? 0 : item.nextRetryAt || 0, error: item.error || "", failureCode: item.failureCode || "", revision: Math.max(1, Number(item.revision) || 1),
      }));
      write(KEYS.monthOutbox, migrated);
      const localBalances = read(KEYS.balances).map(migrateBalance); const localContributions = read(KEYS.contributions).map(migrateContribution);
      migrated.filter((item) => item.failureCode === "conflict" && item.current).forEach((item) => applyMonthToArrays(localBalances, localContributions, item.current));
      write(KEYS.balances, localBalances); write(KEYS.contributions, localContributions);
    }
    [KEYS.legacySnapshotsV2, KEYS.legacySnapshotsV1, KEYS.legacyOutboxV2, KEYS.legacyOutboxV1].forEach((key) => localStorage.removeItem(key));
  }
  migrateLocalStorage();

  /** Handles the accounts operation for the investment data layer. */
  function accounts() { return read(KEYS.accounts).map(migrateAccount).sort((a, b) => a.name.localeCompare(b.name)); }
  /** Handles the balances operation for the investment data layer. */
  function balances() { return read(KEYS.balances).map(migrateBalance).sort((a, b) => a.month.localeCompare(b.month)); }
  /** Handles the contributions operation for the investment data layer. */
  function contributions() { return read(KEYS.contributions).map(migrateContribution).sort((a, b) => String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id))); }
  /** Handles the accountOutbox operation for the investment data layer. */
  function accountOutbox() { return migrateAccountOutbox(read(KEYS.accountOutbox)); }
  /** Handles the monthOutbox operation for the investment data layer. */
  function monthOutbox() { return migrateMonthOutbox(read(KEYS.monthOutbox)); }
  /** Handles the hasUnsynced operation for the investment data layer. */
  function hasUnsynced() { return accountOutbox().length > 0 || monthOutbox().length > 0; }
  /** Handles the hydrateAccount operation for the investment data layer. */
  function hydrateAccount(account) { return migrateAccount(account); }
  /** Handles the hydrateBalance operation for the investment data layer. */
  function hydrateBalance(balance) {
    const migrated = migrateBalance(balance);
    const account = accounts().find((item) => item.id === migrated.accountId);
    const creator = budget
      ?.listUsers?.()
      .find((item) => item.id === migrated.createdBy);
    return {
      ...migrated,
      accountName: account?.name || "Unknown",
      source: account?.source || "manual",
      createdByName: creator
        ? `${creator.firstName || ""} ${creator.lastName || ""}`.trim()
        : "Unknown",
    };
  }
  /** Handles the hydrateContribution operation for the investment data layer. */
  function hydrateContribution(record) { const account = accounts().find((item) => item.id === record.accountId); return { ...migrateContribution(record), accountName: account?.name || "Unknown", source: account?.source || "manual" }; }
  /** Handles the rawMonthData operation for the investment data layer. */
  function rawMonthData(accountId, month) { const normalizedMonth = canonicalMonth(month); return { accountId, month: normalizedMonth, balance: balances().find((item) => item.accountId === accountId && item.month === normalizedMonth) || null, contributions: contributions().filter((item) => item.accountId === accountId && item.month === normalizedMonth) }; }
  /** Handles the monthData operation for the investment data layer. */
  function monthData(accountId, month) { return hydrateMonth(rawMonthData(accountId, month)); }
  /** Handles the hydrateMonth operation for the investment data layer. */
  function hydrateMonth(value) {
    if (!value) return null;
    const normalized = normalizeMonth(value);
    const account = accounts().find(
      (item) => item.id === normalized.accountId,
    );
    return {
      ...normalized,
      balance: normalized.balance
        ? hydrateBalance(normalized.balance)
        : null,
      contributions: normalized.contributions.map(hydrateContribution),
      accountName: account?.name || "Unknown",
      source: account?.source || "manual",
    };
  }
  /** Handles the snapshots operation for the investment data layer. */
  function snapshots() {
    return balances().map((balance) => ({ ...hydrateBalance(balance), contribution: contributions().filter((item) => item.accountId === balance.accountId && item.month === balance.month).reduce((sum, item) => sum + item.amount, 0) }));
  }
  /** Handles the applyMonthToArrays operation for the investment data layer. */
  function applyMonthToArrays(balanceRecords, contributionRecords, value) {
    if (!value) return;
    for (let index = balanceRecords.length - 1; index >= 0; index -= 1) if (balanceRecords[index].accountId === value.accountId && balanceRecords[index].month === value.month) balanceRecords.splice(index, 1);
    for (let index = contributionRecords.length - 1; index >= 0; index -= 1) if (contributionRecords[index].accountId === value.accountId && contributionRecords[index].month === value.month) contributionRecords.splice(index, 1);
    if (value.balance) balanceRecords.push(migrateBalance(value.balance));
    (value.contributions || []).forEach((item) => contributionRecords.push(migrateContribution(item)));
  }
  /** Handles the applyLocalMonth operation for the investment data layer. */
  function applyLocalMonth(value) { const balanceRecords = balances(); const contributionRecords = contributions(); applyMonthToArrays(balanceRecords, contributionRecords, value); write(KEYS.balances, balanceRecords); write(KEYS.contributions, contributionRecords); }

  /** Handles the applyServerData operation for the investment data layer. */
  function applyServerData(serverAccounts, serverBalances, serverContributions) {
    if (!Array.isArray(serverAccounts)) throw new Error("The sheet response did not include an investment account list.");
    if (!Array.isArray(serverBalances)) throw new Error("The sheet response did not include an investment balance list.");
    if (!Array.isArray(serverContributions)) throw new Error("The sheet response did not include an investment contribution list.");
    const pendingAccounts = new Map(accountOutbox().map((item) => [item.record.id, item.record]));
    write(KEYS.accounts, [...serverAccounts.filter((item) => !pendingAccounts.has(item.id)), ...pendingAccounts.values()]);
    const localBalances = serverBalances.map(migrateBalance); const localContributions = serverContributions.map(migrateContribution); const outbox = monthOutbox(); let repaired = false;
    outbox.forEach((item) => {
      const serverMonth = { accountId: item.accountId, month: item.month, balance: localBalances.find((entry) => entry.accountId === item.accountId && entry.month === item.month) || null, contributions: localContributions.filter((entry) => entry.accountId === item.accountId && entry.month === item.month) };
      if (item.failureCode === "conflict") { if (JSON.stringify(item.current) !== JSON.stringify(serverMonth)) { item.current = serverMonth; repaired = true; } applyMonthToArrays(localBalances, localContributions, serverMonth); }
      else applyMonthToArrays(localBalances, localContributions, item.draft);
    });
    write(KEYS.balances, localBalances); write(KEYS.contributions, localContributions); if (repaired) write(KEYS.monthOutbox, outbox);
    bootstrapped = true;
  }

  /** Handles the applyBootstrapData operation for the investment data layer. */
  function applyBootstrapData(data) {
    applyServerData(data?.investmentAccounts, data?.investmentBalances, data?.investmentContributions);
    loaded = true;
    emit("budget:investments-changed");
    emit("budget:investments-loaded");
    return { accounts: accounts().map(hydrateAccount), balances: balances().map(hydrateBalance), contributions: contributions().map(hydrateContribution) };
  }

  /** Handles the loadedData operation for the investment data layer. */
  function loadedData() {
    return { accounts: accounts().map(hydrateAccount), balances: balances().map(hydrateBalance), contributions: contributions().map(hydrateContribution) };
  }

  /** Handles the isLoaded operation for the investment data layer. */
  function isLoaded() { return loaded; }

  /** Handles the load operation for the investment data layer. */
  function load(options = {}) {
    if (loaded && !options.refresh) return Promise.resolve(loadedData());
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      if (endpoint() && (!bootstrapped || options.refresh)) {
        const [serverAccounts, serverBalances, serverContributions] = await Promise.all([request("listInvestmentAccounts", {}), request("listInvestmentBalances", {}), request("listInvestmentContributions", {})]);
        applyServerData(serverAccounts, serverBalances, serverContributions);
      }
      loaded = true;
      emit("budget:investments-changed");
      emit("budget:investments-loaded");
      return loadedData();
    })().finally(() => { loadPromise = null; });
    return loadPromise;
  }

  /** Handles the validateAccount operation for the investment data layer. */
  function validateAccount(input) {
    const name = String(input.name || "").trim(); if (!name) throw new Error("Enter an account name.");
    const source = String(input.source || "").toLowerCase(); if (!["paycheck", "manual"].includes(source)) throw new Error("Choose paycheck deduction or manual transfer.");
    return { id: input.id || uuid(), name, source, active: input.active !== false, createdAt: input.createdAt || now(), updatedAt: now() };
  }
  /** Handles the addAccount operation for the investment data layer. */
  function addAccount(input) {
    const record = validateAccount(input); const duplicate = accounts().find((item) => item.active !== false && item.name.toLowerCase() === record.name.toLowerCase()); if (duplicate) return hydrateAccount(duplicate);
    write(KEYS.accounts, [...accounts(), record]); if (endpoint()) { write(KEYS.accountOutbox, [...accountOutbox(), { record, status: "pending", attempts: 0, nextRetryAt: 0, error: "" }]); scheduleNext(); }
    emit("budget:investments-changed"); emit("budget:sync-changed"); return hydrateAccount(record);
  }
  /** Handles the updateAccount operation for the investment data layer. */
  async function updateAccount(input) { const existing = accounts().find((item) => item.id === input.id); if (!existing) throw new Error("That investment account could not be found."); const record = validateAccount({ ...existing, ...input, id: existing.id, createdAt: existing.createdAt }); const saved = endpoint() ? await request("updateInvestmentAccount", { account: record }) : record; write(KEYS.accounts, accounts().map((item) => item.id === saved.id ? saved : item)); emit("budget:investments-changed"); return hydrateAccount(saved); }
  /** Handles the archiveAccount operation for the investment data layer. */
  async function archiveAccount(id) { if (monthOutbox().some((item) => item.accountId === id)) throw new Error("Sync or discard this account’s pending monthly updates first."); const saved = endpoint() ? await request("archiveInvestmentAccount", { id }) : { ...accounts().find((item) => item.id === id), active: false }; write(KEYS.accounts, accounts().map((item) => item.id === id ? saved : item)); emit("budget:investments-changed"); return saved; }

  /** Handles the validateMonthInput operation for the investment data layer. */
  function validateMonthInput(input, base) {
    const user = activeUser(); if (!user) throw new Error("Choose an app user first.");
    const month = String(input.month || ""); if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) throw new Error("Choose a reporting month.");
    if (!accounts().some((account) => account.id === input.accountId && account.active !== false)) throw new Error("Choose an active investment account.");
    const numericBalance = Number(input.balance); if (!Number.isFinite(numericBalance) || numericBalance < 0) throw new Error("Enter a nonnegative ending balance.");
    const timestamp = now(); const baseBalance = base?.balance || null;
    const balance = { id: baseBalance?.id || input.balanceId || uuid(), accountId: input.accountId, month, balance: Math.round(numericBalance * 100) / 100, notes: String(input.notes || "").trim(), createdAt: baseBalance?.createdAt || timestamp, createdBy: baseBalance?.createdBy || user.id, updatedAt: timestamp, updatedBy: user.id };
    const known = new Map([...(base?.contributions || []), ...(input.existingContributions || [])].map((item) => [item.id, item]));
    const flowRecords = (input.contributions || []).filter((item) => item.amount !== "" && Number(item.amount) !== 0).map((item) => {
      const amount = Number(item.amount); if (!Number.isFinite(amount) || amount === 0) throw new Error("Contribution and withdrawal amounts must be positive values.");
      const existing = item.id ? known.get(item.id) : null;
      return { id: item.id || uuid(), accountId: input.accountId, month, amount: Math.round(amount * 100) / 100, createdAt: existing?.createdAt || timestamp, createdBy: existing?.createdBy || user.id, updatedAt: timestamp, updatedBy: user.id };
    });
    return { accountId: input.accountId, month, balance, contributions: flowRecords };
  }
  /** Handles the queueMonth operation for the investment data layer. */
  function queueMonth(input) {
    const outbox = monthOutbox(); const key = monthKey(input.accountId, input.month); const index = outbox.findIndex((item) => monthKey(item.accountId, item.month) === key); const pending = index >= 0 ? outbox[index] : null;
    if (pending?.failureCode === "conflict") throw new Error("Review this month’s Sheet conflict before saving another change.");
    const base = pending?.base || rawMonthData(input.accountId, input.month); const draft = validateMonthInput(input, pending?.draft || base);
    const operation = { id: pending?.id || uuid(), accountId: input.accountId, month: input.month, draft, base, current: null, revision: (pending?.revision || 0) + 1, status: "pending", attempts: 0, nextRetryAt: 0, error: "", failureCode: "" };
    applyLocalMonth(draft); if (endpoint()) { if (index >= 0) outbox[index] = operation; else outbox.push(operation); write(KEYS.monthOutbox, outbox); scheduleNext(); }
    emit("budget:investments-changed"); emit("budget:sync-changed"); return hydrateMonth(draft);
  }
  /** Handles the queueImportedMonths operation for the investment data layer. */
  function queueImportedMonths(inputs) {
    if (!Array.isArray(inputs) || !inputs.length) throw new Error("Choose at least one ready investment month.");
    const outbox = monthOutbox();
    const seen = new Set();
    const operations = [];
    inputs.forEach((input) => {
      const key = monthKey(input.accountId, input.month);
      if (seen.has(key)) throw new Error("An investment account-month can only be imported once.");
      seen.add(key);
      const index = outbox.findIndex((item) => monthKey(item.accountId, item.month) === key);
      const pending = index >= 0 ? outbox[index] : null;
      if (pending?.failureCode === "conflict") throw new Error("Resolve the existing Sheet conflict before importing this month.");
      const base = pending?.base || rawMonthData(input.accountId, input.month);
      const draft = validateMonthInput(input, pending?.draft || base);
      const operation = {
        id: pending?.id || uuid(), accountId: input.accountId, month: input.month,
        draft, base, current: null, revision: (pending?.revision || 0) + 1,
        status: "pending", attempts: 0, nextRetryAt: 0, error: "", failureCode: "",
      };
      operations.push({ operation, index });
    });
    const balanceRecords = balances();
    const contributionRecords = contributions();
    operations.forEach(({ operation, index }) => {
      applyMonthToArrays(balanceRecords, contributionRecords, operation.draft);
      if (endpoint()) {
        if (index >= 0) outbox[index] = operation; else outbox.push(operation);
      }
    });
    write(KEYS.balances, balanceRecords);
    write(KEYS.contributions, contributionRecords);
    if (endpoint()) write(KEYS.monthOutbox, outbox);
    emit("budget:investments-changed"); emit("budget:sync-changed");
    if (endpoint()) scheduleNext();
    return operations.map(({ operation }) => ({ ...hydrateMonth(operation.draft), syncOperationId: operation.id }));
  }
  /** Handles the queueSnapshots operation for the investment data layer. */
  function queueSnapshots(inputs) { return inputs.map((input) => { const existing = rawMonthData(input.accountId, input.month); const amount = Number(input.contribution || 0); return queueMonth({ accountId: input.accountId, month: input.month, balance: input.balance, notes: input.notes, balanceId: existing.balance?.id || input.id, existingContributions: existing.contributions, contributions: amount === 0 ? [] : [{ id: existing.contributions.length === 1 ? existing.contributions[0].id : "", amount }] }); }); }
  /** Handles the getConflict operation for the investment data layer. */
  function getConflict(id) { const item = monthOutbox().find((entry) => entry.id === id && entry.failureCode === "conflict"); return item ? { id, draft: hydrateMonth(item.draft), current: hydrateMonth(item.current), base: hydrateMonth(item.base) } : null; }
  /** Handles the resolveConflict operation for the investment data layer. */
  function resolveConflict(id, input) { const outbox = monthOutbox(); const index = outbox.findIndex((item) => item.id === id && item.failureCode === "conflict"); if (index < 0) throw new Error("That investment conflict is no longer available."); const item = outbox[index]; if (!item.current) throw new Error("Refresh investments before resolving this conflict."); const originalIds = new Set((item.base?.contributions || []).map((flow) => flow.id)); const draftIds = new Set((input.contributions || []).map((flow) => flow.id).filter(Boolean)); const remoteAdditions = item.current.contributions.filter((flow) => !originalIds.has(flow.id) && !draftIds.has(flow.id)); const draft = validateMonthInput({ ...input, accountId: item.accountId, month: item.month, existingContributions: item.draft.contributions, contributions: [...(input.contributions || []), ...remoteAdditions] }, item.current); outbox[index] = { ...item, draft, base: item.current, current: null, revision: item.revision + 1, status: "pending", attempts: 0, nextRetryAt: 0, error: "", failureCode: "" }; applyLocalMonth(draft); write(KEYS.monthOutbox, outbox); emit("budget:investments-changed"); emit("budget:sync-changed"); scheduleNext(); return hydrateMonth(draft); }

  /** Handles the remapAccount operation for the investment data layer. */
  function remapAccount(oldId, record) { write(KEYS.accounts, accounts().filter((item) => item.id !== oldId && item.id !== record.id).concat(record)); write(KEYS.balances, balances().map((item) => item.accountId === oldId ? { ...item, accountId: record.id } : item)); write(KEYS.contributions, contributions().map((item) => item.accountId === oldId ? { ...item, accountId: record.id } : item)); write(KEYS.monthOutbox, monthOutbox().map((item) => item.accountId === oldId ? { ...item, accountId: record.id, draft: { ...item.draft, accountId: record.id, balance: { ...item.draft.balance, accountId: record.id }, contributions: item.draft.contributions.map((flow) => ({ ...flow, accountId: record.id })) } } : item)); }
  /** Handles the retryDelay operation for the investment data layer. */
  function retryDelay(attempts) { return RETRY_DELAYS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS.length - 1)]; }
  /** Handles the pendingSchedule operation for the investment data layer. */
  function pendingSchedule() { const blocked = new Set(accountOutbox().map((item) => item.record.id)); return [...accountOutbox(), ...monthOutbox().filter((item) => !blocked.has(item.accountId))].filter((item) => item.status === "pending").map((item) => Math.max(0, Number(item.nextRetryAt || 0) - Date.now())); }
  /** Handles the scheduleNext operation for the investment data layer. */
  function scheduleNext() { if (retryTimer) clearTimeout(retryTimer); retryTimer = null; if (offline() || !endpoint()) return; const delays = pendingSchedule(); if (delays.length) retryTimer = setTimeout(sync, Math.min(...delays)); }
  /** Handles the transportFailure operation for the investment data layer. */
  function transportFailure(items, key, error) { const sent = new Map(items.map((item) => [item.id || item.record.id, item])); const source = key === KEYS.monthOutbox ? monthOutbox() : accountOutbox(); write(key, source.map((item) => { const sentItem = sent.get(item.id || item.record.id); if (!sentItem || (key === KEYS.monthOutbox && item.revision !== sentItem.revision)) return item; const attempts = (item.attempts || 0) + 1; return { ...item, status: "pending", attempts, nextRetryAt: Date.now() + retryDelay(attempts), error: error.message }; })); emit("budget:sync-retry-scheduled", { error: error.message }); }
  /** Handles the wireOperation operation for the investment data layer. */
  function wireOperation(item) {
    const baseFlows = new Map((item.base?.contributions || []).map((flow) => [flow.id, flow])); const draftFlows = new Map(item.draft.contributions.map((flow) => [flow.id, flow]));
    return { id: item.id, accountId: item.accountId, month: item.month, balance: { record: item.draft.balance, base: item.base?.balance || null }, upserts: [...draftFlows.values()].map((record) => ({ record, base: baseFlows.get(record.id) || null })), deletes: [...baseFlows.values()].filter((record) => !draftFlows.has(record.id)).map((record) => ({ id: record.id, base: record })) };
  }
  /** Handles the sync operation for the investment data layer. */
  async function sync() {
    if (syncPromise || offline() || !endpoint()) return syncPromise; if (!pendingSchedule().some((delay) => delay <= 0)) { scheduleNext(); return null; }
    let changed = false;
    syncPromise = (async () => {
      const accountBatch = accountOutbox().filter((item) => item.status === "pending" && (!item.nextRetryAt || item.nextRetryAt <= Date.now())).slice(0, 50);
      if (accountBatch.length) {
        const ids = new Set(accountBatch.map((item) => item.record.id)); write(KEYS.accountOutbox, accountOutbox().map((item) => ids.has(item.record.id) ? { ...item, status: "syncing" } : item)); emit("budget:sync-changed");
        try { const result = await request("addInvestmentAccounts", { accounts: accountBatch.map((item) => item.record) }); (result.reconciled || []).forEach((item) => { remapAccount(item.requestedId, item.record); changed = true; }); const successful = new Set([...(result.saved || []).map((item) => item.id), ...(result.reconciled || []).map((item) => item.requestedId)]); const failed = new Map((result.failed || []).map((item) => [item.id, item])); write(KEYS.accountOutbox, accountOutbox().filter((item) => !successful.has(item.record.id)).map((item) => failed.has(item.record.id) ? { ...item, status: "failed", error: failed.get(item.record.id).error } : item)); if (successful.size) emit("budget:sync-succeeded", { count: successful.size }); if (failed.size) emit("budget:sync-failed", { count: failed.size }); }
        catch (error) { transportFailure(accountBatch, KEYS.accountOutbox, error); return; }
      }
      const blocked = new Set(accountOutbox().map((item) => item.record.id)); const batch = monthOutbox().filter((item) => item.status === "pending" && !blocked.has(item.accountId) && (!item.nextRetryAt || item.nextRetryAt <= Date.now())).slice(0, 50); if (!batch.length) return;
      const sent = new Map(batch.map((item) => [item.id, item])); write(KEYS.monthOutbox, monthOutbox().map((item) => sent.has(item.id) && item.revision === sent.get(item.id).revision ? { ...item, status: "syncing" } : item)); emit("budget:sync-changed");
      try {
        const result = await request("saveInvestmentMonths", { months: batch.map(wireOperation) }); const saved = new Map((result.saved || []).map((item) => [item.id, normalizeMonth(item)])); const failed = new Map((result.failed || []).map((item) => [item.id, item])); const next = [];
        monthOutbox().forEach((item) => { const sentItem = sent.get(item.id); if (!sentItem) { next.push(item); return; } const confirmed = saved.get(item.id); if (item.revision !== sentItem.revision) { if (confirmed) { item.base = confirmed; applyLocalMonth(item.draft); } next.push({ ...item, status: "pending", nextRetryAt: 0 }); return; } if (confirmed) { applyLocalMonth(confirmed); changed = true; return; } const failure = failed.get(item.id); if (!failure) { next.push({ ...item, status: "pending", nextRetryAt: 0 }); return; } const current = normalizeMonth(failure.current); if (failure.code === "conflict" && current) { applyLocalMonth(current); changed = true; } next.push({ ...item, status: "failed", error: failure.error, failureCode: failure.code || "", current }); });
        write(KEYS.monthOutbox, next); if (saved.size) emit("budget:sync-succeeded", { count: saved.size }); if (failed.size) emit("budget:sync-failed", { count: failed.size });
      } catch (error) { transportFailure(batch, KEYS.monthOutbox, error); }
    })().finally(() => { syncPromise = null; emit("budget:sync-changed"); if (changed) emit("budget:investments-changed"); scheduleNext(); }); return syncPromise;
  }

  /** Handles the awaitImportedMonths operation for the investment data layer. */
  async function awaitImportedMonths(ids, onProgress) {
    const targets = new Set((ids || []).map(String));
    if (!targets.size) return [];
    while (targets.size) {
      if (offline()) throw new Error("The import paused because the browser went offline.");
      const items = monthOutbox().filter((item) => targets.has(String(item.id)));
      const failed = items.find((item) => item.status === "failed");
      if (failed) throw new Error(failed.error || "An investment month could not be saved.");
      [...targets].forEach((id) => {
        if (!items.some((item) => String(item.id) === id)) targets.delete(id);
      });
      onProgress?.({ completed: ids.length - targets.size, total: ids.length });
      if (!targets.size) break;
      const retrying = items.find((item) => item.status === "pending" && item.attempts > 0 && item.nextRetryAt > Date.now());
      if (retrying) throw new Error(retrying.error || "The investment sync paused and is ready to retry.");
      await sync();
      await Promise.resolve();
    }
    return ids;
  }

  /** Handles the syncItems operation for the investment data layer. */
  function syncItems() { const item = (source, entry) => { const record = source === "investmentAccount" ? hydrateAccount(entry.record) : { ...hydrateMonth(entry.draft), balance: entry.draft.balance?.balance || 0 }; return { key: `${source}:${entry.id || entry.record.id}`, source, id: entry.id || entry.record.id, status: entry.status, error: entry.error, failureCode: entry.failureCode, attempts: entry.attempts || 0, nextRetryAt: entry.nextRetryAt || 0, retrying: !offline() && entry.status === "pending" && entry.attempts > 0, waitingForOnline: offline() && entry.status === "pending", record, current: source === "investmentMonth" ? hydrateMonth(entry.current) : null }; }; return [...accountOutbox().map((entry) => item("investmentAccount", entry)), ...monthOutbox().map((entry) => item("investmentMonth", entry))]; }
  /** Handles the retry operation for the investment data layer. */
  function retry(source, id) { const key = source === "investmentAccount" ? KEYS.accountOutbox : KEYS.monthOutbox; const items = source === "investmentAccount" ? accountOutbox() : monthOutbox(); write(key, items.map((item) => (item.id || item.record.id) === id && item.status !== "syncing" && item.failureCode !== "conflict" ? { ...item, status: "pending", nextRetryAt: 0, error: "", failureCode: "" } : item)); emit("budget:sync-changed"); scheduleNext(); }
  /** Handles the discard operation for the investment data layer. */
  function discard(source, id) { if (source === "investmentAccount") { if (monthOutbox().some((item) => item.accountId === id)) throw new Error("Discard dependent monthly updates first."); write(KEYS.accountOutbox, accountOutbox().filter((item) => item.record.id !== id)); write(KEYS.accounts, accounts().filter((item) => item.id !== id)); } else { const item = monthOutbox().find((entry) => entry.id === id); write(KEYS.monthOutbox, monthOutbox().filter((entry) => entry.id !== id)); const restore = item?.current || item?.base; if (restore) applyLocalMonth(restore); } emit("budget:sync-changed"); emit("budget:investments-changed"); scheduleNext(); }

  /** Handles the calculate operation for the investment data layer. */
  function calculate(transactions, range) {
    const start = String(range?.start || "");
    const end = String(range?.end || "");
    const startMonth = start.slice(0, 7);
    const endMonth = end.slice(0, 7);
    const within = (month) =>
      (!startMonth || month >= startMonth) &&
      (!endMonth || month <= endMonth);
    const startDate = start
      ? (start.length === 7 ? `${start}-01` : start)
      : "";
    const endDate = end
      ? (end.length === 7 ? `${end}-31` : end)
      : "";
    const tx = transactions.filter(
      (item) =>
        (!startDate || item.date >= startDate) &&
        (!endDate || item.date <= endDate),
    );
    const income = tx
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const spending = tx
      .filter((item) => item.type !== "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const accountSources = new Map(
      accounts().map((account) => [account.id, account.source]),
    );
    const period = contributions().filter((item) => within(item.month));
    const paycheckContributions = period
      .filter((item) => accountSources.get(item.accountId) === "paycheck")
      .reduce((sum, item) => sum + item.amount, 0);
    const manualContributions = period
      .filter((item) => accountSources.get(item.accountId) !== "paycheck")
      .reduce((sum, item) => sum + item.amount, 0);
    const budgetSurplus = income - spending;
    return {
      income,
      spending,
      budgetSurplus,
      paycheckContributions,
      manualContributions,
      totalSavings: budgetSurplus + paycheckContributions,
    };
  }
  /** Handles the calculateGrowth operation for the investment data layer. */
  function calculateGrowth(openingBalance, endingBalance, periodFlows) { if (openingBalance === null || openingBalance === undefined || endingBalance === null || endingBalance === undefined) return null; return Number(endingBalance) - Number(openingBalance) - periodFlows.reduce((sum, item) => sum + Number(item.amount ?? item.contribution ?? 0), 0); }

  /** Handles the originalSyncItems operation for the investment data layer. */
  const api = { accounts: () => accounts().map(hydrateAccount), balances: () => balances().map(hydrateBalance), contributions: () => contributions().map(hydrateContribution), snapshots, monthData, load, isLoaded, applyBootstrapData, addAccount, updateAccount, archiveAccount, queueMonth, queueImportedMonths, awaitImportedMonths, queueSnapshots, getConflict, resolveConflict, calculate, calculateGrowth, hasUnsynced, sync, retry, discard, getSyncItems: syncItems };
  window.addEventListener("online", () => { write(KEYS.accountOutbox, accountOutbox().map((item) => item.status === "pending" ? { ...item, nextRetryAt: 0 } : item)); write(KEYS.monthOutbox, monthOutbox().map((item) => item.status === "pending" ? { ...item, nextRetryAt: 0 } : item)); sync(); });
  window.addEventListener("offline", () => { if (retryTimer) clearTimeout(retryTimer); retryTimer = null; emit("budget:sync-changed"); }); scheduleNext();
  return api;
}
