import { describe, expect, test } from "bun:test";
import type { BudgetTransaction, TransactionType } from "../src/api/budget-api";
import { buildSpendTrendSeries } from "../src/utilities/spend-trend";

function transaction(date: string, amount: number, type: TransactionType = "expense"): BudgetTransaction {
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

function addWeeks(value: Date, weeks: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + weeks * 7);
  return date;
}

function addMonths(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function dateId(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

describe("spending trend series", () => {
  test("groups weekly spending Sunday through Saturday across year boundaries", () => {
    const series = buildSpendTrendSeries([
      transaction("2025-12-31", 10),
      transaction("2026-01-03", 20),
      transaction("2026-01-04", 999, "income"),
      transaction("2026-01-10", 40),
      transaction("2026-01-17", 50),
      transaction("2026-01-18", 60),
      transaction("2026-01-19", 70),
      transaction("not-a-date", 80),
      transaction("2026-01-11", -10),
    ], "weekly", { today: new Date(2026, 0, 18) });

    expect(series.points.map((point) => [point.periodStart, point.periodEnd, point.total])).toEqual([
      ["2025-12-28", "2026-01-03", 30],
      ["2026-01-04", "2026-01-10", 40],
      ["2026-01-11", "2026-01-17", 50],
    ]);
    expect(series.currentPeriodSpend).toBe(60);
  });

  test("inserts zero-spend weeks and normalizes over available history", () => {
    const series = buildSpendTrendSeries([
      transaction("2026-01-04", 10),
      transaction("2026-01-18", 40),
    ], "weekly", { today: new Date(2026, 0, 25) });

    expect(series.points.map((point) => point.total)).toEqual([10, 0, 40]);
    expect(series.points.map((point) => point.sampleSize)).toEqual([1, 2, 3]);
    expect(series.points.at(-1)!.weightedAverage).toBeCloseTo(130 / 6);
    expect(series.weightedAverageChange).toBeCloseTo((130 / 6) - (10 / 3));
  });

  test("uses off-chart weeks for a full 12-week weighted window", () => {
    const firstWeek = new Date(2025, 0, 5);
    const transactions = Array.from({ length: 23 }, (_, index) =>
      transaction(dateId(addWeeks(firstWeek, index)), index + 1),
    );
    const series = buildSpendTrendSeries(transactions, "weekly", {
      today: addWeeks(firstWeek, 23),
    });

    expect(series.points).toHaveLength(12);
    expect(series.points[0].periodStart).toBe(dateId(addWeeks(firstWeek, 11)));
    expect(series.points[0].sampleSize).toBe(12);
    expect(series.points[0].weightedAverage).toBeCloseTo(650 / 78);
  });

  test("builds six completed months with a 1-through-6 weighted average", () => {
    const firstMonth = new Date(2025, 0, 1);
    const transactions = Array.from({ length: 11 }, (_, index) =>
      transaction(dateId(addMonths(firstMonth, index)), (index + 1) * 100),
    );
    const series = buildSpendTrendSeries(transactions, "monthly", {
      today: new Date(2025, 11, 15),
    });

    expect(series.points).toHaveLength(6);
    expect(series.points[0].periodStart).toBe("2025-06-01");
    expect(series.points.at(-1)!.periodEnd).toBe("2025-11-30");
    expect(series.points[0].sampleSize).toBe(6);
    expect(series.latestWeightedAverage).toBeCloseTo(19600 / 21);
  });

  test("inserts empty months, crosses years, and excludes the current month", () => {
    const series = buildSpendTrendSeries([
      transaction("2025-11-30", 100),
      transaction("2026-01-15", 300),
      transaction("2026-02-10", 75),
      transaction("2026-02-20", 25),
    ], "monthly", { today: new Date(2026, 1, 11) });

    expect(series.points.map((point) => [point.periodStart, point.total])).toEqual([
      ["2025-11-01", 100],
      ["2025-12-01", 0],
      ["2026-01-01", 300],
    ]);
    expect(series.currentPeriodSpend).toBe(75);
  });

  test("keeps a current-period-only expense out of both completed charts", () => {
    for (const period of ["weekly", "monthly"] as const) {
      const series = buildSpendTrendSeries(
        [transaction("2026-01-25", 25)],
        period,
        { today: new Date(2026, 0, 25) },
      );
      expect(series.hasExpenseHistory).toBe(true);
      expect(series.points).toEqual([]);
      expect(series.currentPeriodSpend).toBe(25);
      expect(series.latestWeightedAverage).toBeNull();
    }
  });

  test("returns an empty state when there is no expense history", () => {
    const series = buildSpendTrendSeries(
      [transaction("2026-01-10", 100, "income")],
      "monthly",
      { today: new Date(2026, 0, 25) },
    );
    expect(series.hasExpenseHistory).toBe(false);
    expect(series.points).toEqual([]);
    expect(series.currentPeriodSpend).toBe(0);
  });
});
