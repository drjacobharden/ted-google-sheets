import { describe, expect, test } from "bun:test";
import type { BudgetTransaction, TransactionType } from "../src/api/budget-api";
import type { InvestmentAccount, InvestmentContribution } from "../src/api/investment-api";
import { buildAnnualSummaryCards } from "../src/utilities/annual-summary-cards";

function transaction(date: string, amount: number, type: TransactionType): BudgetTransaction {
  return {
    id: `${date}-${amount}-${type}`,
    createdAt: date,
    createdBy: "user",
    date,
    amount,
    type,
    categoryId: "category",
    vendorId: "vendor",
    assignmentId: "assignment",
    notes: "",
  };
}

const paycheckAccount: InvestmentAccount = {
  id: "paycheck",
  name: "401(k)",
  source: "paycheck",
  assignmentId: "shared",
  active: true,
  createdAt: "2025-01-01",
  updatedAt: "2025-01-01",
};

const manualAccount: InvestmentAccount = {
  ...paycheckAccount,
  id: "manual",
  name: "Brokerage",
  source: "manual",
};

function contribution(
  id: string,
  accountId: string,
  month: string,
  amount: number,
): InvestmentContribution {
  return {
    id,
    accountId,
    month,
    amount,
    createdAt: `${month}-01`,
    createdBy: "user",
    updatedAt: `${month}-01`,
    updatedBy: "user",
  };
}

describe("annual summary cards", () => {
  test("calculates signed monthly totals, paycheck deductions, and total savings", () => {
    const result = buildAnnualSummaryCards([
      transaction("2026-01-02", 1_000, "income"),
      transaction("2026-01-03", -100, "income"),
      transaction("2026-01-04", 400, "expense"),
      transaction("2026-01-05", -50, "expense"),
    ], [paycheckAccount, manualAccount], [
      contribution("paycheck", "paycheck", "2026-01", 100),
      contribution("withdrawal", "paycheck", "2026-01", -25),
      contribution("manual", "manual", "2026-01", 500),
    ], { today: new Date(2026, 7, 11) });

    const metrics = result.summaries[2026].metrics;
    expect(metrics.spend.total).toBe(350);
    expect(metrics.income.total).toBe(900);
    expect(metrics.paycheckDeductions.total).toBe(75);
    expect(metrics.totalSavings.total).toBe(625);
    expect(metrics.totalSavings.months[0].value).toBe(625);
    expect(metrics.spend.months[8].value).toBeNull();
    expect(result.hasPaycheckDeductionHistory).toBe(true);
  });

  test("uses exact-date prior comparisons and full current-month deductions", () => {
    const result = buildAnnualSummaryCards([
      transaction("2025-08-10", 100, "expense"),
      transaction("2025-08-12", 900, "expense"),
      transaction("2026-08-10", 125, "expense"),
    ], [paycheckAccount], [
      contribution("prior", "paycheck", "2025-08", 200),
      contribution("current", "paycheck", "2026-08", 250),
    ], { today: new Date(2026, 7, 11) });

    const metrics = result.summaries[2026].metrics;
    expect(metrics.spend.comparison).toBe(25);
    expect(metrics.paycheckDeductions.comparison).toBe(50);
    expect(metrics.totalSavings.comparison).toBe(25);
  });

  test("falls back independently to monthly averages and retains historical visibility", () => {
    const result = buildAnnualSummaryCards([
      transaction("2026-08-01", 800, "income"),
      transaction("2026-08-02", 400, "expense"),
    ], [paycheckAccount], [
      contribution("historical", "paycheck", "2024-02", 100),
    ], { today: new Date(2026, 7, 11) });

    expect(result.hasPaycheckDeductionHistory).toBe(true);
    expect(result.summaries[2026].metrics.income.comparison).toBeNull();
    expect(result.summaries[2026].metrics.income.averagePerMonth).toBe(100);
    expect(result.summaries[2026].metrics.paycheckDeductions.total).toBe(0);
  });

  test("an account without contribution history does not show deductions", () => {
    const result = buildAnnualSummaryCards([], [paycheckAccount], [], {
      today: new Date(2026, 7, 11),
    });
    expect(result.hasPaycheckDeductionHistory).toBe(false);
  });

  test("filters paycheck deductions by the investment account assignment", () => {
    const personalAccount: InvestmentAccount = {
      ...paycheckAccount,
      id: "personal-paycheck",
      assignmentId: "personal",
    };
    const result = buildAnnualSummaryCards(
      [],
      [paycheckAccount, personalAccount],
      [
        contribution("shared-flow", paycheckAccount.id, "2026-01", 100),
        contribution("personal-flow", personalAccount.id, "2026-01", 250),
      ],
      { today: new Date(2026, 7, 11), assignmentId: "personal" },
    );

    expect(result.summaries[2026].metrics.paycheckDeductions.total).toBe(250);
    expect(result.summaries[2026].metrics.totalSavings.total).toBe(250);
  });

  test("excludes future current-year dates and compares historical full years", () => {
    const result = buildAnnualSummaryCards([
      transaction("2024-12-31", 100, "expense"),
      transaction("2025-12-31", 140, "expense"),
      transaction("2026-08-12", 999, "expense"),
    ], [], [], { today: new Date(2026, 7, 11) });

    expect(result.summaries[2025].metrics.spend.total).toBe(140);
    expect(result.summaries[2025].metrics.spend.comparison).toBe(40);
    expect(result.summaries[2026].metrics.spend.total).toBe(0);
  });
});
