import { describe, expect, test } from "bun:test";
import type { BudgetEntity, BudgetTransaction } from "../src/api/budget-api";
import { buildAnnualHeatmapFromDailyAmounts } from "../src/utilities/annual-spending-heatmap";
import {
  buildBudgetSpendingInsights,
  classifyCategoryKind,
} from "../src/utilities/budget-spending-insights";

const entity = (id: string, name: string): BudgetEntity => ({
  id,
  name,
  active: true,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
});

function transaction(
  id: string,
  date: string,
  amount: number,
  categoryId: string,
  vendorId: string,
  assignmentId: string,
): BudgetTransaction {
  return {
    id,
    createdAt: `${date}T12:00:00.000Z`,
    createdBy: "test",
    type: "expense",
    amount,
    date,
    categoryId,
    vendorId,
    assignmentId,
    source: "manual",
    notes: "",
  };
}

describe("budget spending insights", () => {
  test("centralizes semantic category classification", () => {
    expect(classifyCategoryKind("Dining & Restaurants")).toBe("dining");
    expect(classifyCategoryKind("Rent")).toBe("housing");
    expect(classifyCategoryKind("Something else")).toBe("other");
  });

  test("adds entity and relationship observations without truncating the set", () => {
    const categories = [entity("food", "Dining"), entity("home", "Housing")];
    const vendors = [entity("restaurant", "The Restaurant"), entity("landlord", "Landlord")];
    const people = [entity("alex", "Alex"), entity("sam", "Sam")];
    const transactions = [
      transaction("t1", "2025-01-04", 120, "food", "restaurant", "alex"),
      transaction("t2", "2025-01-11", 140, "food", "restaurant", "alex"),
      transaction("t3", "2025-02-08", 160, "food", "restaurant", "alex"),
      transaction("t4", "2025-03-01", 130, "food", "restaurant", "sam"),
      transaction("t5", "2025-03-15", 400, "home", "landlord", "sam"),
      transaction("t6", "2025-04-15", 300, "home", "landlord", "sam"),
      transaction("t7", "2025-05-15", 300, "home", "landlord", "sam"),
      transaction("p1", "2024-01-06", 60, "food", "restaurant", "alex"),
      transaction("p2", "2024-02-03", 60, "food", "restaurant", "alex"),
      transaction("p3", "2024-03-02", 60, "food", "restaurant", "alex"),
    ];
    const data = buildAnnualHeatmapFromDailyAmounts(
      transactions
        .filter((item) => item.date.startsWith("2025-"))
        .map((item) => ({ date: item.date, amount: item.amount })),
      2025,
    );
    const result = buildBudgetSpendingInsights({
      data,
      transactions,
      accounts: [],
      categories,
      vendors,
      people,
    });

    expect(result.insights.length).toBeGreaterThan(3);
    expect(result.insights.some((item) => item.id.includes("category:"))).toBe(true);
    expect(result.insights.some((item) => item.id.includes("vendor:"))).toBe(true);
    expect(result.insights.some((item) => item.id.includes("person:"))).toBe(true);
    expect(result.insights.some((item) => item.id.includes("cross:"))).toBe(true);
    expect(
      result.insights
        .filter((item) => /^(category|vendor|person|cross):/.test(item.id))
        .every((item) => (item.dayIds?.length ?? 0) > 0),
    ).toBe(true);
    const foodShareInsight = result.insights.find(
      (item) => item.id === "category:share:food",
    );
    expect(foodShareInsight?.headline).toBe("Dining made up 35.5% of total spending.");
    expect(foodShareInsight?.detail).toContain("You spent $550 on dining.");
    expect(result.insights.some((item) => item.id.startsWith("person:total:"))).toBe(false);
    expect(result.insights.some((item) => item.id === "vendor:frequent:restaurant")).toBe(false);
    expect(result.insights.some((item) => item.id === "cross:category-vendor:food")).toBe(false);
    expect([
      "overview:no-spend-days",
      "daily:sparse-spending",
      "daily:no-spend-streak",
    ]).not.toContain(result.insights[0]?.id);
    expect(result.insights[0]?.score).toBe(
      Math.max(...result.insights.map((item) => item.score)),
    );
  });

  test("requires more than 30 vendor transactions for a frequent stop", () => {
    const accounts = [];
    const categories = [entity("food", "Dining")];
    const vendors = [entity("restaurant", "The Restaurant")];
    const people = [entity("alex", "Alex")];
    const build = (count: number) => {
      const transactions = Array.from({ length: count }, (_, index) => {
        const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
        return transaction(`frequent-${index}`, date, 10, "food", "restaurant", "alex");
      });
      const data = buildAnnualHeatmapFromDailyAmounts(
        transactions.map((item) => ({ date: item.date, amount: item.amount })),
        2025,
      );
      return buildBudgetSpendingInsights({ data, transactions, accounts, categories, vendors, people });
    };

    expect(build(30).insights.some((item) => item.id === "vendor:frequent:restaurant")).toBe(false);
    expect(build(31).insights.find((item) => item.id === "vendor:frequent:restaurant")?.headline).toBe(
      "The Restaurant was a frequent stop.",
    );
  });
});
