import { describe, expect, test } from "bun:test";
import type { Account } from "../src/api/account-api";
import type { BudgetTransaction } from "../src/api/budget-api";
import {
  budgetOverviewChartData,
  buildBudgetOverviewChartMonths,
} from "../src/utilities/budget-overview-chart";

const accounts: Account[] = [
  { id: "brokerage", name: "Brokerage", type: "investment", assignmentId: "", active: true, source: "manual", createdAt: "", updatedAt: "" },
  { id: "mortgage", name: "Mortgage", type: "debt", assignmentId: "", active: true, source: "manual", categoryId: "housing", createdAt: "", updatedAt: "" },
];

function transaction(values: Partial<BudgetTransaction>): BudgetTransaction {
  return {
    id: values.id ?? "row",
    createdAt: "2026-01-01",
    createdBy: "user",
    type: "income",
    amount: 0,
    date: "2026-01-15",
    source: "manual",
    notes: "",
    ...values,
  };
}

describe("budget overview chart data", () => {
  test("separates manual income, deductions, spend, and deducted investment savings", () => {
    const rows = buildBudgetOverviewChartMonths([
      transaction({ id: "salary", amount: 1_000 }),
      transaction({ id: "deducted-investment", type: "income", amount: 200, source: "deduction", accountId: "brokerage" }),
      transaction({ id: "deducted-expense", type: "expense", amount: 50, source: "deduction" }),
      transaction({ id: "debt-payment", type: "expense", amount: 100, source: "deduction", accountId: "mortgage" }),
      transaction({ id: "expense", type: "expense", amount: 300 }),
    ], accounts, 2026, new Date(2026, 5, 1));

    expect(rows[0]).toMatchObject({
      income: 1_350,
      manualIncome: 1_000,
      deductions: 350,
      spend: 450,
      deductedSavings: 200,
      budgetSavings: 700,
      totalSavings: 900,
    });
  });

  test("builds monthly savings and dashed prior-year cumulative series", () => {
    const rows = buildBudgetOverviewChartMonths([
      transaction({ id: "income", amount: 1_000, date: "2026-01-15" }),
    ], accounts, 2026, new Date(2026, 5, 1));
    const previous = buildBudgetOverviewChartMonths([
      transaction({ id: "prior-income", amount: 800, date: "2025-01-15" }),
    ], accounts, 2025, new Date(2026, 5, 1));

    expect(budgetOverviewChartData(rows, "total-savings", 2026).ariaLabel).toBe("Monthly savings for 2026");
    const savings = budgetOverviewChartData(rows, "total-savings", 2026, previous).series;
    expect(savings.map((item) => [item.type, item.label, item.palette])).toEqual([
      ["bar", "Monthly savings", "savings"],
      ["value-marker", "Previous year", "savings"],
    ]);
    const cumulativeIncome = budgetOverviewChartData(rows, "cumulative-income", 2026, previous).series;
    expect(cumulativeIncome.map((item) => [item.label, item.variant])).toEqual([
      ["Cumulative income", undefined],
      ["Previous year", "secondary"],
    ]);
    expect(cumulativeIncome[1].points[0].value).toBe(800);
    expect(cumulativeIncome.map((item) => item.palette)).toEqual(["income", "income"]);
  });

  test("mirrors total income and spend around zero", () => {
    const rows = buildBudgetOverviewChartMonths([
      transaction({ id: "standard", type: "expense", amount: 100 }),
      transaction({ id: "deducted", type: "expense", amount: 50, source: "deduction" }),
      transaction({ id: "debt", type: "expense", amount: 75, source: "deduction", accountId: "mortgage" }),
    ], accounts, 2026, new Date(2026, 5, 1));
    const series = budgetOverviewChartData(rows, "income-vs-expense", 2026).series;
    expect(series.map((item) => [item.type, item.overlay, item.label, item.palette])).toEqual([
      ["bar", "income-vs-spend", "Income", "income"],
      ["bar", "income-vs-spend", "Spend", "expense"],
    ]);
    expect(series[0].points[0].value).toBe(125);
    expect(series[1].points[0].value).toBe(-225);
  });

  test("adds monthly income and spend comparisons as value markers", () => {
    const rows = buildBudgetOverviewChartMonths([
      transaction({ id: "income", amount: 1_000, date: "2026-01-15" }),
      transaction({ id: "spend", type: "expense", amount: 300, date: "2026-01-15" }),
    ], accounts, 2026, new Date(2026, 5, 1));
    const previous = buildBudgetOverviewChartMonths([
      transaction({ id: "prior-income", amount: 800, date: "2025-01-15" }),
      transaction({ id: "prior-spend", type: "expense", amount: 200, date: "2025-01-15" }),
    ], accounts, 2025, new Date(2026, 5, 1));

    for (const display of ["monthly-income", "monthly-spend"] as const) {
      const series = budgetOverviewChartData(rows, display, 2026, previous).series;
      expect(series.map((item) => [item.type, item.palette, item.variant, item.barWidthScale])).toEqual([
        ["bar", display === "monthly-income" ? "income" : "expense", undefined, undefined],
        ["value-marker", display === "monthly-income" ? "income" : "expense", "secondary", undefined],
      ]);
    }
  });

  test("builds combined cumulative income and spend lines", () => {
    const rows = buildBudgetOverviewChartMonths([
      transaction({ id: "income", amount: 1_000, date: "2026-01-15" }),
      transaction({ id: "spend", type: "expense", amount: 300, date: "2026-01-15" }),
    ], accounts, 2026, new Date(2026, 5, 1));
    const series = budgetOverviewChartData(rows, "cumulative-income-vs-spend", 2026).series;
    expect(series.map((item) => [item.label, item.palette, item.variant])).toEqual([
      ["Cumulative income", "income", undefined],
      ["Cumulative spend", "expense", undefined],
    ]);
    expect(series[0].points[0].value).toBe(1_000);
    expect(series[1].points[0].value).toBe(300);
  });
});
