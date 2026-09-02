import { describe, expect, test } from "bun:test";
import type { Account } from "../src/api/account-api";
import type { BudgetTransaction } from "../src/api/budget-api";
import {
  buildEntityChartMonths,
  entityChartData,
} from "../src/utilities/entity-detail-chart";

const accounts: Account[] = [
  { id: "investment", name: "Brokerage", type: "investment", assignmentId: "person", active: true, source: "manual", createdAt: "", updatedAt: "" },
  { id: "debt", name: "Loan", type: "debt", assignmentId: "person", categoryId: "housing", active: true, source: "manual", createdAt: "", updatedAt: "" },
];

function transaction(values: Partial<BudgetTransaction>): BudgetTransaction {
  return {
    id: values.id ?? "row",
    createdAt: "2026-01-01",
    createdBy: "user",
    type: "expense",
    amount: 0,
    date: "2026-01-15",
    source: "manual",
    notes: "",
    ...values,
  };
}

describe("entity detail chart data", () => {
  test("uses derived account category and assignment and separates expense sources", () => {
    const rows = buildEntityChartMonths([
      transaction({ id: "standard", categoryId: "food", assignmentId: "person", amount: 100 }),
      transaction({ id: "deducted", categoryId: "food", assignmentId: "person", amount: 25, source: "deduction" }),
      transaction({ id: "debt-payment", accountId: "debt", amount: 40, source: "deduction" }),
      transaction({ id: "investment", accountId: "investment", amount: 60, source: "deduction" }),
    ], accounts, "category", "housing", 2026, new Date(2026, 5, 1));

    expect(rows[0]).toMatchObject({
      income: 40,
      deductions: 40,
      spend: 40,
      debtPayments: 40,
      deductedSavings: 0,
    });

    const personRows = buildEntityChartMonths([
      transaction({ id: "debt-payment", accountId: "debt", amount: 40 }),
      transaction({ id: "investment", accountId: "investment", amount: 60, source: "deduction" }),
    ], accounts, "assignment", "person", 2026, new Date(2026, 5, 1));
    expect(personRows[0]).toMatchObject({ income: 60, spend: 40, deductedSavings: 60 });
  });

  test("builds stacked monthly comparisons and cumulative prior-year lines", () => {
    const current = buildEntityChartMonths([
      transaction({ id: "current", categoryId: "food", amount: 100 }),
    ], accounts, "category", "food", 2026, new Date(2026, 5, 1));
    const previous = buildEntityChartMonths([
      transaction({ id: "previous", categoryId: "food", amount: 80, date: "2025-01-15" }),
    ], accounts, "category", "food", 2025, new Date(2026, 5, 1));

    const monthly = entityChartData(current, "monthly-spend", 2026, previous).series;
    expect(monthly).toHaveLength(2);
    expect(monthly[0]).toMatchObject({ type: "bar", label: "Spend", palette: "expense" });
    expect(monthly[1]).toMatchObject({ type: "value-marker", palette: "expense", variant: "secondary" });

    const cumulative = entityChartData(current, "cumulative-spend", 2026, previous).series;
    expect(cumulative.map((item) => [item.label, item.variant, item.palette])).toEqual([
      ["Cumulative spend", undefined, "expense"],
      ["Previous year", "secondary", "expense"],
    ]);
    expect(cumulative[1].points[0].value).toBe(80);
  });

  test("fills empty months inside cumulative series with zero-value increments", () => {
    const rows = buildEntityChartMonths([
      transaction({ id: "january", categoryId: "food", amount: 100, date: "2026-01-15" }),
      transaction({ id: "april", categoryId: "food", amount: 50, date: "2026-04-15" }),
    ], accounts, "category", "food", 2026, new Date(2026, 5, 1));

    const series = entityChartData(rows, "cumulative-spend", 2026).series[0];
    expect(series.points.map((point) => point.date)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
    ]);
    expect(series.points.map((point) => point.value)).toEqual([100, 100, 100, 150, 150, 150]);
  });
});
