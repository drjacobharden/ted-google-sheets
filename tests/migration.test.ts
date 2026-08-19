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
    expect(parseRoute("#/budget-overview").name).toBe("budgeting/overview");
    expect(routeHash("budgeting/entity-detail", { kind: "vendor", id: "vendor 1" })).toBe("#/budgeting/vendors/vendor%201");
    expect(parseRoute("#/entity-detail?kind=vendor&id=vendor%201")).toEqual({ name: "budgeting/entity-detail", params: { kind: "vendor", id: "vendor 1" } });
    expect(parseRoute("#/not-a-route?drawer=edit").name).toBe("budgeting/overview");
    expect(routeHash("budgeting/transactions", { drawer: "edit", transactionId: null })).toBe("#/budgeting/transactions?drawer=edit");
  });

  test("budget overview is available from budgeting navigation", () => {
    const navigation = readFileSync("src/elements/navigation-bar/navigation-bar.ts", "utf8");
    const html = readFileSync("index.html", "utf8");
    const screen = readFileSync("src/screens/budget-overview-screen/budget-overview-screen.ts", "utf8");
    const controller = readFileSync("src/state/app-controller.ts", "utf8");
    const state = readFileSync("src/state/app-state.ts", "utf8");
    expect(navigation).toContain('{ label: "Overview", icon: "dashboard", tab: "budgeting/overview" }');
    expect(html).toContain('<template id="route-budgeting">');
    expect(html).toContain("<budgeting-shell></budgeting-shell>");
    expect(screen).toContain('appState.get("budgetOverview").annualSpendTrendsByYear');
    expect(screen).toContain('appState.subscribe("budgetOverview"');
    expect(screen).toContain("this.#unsubscribeBudgetOverview?.()");
    expect(screen).not.toContain("buildSpendTrendSeries(");
    expect(state).toContain("spendTrends: Record<SpendTrendPeriod, SpendTrendSeries | null>");
    expect(state).toContain("monthlyTransactionSummaries: MonthlyTransactionSummaries");
    expect(state).toContain("annualSpendTrendsByYear: AnnualSpendTrendsByYear");
    expect(state).toContain("annualBudgetOverviews: AnnualBudgetOverviews");
    expect(state).toContain("annualSummaryCards: AnnualSummaryCards");
    expect(state).toContain("hasPaycheckDeductionHistory: boolean");
    expect(state).toContain("budgetOverview: BudgetOverviewDerivedState");
    expect(state).toContain("budgetingContext: BudgetingContext");
    expect(screen).toContain("appController.setBudgetOverviewAssignment(");
    expect(controller).toContain('window.addEventListener("budget:investments-changed"');
    expect(controller).toContain('appState.set("spendTrends"');
    expect(controller).toContain('appState.set("annualSpendTrendsByYear"');
    expect(controller).toContain('"monthlyTransactionSummaries",');
    expect(controller).toContain('weekly: buildSpendTrendSeries(transactions, "weekly")');
    expect(controller).toContain('monthly: buildSpendTrendSeries(transactions, "monthly")');
  });

  test("overlay manager owns notices, toasts, onboarding, and all drawers", () => {
    const source = readFileSync("src/elements/overlay-manager/overlay-manager.ts", "utf8");
    for (const tag of ["app-alert", "toast-stack", "sync-notifications", "onboarding-overlay", "transaction-drawer-screen", "entity-drawer-screen", "investment-account-drawer-screen", "investment-month-drawer-screen"]) expect(source).toContain(tag);
    expect(readFileSync("index.html", "utf8")).not.toMatch(/drawer-backdrop|toast-stack|onboarding-dialog|app-notice/);
  });
});
