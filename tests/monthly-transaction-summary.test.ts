import { describe, expect, test } from "bun:test";
import type { BudgetTransaction, TransactionType } from "../src/api/budget-api";
import {
  buildMonthlyTransactionSummaries,
  monthlyNetDifference,
} from "../src/utilities/monthly-transaction-summary";

function transaction(
  date: string,
  amount: number,
  type: TransactionType = "expense",
): BudgetTransaction {
  return {
    id: `${type}-${date}-${amount}`,
    createdAt: date,
    createdBy: "user",
    type,
    amount,
    date,
    categoryId: "category",
    vendorId: "vendor",
    assignmentId: "assignment",
    notes: "",
  };
}

describe("monthly transaction summaries", () => {
  test("returns January through December placeholders for an empty history", () => {
    const summaries = buildMonthlyTransactionSummaries([], {
      today: new Date(2026, 7, 11),
    });

    expect(Object.keys(summaries)).toEqual(["2026"]);
    expect(summaries[2026]).toHaveLength(12);
    expect(summaries[2026].map((row) => row.monthId)).toEqual(
      Array.from({ length: 12 }, (_, index) =>
        `2026-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(summaries[2026].every((row) =>
      !row.hasData
      && row.spend === null
      && row.income === null
      && row.netBalance === null
    )).toBe(true);
  });

  test("totals income, expense, and signed refund adjustments", () => {
    const summaries = buildMonthlyTransactionSummaries([
      transaction("2026-01-02", 100),
      transaction("2026-01-08", 25),
      transaction("2026-01-10", -20),
      transaction("2026-01-15", 250, "income"),
      transaction("2026-02-03", 75, "income"),
      transaction("2026-03-04", 40),
    ], { today: new Date(2026, 7, 11) });

    expect(summaries[2026][0]).toEqual({
      monthId: "2026-01",
      spend: 105,
      income: 250,
      netBalance: 145,
      hasData: true,
    });
    expect(summaries[2026][1]).toMatchObject({
      spend: 0,
      income: 75,
      netBalance: 75,
      hasData: true,
    });
    expect(summaries[2026][2]).toMatchObject({
      spend: 40,
      income: 0,
      netBalance: -40,
      hasData: true,
    });
  });

  test("separates years and fills intervening years with empty months", () => {
    const summaries = buildMonthlyTransactionSummaries([
      transaction("2023-12-31", 10),
      transaction("2025-01-01", 20, "income"),
    ], { today: new Date(2026, 7, 11) });

    expect(Object.keys(summaries)).toEqual(["2023", "2024", "2025", "2026"]);
    expect(summaries[2023][11].spend).toBe(10);
    expect(summaries[2024].every((row) => !row.hasData)).toBe(true);
    expect(summaries[2025][0].income).toBe(20);
    expect(summaries[2026]).toHaveLength(12);
  });

  test("ignores invalid dates, non-finite amounts, and future years", () => {
    const summaries = buildMonthlyTransactionSummaries([
      transaction("not-a-date", 10),
      transaction("2026-02-30", 20),
      transaction("2026-01-02", Number.NaN),
      transaction("2027-01-02", 40),
      transaction("2025-06-15", 50),
    ], { today: new Date(2026, 7, 11) });

    expect(Object.keys(summaries)).toEqual(["2025", "2026"]);
    expect(summaries[2025][5].spend).toBe(50);
    expect(summaries[2026].every((row) => !row.hasData)).toBe(true);
  });

  test("calculates the signed net difference from the same prior-year month", () => {
    const summaries = buildMonthlyTransactionSummaries([
      transaction("2025-01-02", 400),
      transaction("2025-01-15", 1_000, "income"),
      transaction("2026-01-02", 300),
      transaction("2026-01-15", 1_200, "income"),
      transaction("2026-02-01", 50),
    ], { today: new Date(2026, 7, 11) });

    expect(monthlyNetDifference(summaries[2026][0], summaries[2025][0])).toBe(300);
    expect(monthlyNetDifference(summaries[2026][1], summaries[2025][1])).toBeNull();
  });
});
