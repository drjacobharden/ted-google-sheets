import { describe, expect, test } from "bun:test";
import { parseRoute, routeHash } from "../src/router/router";
import { filterForBudgetingContext } from "../src/screens/budgeting/budgeting-context";
import type { BudgetTransaction } from "../src/api/budget-api";

describe("standard budgeting routes", () => {
  test("parses flat screens and accepts old nested links", () => {
    expect(parseRoute("#/money-flow?year=2026")).toEqual({
      name: "money-flow",
      params: { year: "2026" },
    });
    expect(parseRoute("#/budgeting/flow?year=2025")).toEqual({
      name: "money-flow",
      params: { year: "2025" },
    });
    expect(parseRoute("#/categories?year=2025")).toEqual({
      name: "categories",
      params: { year: "2025" },
    });
    expect(
      parseRoute(
        "#/budgeting/vendors/vendor%2F1?year=2024&assignment=person-1",
      ),
    ).toEqual({
      name: "entity-detail",
      params: {
        kind: "vendor",
        id: "vendor/1",
        year: "2024",
        assignment: "person-1",
      },
    });
  });

  test("builds flat detail and archive hashes", () => {
    expect(
      routeHash("entity-detail", {
        kind: "category",
        id: "food & drink",
        year: 2026,
        assignment: "all",
      }),
    ).toBe("#/entity-detail?kind=category&id=food+%26+drink&year=2026&assignment=all");
    expect(
      routeHash("entity-archive", {
        kind: "assignment",
        year: 2026,
        assignment: "all",
      }),
    ).toBe("#/entity-archive?kind=assignment&year=2026&assignment=all");
  });
});

describe("shared budgeting scope", () => {
  const transactions = [
    { id: "1", date: "2026-01-01", assignmentId: "a" },
    { id: "2", date: "2026-02-01", assignmentId: "b" },
    { id: "3", date: "2025-02-01", assignmentId: "a" },
  ] as BudgetTransaction[];

  test("filters every child view by year", () => {
    expect(
      filterForBudgetingContext(transactions, {
        year: 2026,
        lastRoute: "budget-overview",
        lastParams: {},
      }).map((item) => item.id),
    ).toEqual(["1", "2"]);
  });
});
