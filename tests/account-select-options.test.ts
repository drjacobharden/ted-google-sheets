import { describe, expect, test } from "bun:test";
import type { Account } from "../src/api/account-api";
import {
  accountSelectGroup,
  accountsForSelect,
} from "../src/components/dropdowns/account-select-options";

function account(
  id: string,
  name: string,
  type: "investment" | "debt",
  active = true,
): Account {
  return {
    id,
    name,
    type,
    active,
    assignmentId: "shared",
    source: "manual",
    createdAt: "",
    updatedAt: "",
  };
}

describe("account select options", () => {
  test("groups debts before investments and sorts names within each group", () => {
    const result = accountsForSelect(
      [
        account("i-2", "Vanguard", "investment"),
        account("d-2", "Student loan", "debt"),
        account("i-1", "Brokerage", "investment"),
        account("d-1", "Auto loan", "debt"),
      ],
      "all",
    );

    expect(result.map(({ id }) => id)).toEqual(["d-1", "d-2", "i-1", "i-2"]);
    expect(result.map(({ type }) => accountSelectGroup(type))).toEqual([
      "Debts",
      "Debts",
      "Investments",
      "Investments",
    ]);
  });

  test("omits inactive and out-of-scope account sections", () => {
    const result = accountsForSelect(
      [
        account("d-1", "Mortgage", "debt"),
        account("i-1", "Brokerage", "investment"),
        account("i-2", "Old 401k", "investment", false),
      ],
      "investment",
    );

    expect(result.map(({ id }) => id)).toEqual(["i-1"]);
    expect(new Set(result.map(({ type }) => accountSelectGroup(type)))).toEqual(
      new Set(["Investments"]),
    );
  });
});
