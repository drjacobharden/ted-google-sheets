import { describe, expect, test } from "bun:test";
import { TransactionFormController } from "../src/screens/transaction-form-controller";

const base = {
  amount: 125,
  date: "2026-08-29",
  categoryId: "category-1",
  vendorId: "vendor-1",
  assignmentId: "assignment-1",
  notes: "  memo  ",
  source: "manual" as const,
};

describe("TransactionFormController", () => {
  test("builds ordinary expense and income drafts", () => {
    const controller = new TransactionFormController();
    expect(controller.buildDraft({ ...base, kind: "expense" })).toMatchObject({
      type: "expense",
      amount: 125,
      categoryId: "category-1",
      vendorId: "vendor-1",
      assignmentId: "assignment-1",
      accountId: "",
      notes: "memo",
      source: "manual",
    });
    expect(
      controller.buildDraft({ ...base, kind: "income", source: "deduction" }),
    ).toMatchObject({ type: "income", amount: 125, source: "deduction" });
  });

  test("preserves signed account amounts and clears budget fields", () => {
    const controller = new TransactionFormController();
    expect(
      controller.buildDraft({
        ...base,
        kind: "account",
        accountId: "account-1",
        amount: -125,
      }),
    ).toMatchObject({
      amount: -125,
      accountId: "account-1",
      categoryId: "",
      vendorId: "",
      assignmentId: "",
    });
    expect(
      controller.buildDraft({
        ...base,
        kind: "account",
        accountId: "account-1",
        amount: 125,
      }),
    ).toMatchObject({ amount: 125, accountId: "account-1" });
  });

  test("resets creation state while date remains host-owned", () => {
    const controller = new TransactionFormController();
    controller.setKind("account");
    controller.reset();
    expect(controller.kind).toBe("expense");
  });
});
