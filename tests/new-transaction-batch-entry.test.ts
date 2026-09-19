import { describe, expect, test } from "bun:test";
import {
  amountForNewBatchDate,
  latestDatePerMonth,
} from "../src/screens/new-transaction-screen/batch-entry";

describe("new transaction batch entry helpers", () => {
  test("new dates inherit the amount from the most recently selected date", () => {
    const amounts = new Map([
      ["2026-09-18", "15.00"],
      ["2026-09-02", "23.50"],
    ]);
    expect(
      amountForNewBatchDate(["2026-09-18", "2026-09-02"], amounts, ""),
    ).toBe("23.50");
    expect(amountForNewBatchDate([], amounts, "8.00")).toBe("8.00");
  });

  test("balance dates keep only the latest date in each month", () => {
    expect(
      latestDatePerMonth([
        "2026-08-04",
        "2026-09-02",
        "2026-08-29",
        "2026-09-18",
      ]),
    ).toEqual({
      kept: ["2026-08-29", "2026-09-18"],
      dropped: ["2026-08-04", "2026-09-02"],
    });
  });
});
