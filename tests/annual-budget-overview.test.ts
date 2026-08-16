import { describe, expect, test } from "bun:test";
import type { BudgetTransaction, TransactionType } from "../src/api/budget-api";
import { buildAnnualBudgetOverviews } from "../src/utilities/annual-budget-overview";
import {
  savingsRateBreakdown,
  savingsRateChange,
} from "../src/utilities/savings-rate-breakdown";

function transaction(
  id: string,
  date: string,
  amount: number,
  type: TransactionType,
  categoryId = "category",
  category = "Food",
  vendorId = "vendor",
  vendor = "Market",
): BudgetTransaction {
  return {
    id,
    createdAt: date,
    createdBy: "user",
    type,
    amount,
    date,
    categoryId,
    category,
    vendorId,
    vendor,
    assignmentId: "assignment",
    notes: "",
  };
}

describe("annual budget overviews", () => {
  test("calculates savings rate and signed annual totals", () => {
    const overviews = buildAnnualBudgetOverviews([
      transaction("income", "2026-01-01", 1_000, "income"),
      transaction("spend", "2026-01-02", 400, "expense"),
      transaction("refund", "2026-01-03", -50, "expense"),
      transaction("income-adjustment", "2026-01-04", -100, "income"),
    ], [2026]);

    expect(overviews[2026]).toMatchObject({
      totalSpend: 350,
      totalIncome: 900,
      netBalance: 550,
      savingsRate: 550 / 9,
      hasData: true,
    });
  });

  test("ranks vendors and categories by expense total and limits each to five", () => {
    const transactions = Array.from({ length: 12 }, (_, index) =>
      transaction(
        `expense-${index}`,
        "2025-06-01",
        (index + 1) * 10,
        "expense",
        `category-${index}`,
        `Category ${index}`,
        `vendor-${index}`,
        `Vendor ${index}`,
      ),
    );
    transactions.push(
      transaction("combine", "2025-07-01", 200, "expense", "category-0", "Category 0", "vendor-0", "Vendor 0"),
      transaction("other-year", "2026-01-01", 999, "expense"),
    );

    const overviews = buildAnnualBudgetOverviews(transactions, [2025, 2026]);
    expect(overviews[2025].topVendors).toHaveLength(5);
    expect(overviews[2025].topVendors[0]).toMatchObject({
      id: "vendor-0",
      name: "Vendor 0",
      total: 210,
    });
    expect(overviews[2025].topCategories[0].total).toBe(210);
    expect(overviews[2026].totalSpend).toBe(999);
  });

  test("returns no savings rate without positive income and ignores invalid rows", () => {
    const overviews = buildAnnualBudgetOverviews([
      transaction("spend", "2024-01-10", 50, "expense"),
      transaction("bad-date", "2024-02-30", 500, "expense"),
      transaction("bad-amount", "2024-03-01", Number.NaN, "income"),
    ], [2024, 2025]);

    expect(overviews[2024].savingsRate).toBeNull();
    expect(overviews[2024].totalSpend).toBe(50);
    expect(overviews[2025]).toMatchObject({
      hasData: false,
      totalSpend: 0,
      totalIncome: 0,
      savingsRate: null,
    });
  });

  test("adds prior-year totals and percent change to ranked rows", () => {
    const overviews = buildAnnualBudgetOverviews([
      transaction("prior", "2025-03-01", 200, "expense"),
      transaction("current", "2026-03-01", 250, "expense"),
    ], [2026]);

    expect(overviews[2026].topCategories[0]).toMatchObject({
      priorYearTotal: 200,
      inflationRate: 25,
    });
    expect(overviews[2026].topVendors[0]).toMatchObject({
      priorYearTotal: 200,
      inflationRate: 25,
    });
  });
});

describe("savings rate chart breakdown", () => {
  test("partitions gross income into savings, deductions, and spend", () => {
    const breakdown = savingsRateBreakdown({
      income: 800,
      spend: 500,
      deductions: 200,
    });

    expect(breakdown).toEqual({
      amountSaved: 500,
      totalIncome: 1_000,
      rate: 50,
      savingsPercent: 30,
      deductionsPercent: 20,
      spendPercent: 50,
    });
  });

  test("uses spend as the full bar when spending exceeds gross income", () => {
    expect(
      savingsRateBreakdown({ income: 800, spend: 1_100, deductions: 200 }),
    ).toMatchObject({
      rate: -10,
      savingsPercent: 0,
      deductionsPercent: 0,
      spendPercent: 100,
    });
  });

  test("returns a signed savings-rate change only with prior income", () => {
    const current = savingsRateBreakdown({
      income: 800,
      spend: 500,
      deductions: 200,
    });
    const previous = savingsRateBreakdown({
      income: 800,
      spend: 600,
      deductions: 200,
    });

    expect(savingsRateChange(current, previous)).toBe(10);
    expect(savingsRateChange(current, null)).toBeNull();
    expect(
      savingsRateChange(
        current,
        savingsRateBreakdown({ income: 0, spend: 0, deductions: 0 }),
      ),
    ).toBeNull();
  });
});
