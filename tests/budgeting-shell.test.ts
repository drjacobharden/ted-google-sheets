import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseRoute, routeHash } from "../src/router/router";
import { filterForBudgetingContext } from "../src/screens/budgeting/budgeting-context";
import type { BudgetTransaction } from "../src/api/budget-api";

describe("standard budgeting routes", () => {
  test("parses flat screens and accepts old nested links", () => {
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

  test("main mounts budgeting screens from the root route outlet", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const shell = readFileSync(
      "src/screens/budgeting/budgeting-shell.ts",
      "utf8",
    );
    const topNav = readFileSync(
      "src/elements/top-nav/top-nav.ts",
      "utf8",
    );
    const html = readFileSync("index.html", "utf8");
    const headerTemplate = readFileSync(
      "src/screens/budgeting/template.html",
      "utf8",
    );
    expect(main).toContain("`route-${name}`");
    expect(main).not.toContain('mountedContentKey !== "budgeting"');
    expect(html).toContain('<template id="route-transactions">');
    expect(html.match(/<budgeting-header><\/budgeting-header>/g)).toHaveLength(1);
    expect(html).toContain('<template id="route-transactions">\n        <transaction-list-screen>');
    expect(html).not.toContain("budgeting-view-outlet");
    expect(headerTemplate).toContain('variant="section-tabs"');
    expect(headerTemplate).not.toContain("budgeting-assignment-selector");
    expect(shell).toContain("router.replaceParams({ year:");
    expect(shell).not.toContain("#budgeting-assignment-selector");
    expect(shell).toContain("assignment: _legacyAssignment");
    expect(shell).toContain("#handleSectionSelection");
    expect(topNav).toContain(
      '.value as import("../../router/types").BudgetingRouteName',
    );
    expect(topNav).toContain("BUDGETING_CONTENT_ROUTES.map");
  });
});
