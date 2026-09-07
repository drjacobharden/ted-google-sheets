import { describe, expect, test } from "bun:test";
import type { AnnualSpendingHeatmap } from "../src/utilities/annual-spending-heatmap";
import {
  analyzeDailySpending,
  getDailySpendingInsights,
} from "../src/utilities/daily-spending-insights";

function heatmap(spends: number[]): AnnualSpendingHeatmap {
  const start = Date.UTC(2025, 0, 1);
  const days = spends.map((spend, index) => {
    const date = new Date(start + index * 86_400_000);
    return {
      id: date.toISOString().slice(0, 10),
      date: date.toISOString().slice(0, 10),
      year: 2025,
      dayOfYear: index,
      week: Math.floor((index + 3) / 7),
      weekday: date.getUTCDay(),
      spend,
      level: spend > 0 ? 1 : 0,
    };
  });
  return { year: 2025, days, hasData: days.some((day) => day.spend > 0) };
}

describe("daily spending insights", () => {
  test("returns a factual fallback for zero spending", () => {
    const insights = getDailySpendingInsights(analyzeDailySpending(heatmap([0, 0, 0])));
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      headline: "No spending yet.",
      isFallback: true,
    });
  });

  test("ranks multiple valid observations and keeps every available insight", () => {
    const insights = getDailySpendingInsights(
      analyzeDailySpending(heatmap([
        1000, 0, 0, 0, 0, 0, 0,
        50, 50, 50, 50, 50, 50, 50,
        50, 50, 50, 50, 50, 50, 50,
        50, 50, 50, 50, 50, 50, 50,
      ])),
    );

    expect(insights.length).toBeGreaterThan(1);
    expect(insights.every((item, index) => index === 0 || item.score <= insights[index - 1]!.score)).toBe(true);
    expect(insights.some((item) => item.id === "single-day-outlier")).toBe(true);
    expect(insights.some((item) => item.id === "no-spend-streak")).toBe(true);
  });

  test("detects a steady daily pattern without inventing an empty state", () => {
    const insights = getDailySpendingInsights(
      analyzeDailySpending(heatmap(Array.from({ length: 30 }, () => 100))),
    );
    expect(insights.some((item) => item.id === "consistent-spending")).toBe(true);
    expect(insights[0]?.headline).toBe("Your spending stayed remarkably steady.");
  });

  test("measures elapsed days, streaks, and above-average days from the shared input", () => {
    const metrics = analyzeDailySpending(heatmap([10, 0, 0, 40, 0, 20]));
    expect(metrics.elapsedDays).toBe(6);
    expect(metrics.spendingDays).toBe(3);
    expect(metrics.noSpendDays).toBe(3);
    expect(metrics.longestNoSpendStreak).toBe(2);
    expect(metrics.longestSpendingStreak).toBe(1);
    expect(metrics.daysAboveAverage).toBe(2);
  });

  test("reports one-day streaks instead of suppressing them with a minimum", () => {
    const insights = getDailySpendingInsights(
      analyzeDailySpending(
        heatmap(Array.from({ length: 14 }, (_, index) => (index % 2 === 0 ? 10 : 0))),
      ),
    );

    expect(insights.some((item) => item.id === "no-spend-streak")).toBe(true);
    expect(insights.some((item) => item.id === "spending-streak")).toBe(true);
    expect(insights.find((item) => item.id === "above-average-spending-days")?.dayIds).toHaveLength(7);
  });
});
