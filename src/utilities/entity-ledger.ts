import type { BudgetEntity, BudgetTransaction, TransactionType } from "../api/budget-api";

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });

export const editorialMonthItems = [
  { key: "all", title: "All months", isDefaultValue: true },
  ...Array.from({ length: 12 }, (_, index) => ({
    key: String(index + 1).padStart(2, "0"),
    title: monthFormatter.format(new Date(2024, index, 1)),
  })),
];

export function editorialPeriod(year: number, month: string | null): string {
  if (!month) return String(year);
  return `${editorialMonthItems[Number(month)].title} ${year}`;
}

export function signedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })}%`;
}

export function signedTransactionAmount(
  transaction: Pick<BudgetTransaction, "amount" | "type">,
): number {
  const amount = Number(transaction.amount);
  return transaction.type === "expense" ? -amount : amount;
}

export function matchesLedgerFilter(
  value: unknown,
  operator: string,
  expectedValue: string | number,
): boolean {
  const comparable = typeof value === "string" ? value.toLowerCase() : value;
  const expected = typeof expectedValue === "string"
    ? expectedValue.toLowerCase()
    : expectedValue;
  switch (operator) {
    case "Equals": return comparable === expected;
    case "Does not equal": return comparable !== expected;
    case "Greater than": return Number(comparable) > Number(expected);
    case "Less than": return Number(comparable) < Number(expected);
    case "Contains": return String(comparable ?? "").includes(String(expected));
    case "Starts with": return String(comparable ?? "").startsWith(String(expected));
    default: return true;
  }
}

export function matchesLedgerFilterGroups<T extends object>(
  row: T,
  filters: ReadonlyArray<{
    key: keyof T;
    operator: string;
    value: string | number;
  }>,
  valueForFilter: (row: T, key: keyof T) => unknown = (item, key) => item[key],
): boolean {
  const groups = new Map<keyof T, typeof filters>();
  for (const filter of filters) {
    groups.set(filter.key, [...(groups.get(filter.key) ?? []), filter]);
  }

  return [...groups.values()].every((group) =>
    group.some((filter) =>
      matchesLedgerFilter(
        valueForFilter(row, filter.key),
        filter.operator,
        filter.value,
      ),
    ),
  );
}

export interface EntityLedgerRow {
  id: string;
  name: string;
  active: boolean;
  status: "Active" | "Archived";
  rank: number;
  transactionCount: number;
  average: number;
  total: number;
  previousTotal: number;
  comparison: number | null;
}

export interface PersonLedgerRow {
  id: string;
  name: string;
  active: boolean;
  status: "Active" | "Archived";
  rank: number;
  income: number;
  expense: number;
  balance: number;
  previousBalance: number;
  comparison: number | null;
}

function periodTransactions(
  transactions: ReadonlyArray<BudgetTransaction>,
  year: number,
  month: string | null,
): BudgetTransaction[] {
  const prefix = `${year}-${month ?? ""}`;
  return transactions.filter((transaction) => transaction.date.startsWith(prefix));
}

function percentageChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

export function buildEntityLedgerRows(
  entities: ReadonlyArray<BudgetEntity>,
  transactions: ReadonlyArray<BudgetTransaction>,
  options: {
    year: number;
    month: string | null;
    idKey: "categoryId" | "vendorId";
    type: TransactionType;
  },
): EntityLedgerRow[] {
  const current = periodTransactions(transactions, options.year, options.month)
    .filter(({ type }) => type === options.type);
  const previous = periodTransactions(
    transactions,
    options.year - 1,
    options.month,
  ).filter(({ type }) => type === options.type);

  const aggregate = (rows: ReadonlyArray<BudgetTransaction>) => {
    const values = new Map<string, { count: number; total: number }>();
    rows.forEach((transaction) => {
      const id = transaction[options.idKey];
      if (!id) return;
      const value = values.get(id) ?? { count: 0, total: 0 };
      value.count += 1;
      value.total += Number(transaction.amount) || 0;
      values.set(id, value);
    });
    return values;
  };

  const currentValues = aggregate(current);
  const previousValues = aggregate(previous);
  return entities
    .map((entity) => {
      const value = currentValues.get(entity.id) ?? { count: 0, total: 0 };
      const previousTotal = previousValues.get(entity.id)?.total ?? 0;
      return {
        id: entity.id,
        name: entity.name,
        active: entity.active,
        status: entity.active ? "Active" as const : "Archived" as const,
        rank: 0,
        transactionCount: value.count,
        average: value.count === 0 ? 0 : value.total / value.count,
        total: value.total,
        previousTotal,
        comparison: percentageChange(value.total, previousTotal),
      };
    })
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function buildPersonLedgerRows(
  people: ReadonlyArray<BudgetEntity>,
  transactions: ReadonlyArray<BudgetTransaction>,
  year: number,
  month: string | null,
): PersonLedgerRow[] {
  const aggregate = (rows: ReadonlyArray<BudgetTransaction>) => {
    const values = new Map<string, { income: number; expense: number }>();
    rows.forEach((transaction) => {
      if (!transaction.assignmentId || (transaction.type !== "income" && transaction.type !== "expense")) return;
      const value = values.get(transaction.assignmentId) ?? {
        income: 0,
        expense: 0,
      };
      value[transaction.type] += Number(transaction.amount) || 0;
      values.set(transaction.assignmentId, value);
    });
    return values;
  };
  const current = aggregate(periodTransactions(transactions, year, month));
  const previous = aggregate(periodTransactions(transactions, year - 1, month));

  return people
    .map((person) => {
      const value = current.get(person.id) ?? { income: 0, expense: 0 };
      const prior = previous.get(person.id) ?? { income: 0, expense: 0 };
      const balance = value.income - value.expense;
      const previousBalance = prior.income - prior.expense;
      return {
        id: person.id,
        name: person.name,
        active: person.active,
        status: person.active ? "Active" as const : "Archived" as const,
        rank: 0,
        income: value.income,
        expense: value.expense,
        balance,
        previousBalance,
        comparison: percentageChange(balance, previousBalance),
      };
    })
    .sort((left, right) => right.balance - left.balance || left.name.localeCompare(right.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
