const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

function loadRouter(initialHash = "") {
  const source = fs.readFileSync("src/router/router.ts", "utf8");
  const events = [];
  const listeners = new Map();
  let hash = initialHash;

  const location = {};
  Object.defineProperty(location, "hash", {
    get: () => hash,
    set: (value) => {
      hash = String(value).startsWith("#") ? String(value) : `#${value}`;
    },
  });

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const window = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(event) {
      events.push(event);
      listeners.get(event.type)?.(event);
    },
  };

  vm.runInNewContext(source, {
    window,
    location,
    CustomEvent,
    URLSearchParams,
    Map,
    Set,
    Promise,
    document: {},
    Error,
  });

  return { window, location, events };
}

test("router parses entity identifiers from the hash", () => {
  const { window } = loadRouter("#/entity-detail?kind=vendor&id=vendor%201");

  assert.equal(window.AppRouter.currentRoute(), "entity-detail");
  assert.deepEqual(
    { ...window.AppRouter.currentParams() },
    { kind: "vendor", id: "vendor 1" },
  );
});

test("router preserves the current screen when adding drawer parameters", () => {
  const { window, location, events } = loadRouter("#/categories");

  window.AppRouter.updateParams({
    drawer: "edit",
    transactionId: "transaction/1",
  });
  assert.equal(
    location.hash,
    "#/categories?drawer=edit&transactionId=transaction%2F1",
  );

  window.AppRouter.start();
  events.length = 0;
  window.AppRouter.updateParams({
    drawer: "edit",
    transactionId: "transaction/1",
  });

  assert.equal(
    JSON.stringify(events.at(-1).detail),
    JSON.stringify({
      route: "categories",
      params: { drawer: "edit", transactionId: "transaction/1" },
    }),
  );
});

test("removing drawer parameters preserves entity-detail state", () => {
  const { window, location } = loadRouter(
    "#/entity-detail?kind=vendor&id=vendor-1&drawer=edit&transactionId=tx-1",
  );

  window.AppRouter.updateParams({ drawer: null, transactionId: null });

  assert.equal(
    location.hash,
    "#/entity-detail?kind=vendor&id=vendor-1",
  );
});

test("entity editor parameters preserve the underlying detail route", () => {
  const { window, location } = loadRouter(
    "#/entity-detail?kind=vendor&id=vendor-1",
  );

  window.AppRouter.updateParams({
    drawer: "entity-edit",
    entityKind: "vendor",
    entityId: "vendor-1",
  });

  assert.equal(
    location.hash,
    "#/entity-detail?kind=vendor&id=vendor-1&drawer=entity-edit&entityKind=vendor&entityId=vendor-1",
  );

  window.AppRouter.updateParams({
    drawer: null,
    entityKind: null,
    entityId: null,
  });
  assert.equal(location.hash, "#/entity-detail?kind=vendor&id=vendor-1");
});

test("investment drawers preserve the account-detail route", () => {
  const { window, location } = loadRouter(
    "#/investment-account-detail?accountId=account-1",
  );

  window.AppRouter.updateParams({
    drawer: "investment-month",
    investmentAccountId: "account-1",
    investmentMonth: "2026-07",
  });
  assert.equal(
    location.hash,
    "#/investment-account-detail?accountId=account-1&drawer=investment-month&investmentAccountId=account-1&investmentMonth=2026-07",
  );

  window.AppRouter.updateParams({
    drawer: null,
    investmentAccountId: null,
    investmentMonth: null,
  });
  assert.equal(
    location.hash,
    "#/investment-account-detail?accountId=account-1",
  );
});

test("main treats drawer parameters as overlays rather than new content", () => {
  const main = fs.readFileSync("src/main.ts", "utf8");
  const drawer = fs.readFileSync("src/screens/transaction-drawer-screen/transaction-drawer-screen.ts", "utf8");
  const entityDrawer = fs.readFileSync("src/screens/entity-drawer-screen/entity-drawer-screen.ts", "utf8");

  assert.match(main, /delete contentParams\.drawer/);
  assert.match(main, /delete contentParams\.transactionId/);
  assert.match(main, /delete contentParams\.entityKind/);
  assert.match(main, /delete contentParams\.entityId/);
  assert.match(main, /delete contentParams\.investmentAccountId/);
  assert.match(main, /delete contentParams\.investmentMonth/);
  assert.match(main, /delete contentParams\.investmentReviewId/);
  assert.match(main, /if \(contentKey === mountedContentKey\) return/);
  assert.match(main, /BudgetAPI\.loadAppData/);
  assert.match(main, /dashboard: window\.DashboardRoute/);
  assert.match(main, /await window\.InvestmentAPI\.load\(\)/);
  assert.doesNotMatch(main, /window\.InvestmentUI/);
  assert.doesNotMatch(main, /BudgetAPI\.(?:loadReferenceData|listTransactions)/);
  assert.match(drawer, /AppRouter\.updateParams/);
  assert.doesNotMatch(drawer, /AppRouter\.navigate\("transactions"/);
  assert.doesNotMatch(drawer, /window\.TransactionEditor/);
  assert.match(entityDrawer, /budget:reference-data-changed/);
  assert.doesNotMatch(entityDrawer, /window\.EntityEditor/);
});

test("dashboard is registered as a routed module", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const router = fs.readFileSync("src/router/router.ts", "utf8");
  const route = fs.readFileSync("src/screens/dashboard-screen/dashboard-screen.ts", "utf8");
  assert.match(router, /dashboard:\s*\{\s*template: "route-dashboard",?\s*\}/);
  assert.match(html, /<template id="route-dashboard">\s*<dashboard-screen><\/dashboard-screen>/);
  assert.doesNotMatch(html, /js\/routes\/dashboard\.js/);
  assert.doesNotMatch(html, /<script src="js\/investments\.js"/);
  assert.match(route, /class DashboardScreen extends HTMLElement/);
  assert.match(route, /connectedCallback\(\): void/);
  assert.match(route, /disconnectedCallback\(\): void/);
});

test("archived entities use one routed list and the shared edit drawer", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const router = fs.readFileSync("src/router/router.ts", "utf8");
  const main = fs.readFileSync("src/main.ts", "utf8");
  const route = fs.readFileSync("src/screens/entity-archive-screen/entity-archive-screen.ts", "utf8");
  const template = fs.readFileSync("src/screens/entity-archive-screen/template.html", "utf8");
  const drawer = fs.readFileSync("src/screens/entity-drawer-screen/entity-drawer-screen.ts", "utf8");

  assert.match(router, /"entity-archive":\s*\{\s*template: "route-entity-archive",?\s*\}/);
  assert.match(main, /"entity-archive": window\.EntityArchiveRoute/);
  assert.match(html, /<template id="route-entity-archive">/);
  assert.match(template, /Archived entities/);
  assert.match(route, /APIs\.budget\.listArchivedEntities/);
  assert.match(route, /drawer: "entity-edit"/);
  assert.match(drawer, /reactivateCategory/);
  assert.match(drawer, /Reactivate/);
  assert.match(html, /id="archive-entity"/);
  assert.match(drawer, /archiveCategory/);
});

test("settings route delegates state to cached custom-element forms", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const main = fs.readFileSync("src/main.ts", "utf8");
  const route = fs.readFileSync("src/screens/settings-screen/settings-screen.ts", "utf8");
  const template = fs.readFileSync("src/screens/settings-screen/template.html", "utf8");
  const userForm = fs.readFileSync("src/components/user-form/user-form.ts", "utf8");
  const urlForm = fs.readFileSync("src/components/url-form/url-form.ts", "utf8");

  assert.match(template, /<user-form><\/user-form>[\s\S]*<url-form><\/url-form>/);
  assert.doesNotMatch(html, /js\/routes\/settings\.js/);
  assert.match(main, /settings: window\.SettingsRoute/);
  assert.match(route, /class SettingsScreen extends HTMLElement/);
  assert.match(userForm, /const users = window\.BudgetAPI\.listUsers\(\)/);
  assert.doesNotMatch(userForm, /await window\.BudgetAPI\.listUsers/);
  assert.match(userForm, /budget:reference-data-changed/);
  assert.match(
    urlForm,
    /await window\.BudgetUI\.initializeData\(\{ refresh: true \}\)[\s\S]*budget:connection-changed/,
  );
});

test("startup uses a cold splash, cached refresh lifecycle, and paginated monthly transactions", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const main = fs.readFileSync("src/main.ts", "utf8");
  const transactions = fs.readFileSync("src/screens/transactions/transactions.ts", "utf8");

  assert.match(html, /id="app-loading-splash"/);
  assert.match(html, /id="app-refresh-indicator"/);
  assert.match(html, /id="route-transactions"[\s\S]*<date-range-picker preset="month"/);
  assert.match(html, /id="load-more-transactions"/);
  assert.match(main, /BudgetAPI\.getCachedTransactions/);
  assert.match(main, /budget:data-refresh-started/);
  assert.match(main, /budget:data-refresh-complete/);
  assert.match(main, /budget:data-refresh-failed/);
  assert.match(main, /detail: \{ source: "cache" \}/);
  assert.match(main, /detail: \{ source: "server" \}/);
  assert.match(transactions, /const PAGE_SIZE = 250/);
  assert.match(transactions, /activeRange = rangePicker\?\.value/);
  assert.match(transactions, /const visible = items\.slice\(0, visibleLimit\)/);
  assert.match(transactions, /Showing \$\{visible\.length\} of \$\{total\} transactions/);
  assert.match(transactions, /visibleLimit \+= PAGE_SIZE/);
  assert.match(transactions, /function updateSummary\(\)[\s\S]*window\.BudgetUI\?\.getTransactions/);
});
