import type { Account } from "../api/account-api";
import type { BudgetTransaction } from "../api/budget-api";

export interface ActivityEffects {
  account: Account | null;
  income: number;
  expense: number;
  investmentFlow: number;
  debtFlow: number;
  categoryId: string;
  assignmentId: string;
  budgetVisible: boolean;
  kind: "income" | "expense" | "investment" | "debt-payment" | "borrowing";
}

/** Projects every reporting effect from one canonical stored activity row. */
export function activityEffects(
  transaction: BudgetTransaction,
  accounts: ReadonlyArray<Account>,
): ActivityEffects {
  const amount = Number(transaction.amount);
  const value = Number.isFinite(amount) ? amount : 0;
  const account = transaction.accountId
    ? accounts.find((item) => item.id === transaction.accountId) ?? null
    : null;
  const deduction = transaction.source === "deduction";

  if (!account) {
    if (transaction.type === "income") {
      return { account:null, income:value, expense:0, investmentFlow:0, debtFlow:0, categoryId:transaction.categoryId||"", assignmentId:transaction.assignmentId||"", budgetVisible:true, kind:"income" };
    }
    return { account:null, income:deduction?value:0, expense:value, investmentFlow:0, debtFlow:0, categoryId:transaction.categoryId||"", assignmentId:transaction.assignmentId||"", budgetVisible:true, kind:"expense" };
  }

  if (account.type === "investment") {
    return { account, income:deduction?value:0, expense:0, investmentFlow:value, debtFlow:0, categoryId:"", assignmentId:account.assignmentId||"", budgetVisible:deduction, kind:"investment" };
  }
  if (value < 0) {
    return { account, income:0, expense:0, investmentFlow:0, debtFlow:value, categoryId:"", assignmentId:account.assignmentId||"", budgetVisible:false, kind:"borrowing" };
  }
  return { account, income:deduction?value:0, expense:value, investmentFlow:0, debtFlow:value, categoryId:account.categoryId||"", assignmentId:account.assignmentId||"", budgetVisible:true, kind:"debt-payment" };
}

export function budgetingActivities(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  categories: ReadonlyArray<{id:string;name:string}> = [],
  assignments: ReadonlyArray<{id:string;name:string}> = [],
): BudgetTransaction[] {
  return transactions.flatMap((transaction) => {
    const effects = activityEffects(transaction, accounts);
    if (!effects.budgetVisible) return [];
    return [{
      ...transaction,
      categoryId: effects.categoryId,
      assignmentId: effects.assignmentId,
      category: categories.find(item=>item.id===effects.categoryId)?.name || transaction.category,
      assignment: assignments.find(item=>item.id===effects.assignmentId)?.name || transaction.assignment,
      account: effects.account?.name || transaction.account,
    }];
  });
}

/** Expands stored rows in memory only so legacy aggregators consume derived effects. */
export function reportingTransactions(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
): BudgetTransaction[] {
  return transactions.flatMap((transaction) => {
    const effects = activityEffects(transaction, accounts);
    const base = { ...transaction, categoryId:effects.categoryId, assignmentId:effects.assignmentId };
    const rows: BudgetTransaction[] = [];
    if (effects.income) rows.push({ ...base, id:`${transaction.id}:income`, accountId:"", type:"income", amount:effects.income, categoryId:"00000000-0000-4000-8000-000000000001", vendorId:"" });
    if (effects.expense) rows.push({ ...base, id:`${transaction.id}:expense`, accountId:"", type:"expense", amount:effects.expense });
    return rows;
  });
}
