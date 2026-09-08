import type { Account } from "../api/account-api";
import type { BudgetTransaction, EntityKind } from "../api/budget-api";
import type { DataChartData } from "../components/data-chart/data-chart";
import { activityEffects } from "./activity-effects";

export type EntityChartDisplay =
  | "monthly-income"
  | "monthly-spend"
  | "monthly-savings-rate"
  | "cumulative-income"
  | "cumulative-spend"
  | "cumulative-income-vs-spend"
  | "cumulative-savings-rate"
  | "total-savings"
  | "income-vs-expense"
  | "cumulative-savings";

export interface EntityChartMonth {
  monthId: string;
  isAvailable: boolean;
  income: number;
  manualIncome: number;
  deductions: number;
  spend: number;
  standardExpenses: number;
  deductedExpenses: number;
  debtPayments: number;
  deductedSavings: number;
  budgetSavings: number;
  totalSavings: number;
  hasData: boolean;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cumulative(rows: readonly EntityChartMonth[], value: (row: EntityChartMonth) => number) {
  let total = 0;
  return rows.filter((row) => row.isAvailable).map((row) => {
    total += value(row);
    return { date: row.monthId, value: total };
  });
}

function matchesEntity(
  transaction: BudgetTransaction,
  effects: ReturnType<typeof activityEffects>,
  kind: EntityKind,
  id: string,
): boolean {
  if (kind === "category") return effects.categoryId === id || transaction.categoryId === id;
  if (kind === "vendor") return transaction.vendorId === id;
  return effects.assignmentId === id || transaction.assignmentId === id;
}

export function buildEntityChartMonths(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  kind: EntityKind,
  id: string,
  year: number,
  today = new Date(),
): EntityChartMonth[] {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    monthId: `${year}-${String(index + 1).padStart(2, "0")}`,
    isAvailable: year !== today.getFullYear() || index <= today.getMonth(),
    income: 0,
    manualIncome: 0,
    deductions: 0,
    spend: 0,
    standardExpenses: 0,
    deductedExpenses: 0,
    debtPayments: 0,
    deductedSavings: 0,
    budgetSavings: 0,
    totalSavings: 0,
    hasData: false,
  }));
  transactions.forEach((transaction) => {
    if (!validDate(transaction.date) || transaction.date.slice(0, 4) !== String(year)) return;
    const month = Number(transaction.date.slice(5, 7)) - 1;
    if (year === today.getFullYear() && month > today.getMonth()) return;
    const effects = activityEffects(transaction, accounts);
    if (!matchesEntity(transaction, effects, kind, id)) return;
    if (!effects.budgetVisible) return;
    const row = rows[month];
    row.hasData = true;
    if (effects.income) {
      row.income += effects.income;
      if (transaction.source === "deduction") row.deductions += effects.income;
      else row.manualIncome += effects.income;
    }
    if (effects.expense) {
      row.spend += effects.expense;
      if (effects.account?.type === "debt") row.debtPayments += effects.expense;
      else if (transaction.source === "deduction") row.deductedExpenses += effects.expense;
      else row.standardExpenses += effects.expense;
    }
    if (effects.account?.type === "investment" && transaction.source === "deduction") {
      row.deductedSavings += effects.investmentFlow;
    }
  });
  rows.forEach((row) => {
    row.budgetSavings = row.income - row.spend - row.deductedSavings;
    row.totalSavings = row.budgetSavings + row.deductedSavings;
  });
  return rows;
}

function points(rows: readonly EntityChartMonth[], value: (row: EntityChartMonth) => number) {
  return rows.filter((row) => row.hasData).map((row) => ({ date: row.monthId, value: value(row) }));
}

function savingsRate(row: EntityChartMonth): number {
  return row.income === 0 ? 0 : (row.totalSavings / row.income) * 100;
}

function cumulativeRatePoints(rows: readonly EntityChartMonth[]) {
  let income = 0;
  let savings = 0;
  return rows.filter((row) => row.isAvailable).map((row) => {
    income += row.income;
    savings += row.totalSavings;
    return { date: row.monthId, value: income === 0 ? 0 : (savings / income) * 100 };
  });
}

export function entityChartData(
  rows: readonly EntityChartMonth[],
  display: EntityChartDisplay,
  year: number,
  previousRows: readonly EntityChartMonth[] = [],
): DataChartData {
  const base = { year, format: "monthly" as const, ariaLabel: `${year} entity chart` };
  const line = (label: string, value: (row: EntityChartMonth) => number, palette: "income" | "expense" | "savings", sourceRows = rows) => ({ type: "line" as const, label, palette, points: cumulative(sourceRows, value) });
  const previousLine = (value: (row: EntityChartMonth) => number, palette: "income" | "expense" | "savings") => previousRows.some((row) => row.hasData) ? [
    { ...line("Previous year", value, palette, previousRows), variant: "secondary" as const },
  ] : [];
  if (display === "monthly-income" || display === "monthly-spend") {
    const income = display === "monthly-income";
    const currentSeries = income
      ? [{ type: "bar" as const, palette: "income" as const, label: "Income", points: points(rows, (row) => row.income) }]
      : [{ type: "bar" as const, palette: "expense" as const, label: "Spend", points: points(rows, (row) => row.spend) }];
    const previousSeries = previousRows.some((row) => row.hasData)
          ? [{
              type: "value-marker" as const,
              palette: income ? "income" as const : "expense" as const,
              variant: "secondary" as const,
              label: "Previous year",
              points: points(previousRows, (row) => income ? row.income : row.spend),
            }]
      : [];
    return { ...base, ariaLabel: `Monthly ${income ? "income" : "spend"} for ${year}`, series: [...currentSeries, ...previousSeries] };
  }
  if (display === "monthly-savings-rate") return { ...base, ariaLabel: `Monthly savings rate for ${year}`, valueFormatter: (value) => `${value.toFixed(1)}%`, series: [
    { type: "bar" as const, palette: "savings" as const, label: "Savings rate", points: points(rows, savingsRate) },
    ...(previousRows.some((row) => row.hasData)
      ? [{ type: "value-marker" as const, palette: "savings" as const, variant: "secondary" as const, label: "Previous year", points: points(previousRows, savingsRate) }]
      : []),
  ] };
  if (display === "cumulative-income") return { ...base, ariaLabel: `Cumulative income for ${year}`, series: [line("Cumulative income", (row) => row.income, "income"), ...previousLine((row) => row.income, "income")] };
  if (display === "cumulative-spend") return { ...base, ariaLabel: `Cumulative spend for ${year}`, series: [line("Cumulative spend", (row) => row.spend, "expense"), ...previousLine((row) => row.spend, "expense")] };
  if (display === "cumulative-income-vs-spend") return { ...base, ariaLabel: `Cumulative income versus spend for ${year}`, series: [
    line("Cumulative income", (row) => row.income, "income"),
    line("Cumulative spend", (row) => row.spend, "expense"),
  ] };
  if (display === "cumulative-savings-rate") return { ...base, ariaLabel: `Cumulative savings rate for ${year}`, valueFormatter: (value) => `${value.toFixed(1)}%`, series: [
    { type: "line" as const, label: "Savings rate", palette: "savings" as const, points: cumulativeRatePoints(rows) },
    ...(previousRows.some((row) => row.hasData)
      ? [{ type: "line" as const, label: "Previous year", palette: "savings" as const, variant: "secondary" as const, points: cumulativeRatePoints(previousRows) }]
      : []),
  ] };
  if (display === "total-savings") return { ...base, ariaLabel: `Monthly savings for ${year}`, series: [
    { type: "bar" as const, palette: "savings" as const, label: "Monthly savings", points: points(rows, (row) => row.totalSavings) },
    ...(previousRows.some((row) => row.hasData)
      ? [{ type: "value-marker" as const, palette: "savings" as const, variant: "secondary" as const, barWidthScale: 0.5, label: "Previous year", points: points(previousRows, (row) => row.totalSavings) }]
      : []),
  ] };
  if (display === "income-vs-expense") return { ...base, ariaLabel: `Monthly income versus expense for ${year}`, series: [
    { type: "bar" as const, overlay: "income-vs-spend", palette: "income" as const, label: "Income", points: points(rows, (row) => row.income) },
    { type: "bar" as const, overlay: "income-vs-spend", palette: "expense" as const, label: "Spend", points: points(rows, (row) => -row.spend) },
  ] };
  return { ...base, ariaLabel: `Cumulative savings for ${year}`, series: [line("Cumulative savings", (row) => row.totalSavings, "savings"), ...previousLine((row) => row.totalSavings, "savings")] };
}
