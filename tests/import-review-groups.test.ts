import { describe, expect, test } from "bun:test";
import type { BudgetEntity } from "../src/api/budget-api";
import type { StagedImportRow } from "../src/utilities/import-runtime";
import {
  applyGroupSelection,
  groupBudgetRows,
  groupHasBlockingErrors,
  groupSelectionState,
  groupVendorName,
  resolveGroupVendor,
  summarizeBudgetImport,
  transactionBalanceEffect,
  vendorGroupProgress,
} from "../src/utilities/import-review-groups";

function row(
  id: string,
  vendor: string,
  normalized: string,
  overrides: Partial<StagedImportRow> = {},
): StagedImportRow {
  return {
    stagingId: id,
    sourceRowNumber: Number(id.replace(/\D/g, "")) || 1,
    include: true,
    queued: false,
    vendorDescription: vendor,
    normalizedVendorDescription: normalized,
    categoryId: "",
    personId: "",
    type: "expense",
    amount: 0,
    flows: [],
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("vendor-group import review model", () => {
  test("groups normalized descriptions in stable first-seen order", () => {
    const rows = [
      row("r1", "ACME  STORE", "acme store"),
      row("r2", "Corner Shop", "corner shop"),
      row("r3", "Acme Store", "acme store"),
    ];
    const groups = groupBudgetRows(rows);
    expect(groups.map((group) => group.key)).toEqual([
      "acme store",
      "corner shop",
    ]);
    expect(groups[0].rows.map((item) => item.stagingId)).toEqual(["r1", "r3"]);
    expect(groups[0].sourceDescription).toBe("ACME  STORE");
  });

  test("reports uniform, empty, and mixed group selections", () => {
    const rows = [
      row("r1", "A", "a", { categoryId: "food" }),
      row("r2", "A", "a", { categoryId: "food" }),
    ];
    expect(groupSelectionState(rows, "categoryId")).toEqual({
      value: "food",
      mixed: false,
    });
    applyGroupSelection(
      { key: "a", sourceDescription: "A", rows },
      "categoryId",
      "",
    );
    expect(groupSelectionState(rows, "categoryId")).toEqual({
      value: "",
      mixed: false,
    });
    rows[1].categoryId = "travel";
    expect(groupSelectionState(rows, "categoryId")).toEqual({
      value: "",
      mixed: true,
    });
  });

  test("applies group selections to excluded rows and resolves one vendor name", () => {
    const rows = [row("r1", "A", "a", { include: false }), row("r2", "A", "a")];
    const group = groupBudgetRows(rows)[0];
    applyGroupSelection(group, "personId", "person-1");
    expect(rows.map((item) => item.personId)).toEqual(["person-1", "person-1"]);
    rows.forEach((item) => (item.vendorId = "vendor-1"));
    const vendors = [{ id: "vendor-1", name: "Acme" }] as BudgetEntity[];
    expect(groupVendorName(group, vendors)).toBe("Acme");
  });

  test("reuses normalized vendors and stages only genuinely new names", () => {
    const vendors = [{ id: "vendor-1", name: "Acme Store" }] as BudgetEntity[];
    const normalize = (value: unknown) =>
      String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
    let created = "";
    expect(
      resolveGroupVendor("  ACME   STORE ", vendors, normalize, (name) => {
        created = name;
        return { id: "draft", name } as BudgetEntity;
      })?.id,
    ).toBe("vendor-1");
    expect(created).toBe("");
    expect(
      resolveGroupVendor("Corner Shop", vendors, normalize, (name) => {
        created = name;
        return { id: "draft", name } as BudgetEntity;
      })?.id,
    ).toBe("draft");
    expect(created).toBe("Corner Shop");
  });

  test("blocks navigation only for invalid included rows", () => {
    const invalid = row("r1", "A", "a", { errors: ["Choose a category."] });
    const group = groupBudgetRows([invalid])[0];
    expect(groupHasBlockingErrors(group)).toBe(true);
    invalid.include = false;
    expect(groupHasBlockingErrors(group)).toBe(false);
  });

  test("sizes progress by transaction share", () => {
    const groups = groupBudgetRows([
      row("r1", "A", "a"),
      row("r2", "B", "b"),
      row("r3", "B", "b"),
      row("r4", "B", "b"),
    ]);
    expect(vendorGroupProgress(groups)).toEqual([25, 75]);
  });

  test("summarizes included ledger effects including expense refunds", () => {
    const rows = [
      row("r1", "Income", "income", { type: "income", amount: 1000 }),
      row("r2", "Shop", "shop", { type: "expense", amount: 200 }),
      row("r3", "Refund", "refund", { type: "expense", amount: -50 }),
      row("r4", "Skip", "skip", {
        type: "expense",
        amount: 10,
        include: false,
      }),
    ];
    expect(transactionBalanceEffect(rows[2])).toBe(50);
    expect(summarizeBudgetImport(rows, 4)).toEqual({
      readyCount: 3,
      excludedCount: 1,
      groupCount: 4,
      netBalance: 850,
    });
  });
});
