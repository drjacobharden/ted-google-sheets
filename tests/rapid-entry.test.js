const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("transaction entry is optimistic and exposes durable sync controls", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const syncTemplate = fs.readFileSync("src/screens/sync-screen/template.html", "utf8");
  const form = fs.readFileSync("js/routes/transaction-drawer.js", "utf8");
  const main = fs.readFileSync("js/main.js", "utf8");
  const api = fs.readFileSync("js/api.js", "utf8");
  assert.match(html, /<sync-screen><\/sync-screen>/);
  assert.match(syncTemplate, /id="sync-list"/);
  assert.match(form, /BudgetAPI\.queueTransaction\(draft\)/);
  assert.doesNotMatch(form, /await window\.BudgetAPI\.addTransaction/);
  assert.match(form, /AppRouter\.updateParams/);
  assert.match(main, /budget:transaction-queued/);
  assert.match(main, /budget:transaction-saved/);
  assert.match(api, /myFinance\.transactionOutbox\.v2/);
  assert.match(api, /sync or remove pending changes/i);
});

test("transaction editing uses a UUID drawer, durable updates, and unified notifications", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const transactions = fs.readFileSync("js/routes/transactions.js", "utf8");
  const editor = fs.readFileSync("js/routes/transaction-drawer.js", "utf8");
  const sync = fs.readFileSync("src/screens/sync-screen/sync-screen.ts", "utf8");
  const api = fs.readFileSync("js/api.js", "utf8");
  assert.match(html, /id="transaction-drawer"/);
  assert.match(html, /id="transaction-edit-id"/);
  assert.match(html, /id="transaction-created-footnote"/);
  assert.match(html, /id="toast-stack"/);
  assert.match(transactions, /AppRouter\.updateParams/);
  assert.match(editor, /function openCreate\(\)/);
  assert.match(editor, /function openEdit\(id/);
  assert.match(editor, /\["new", "edit", "review"\]\.includes\(action\)/);
  assert.match(editor, /queueTransactionUpdate/);
  assert.match(api, /operation: "update"/);
  assert.match(api, /revision/);
  assert.match(api, /updateTransactions/);
  assert.match(sync, /discardTransactionChange/);
});

test("offline retries expose countdowns, manual controls, and a deduplicated outage notice", () => {
  const sync = fs.readFileSync("src/screens/sync-screen/sync-screen.ts", "utf8");
  const notifications = fs.readFileSync("js/sync-notifications.js", "utf8");
  const api = fs.readFileSync("js/api.js", "utf8");
  assert.match(api, /RETRY_DELAYS = Object\.freeze\(\[2000, 5000, 15000, 30000, 60000\]\)/);
  assert.match(api, /budget:sync-retry-scheduled/);
  assert.match(api, /discardEntityChange/);
  assert.match(sync, /Retrying in \$\{seconds\}s/);
  assert.match(sync, /Attempt \$\{item\.attempts\}/);
  assert.match(sync, /navigator\.onLine === false/);
  assert.match(sync, /Retry now/);
  assert.match(sync, /Offline · Sync will attempt again when back online/);
  assert.match(sync, /disabled title="Available when online"/);
  assert.match(sync, /setInterval\(\(\) => this\.#render\(\), 1000\)/);
  assert.match(notifications, /outageToast\?\.isConnected/);
  assert.match(notifications, /View Sync/);
  assert.match(api, /browserIsOffline\(\)/);
  assert.match(api, /window\.addEventListener\("offline", pauseSyncWhileOffline\)/);
});

test("entity creation is optimistic and management screens reuse loaded transactions", () => {
  const api = fs.readFileSync("js/api.js", "utf8");
  const category = fs.readFileSync(
    "src/screens/category-screen/category-screen.ts",
    "utf8",
  );
  const vendor = fs.readFileSync("src/screens/vendors-screen/vendors-screen.ts", "utf8");
  const people = fs.readFileSync("src/screens/people-screen/people-screen.ts", "utf8");
  assert.match(api, /myFinance\.entityOutbox\.v1/);
  assert.match(api, /syncEntityOutbox/);
  assert.match(api, /pendingEntities\.has\(item\.record\.vendorId\)/);
  [category, vendor, people].forEach((source) => {
    assert.match(source, /getEntitySyncStatus/);
    assert.match(source, /budgetUI\(\)\?\.getTransactions/);
    assert.doesNotMatch(source, /APIs\.budget\.listTransactions\(/);
  });
});

test("entity status changes are optimistic and labeled in Sync", () => {
  const api = fs.readFileSync("src/api/budget-api.ts", "utf8");
  const sync = fs.readFileSync("src/screens/sync-screen/sync-screen.ts", "utf8");
  assert.match(api, /operation: active \? "reactivate" : "archive"/);
  assert.match(api, /scheduleEntitySync\(0\)/);
  assert.match(sync, /item\.operation === "archive" \? "Archive"/);
  assert.match(sync, /item\.operation === "reactivate" \? "Reactivate"/);
});
