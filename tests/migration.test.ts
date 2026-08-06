import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseRoute, routeHash } from "../src/router/router";

function files(root: string): string[] {
  return readdirSync(root).flatMap(name => { const path = join(root, name); return statSync(path).isDirectory() ? files(path) : [path]; });
}

describe("TypeScript runtime migration", () => {
  test("legacy runtime tree is gone and index loads only the bundle", () => {
    expect(existsSync("js")).toBe(false);
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toContain('src="js/');
    expect(html.match(/<script /g)).toHaveLength(1);
    expect(html).toContain('src="dist/bundle.js"');
  });

  test("source contains no legacy application globals or adapters", () => {
    const source = files("src").filter(path => path.endsWith(".ts")).map(path => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toMatch(/window\.(AppRouter|BudgetUI|BudgetAPI|InvestmentAPI|ImportAPI|ImportUtils|InvestmentView|TransactionRow|ToastUI|OnboardingUI)/);
    expect(source).not.toContain("legacy-runtime");
    expect(source).not.toContain("legacy-route-adapter");
  });

  test("router encodes, parses, preserves, and removes hash parameters", () => {
    expect(routeHash("entity-detail", { kind: "vendor", id: "vendor 1" })).toBe("#/entity-detail?kind=vendor&id=vendor+1");
    expect(parseRoute("#/entity-detail?kind=vendor&id=vendor%201")).toEqual({ name: "entity-detail", params: { kind: "vendor", id: "vendor 1" } });
    expect(parseRoute("#/not-a-route?drawer=edit").name).toBe("transactions");
    expect(routeHash("transactions", { drawer: "edit", transactionId: null })).toBe("#/transactions?drawer=edit");
  });

  test("overlay manager owns notices, toasts, onboarding, and all drawers", () => {
    const source = readFileSync("src/elements/overlay-manager/overlay-manager.ts", "utf8");
    for (const tag of ["app-alert", "toast-stack", "sync-notifications", "onboarding-overlay", "transaction-drawer-screen", "entity-drawer-screen", "investment-account-drawer-screen", "investment-month-drawer-screen"]) expect(source).toContain(tag);
    expect(readFileSync("index.html", "utf8")).not.toMatch(/drawer-backdrop|toast-stack|onboarding-dialog|app-notice/);
  });
});
