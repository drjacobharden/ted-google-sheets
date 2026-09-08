import type { Account } from "../api/account-api";
import type { BudgetEntity, BudgetTransaction } from "../api/budget-api";

export type MoneyFlowPalette = "income" | "expense" | "savings" | "debt";
export type MoneyFlowNodeKind =
  | "source"
  | "total"
  | "branch"
  | "category"
  | "account"
  | "cash";

export interface MoneyFlowNode {
  id: string;
  name: string;
  value: number;
  stage: 0 | 1 | 2 | 3 | 4;
  palette: MoneyFlowPalette;
  kind: MoneyFlowNodeKind;
  /** Optional rendered magnitude when a logical value must remain visible but cannot overhang its source. */
  displayValue?: number;
}

export interface MoneyFlowLink {
  id: string;
  source: string;
  target: string;
  value: number;
  palette: MoneyFlowPalette;
  /** Optional rendered magnitude; labels and percentages continue to use value. */
  displayValue?: number;
}

export interface AnnualMoneyFlow {
  year: number;
  totalInflows: number;
  nodes: MoneyFlowNode[];
  links: MoneyFlowLink[];
  priorCash: number;
  hasData: boolean;
}

interface NamedTotal {
  id: string;
  name: string;
  value: number;
}

interface DebtPaymentTotal extends NamedTotal {
  categoryId: string;
  categoryName: string;
}

const DEFAULT_INCOME_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";
const EXPENSE_DEDUCTIONS_SOURCE_ID = "expense-deductions";
const INVESTMENT_DEDUCTIONS_SOURCE_ID = "investment-deductions";
const SPENDABLE_CASH_ID = "spendable-cash";
const SPEND_ID = "spend";
const SAVINGS_ID = "savings";
const TOTAL_SAVINGS_ID = "total-savings";
const PRIOR_CASH_ID = "prior-cash";
const EPSILON = 0.005;

function addTotal(
  totals: Map<string, NamedTotal>,
  id: string,
  name: string,
  value: number,
): void {
  if (!Number.isFinite(value) || Math.abs(value) < EPSILON) return;
  const current = totals.get(id);
  totals.set(id, {
    id,
    name: name.trim() || current?.name || "Uncategorized",
    value: (current?.value ?? 0) + value,
  });
}

function sortedPositive(totals: Map<string, NamedTotal>): NamedTotal[] {
  return [...totals.values()]
    .filter((item) => item.value >= EPSILON)
    .sort((left, right) =>
      right.value - left.value || left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
}

function sortSources(
  left: NamedTotal & { prefix: string },
  right: NamedTotal & { prefix: string },
): number {
  const sourceGroup = (prefix: string): number =>
    prefix === "prior-cash" ? 0
      : prefix === "investment-deduction" ? 1
        : prefix === "expense-deduction" ? 2
          : prefix === "income" ? 3
            : 4;
  const leftGroup = sourceGroup(left.prefix);
  const rightGroup = sourceGroup(right.prefix);
  return leftGroup - rightGroup ||
    right.value - left.value ||
    left.name.localeCompare(right.name);
}

function yearOf(date: string): number | null {
  const match = String(date).match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  return match ? Number(match[1]) : null;
}

function amountOf(transaction: BudgetTransaction): number | null {
  const value = Number(transaction.amount);
  return Number.isFinite(value) ? value : null;
}

function key(id: string | undefined, fallback: string): string {
  return String(id || fallback).trim() || fallback;
}

function categoryName(
  transaction: BudgetTransaction,
  categories: ReadonlyMap<string, BudgetEntity>,
  fallback: string,
): string {
  return (
    categories.get(String(transaction.categoryId || ""))?.name ||
    transaction.category ||
    fallback
  );
}

/** Builds a behavioral, selected-year cash-flow graph without using account balances. */
export function buildAnnualMoneyFlow(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  categories: ReadonlyArray<BudgetEntity>,
  year: number,
): AnnualMoneyFlow {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const defaultIncomeName = categoryById.get(DEFAULT_INCOME_CATEGORY_ID)?.name || "Income";

  const income = new Map<string, NamedTotal>();
  const expenses = new Map<string, NamedTotal>();
  const investments = new Map<string, NamedTotal>();
  const debtPayments = new Map<string, DebtPaymentTotal>();
  const debtBorrowing = new Map<string, NamedTotal>();
  let expenseDeductionTotal = 0;
  let investmentDeductionTotal = 0;

  for (const transaction of transactions) {
    if (yearOf(transaction.date) !== year) continue;
    const amount = amountOf(transaction);
    if (amount === null || Math.abs(amount) < EPSILON) continue;

    const account = transaction.accountId
      ? accountById.get(transaction.accountId)
      : undefined;

    if (account?.type === "investment") {
      addTotal(
        investments,
        account.id,
        account.name || transaction.account || "Unknown investment account",
        amount,
      );
      if (transaction.source === "deduction") {
        investmentDeductionTotal += amount;
      }
      continue;
    }

    if (account?.type === "debt") {
      if (amount > 0) {
        const categoryId = key(account.categoryId, "uncategorized-expense");
        const current = debtPayments.get(account.id);
        debtPayments.set(account.id, {
          id: account.id,
          name: account.name || transaction.account || "Unknown debt account",
          value: (current?.value ?? 0) + amount,
          categoryId,
          categoryName:
            categoryById.get(categoryId)?.name ||
            transaction.category ||
            "Uncategorized expenses",
        });
        if (transaction.source === "deduction") {
          expenseDeductionTotal += amount;
        }
      } else {
        addTotal(debtBorrowing, account.id, account.name || "Unknown debt account", -amount);
      }
      continue;
    }

    if (transaction.type === "income") {
      const id = key(transaction.categoryId, DEFAULT_INCOME_CATEGORY_ID);
      addTotal(
        income,
        id,
        categoryName(transaction, categoryById, defaultIncomeName),
        amount,
      );
      continue;
    }

    const id = key(transaction.categoryId, "uncategorized-expense");
    addTotal(
      expenses,
      id,
      categoryName(transaction, categoryById, "Uncategorized expenses"),
      amount,
    );
    if (transaction.source === "deduction") {
      expenseDeductionTotal += amount;
    }
  }

  const incomeSources = sortedPositive(income);
  const incomeReversals = [...income.values()]
    .filter((item) => item.value <= -EPSILON)
    .map((item) => ({ ...item, value: -item.value }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
  const expenseUses = sortedPositive(expenses);
  const expenseRefunds = [...expenses.values()]
    .filter((item) => item.value <= -EPSILON)
    .map((item) => ({ ...item, value: -item.value }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
  const investmentUses = sortedPositive(investments);
  const investmentWithdrawals = [...investments.values()]
    .filter((item) => item.value <= -EPSILON)
    .map((item) => ({ ...item, value: -item.value }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
  const paymentUses = [...debtPayments.values()]
    .filter((item) => item.value >= EPSILON)
    .sort((left, right) =>
      right.value - left.value || left.name.localeCompare(right.name),
    );
  const borrowingSources = sortedPositive(debtBorrowing);

  const categorizedIncome = incomeSources.reduce((total, item) => total + item.value, 0);
  const expenseDeductions = Math.max(0, expenseDeductionTotal);
  const investmentDeductions = Math.max(0, investmentDeductionTotal);
  const supplementalCash =
    expenseRefunds.reduce((total, item) => total + item.value, 0) +
    investmentWithdrawals.reduce((total, item) => total + item.value, 0) +
    borrowingSources.reduce((total, item) => total + item.value, 0);
  const spendableCash = categorizedIncome + expenseDeductions + supplementalCash;

  const sources: Array<NamedTotal & { prefix: string; palette: MoneyFlowPalette }> = [
    ...(expenseDeductions >= EPSILON
      ? [{ id: EXPENSE_DEDUCTIONS_SOURCE_ID, name: "Expense deductions", value: expenseDeductions, prefix: "expense-deduction", palette: "income" as const }]
      : []),
    ...(investmentDeductions >= EPSILON
      ? [{ id: INVESTMENT_DEDUCTIONS_SOURCE_ID, name: "Investment deductions", value: investmentDeductions, prefix: "investment-deduction", palette: "savings" as const }]
      : []),
    ...incomeSources.map((item) => ({ ...item, prefix: "income", palette: "income" as const })),
    ...expenseRefunds.map((item) => ({ ...item, name: `${item.name} refunds`, prefix: "refund", palette: "expense" as const })),
    ...investmentWithdrawals.map((item) => ({ ...item, name: `${item.name} withdrawals`, prefix: "withdrawal", palette: "savings" as const })),
    ...borrowingSources.map((item) => ({ ...item, name: `${item.name} borrowing`, prefix: "borrowing", palette: "debt" as const })),
  ].sort(sortSources);

  const debtTotal = paymentUses.reduce((total, item) => total + item.value, 0);
  const expenseTotal = expenseUses.reduce((total, item) => total + item.value, 0) +
    incomeReversals.reduce((total, item) => total + item.value, 0);
  const spentTotal = expenseTotal + debtTotal;
  const investmentTotal = investmentUses.reduce((total, item) => total + item.value, 0);
  const spendableSavings = Math.max(0, spendableCash - spentTotal);
  const investmentNeed = Math.max(0, investmentTotal - investmentDeductions);
  const priorCash = Math.max(0, investmentNeed - spendableSavings);
  const totalSavings = spendableSavings + investmentDeductions + priorCash;
  const cash = Math.max(0, totalSavings - investmentTotal);
  const totalInflows = Math.max(spendableCash, totalSavings);
  const displayedSpend = Math.min(spentTotal, spendableCash);
  const spendDisplayRatio = spentTotal >= EPSILON ? displayedSpend / spentTotal : 0;

  if (priorCash >= EPSILON) {
    sources.push({ id: PRIOR_CASH_ID, name: "Prior cash", value: priorCash, prefix: "prior-cash", palette: "savings" });
    sources.sort(sortSources);
  }

  const nodes: MoneyFlowNode[] = [];
  const links: MoneyFlowLink[] = [];
  const addNode = (node: MoneyFlowNode): void => {
    nodes.push(node);
  };
  const addLink = (
    source: string,
    target: string,
    value: number,
    palette: MoneyFlowPalette,
    displayValue?: number,
  ): void => {
    if (value < EPSILON) return;
    links.push({ id: `${source}->${target}`, source, target, value, palette, ...(displayValue === undefined ? {} : { displayValue }) });
  };

  for (const source of sources) {
    const id = `source:${source.prefix}:${source.id}`;
    addNode({ id, name: source.name, value: source.value, stage: 0, palette: source.palette, kind: "source" });
    if (source.prefix === "prior-cash") {
      addLink(id, TOTAL_SAVINGS_ID, source.value, "savings");
    } else if (source.prefix === "investment-deduction") {
      addLink(id, TOTAL_SAVINGS_ID, source.value, "savings");
    } else {
      addLink(id, SPENDABLE_CASH_ID, source.value, source.palette);
    }
  }

  if (spendableCash >= EPSILON || spentTotal >= EPSILON || totalSavings >= EPSILON) {
    addNode({ id: SPENDABLE_CASH_ID, name: "Spendable cash", value: spendableCash, stage: 1, palette: "income", kind: "total" });
  }
  if (spendableSavings >= EPSILON || spendableCash >= EPSILON || spentTotal >= EPSILON) {
    addNode({ id: SAVINGS_ID, name: "Savings", value: spendableSavings, stage: 2, palette: "savings", kind: "branch" });
    addLink(SPENDABLE_CASH_ID, SAVINGS_ID, spendableSavings, "savings");
  }
  if (spentTotal >= EPSILON) {
    addNode({ id: SPEND_ID, name: "Spend", value: spentTotal, displayValue: displayedSpend, stage: 2, palette: "expense", kind: "branch" });
    addLink(SPENDABLE_CASH_ID, SPEND_ID, spentTotal, "expense", displayedSpend);
  }

  if (totalSavings >= EPSILON || spendableCash >= EPSILON || spentTotal >= EPSILON || investmentTotal >= EPSILON) {
    addNode({
      id: TOTAL_SAVINGS_ID,
      name: priorCash >= EPSILON ? "Total investments" : "Total savings",
      value: totalSavings,
      stage: 3,
      palette: "savings",
      kind: "branch",
    });
    addLink(SAVINGS_ID, TOTAL_SAVINGS_ID, spendableSavings, "savings");
  }

  if (investmentTotal >= EPSILON) {
    for (const item of investmentUses) {
      const id = `investment:${item.id}`;
      addNode({ id, name: item.name, value: item.value, stage: 4, palette: "savings", kind: "account" });
      addLink(TOTAL_SAVINGS_ID, id, item.value, "savings");
    }
  }
  if (cash >= EPSILON) {
    addNode({ id: "cash", name: "Cash", value: cash, stage: 4, palette: "savings", kind: "cash" });
    addLink(TOTAL_SAVINGS_ID, "cash", cash, "savings");
  }

  const spendCategories = new Map<
    string,
    NamedTotal & { ordinary: number; debts: DebtPaymentTotal[] }
  >();
  for (const item of expenseUses) {
    spendCategories.set(item.id, { ...item, ordinary: item.value, debts: [] });
  }
  for (const item of paymentUses) {
    const current = spendCategories.get(item.categoryId);
    spendCategories.set(item.categoryId, {
      id: item.categoryId,
      name: current?.name || item.categoryName,
      value: (current?.value ?? 0) + item.value,
      ordinary: current?.ordinary ?? 0,
      debts: [...(current?.debts ?? []), item],
    });
  }
  for (const item of incomeReversals) {
    spendCategories.set(`income-reversal:${item.id}`, {
      id: `income-reversal:${item.id}`,
      name: `${item.name} reversals`,
      value: item.value,
      ordinary: item.value,
      debts: [],
    });
  }

  const orderedSpendCategories = [...spendCategories.values()].sort(
    (left, right) =>
      right.value - left.value || left.name.localeCompare(right.name),
  );
  for (const item of orderedSpendCategories) {
    const id = item.id.startsWith("income-reversal:")
      ? item.id
      : `expense:${item.id}`;
    const displayValue = item.value * spendDisplayRatio;
    addNode({ id, name: item.name, value: item.value, displayValue, stage: 3, palette: "expense", kind: "category" });
    addLink(SPEND_ID, id, item.value, "expense", displayValue);

    if (item.debts.length === 0) continue;
    for (const debt of item.debts) {
      const debtId = `debt:${debt.id}`;
      const debtDisplayValue = debt.value * spendDisplayRatio;
      addNode({ id: debtId, name: debt.name, value: debt.value, displayValue: debtDisplayValue, stage: 4, palette: "debt", kind: "account" });
      addLink(id, debtId, debt.value, "debt", debtDisplayValue);
    }
    if (item.ordinary >= EPSILON) {
      const otherId = `expense-other:${item.id}`;
      const otherDisplayValue = item.ordinary * spendDisplayRatio;
      addNode({ id: otherId, name: `Other ${item.name}`, value: item.ordinary, displayValue: otherDisplayValue, stage: 4, palette: "expense", kind: "category" });
      addLink(id, otherId, item.ordinary, "expense", otherDisplayValue);
    }
  }

  // Insertion order within each stage is intentional: it defines the top spine
  // first, followed by descending subordinate branches.
  nodes.sort((left, right) => left.stage - right.stage);
  links.sort((left, right) => left.source.localeCompare(right.source) || left.target.localeCompare(right.target));

  return {
    year,
    totalInflows,
    nodes,
    links,
    priorCash,
    hasData: nodes.length > 0,
  };
}
