import { describe, expect, test } from "bun:test";
import {
  parsePayeeKey,
  payeeKey,
  payeeOptions,
} from "../src/components/dropdowns/payee-select-options";
import { importUtilities } from "../src/utilities/import-runtime";
import type { ImportProfile, ImportProfileBundle } from "../src/api/import-api";

const utils = importUtilities();
const entity = (id: string, name: string, type?: "income" | "expense") => ({
  id, name, type, active: true, createdAt: "", updatedAt: "",
});
const account = (id: string, name: string, type: "investment" | "debt", extra: any = {}) => ({
  id, name, type, active: true, assignmentId: "shared", source: "manual", createdAt: "", updatedAt: "", ...extra,
});

describe("unified import payees", () => {
  test("namespaces values and orders Vendors, Investments, then Debts", () => {
    const options = payeeOptions(
      [entity("v2", "Utility"), entity("v1", "Grocer")],
      [account("d1", "Student loan", "debt"), account("i1", "Brokerage", "investment")],
    );
    expect(options.map((item) => [item.group, item.name])).toEqual([
      ["Vendors", "Grocer"],
      ["Vendors", "Utility"],
      ["Investments", "Brokerage"],
      ["Debts", "Student loan"],
    ]);
    expect(payeeKey("account", "i1")).toBe("account:i1");
    expect(parsePayeeKey("vendor:v1")).toEqual({ kind: "vendor", id: "v1" });
  });

  test("loads learned account mappings and converts bank direction to account activity", () => {
    const parsed = utils.parseCSV(
      "Date,Description,Amount\n09/01/2026,STUDENT LOAN,-250\n09/02/2026,BROKERAGE,500",
    );
    const profile: ImportProfile = {
      id: "profile", name: "Bank", target: "transaction", investmentAccountId: "",
      headerSignature: parsed.signature,
      columnMapping: { date: 0, vendorDescription: 1, amount: 2, amountSignConvention: "expensesNegative" },
      dateFormat: "MM/DD/YYYY", amountMode: "unified", amountMultiplier: -1,
      active: true, createdAt: "", updatedAt: "",
    };
    const bundle: ImportProfileBundle = {
      profile,
      vendorMappings: [
        { sourceDescription: "STUDENT LOAN", normalizedSourceDescription: "STUDENT LOAN", accountId: "debt" },
        { sourceDescription: "BROKERAGE", normalizedSourceDescription: "BROKERAGE", accountId: "investment" },
      ],
      personMappings: [],
    };
    const references = {
      categories: [entity("loan-category", "Debt Payment", "expense")],
      vendors: [],
      people: [entity("shared", "Shared")],
      accounts: [
        account("debt", "Student loan", "debt", { categoryId: "loan-category" }),
        account("investment", "Brokerage", "investment"),
      ],
      sharedAssignmentId: "shared",
    };
    const rows = utils.createBudgetRows(parsed, profile, bundle, references, () => entity("draft", "Draft"));
    const debt = utils.validateBudgetRow(rows[0], references, profile);
    const withdrawal = utils.validateBudgetRow(rows[1], references, profile);
    expect(rows.map((row) => [row.payeeKind, row.accountId, row.vendorId])).toEqual([
      ["account", "debt", ""],
      ["account", "investment", ""],
    ]);
    expect(debt).toMatchObject({ errors: [], type: "", amount: 250 });
    expect(withdrawal).toMatchObject({ errors: [], type: "", amount: -500 });
  });
});
