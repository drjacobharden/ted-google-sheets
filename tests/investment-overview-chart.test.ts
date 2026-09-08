import { describe, expect, test } from "bun:test";
import type {
  Account,
  AccountActivity,
  AccountBalance,
} from "../src/api/account-api";
import {
  buildInvestmentOverviewChartMonths,
  investmentOverviewChartData,
} from "../src/utilities/investment-overview-chart";

const accounts: Account[] = [
  {
    id: "brokerage",
    name: "Brokerage",
    type: "investment",
    assignmentId: "",
    active: true,
    source: "manual",
    createdAt: "",
    updatedAt: "",
  },
];

function balance(values: Partial<AccountBalance>): AccountBalance {
  return {
    id: "balance",
    accountId: "brokerage",
    month: "2026-01",
    asOfDate: "2026-01-31",
    balance: 0,
    notes: "",
    createdAt: "",
    createdBy: "",
    updatedAt: "",
    updatedBy: "",
    ...values,
  };
}

function activity(values: Partial<AccountActivity>): AccountActivity {
  return {
    id: "activity",
    accountId: "brokerage",
    date: "2026-01-15",
    month: "2026-01",
    amount: 0,
    source: "manual",
    activityType: "contribution",
    createdAt: "",
    createdBy: "",
    ...values,
  };
}

describe("investment overview chart data", () => {
  test("builds balance, cumulative contribution, and comparison series", () => {
    const rows = buildInvestmentOverviewChartMonths(
      [
        balance({ month: "2026-01", balance: 1_000 }),
        balance({ month: "2026-02", balance: 1_150 }),
      ],
      [
        activity({ month: "2025-12", date: "2025-12-15", amount: 1_000 }),
        activity({ month: "2026-01", amount: 100 }),
        activity({ month: "2026-02", amount: 50 }),
        activity({ month: "2026-02", amount: -20 }),
      ],
      accounts,
      2026,
      2,
    );
    const previous = buildInvestmentOverviewChartMonths(
      [balance({ month: "2025-01", asOfDate: "2025-01-31", balance: 900 })],
      [activity({ month: "2025-01", date: "2025-01-15", amount: 80 })],
      accounts,
      2025,
      2,
    );

    expect(rows.map((row) => row.contributions)).toEqual([1_100, 1_150]);
    expect(
      investmentOverviewChartData(rows, "balance", 2026, previous).series.map(
        (item) => [item.type, item.palette],
      ),
    ).toEqual([
      ["line", "comparison"],
      ["line", "comparison"],
    ]);
    expect(
      investmentOverviewChartData(
        rows,
        "total-contributions",
        2026,
        previous,
      ).series.map((item) => [item.type, item.palette]),
    ).toEqual([
      ["line", "income"],
      ["line", "income"],
    ]);
    expect(
      investmentOverviewChartData(
        rows,
        "yearly-contributions",
        2026,
        previous,
      ).series.map((item) => [item.type, item.palette]),
    ).toEqual([
      ["line", "income"],
      ["line", "income"],
    ]);
    expect(
      investmentOverviewChartData(
        rows,
        "monthly-contributions",
        2026,
        previous,
      ).series.map((item) => [item.type, item.palette]),
    ).toEqual([
      ["bar", "income"],
      ["value-marker", "income"],
    ]);
  });

  test("does not create a prior balance series without prior data", () => {
    const rows = buildInvestmentOverviewChartMonths([], [], accounts, 2026, 1);
    expect(
      investmentOverviewChartData(rows, "balance", 2026).series,
    ).toHaveLength(1);
  });
});
