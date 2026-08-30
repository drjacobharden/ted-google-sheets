import { describe, expect, test } from "bun:test";
import {
  buildAccountActivityProjection,
  normalizeAccountActivityRecords,
} from "../src/api/account-api";

describe("account activity cache", () => {
  test("repairs legacy dates and rejects unusable cached records", () => {
    const records = normalizeAccountActivityRecords([
      {
        id: "legacy-contribution",
        accountId: "brokerage",
        month: "2026-02",
        amount: "125.50",
        activityType: "contribution",
      },
      {
        id: "legacy-payment",
        debtAccountId: "mortgage",
        date: "2026-03-08",
        amount: 800,
        kind: "payment",
      },
      {
        id: "missing-date-and-month",
        accountId: "brokerage",
        amount: 10,
        activityType: "contribution",
      },
      {
        id: "invalid-amount",
        accountId: "brokerage",
        month: "2026-04",
        amount: "not-a-number",
        activityType: "contribution",
      },
      {
        id: "mismatched-date",
        accountId: "brokerage",
        month: "2026-04",
        date: "2026-05-02",
        amount: 25,
        activityType: "contribution",
      },
      {
        id: "invalid-calendar-date",
        accountId: "brokerage",
        date: "2026-02-31",
        amount: 25,
        activityType: "contribution",
      },
    ]);

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      id: "legacy-contribution",
      accountId: "brokerage",
      month: "2026-02",
      date: "2026-02-15",
      amount: 125.5,
      activityType: "contribution",
    });
    expect(records[1]).toMatchObject({
      id: "legacy-payment",
      accountId: "mortgage",
      month: "2026-03",
      date: "2026-03-08",
      activityType: "payment",
    });
    expect(records[2]).toMatchObject({
      id: "mismatched-date",
      month: "2026-04",
      date: "2026-04-15",
    });
  });

  test("partitions canonical transactions into indexed account activity in one pass", () => {
    const projection = buildAccountActivityProjection(
      [
        { id: "brokerage", type: "investment", source: "manual" },
        { id: "mortgage", type: "debt", source: "manual" },
      ] as never[],
      [
        { id: "budget-only", date: "2026-01-02", amount: 10 },
        {
          id: "flow",
          accountId: "brokerage",
          date: "2026-02-03",
          amount: 100,
          source: "manual",
        },
        {
          id: "payment",
          accountId: "mortgage",
          date: "2026-02-04",
          amount: 50,
          source: "manual",
        },
        {
          id: "flow",
          accountId: "brokerage",
          date: "2026-02-05",
          amount: 125,
          source: "deduction",
        },
      ] as never[],
    );

    expect(projection.all).toHaveLength(2);
    expect(projection.investment).toHaveLength(1);
    expect(projection.debt).toHaveLength(1);
    expect(projection.byAccount.get("brokerage")?.[0]).toMatchObject({
      id: "flow",
      amount: 125,
      month: "2026-02",
      activityType: "contribution",
    });
    expect(projection.byAccountMonth.get("mortgage:2026-02")?.[0]).toMatchObject({
      id: "payment",
      activityType: "payment",
    });
  });
});
