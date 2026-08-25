import { describe, expect, test } from "bun:test";
import { buildInvestmentLedgerRows } from "../src/utilities/investment-ledger-core";

describe("investment ledger", () => {
  test("combines external investment flows and debt payments with signed amounts", () => {
    const rows = buildInvestmentLedgerRows(
      [{ id: "a", name: "Brokerage" }],
      [
        { id: "i", accountId: "a", date: "2026-03-01", month: "2026-03", amount: 500, flowType: "external" },
        { id: "w", accountId: "a", date: "2026-03-02", month: "2026-03", amount: -100, flowType: "external" },
        { id: "t", accountId: "a", date: "2026-03-03", month: "2026-03", amount: 50, flowType: "transfer" },
      ],
      [{ id: "d", name: "Student loan" }],
      [{ id: "p", debtAccountId: "d", date: "2026-03-04", month: "2026-03", amount: 250 }],
    );
    expect(rows.map((row) => row.type)).toEqual(["Debt payment", "Withdrawal", "Investment"]);
    expect(rows.map((row) => row.amount)).toEqual([-250, -100, 500]);
    expect(rows.some((row) => row.id === "t")).toBe(false);
  });

  test("uses the reporting month and a midpoint display date for legacy activity without a date", () => {
    const [row] = buildInvestmentLedgerRows(
      [{ id: "a", name: "Brokerage" }],
      [{ id: "i", accountId: "a", date: "", month: "2026-03", amount: 500, activityType: "contribution", flowType: "external" }],
    );
    expect(row.month).toBe("2026-03");
    expect(row.date).toBe("2026-03-15");
  });
});
