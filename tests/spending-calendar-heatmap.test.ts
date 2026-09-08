import { describe, expect, test } from "bun:test";
import type { Account } from "../src/api/account-api";
import type { BudgetTransaction } from "../src/api/budget-api";
import { buildAnnualSpendingCalendar } from "../src/utilities/annual-spending-calendar";
import { buildAnnualSpendingHeatmap } from "../src/utilities/annual-spending-heatmap";

const investment: Account = {
  id: "investment",
  name: "401(k)",
  type: "investment",
  assignmentId: "shared",
  active: true,
  source: "manual",
  createdAt: "",
  updatedAt: "",
};

function row(
  id: string,
  amount: number,
  values: Partial<BudgetTransaction> = {},
): BudgetTransaction {
  return {
    id,
    createdAt: "",
    createdBy: "user",
    type: "expense",
    amount,
    date: "2026-01-15",
    source: "manual",
    notes: "",
    ...values,
  };
}

describe("spending calendar", () => {
  test("builds monthly balance, quarterly totals, and deduction-aware tooltip values", () => {
    const calendar = buildAnnualSpendingCalendar([
      row("salary", 100, { type: "income", date: "2026-01-05" }),
      row("spend", 75, { date: "2026-01-06" }),
      row("deducted-health", 10, { source: "deduction", date: "2026-01-07" }),
      row("deducted-investment", 20, { source: "deduction", accountId: investment.id, date: "2026-01-08" }),
      row("prior-year", 500, { type: "income", date: "2025-01-01" }),
    ], [investment], 2026);

    expect(calendar.months).toHaveLength(12);
    expect(calendar.months[0]).toMatchObject({
      income: 130,
      spend: 85,
      savings: 45,
      balance: 45,
      hasData: true,
    });
    expect(calendar.quarters[0]?.total).toBe(45);
    expect(calendar.months.slice(1).every((month) => !month.hasData)).toBe(true);
  });
});

describe("spending heatmap", () => {
  test("builds every day in the year, maps weekday rows, and assigns darker levels to higher spend", () => {
    const heatmap = buildAnnualSpendingHeatmap([
      row("small", 10, { date: "2025-01-01" }),
      row("large", 30, { date: "2025-01-02" }),
      row("prior-year", 100, { date: "2024-01-01" }),
    ], [], 2025);

    expect(heatmap.days).toHaveLength(365);
    expect(heatmap.hasData).toBe(true);
    expect(heatmap.days.find((day) => day.date === "2025-01-01")).toMatchObject({
      week: 0,
      weekday: 3,
      spend: 10,
      level: 1,
    });
    expect(heatmap.days.find((day) => day.date === "2025-01-02")).toMatchObject({
      week: 0,
      weekday: 4,
      spend: 30,
      level: 4,
    });
    expect(Math.max(...heatmap.days.map((day) => day.week))).toBe(52);
  });

  test("does not create future no-spend days for the current year", () => {
    const today = new Date();
    const year = today.getFullYear();
    const heatmap = buildAnnualSpendingHeatmap([], [], year);
    const expectedElapsedDays =
      Math.floor(
        (Date.UTC(year, today.getMonth(), today.getDate()) -
          Date.UTC(year, 0, 1)) /
          (86_400_000),
      ) + 1;

    expect(heatmap.days).toHaveLength(expectedElapsedDays);
    expect(heatmap.days.at(-1)?.date).toBe(
      `${year}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    );
  });
});
