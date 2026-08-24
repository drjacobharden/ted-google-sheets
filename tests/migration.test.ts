import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseRoute, routeHash } from "../src/router/router";

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("TypeScript runtime migration", () => {
  test("legacy runtime tree is gone and index loads only the bundle", () => {
    expect(existsSync("js")).toBe(false);
    const html = readFileSync("index.html", "utf8");
    expect(html).not.toContain('src="js/');
    expect(html.match(/<script /g)).toHaveLength(1);
    expect(html).toMatch(/src="dist\/bundle\.js(?:\?[^\"]*)?"/);
  });

  test("source contains no legacy application globals or adapters", () => {
    const source = files("src")
      .filter((path) => path.endsWith(".ts"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /window\.(AppRouter|BudgetUI|BudgetAPI|InvestmentAPI|ImportAPI|ImportUtils|InvestmentView|TransactionRow|ToastUI|OnboardingUI)/,
    );
    expect(source).not.toContain("legacy-runtime");
    expect(source).not.toContain("legacy-route-adapter");
  });

  test("router encodes, parses, preserves, and removes hash parameters", () => {
    expect(parseRoute("#/budget-overview").name).toBe("budget-overview");
    expect(routeHash("entity-detail", { kind: "vendor", id: "vendor 1" })).toBe(
      "#/entity-detail?kind=vendor&id=vendor+1",
    );
    expect(parseRoute("#/entity-detail?kind=vendor&id=vendor%201")).toEqual({
      name: "entity-detail",
      params: { kind: "vendor", id: "vendor 1" },
    });
    expect(parseRoute("#/not-a-route?drawer=edit").name).toBe(
      "budget-overview",
    );
    expect(
      routeHash("transactions", { drawer: "edit", transactionId: null }),
    ).toBe("#/transactions?drawer=edit");
  });

  test("budget overview is available from budgeting navigation", () => {
    const navigation = readFileSync(
      "src/elements/navigation-bar/navigation-bar.ts",
      "utf8",
    );
    const html = readFileSync("index.html", "utf8");
    const screen = readFileSync(
      "src/screens/budget-overview-screen/budget-overview-screen.ts",
      "utf8",
    );
    const shell = readFileSync(
      "src/screens/budgeting/budgeting-shell.ts",
      "utf8",
    );
    const controller = readFileSync("src/state/app-controller.ts", "utf8");
    const state = readFileSync("src/state/app-state.ts", "utf8");
    expect(navigation).toContain(
      '{ label: "Overview", icon: "dashboard", tab: "budget-overview" }',
    );
    expect(html).toContain('<template id="route-budget-overview">');
    expect(html).toContain("<budgeting-header></budgeting-header>");
    expect(html).toContain("<budget-overview-screen></budget-overview-screen>");
    expect(html).not.toContain("budgeting-view-outlet");
    expect(screen).toContain(
      'appState.get("budgetOverview").annualSpendTrendsByYear',
    );
    expect(screen).toContain('appState.subscribe("budgetOverview"');
    expect(screen).toContain("this.#unsubscribeBudgetOverview?.()");
    expect(screen).not.toContain("buildSpendTrendSeries(");
    expect(state).toContain(
      "spendTrends: Record<SpendTrendPeriod, SpendTrendSeries | null>",
    );
    expect(state).toContain(
      "monthlyTransactionSummaries: MonthlyTransactionSummaries",
    );
    expect(state).toContain("annualSpendTrendsByYear: AnnualSpendTrendsByYear");
    expect(state).toContain("annualBudgetOverviews: AnnualBudgetOverviews");
    expect(state).toContain("annualSummaryCards: AnnualSummaryCards");
    expect(state).toContain("hasPaycheckDeductionHistory: boolean");
    expect(state).toContain("budgetOverview: BudgetOverviewDerivedState");
    expect(state).toContain("budgetingContext: BudgetingContext");
    expect(shell).not.toContain("setBudgetOverviewAssignment(");
    expect(controller).toContain("getMonthlyLedger:");
    expect(controller).toContain(
      'window.addEventListener("budget:investments-changed"',
    );
    expect(controller).toContain('appState.set("spendTrends"');
    expect(controller).toContain('appState.set("annualSpendTrendsByYear"');
    expect(controller).toContain('"monthlyTransactionSummaries",');
    expect(controller).toContain(
      'weekly: buildSpendTrendSeries(transactions, "weekly")',
    );
    expect(controller).toContain(
      'monthly: buildSpendTrendSeries(transactions, "monthly")',
    );
  });

  test("transaction ledger uses editorial controls, columns, and interactive rows", () => {
    const screen = readFileSync(
      "src/screens/transactions/transactions.ts",
      "utf8",
    );
    const template = readFileSync(
      "src/screens/transactions/template.html",
      "utf8",
    );
    const table = readFileSync("src/components/table/table.ts", "utf8");
    expect(template).toContain("Transaction ledger");
    expect(template).toContain('id="transaction-month-selector"');
    expect(template).toContain('variant="editorial"');
    expect(template).not.toContain("<page-control");
    expect(screen).toContain('{ key: "all", title: "All months"');
    expect(screen).toContain("row.date.slice(5, 7) === this.#selectedMonth");
    expect(screen).not.toContain("#pageSize");
    expect(screen).toContain('title: "Description"');
    expect(screen).toContain('subline: (row) => row.vendor || "No vendor"');
    expect(screen).toContain('row.category || "Uncategorized"');
    expect(screen).toContain('title: "Transaction type"');
    expect(screen).toContain('dataType: ["Income", "Expense"]');
    expect(screen).toContain("matchesLedgerFilterGroups(row, this.#filters");
    expect(screen).toContain("signedTransactionAmount(row)");
    expect(screen).toContain("searchable: true");
    expect(screen).toContain('dataType: this.#filterValues("assignment")');
    const dropdownStyles = readFileSync(
      "src/components/dropdown-menu/style.css",
      "utf8",
    );
    const popover = readFileSync(
      "src/components/popover-menu/popover-menu.ts",
      "utf8",
    );
    expect(dropdownStyles).toContain("max-height: 304px");
    expect(dropdownStyles).toContain("overscroll-behavior: contain");
    expect(popover).toContain("this.contains(event.target)");
    expect(screen).toContain("columns: this.#columns()");
    expect(screen).toContain("footer: {");
    expect(screen).toContain(
      '[null, "Total", null, null, money(visibleTotal)]',
    );
    expect(screen).toContain("interactiveRows: true");
    expect(screen).not.toContain('columns: ["checkbox"');
    expect(table).toContain("tr.tabIndex = 0");
    expect(table).toContain("column.subline");
    const styles = readFileSync("src/screens/transactions/style.css", "utf8");
    expect(styles).toContain("@media (max-width: 1100px)");
    expect(styles).toContain("line-height: var(--leading-snug)");
  });

  test("monthly ledger uses a local assignment filter and editorial totals", () => {
    const screen = readFileSync(
      "src/screens/budget-overview-screen/budget-overview-screen.ts",
      "utf8",
    );
    const template = readFileSync(
      "src/screens/budget-overview-screen/template.html",
      "utf8",
    );
    const headerTemplate = readFileSync(
      "src/screens/budgeting/template.html",
      "utf8",
    );
    expect(headerTemplate).not.toContain("budgeting-assignment-selector");
    expect(headerTemplate).toContain('id="budgeting-year-previous"');
    expect(headerTemplate).toContain('leading-icon="chevronLeft"');
    expect(headerTemplate).toContain('id="budgeting-year-next"');
    expect(headerTemplate).toContain('leading-icon="chevronRight"');
    expect(headerTemplate).toContain('id="budgeting-year-selector"');
    expect(headerTemplate).toContain('variant="editorial"');
    expect(template).toContain('id="monthly-summary-assignment-selector"');
    expect(template).toContain('variant="editorial"');
    expect(template).toContain("<tfoot>");
    expect(template).toContain("Deductions");
    expect(template).toContain('id="monthly-summary-comparison-heading"');
    expect(template).toContain('id="overview-total-income-comparison"');
    expect(template).toContain('id="overview-total-spend-comparison"');
    expect(template).toContain('id="overview-total-deductions-comparison"');
    expect(screen).toContain("getMonthlyLedger(");
    expect(screen).toContain("totals.deductions += deductions");
    expect(screen).toContain("totals.net += net");
    expect(screen).toContain("totals.previousNet += previousNet");
    expect(screen).toContain("#renderHeroComparison(");
  });

  test("entity drill-down ledgers omit redundant entity columns and filters", () => {
    const detail = readFileSync(
      "src/screens/entity-detail-screen/entity-detail-screen.ts",
      "utf8",
    );
    expect(detail).toContain(
      "? [this.#assignmentColumn(), this.#vendorColumn()]",
    );
    expect(detail).toContain(
      "? [this.#categoryColumn(), this.#assignmentColumn()]",
    );
    expect(detail).toContain('this.#selected.kind !== "category"');
    expect(detail).toContain('this.#selected.kind !== "vendor"');
    expect(detail).toContain(
      'dataType: this.#filterValues("assignment", year)',
    );
    expect(detail).toContain('dataType: ["Income", "Expense"]');
    expect(detail).toContain("searchable: true");
  });

  test("mobile navigation consolidates app sections and budgeting pages", () => {
    const navigation = readFileSync(
      "src/elements/top-nav/template.html",
      "utf8",
    );
    const navigationSource = readFileSync(
      "src/elements/top-nav/top-nav.ts",
      "utf8",
    );
    const navigationStyles = readFileSync(
      "src/elements/top-nav/style.css",
      "utf8",
    );
    const budgetingStyles = readFileSync(
      "src/screens/budgeting/style.css",
      "utf8",
    );
    expect(navigation).toContain('id="top-mobile-navigation"');
    expect(navigation).toContain('data-mobile-section="budgeting"');
    expect(navigation).toContain('data-mobile-section="investments"');
    expect(navigation).toContain('data-mobile-section="goals"');
    expect(navigationSource).toContain("#trapMobileNavigationFocus");
    expect(navigationStyles).toContain("transform: translateX(105%)");
    expect(budgetingStyles).toContain(".budgeting-header__sections");
    expect(budgetingStyles).toContain("#budgeting-section-selector");
    expect(budgetingStyles).toContain("gap: 12px");
    expect(budgetingStyles).toContain("display: none");
    expect(budgetingStyles).toContain(
      ".budgeting-header__compact-action.square",
    );
  });

  test("overlay manager owns notices, toasts, onboarding, and all drawers", () => {
    const source = readFileSync(
      "src/elements/overlay-manager/overlay-manager.ts",
      "utf8",
    );
    for (const tag of [
      "app-alert",
      "toast-stack",
      "sync-notifications",
      "onboarding-overlay",
      "transaction-drawer-screen",
      "entity-drawer-screen",
      "investment-account-drawer-screen",
      "investment-month-drawer-screen",
    ])
      expect(source).toContain(tag);
    expect(readFileSync("index.html", "utf8")).not.toMatch(
      /drawer-backdrop|toast-stack|onboarding-dialog|app-notice/,
    );
  });

  test("entity creation and editing share the editorial drawer", () => {
    const drawer = readFileSync(
      "src/screens/entity-drawer-screen/entity-drawer-screen.ts",
      "utf8",
    );
    const template = readFileSync(
      "src/screens/entity-drawer-screen/template.html",
      "utf8",
    );
    const overlay = readFileSync(
      "src/elements/overlay-manager/overlay-manager.ts",
      "utf8",
    );
    expect(drawer).toContain('action !== "entity-new"');
    expect(drawer).toContain('action !== "entity-edit"');
    expect(template).toContain('id="entity-category-type-selector"');
    expect(template).toContain('class="metadata entity-metadata"');
    expect(template).toContain('class="transaction-drawer editorial-theme');
    expect(overlay).not.toContain("new-entity-popover");
    expect(overlay).not.toContain("showEntityForm");
  });
});
