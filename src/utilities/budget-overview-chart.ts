import type { Account } from "../api/account-api";
import type { BudgetTransaction } from "../api/budget-api";
import type { DataChartData } from "../components/data-chart/data-chart";
import {
  activityEffects,
  deductedInvestmentSavings,
  reportingTransactions,
} from "./activity-effects";

export type BudgetOverviewChartDisplay =
  | "total-savings"
  | "income-vs-expense"
  | "monthly-income"
  | "monthly-spend"
  | "monthly-savings-rate"
  | "cumulative-income"
  | "cumulative-spend"
  | "cumulative-income-vs-spend"
  | "cumulative-savings-rate"
  | "cumulative-savings";

export interface BudgetOverviewChartMonth {
  monthId: string;
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
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function monthsThroughLastData(
  rows: readonly BudgetOverviewChartMonth[],
): BudgetOverviewChartMonth[] {
  let lastDataIndex = -1;
  rows.forEach((row, index) => {
    if (row.hasData) lastDataIndex = index;
  });
  return lastDataIndex < 0 ? [] : rows.slice(0, lastDataIndex + 1);
}

function cumulative(
  rows: readonly BudgetOverviewChartMonth[],
  value: (row: BudgetOverviewChartMonth) => number,
): Array<{ date: string; value: number }> {
  let total = 0;
  return monthsThroughLastData(rows).map((row) => {
    total += value(row);
    return { date: row.monthId, value: total };
  });
}

export function buildBudgetOverviewChartMonths(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  year: number,
  today = new Date(),
  throughDate?: string,
): BudgetOverviewChartMonth[] {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    monthId: `${year}-${String(index + 1).padStart(2, "0")}`,
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
  const reporting = reportingTransactions(transactions, accounts);
  reporting.forEach((transaction) => {
    if (
      !validDate(transaction.date) ||
      transaction.date.slice(0, 4) !== String(year)
    )
      return;
    if (throughDate && transaction.date > throughDate) return;
    const month = Number(transaction.date.slice(5, 7)) - 1;
    if (year === today.getFullYear() && month > today.getMonth()) return;
    const row = rows[month];
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount)) return;
    row.hasData = true;
    if (transaction.type === "income") {
      row.income += amount;
      if (transaction.source === "deduction") row.deductions += amount;
      else row.manualIncome += amount;
    } else if (transaction.type === "expense") {
      row.spend += amount;
    }
  });
  transactions.forEach((transaction) => {
    if (
      !validDate(transaction.date) ||
      transaction.date.slice(0, 4) !== String(year)
    ) return;
    if (throughDate && transaction.date > throughDate) return;
    const month = Number(transaction.date.slice(5, 7)) - 1;
    if (year === today.getFullYear() && month > today.getMonth()) return;
    const effects = activityEffects(transaction, accounts);
    if (!effects.expense) return;
    const row = rows[month];
    if (effects.account?.type === "debt") row.debtPayments += effects.expense;
    else if (transaction.source === "deduction") row.deductedExpenses += effects.expense;
    else row.standardExpenses += effects.expense;
  });
  const deductedInvestmentByMonth = new Map<string, number>();
  transactions.forEach((transaction) => {
    if (
      transaction.source !== "deduction" ||
      !validDate(transaction.date) ||
      transaction.date.slice(0, 4) !== String(year)
    )
      return;
    if (throughDate && transaction.date > throughDate) return;
    const amount = deductedInvestmentSavings([transaction], accounts);
    if (amount)
      deductedInvestmentByMonth.set(
        transaction.date.slice(0, 7),
        (deductedInvestmentByMonth.get(transaction.date.slice(0, 7)) ?? 0) +
          amount,
      );
  });
  rows.forEach((row) => {
    row.deductedSavings = deductedInvestmentByMonth.get(row.monthId) ?? 0;
    row.budgetSavings = row.income - row.spend - row.deductedSavings;
    row.totalSavings = row.budgetSavings + row.deductedSavings;
  });
  return rows;
}

export function budgetOverviewChartData(
  rows: readonly BudgetOverviewChartMonth[],
  display: BudgetOverviewChartDisplay,
  year: number,
  previousRows: readonly BudgetOverviewChartMonth[] = [],
): DataChartData {
  const activeRows = rows.filter((row) => row.hasData);
  const points = (value: (row: BudgetOverviewChartMonth) => number) =>
    activeRows.map((row) => ({ date: row.monthId, value: value(row) }));
  const previousPoints = (value: (row: BudgetOverviewChartMonth) => number) =>
    previousRows.filter((row) => row.hasData).map((row) => ({ date: row.monthId, value: value(row) }));
  const savingsRate = (row: BudgetOverviewChartMonth) =>
    row.income === 0 ? 0 : (row.totalSavings / row.income) * 100;
  const cumulativeRatePoints = (sourceRows: readonly BudgetOverviewChartMonth[]) => {
    let income = 0;
    let savings = 0;
    return sourceRows.filter((row) => row.hasData).map((row) => {
      income += row.income;
      savings += row.totalSavings;
      return { date: row.monthId, value: income === 0 ? 0 : (savings / income) * 100 };
    });
  };
  const line = (
    label: string,
    value: (row: BudgetOverviewChartMonth) => number,
    variant?: "secondary",
    sourceRows: readonly BudgetOverviewChartMonth[] = rows,
    palette: "income" | "expense" | "savings" | "comparison" = "income",
  ) => ({
    type: "line" as const,
    label,
    variant,
    palette,
    points: cumulative(sourceRows, value),
  });
  const previousLine = (
    value: (row: BudgetOverviewChartMonth) => number,
    palette: "income" | "expense" | "savings",
  ) =>
    previousRows.some((row) => row.hasData)
      ? [line(`Previous year`, value, "secondary", previousRows, palette)]
      : [];
  const base = {
    year,
    format: "monthly" as const,
    ariaLabel: `${year} budget overview chart`,
  };
  if (display === "total-savings")
    return {
      ...base,
      ariaLabel: `Monthly savings for ${year}`,
      series: [
        {
          type: "bar",
          palette: "savings",
          label: "Monthly savings",
          points: points((row) => row.totalSavings),
        },
        ...(previousRows.some((row) => row.hasData)
          ? [{
              type: "value-marker" as const,
              palette: "savings" as const,
              variant: "secondary" as const,
              barWidthScale: 0.5,
              label: "Previous year",
              points: previousPoints((row) => row.totalSavings),
            }]
          : []),
      ],
    };
  if (display === "income-vs-expense")
    return {
      ...base,
      ariaLabel: `Monthly income versus expense for ${year}`,
      series: [
        {
          type: "bar",
          overlay: "income-vs-spend",
          palette: "income",
          label: "Income",
          points: points((row) => row.income),
        },
        {
          type: "bar",
          overlay: "income-vs-spend",
          palette: "expense",
          label: "Spend",
          points: points((row) => -row.spend),
        },
      ],
    };
  if (display === "monthly-income")
    return {
      ...base,
      ariaLabel: `Monthly income for ${year}`,
      series: [
        {
          type: "bar",
          palette: "income",
          label: "Income",
          points: points((row) => row.income),
        },
        ...(previousRows.some((row) => row.hasData)
          ? [{
              type: "value-marker" as const,
              palette: "income" as const,
              variant: "secondary" as const,
              label: "Previous year",
              points: previousPoints((row) => row.income),
            }]
          : []),
      ],
    };
  if (display === "monthly-spend")
    return {
      ...base,
      ariaLabel: `Monthly spend for ${year}`,
      series: [
        {
          type: "bar",
          palette: "expense",
          label: "Spend",
          points: points((row) => row.spend),
        },
        ...(previousRows.some((row) => row.hasData)
          ? [{
              type: "value-marker" as const,
              palette: "expense" as const,
              variant: "secondary" as const,
              label: "Previous year",
              points: previousPoints((row) => row.spend),
            }]
          : []),
      ],
    };
  if (display === "monthly-savings-rate")
    return {
      ...base,
      ariaLabel: `Monthly savings rate for ${year}`,
      valueFormatter: (value) => `${value.toFixed(1)}%`,
      series: [
        { type: "bar", palette: "savings", label: "Savings rate", points: points(savingsRate) },
        ...(previousRows.some((row) => row.hasData)
          ? [{ type: "value-marker" as const, palette: "savings" as const, variant: "secondary" as const, label: "Previous year", points: previousPoints(savingsRate) }]
          : []),
      ],
    };
  if (display === "cumulative-income")
    return {
      ...base,
      ariaLabel: `Cumulative income for ${year}`,
      series: [
        line(
          "Cumulative income",
          (row) => row.income,
          undefined,
          rows,
          "income",
        ),
        ...previousLine((row) => row.income, "income"),
      ],
    };
  if (display === "cumulative-spend")
    return {
      ...base,
      ariaLabel: `Cumulative spend for ${year}`,
      series: [
        line(
          "Cumulative spend",
          (row) => row.spend,
          undefined,
          rows,
          "expense",
        ),
        ...previousLine((row) => row.spend, "expense"),
      ],
    };
  if (display === "cumulative-income-vs-spend")
    return {
      ...base,
      ariaLabel: `Cumulative income versus spend for ${year}`,
      series: [
        line("Cumulative income", (row) => row.income, undefined, rows, "income"),
        line("Cumulative spend", (row) => row.spend, undefined, rows, "expense"),
      ],
    };
  if (display === "cumulative-savings-rate")
    return {
      ...base,
      ariaLabel: `Cumulative savings rate for ${year}`,
      valueFormatter: (value) => `${value.toFixed(1)}%`,
      series: [
        { type: "line" as const, label: "Savings rate", palette: "savings" as const, points: cumulativeRatePoints(rows) },
        ...(previousRows.some((row) => row.hasData)
          ? [{ type: "line" as const, label: "Previous year", palette: "savings" as const, variant: "secondary" as const, points: cumulativeRatePoints(previousRows) }]
          : []),
      ],
    };
  return {
    ...base,
    ariaLabel: `Cumulative savings for ${year}`,
    series: [
      line(
        "Cumulative savings",
        (row) => row.totalSavings,
        undefined,
        rows,
        "savings",
      ),
        ...previousLine((row) => row.totalSavings, "savings"),
    ],
  };
}
