import { describe, expect, test } from "bun:test";
import type { BudgetEntity, BudgetTransaction } from "../src/api/budget-api";
import {
  buildEntityLedgerRows,
  buildPersonLedgerRows,
  matchesLedgerFilterGroups,
  signedTransactionAmount,
} from "../src/utilities/entity-ledger";

const entity = (id: string, name: string, active = true): BudgetEntity => ({
  id, name, active, createdAt: "2025-01-01", updatedAt: "2025-01-01",
});

const transaction = (
  id: string,
  date: string,
  amount: number,
  type: "income" | "expense",
  categoryId: string,
  vendorId: string,
  assignmentId: string,
): BudgetTransaction => ({
  id, date, amount, type, categoryId, vendorId, assignmentId,
  createdAt: date, createdBy: "test", notes: "",
});

describe("editorial entity ledgers", () => {
  const rows = [
    transaction("1", "2025-01-02", 100, "expense", "food", "market", "alex"),
    transaction("2", "2025-01-12", 50, "expense", "food", "market", "alex"),
    transaction("3", "2025-02-01", 400, "expense", "home", "store", "sam"),
    transaction("4", "2024-01-02", 100, "expense", "food", "market", "alex"),
    transaction("5", "2025-01-03", 1000, "income", "pay", "employer", "alex"),
    transaction("6", "2024-01-03", 800, "income", "pay", "employer", "alex"),
  ];

  test("calculates rank, average, totals, comparison, and month scope", () => {
    const result = buildEntityLedgerRows(
      [entity("food", "Food"), entity("home", "Home", false)],
      rows,
      { year: 2025, month: "01", idKey: "categoryId", type: "expense" },
    );
    expect(result[0]).toMatchObject({ name: "Food", rank: 1, transactionCount: 2, average: 75, total: 150, comparison: 50 });
    expect(result[1]).toMatchObject({ name: "Home", active: false, status: "Archived", total: 0 });
  });

  test("calculates person income, expense, balance, and prior comparison", () => {
    const result = buildPersonLedgerRows([entity("alex", "Alex")], rows, 2025, "01");
    expect(result[0]).toMatchObject({ income: 1000, expense: 150, balance: 850 });
    expect(result[0].comparison).toBeCloseTo(21.43, 1);
  });

  test("uses the displayed transaction sign for ledger amounts", () => {
    expect(signedTransactionAmount({ amount: 125, type: "income" })).toBe(125);
    expect(signedTransactionAmount({ amount: 125, type: "expense" })).toBe(-125);
    expect(signedTransactionAmount({ amount: -25, type: "expense" })).toBe(25);
  });

  test("ORs filters for one field and ANDs filters across fields", () => {
    const row = { category: "Groceries", vendor: "Publix", amount: -25 };
    expect(matchesLedgerFilterGroups(row, [
      { key: "category", operator: "Equals", value: "Dining" },
      { key: "category", operator: "Equals", value: "Groceries" },
      { key: "vendor", operator: "Equals", value: "Publix" },
    ])).toBe(true);
    expect(matchesLedgerFilterGroups(row, [
      { key: "category", operator: "Equals", value: "Dining" },
      { key: "category", operator: "Equals", value: "Groceries" },
      { key: "vendor", operator: "Equals", value: "Walmart" },
    ])).toBe(false);
  });
});
