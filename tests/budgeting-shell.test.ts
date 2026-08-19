import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseRoute, routeHash } from "../src/router/router";
import { filterForBudgetingContext } from "../src/screens/budgeting/budgeting-context";
import type { BudgetTransaction } from "../src/api/budget-api";

describe("nested budgeting routes", () => {
  test("normalizes legacy screens and parses scoped detail paths", () => {
    expect(parseRoute("#/categories?year=2025")).toEqual({
      name: "budgeting/categories",
      params: { year: "2025" },
    });
    expect(
      parseRoute(
        "#/budgeting/vendors/vendor%2F1?year=2024&assignment=person-1",
      ),
    ).toEqual({
      name: "budgeting/entity-detail",
      params: {
        kind: "vendor",
        id: "vendor/1",
        year: "2024",
        assignment: "person-1",
      },
    });
  });

  test("builds canonical detail and archive hashes", () => {
    expect(
      routeHash("budgeting/entity-detail", {
        kind: "category",
        id: "food & drink",
        year: 2026,
        assignment: "all",
      }),
    ).toBe(
      "#/budgeting/categories/food%20%26%20drink?year=2026&assignment=all",
    );
    expect(
      routeHash("budgeting/entity-archive", {
        kind: "assignment",
        year: 2026,
        assignment: "all",
      }),
    ).toBe("#/budgeting/people/archive?year=2026&assignment=all");
  });
});

describe("shared budgeting scope", () => {
  const transactions = [
    { id: "1", date: "2026-01-01", assignmentId: "a" },
    { id: "2", date: "2026-02-01", assignmentId: "b" },
    { id: "3", date: "2025-02-01", assignmentId: "a" },
  ] as BudgetTransaction[];

  test("filters every child view by year and optional assignment", () => {
    expect(
      filterForBudgetingContext(transactions, {
        year: 2026,
        assignmentId: null,
        lastRoute: "budgeting/overview",
        lastParams: {},
      }).map((item) => item.id),
    ).toEqual(["1", "2"]);
    expect(
      filterForBudgetingContext(transactions, {
        year: 2026,
        assignmentId: "a",
        lastRoute: "budgeting/overview",
        lastParams: {},
      }).map((item) => item.id),
    ).toEqual(["1"]);
  });

  test("main keeps the budgeting shell mounted while views change", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const shell = readFileSync(
      "src/screens/budgeting/budgeting-shell.ts",
      "utf8",
    );
    expect(main).toContain('mountedContentKey !== "budgeting"');
    expect(main).toContain("shell.route = { name, route: name, params }");
    expect(shell).toContain("router.replaceParams({ year:");
    expect(shell).toContain("router.replaceParams({ assignment:");
    expect(shell).toContain('event.detail.value as BudgetingRouteName');
  });
});
