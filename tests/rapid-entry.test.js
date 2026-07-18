const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("transaction entry is optimistic and exposes durable sync controls", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const form = fs.readFileSync("js/form.js", "utf8");
  const main = fs.readFileSync("js/main.js", "utf8");
  const api = fs.readFileSync("js/api.js", "utf8");
  assert.match(html, /id="transaction-sync-status"/);
  assert.match(html, /id="view-sync-from-form"/);
  assert.match(html, /data-screen="sync"/);
  assert.match(form, /BudgetAPI\.queueTransaction\(transaction\)/);
  assert.doesNotMatch(form, /await window\.BudgetAPI\.addTransaction/);
  assert.doesNotMatch(form, /showTab\("transactions"\)/);
  assert.match(main, /budget:transaction-queued/);
  assert.match(main, /budget:transaction-saved/);
  assert.match(api, /myFinance\.transactionOutbox\.v2/);
  assert.match(api, /sync or remove pending changes/i);
});

test("transaction editing uses a UUID drawer, durable updates, and unified notifications", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const main = fs.readFileSync("js/main.js", "utf8");
  const editor = fs.readFileSync("js/transaction-editor.js", "utf8");
  const sync = fs.readFileSync("js/sync.js", "utf8");
  const api = fs.readFileSync("js/api.js", "utf8");
  assert.match(html, /id="transaction-drawer"/);
  assert.match(html, /id="transaction-edit-id"/);
  assert.match(html, /id="transaction-created-footnote"/);
  assert.match(html, /id="toast-stack"/);
  assert.match(main, /dataset\.transactionId = transaction\.id/);
  assert.match(main, /TransactionEditor\?\.open/);
  assert.match(editor, /window\.openTransactionEditor = open/);
  assert.match(editor, /queueTransactionUpdate/);
  assert.match(api, /operation: "update"/);
  assert.match(api, /revision/);
  assert.match(api, /updateTransactions/);
  assert.match(sync, /View Sync/);
  assert.match(sync, /discardTransactionChange/);
});

test("offline retries expose countdowns, manual controls, and a deduplicated outage notice", () => {
  const sync = fs.readFileSync("js/sync.js", "utf8");
  const form = fs.readFileSync("js/form.js", "utf8");
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
  assert.match(sync, /setInterval\(render, 1000\)/);
  assert.match(sync, /outageToast\?\.isConnected/);
  assert.match(form, /Waiting to retry/);
  assert.match(form, /Offline · Sync will attempt again when back online/);
  assert.match(api, /browserIsOffline\(\)/);
  assert.match(api, /window\.addEventListener\("offline", pauseSyncWhileOffline\)/);
});

test("entity creation is optimistic and management screens reuse loaded transactions", () => {
  const api = fs.readFileSync("js/api.js", "utf8");
  const category = fs.readFileSync("js/categories.js", "utf8");
  const vendor = fs.readFileSync("js/vendors.js", "utf8");
  const people = fs.readFileSync("js/people.js", "utf8");
  assert.match(api, /myFinance\.entityOutbox\.v1/);
  assert.match(api, /syncEntityOutbox/);
  assert.match(api, /pendingEntities\.has\(item\.record\.vendorId\)/);
  [category, vendor, people].forEach((source) => {
    assert.match(source, /getEntitySyncStatus/);
    assert.match(source, /BudgetUI\?\.getTransactions/);
    assert.doesNotMatch(source, /BudgetAPI\.listTransactions\(/);
  });
});
