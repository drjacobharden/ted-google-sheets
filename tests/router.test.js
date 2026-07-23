const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

function loadRouter(initialHash = "") {
  const source = fs.readFileSync("js/router.js", "utf8");
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
  const main = fs.readFileSync("js/main.js", "utf8");
  const drawer = fs.readFileSync("js/routes/transaction-drawer.js", "utf8");
  const entityDrawer = fs.readFileSync("js/routes/entity-drawer.js", "utf8");

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
  const router = fs.readFileSync("js/router.js", "utf8");
  const route = fs.readFileSync("js/routes/dashboard.js", "utf8");
  assert.match(router, /dashboard:\s*\{[\s\S]*template: "route-dashboard"[\s\S]*script: "js\/routes\/dashboard\.js"[\s\S]*window\.DashboardRoute/);
  assert.match(html, /<template id="route-dashboard">/);
  assert.doesNotMatch(html, /<script src="js\/investments\.js"/);
  assert.match(route, /function mount\(root\)/);
  assert.match(route, /function unmount\(\)/);
});

test("archived entities use one routed list and the shared edit drawer", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const router = fs.readFileSync("js/router.js", "utf8");
  const main = fs.readFileSync("js/main.js", "utf8");
  const route = fs.readFileSync("js/routes/entity-archive.js", "utf8");
  const drawer = fs.readFileSync("js/routes/entity-drawer.js", "utf8");

  assert.match(router, /"entity-archive":\s*\{[\s\S]*js\/routes\/entity-archive\.js/);
  assert.match(main, /"entity-archive": window\.EntityArchiveRoute/);
  assert.match(html, /<template id="route-entity-archive">/);
  assert.equal((html.match(/View archived (?:categories|vendors|people)/g) || []).length, 3);
  assert.match(route, /BudgetAPI\.listArchivedEntities/);
  assert.match(route, /drawer: "entity-edit"/);
  assert.match(drawer, /reactivateCategory/);
  assert.match(drawer, /Reactivate/);
  assert.match(html, /id="archive-entity"/);
  assert.match(drawer, /archiveCategory/);
});

test("settings route delegates state to cached custom-element forms", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const main = fs.readFileSync("js/main.js", "utf8");
  const route = fs.readFileSync("js/routes/settings.js", "utf8");
  const userForm = fs.readFileSync("js/components/user-form.js", "utf8");
  const urlForm = fs.readFileSync("js/components/url-form.js", "utf8");

  assert.match(html, /id="route-settings"[\s\S]*<user-form><\/user-form>[\s\S]*<url-form><\/url-form>/);
  assert.match(html, /js\/routes\/settings\.js/);
  assert.match(main, /settings: window\.SettingsRoute/);
  assert.doesNotMatch(route, /querySelector|addEventListener/);
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
  const main = fs.readFileSync("js/main.js", "utf8");
  const transactions = fs.readFileSync("js/routes/transactions.js", "utf8");

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
