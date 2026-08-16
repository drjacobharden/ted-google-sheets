import { describe, expect, test } from "bun:test";
import type { BudgetTransaction } from "../src/api/budget-api";
import { buildAnnualSpendTrendSeries } from "../src/utilities/annual-spend-trend";

function expense(date: string, amount: number): BudgetTransaction {
  return {
    id: `${date}-${amount}`,
    createdAt: date,
    createdBy: "user",
    type: "expense",
    amount,
    date,
    categoryId: "category",
    vendorId: "vendor",
    assignmentId: "assignment",
    notes: "",
  };
}

describe("annual spending trend", () => {
  test("plots all twelve months while preserving missing actual totals", () => {
    const series = buildAnnualSpendTrendSeries(
      [expense("2026-01-10", 100), expense("2026-03-10", 300)],
      2026,
      "monthly",
      { today: new Date(2026, 7, 12) },
    );

    expect(series.points).toHaveLength(12);
    expect(series.points[0].date).toBe("2026-01-01");
    expect(series.points.at(-1)!.date).toBe("2026-12-01");
    expect(series.points[0].total).toBe(100);
    expect(series.points[1].total).toBeNull();
    expect(series.points[2].total).toBe(300);
    expect(series.points.every((point) => Number.isFinite(point.trend))).toBe(true);
    expect(series.points.slice(0, 7).every((point) => point.isTrendAvailable)).toBe(true);
    expect(series.points.slice(7).every((point) => !point.isTrendAvailable)).toBe(true);
  });

  test("uses the existing recent-weighted calculation and off-chart history", () => {
    const transactions = Array.from({ length: 12 }, (_, index) =>
      expense(`2025-${String(index + 1).padStart(2, "0")}-10`, (index + 1) * 100),
    );
    const series = buildAnnualSpendTrendSeries(
      transactions,
      2026,
      "monthly",
      { today: new Date(2026, 7, 12) },
    );

    expect(series.points[0].trend).toBeCloseTo(16000 / 21);
    expect(series.points[0].total).toBeNull();
  });

  test("aligns a prior-year trend and compares against the requested lookback", () => {
    const transactions = [
      ...Array.from({ length: 12 }, (_, index) =>
        expense(`2025-${String(index + 1).padStart(2, "0")}-10`, 100),
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        expense(`2026-${String(index + 1).padStart(2, "0")}-10`, (index + 1) * 100),
      ),
    ];
    const series = buildAnnualSpendTrendSeries(
      transactions,
      2026,
      "monthly",
      { today: new Date(2026, 6, 15) },
    );

    expect(series.hasPriorYearTrend).toBe(true);
    expect(series.points.every((point) => point.priorYearTrend !== null)).toBe(true);
    expect(series.comparisonPeriods).toBe(3);
    expect(series.comparisonPeriodsUsed).toBe(3);
    expect(series.trendPercentChange).not.toBeNull();
  });

  test("falls back to the earliest observed point when history is short", () => {
    const series = buildAnnualSpendTrendSeries(
      [expense("2026-04-05", 100), expense("2026-04-19", 200)],
      2026,
      "weekly",
      { today: new Date(2026, 4, 3) },
    );

    expect(series.comparisonPeriods).toBe(12);
    expect(series.comparisonPeriodsUsed).toBeLessThan(12);
    expect(series.trendPercentChange).not.toBeNull();
  });

  test("calculates full-year trend averages and prior-year comparison", () => {
    const transactions = [
      ...Array.from({ length: 12 }, (_, index) =>
        expense(`2024-${String(index + 1).padStart(2, "0")}-10`, 50),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        expense(`2025-${String(index + 1).padStart(2, "0")}-10`, 100),
      ),
    ];
    const series = buildAnnualSpendTrendSeries(
      transactions,
      2025,
      "monthly",
      { today: new Date(2026, 7, 12) },
    );
    const currentMean = series.points.reduce((sum, point) => sum + point.trend, 0) / 12;
    const priorSeries = buildAnnualSpendTrendSeries(
      transactions,
      2024,
      "monthly",
      { today: new Date(2026, 7, 12) },
    );
    const priorMean = priorSeries.annualAverageTrend!;

    expect(series.annualAverageTrend).toBeCloseTo(currentMean);
    expect(series.priorAnnualAverageTrend).toBeCloseTo(priorMean);
    expect(series.annualAveragePercentChange).toBeCloseTo(
      ((currentMean - priorMean) / priorMean) * 100,
    );
  });
});
