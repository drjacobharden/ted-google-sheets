const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");

function loadAPI(seed = {}, fetchImpl, runtimeOptions = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const events = [];
  const listeners = new Map();
  const navigator = { onLine: runtimeOptions.online !== false };
  const context = {
    localStorage,
    crypto: { randomUUID: crypto.randomUUID, getRandomValues: (array) => crypto.randomFillSync(array) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    window: {
      dispatchEvent: (event) => {
        events.push(event);
        (listeners.get(event.type) || []).forEach((listener) => listener(event));
      },
      addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) || []), listener]),
    },
    fetch: fetchImpl || (() => { throw new Error("Unexpected network request"); }),
    navigator,
    URL,
    console,
  };
  if (runtimeOptions.timers) {
    context.setTimeout = setTimeout;
    context.clearTimeout = clearTimeout;
  }
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/api.js", "utf8"), context);
  return {
    api: context.window.BudgetAPI, localStorage, values, events,
    dispatchWindowEvent: (type) => context.window.dispatchEvent({ type }),
    setOnline: (online) => { navigator.onLine = online; },
  };
}

test("connects to a Google-provided Apps Script /exec deployment URL", async () => {
  const requests = [];
  const endpoint = "https://script.google.com/macros/s/deployment-id/exec";
  const { api } = loadAPI({}, async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { status: "ok" } }) };
  });

  const result = await api.testConnection(endpoint);
  assert.equal(result.status, "ok");
  assert.match(requests[0].url, /^https:\/\/script\.google\.com\/macros\/s\/deployment-id\/exec\?action=health&_/);
  assert.equal(api.getConfig().endpoint, "");
});

test("migrates legacy name transactions to normalized IDs", async () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const { api, values } = loadAPI({
    "myFinance.users.v1": [{ id: userId, firstName: "Ada", lastName: "Byron", active: true }],
    "myFinance.activeUser.v1": userId,
    "myFinance.vendors.v1": [{ id: "cafe", name: "Cafe" }],
    "myFinance.transactions.v1": [{
      id: "legacy", createdAt: "2026-01-01T12:00:00.000Z", type: "expense", amount: 12,
      date: "2026-01-01", category: "Dining", vendor: "Cafe", assignment: "Shared", notes: "Lunch",
    }],
  });

  const [transaction] = await api.listTransactions();
  assert.match(transaction.id, /^[0-9a-f-]{36}$/);
  assert.equal(transaction.category, "Dining");
  assert.equal(transaction.vendor, "Cafe");
  assert.equal(transaction.assignment, "Shared");
  assert.equal(transaction.createdBy, userId);
  const stored = JSON.parse(values.get("myFinance.transactions.v1"))[0];
  assert.ok(stored.categoryId);
  assert.ok(stored.vendorId);
  assert.ok(stored.assignmentId);
  assert.equal("category" in stored, false);
  assert.equal("vendor" in stored, false);
});

test("requires normalized category IDs and defaults income to seeded Income", async () => {
  const { api, values } = loadAPI();
  const user = await api.addUser({ firstName: "Grace", lastName: "Hopper" });
  const income = api.listCategories({ type: "income" });
  const expenses = api.listCategories({ type: "expense" });
  assert.equal(income.length, 1);
  assert.equal(income[0].name, "Income");
  assert.ok(expenses.length > 1);
  assert.ok(expenses.every((category) => category.type === "expense"));

  const saved = await api.addTransaction({
    type: "income", amount: 100, date: "2026-07-13", categoryId: api.INCOME_CATEGORY_ID,
    vendorId: "", assignmentId: api.SHARED_ASSIGNMENT_ID, notes: "Deposit",
  });
  assert.equal(saved.category, "Income");
  assert.equal(saved.createdBy, user.id);
  const raw = JSON.parse(values.get("myFinance.transactions.v1"))[0];
  assert.equal(raw.categoryId, api.INCOME_CATEGORY_ID);
  assert.equal(raw.vendorId, "");

  await assert.rejects(() => api.addTransaction({
    type: "income", amount: 10, date: "2026-07-13", categoryId: expenses[0].id,
    assignmentId: api.SHARED_ASSIGNMENT_ID,
  }), /valid category/);

  const vendor = await api.addVendor({ name: "Bookshop" });
  const refund = await api.addTransaction({
    type: "expense", amount: -24.99, date: "2026-07-14",
    categoryId: expenses[0].id, vendorId: vendor.id,
    assignmentId: api.SHARED_ASSIGNMENT_ID, notes: "Refund",
  });
  assert.equal(refund.type, "expense");
  assert.equal(refund.amount, -24.99);
  const updatedRefund = api.queueTransactionUpdate(
    { ...refund, amount: -19.5 },
    refund,
  );
  assert.equal(updatedRefund.amount, -19.5);
  await assert.rejects(() => api.addTransaction({
    type: "expense", amount: 0, date: "2026-07-14",
    categoryId: expenses[0].id, vendorId: vendor.id,
    assignmentId: api.SHARED_ASSIGNMENT_ID,
  }), /non-zero/);
});

test("keeps each computer's active user selection local", () => {
  const users = [
    { id: "123e4567-e89b-42d3-a456-426614174000", firstName: "Ada", lastName: "Byron", active: true },
    { id: "223e4567-e89b-42d3-a456-426614174000", firstName: "Grace", lastName: "Hopper", active: true },
  ];
  const firstComputer = loadAPI({ "myFinance.users.v1": users });
  const secondComputer = loadAPI({ "myFinance.users.v1": users });
  firstComputer.api.setActiveUser(users[0].id);
  secondComputer.api.setActiveUser(users[1].id);
  assert.equal(firstComputer.api.getActiveUser().id, users[0].id);
  assert.equal(secondComputer.api.getActiveUser().id, users[1].id);
});

test("hydrates users with reference data and serves repeated user lists from cache", async () => {
  const seed = connectedSeed();
  const refreshedUser = {
    id: "323e4567-e89b-42d3-a456-426614174000",
    firstName: "Grace",
    lastName: "Hopper",
    active: true,
  };
  const actions = [];
  const runtime = loadAPI(seed.values, async (url) => {
    const action = new URL(String(url)).searchParams.get("action");
    actions.push(action);
    const data = {
      listCategories: seed.values["myFinance.categories.v1"],
      listVendors: seed.values["myFinance.vendors.v1"],
      listAssignments: seed.values["myFinance.people.v1"],
      listUsers: [refreshedUser],
    }[action];
    return { ok: true, json: async () => ({ ok: true, data }) };
  });

  assert.equal(runtime.api.listUsers()[0].id, seed.userId);
  assert.deepEqual(actions, []);

  const referenceData = await runtime.api.loadReferenceData();
  assert.deepEqual(actions.sort(), [
    "listAssignments",
    "listCategories",
    "listUsers",
    "listVendors",
  ]);
  assert.equal(referenceData.users[0].id, refreshedUser.id);
  assert.equal(runtime.api.getActiveUser(), null);
  assert.equal(
    runtime.events.some(
      (event) =>
        event.type === "budget:active-user-changed" && event.detail === null,
    ),
    true,
  );

  const requestsAfterHydration = actions.length;
  assert.equal(runtime.api.listUsers()[0].id, refreshedUser.id);
  assert.equal(runtime.api.listUsers()[0].id, refreshedUser.id);
  assert.equal(actions.length, requestsAfterHydration);
});

test("rejects an invalid user list during reference-data hydration", async () => {
  const seed = connectedSeed();
  const runtime = loadAPI(seed.values, async (url) => {
    const action = new URL(String(url)).searchParams.get("action");
    const data = {
      listCategories: seed.values["myFinance.categories.v1"],
      listVendors: seed.values["myFinance.vendors.v1"],
      listAssignments: seed.values["myFinance.people.v1"],
      listUsers: { unexpected: true },
    }[action];
    return { ok: true, json: async () => ({ ok: true, data }) };
  });

  await assert.rejects(
    () => runtime.api.loadReferenceData(),
    /did not include a user list/,
  );
});

function connectedSeed() {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const vendorId = "223e4567-e89b-42d3-a456-426614174000";
  return {
    userId,
    vendorId,
    values: {
      "myFinance.config.v1": { endpoint: "https://script.google.com/macros/s/deployment-id/exec" },
      "myFinance.schemaVersion": "2",
      "myFinance.users.v1": [{ id: userId, firstName: "Ada", lastName: "Byron", active: true }],
      "myFinance.activeUser.v1": userId,
      "myFinance.categories.v1": [{ id: "00000000-0000-4000-8000-000000000003", name: "Dining", type: "expense", active: true }],
      "myFinance.vendors.v1": [{ id: vendorId, name: "Cafe", active: true }],
      "myFinance.people.v1": [{ id: "00000000-0000-4000-8000-000000000101", name: "Shared", active: true, isDefault: true }],
    },
  };
}

test("queues immediately, batch-syncs, and protects the configured household", async () => {
  const seed = connectedSeed();
  const requests = [];
  const { api, values } = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return {
      ok: true,
      json: async () => ({ ok: true, data: {
        saved: body.transactions.map((record) => ({ ...record, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" })),
        failed: [],
      } }),
    };
  });
  const queued = api.queueTransaction({
    type: "expense", amount: 12.5, date: "2026-07-13",
    categoryId: "00000000-0000-4000-8000-000000000003", vendorId: seed.vendorId,
    assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Lunch",
  });
  assert.equal(queued.syncStatus, "pending");
  assert.equal(api.getOutboxStatus().pending, 1);
  assert.throws(() => api.saveConfig({ endpoint: "https://script.google.com/macros/s/other/exec" }), /pending changes/);
  await api.syncOutbox();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].action, "addTransactions");
  assert.equal(api.getOutboxStatus().total, 0);
  assert.deepEqual(JSON.parse(values.get("myFinance.transactionOutbox.v2")), []);
});

test("retains validation failures and transport failures for retry or removal", async () => {
  const seed = connectedSeed();
  let mode = "validation";
  const runtime = loadAPI(seed.values, async (url, options) => {
    if (mode === "transport") throw new Error("offline");
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, data: { saved: [], failed: [{ id: body.transactions[0].id, error: "Vendor is inactive." }] } }) };
  });
  const input = {
    type: "expense", amount: 20, date: "2026-07-13",
    categoryId: "00000000-0000-4000-8000-000000000003", vendorId: seed.vendorId,
    assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Dinner",
  };
  runtime.api.queueTransaction(input);
  await runtime.api.syncOutbox();
  assert.equal(runtime.api.getOutboxStatus().failed, 1);
  runtime.api.retryFailedTransactions();
  assert.equal(runtime.api.getOutboxStatus().pending, 1);
  mode = "transport";
  await runtime.api.syncOutbox();
  assert.equal(runtime.api.getOutboxStatus().pending, 1);
  assert.equal(runtime.api.getOutboxStatus().failed, 0);
  runtime.api.removeFailedTransactions();
  assert.equal(runtime.api.getOutboxStatus().total, 1, "pending transport failures are not discarded");
});

test("exposes transport retry metadata and lets Retry now bypass backoff", async () => {
  const seed = connectedSeed();
  let offline = true;
  const runtime = loadAPI(seed.values, async (url, options) => {
    if (offline) throw new Error("Load failed");
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, data: {
      saved: body.transactions.map((record) => ({ ...record, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" })),
      failed: [],
    } }) };
  });
  const queued = runtime.api.queueTransaction({
    type: "expense", amount: 19, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Offline",
  });
  const before = Date.now();
  await runtime.api.syncOutbox();
  const retrying = runtime.api.getSyncItems().find((item) => item.id === queued.id);
  assert.equal(retrying.retrying, true);
  assert.equal(retrying.attempts, 1);
  assert.ok(retrying.nextRetryAt >= before + 1900);
  assert.equal(runtime.api.getOutboxStatus().retrying, 1);
  assert.equal(runtime.events.filter((event) => event.type === "budget:sync-retry-scheduled").length, 1);

  offline = false;
  runtime.api.retryTransaction(queued.id);
  const immediate = runtime.api.getTransactionOutboxItem(queued.id);
  assert.equal(immediate.nextRetryAt, 0);
  assert.equal(immediate.attempts, 1, "manual retry preserves the attempt history");
  await runtime.api.syncOutbox();
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("an online event bypasses the remaining retry delay", async () => {
  const seed = connectedSeed();
  let offline = true;
  const runtime = loadAPI(seed.values, async (url, options) => {
    if (offline) throw new Error("offline");
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, data: {
      saved: body.transactions.map((record) => ({ ...record, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" })),
      failed: [],
    } }) };
  });
  runtime.api.queueTransaction({
    type: "expense", amount: 11, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Reconnect",
  });
  await runtime.api.syncOutbox();
  assert.equal(runtime.api.getOutboxStatus().retrying, 1);
  offline = false;
  runtime.dispatchWindowEvent("online");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("queues transactions and entities offline without network attempts", async () => {
  const seed = connectedSeed();
  const requests = [];
  const runtime = loadAPI(seed.values, async (url, options) => {
    requests.push(JSON.parse(options.body));
    throw new Error("A request should not start while offline.");
  }, { online: false });
  const vendor = runtime.api.addVendor({ name: "Offline Market" });
  const transaction = runtime.api.queueTransaction({
    type: "expense", amount: 14, date: "2026-07-14", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Offline entry",
  });
  await runtime.api.syncEntityOutbox();
  await runtime.api.syncOutbox();
  assert.equal(requests.length, 0);
  const entityStatus = runtime.api.getEntitySyncStatus("vendor", vendor.id);
  assert.equal(entityStatus.status, "pending");
  assert.equal(entityStatus.error, "");
  assert.equal(entityStatus.attempts, 0);
  assert.equal(entityStatus.nextRetryAt, 0);
  assert.equal(entityStatus.retrying, false);
  assert.equal(entityStatus.waitingForOnline, true);
  const queued = runtime.api.getSyncItems().find((item) => item.id === transaction.id);
  assert.equal(queued.waitingForOnline, true);
  assert.equal(queued.retrying, false);
  assert.equal(queued.attempts, 0);
  assert.equal(runtime.api.getOutboxStatus().waitingForOnline, 1);
  assert.throws(() => runtime.api.retryTransaction(transaction.id), /back online/);
  assert.throws(() => runtime.api.retryEntity("vendor", vendor.id), /back online/);
});

test("entering offline mode preserves an existing transport backoff", async () => {
  const seed = connectedSeed();
  const runtime = loadAPI(seed.values, async () => { throw new Error("Google is unreachable"); });
  const transaction = runtime.api.queueTransaction({
    type: "expense", amount: 16, date: "2026-07-14", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Backoff",
  });
  await runtime.api.syncOutbox();
  const before = runtime.api.getSyncItems().find((item) => item.id === transaction.id);
  assert.equal(before.retrying, true);
  runtime.setOnline(false);
  runtime.dispatchWindowEvent("offline");
  const paused = runtime.api.getSyncItems().find((item) => item.id === transaction.id);
  assert.equal(paused.waitingForOnline, true);
  assert.equal(paused.retrying, false);
  assert.equal(paused.attempts, before.attempts);
  assert.equal(paused.nextRetryAt, before.nextRetryAt);
  assert.equal(paused.error, before.error);
});

test("coming online syncs entities before releasing dependent transactions", async () => {
  const seed = connectedSeed();
  const actions = [];
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    actions.push(body.action);
    if (body.action === "addEntities") {
      return { ok: true, json: async () => ({ ok: true, data: { saved: body.entities, reconciled: [], failed: [] } }) };
    }
    return { ok: true, json: async () => ({ ok: true, data: {
      saved: body.transactions.map((record) => ({ ...record, category: "Dining", vendor: "Reconnect Market", assignment: "Shared", createdByName: "Ada Byron" })),
      failed: [],
    } }) };
  }, { online: false, timers: true });
  const vendor = runtime.api.addVendor({ name: "Reconnect Market" });
  runtime.api.queueTransaction({
    type: "expense", amount: 31, date: "2026-07-14", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: vendor.id, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Dependent",
  });
  assert.deepEqual(actions, []);
  runtime.setOnline(true);
  runtime.dispatchWindowEvent("online");
  for (let attempt = 0; attempt < 20 && runtime.api.getOutboxStatus().total; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.deepEqual(actions, ["addEntities", "addTransactions"]);
  assert.equal(runtime.api.getEntityOutboxStatus().total, 0);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("going offline during a request restores its prior retry state", async () => {
  const seed = connectedSeed();
  let rejectRequest;
  const runtime = loadAPI(seed.values, () => new Promise((resolve, reject) => { rejectRequest = reject; }));
  const transaction = runtime.api.queueTransaction({
    type: "expense", amount: 18, date: "2026-07-14", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Interrupted",
  });
  const activeSync = runtime.api.syncOutbox();
  await Promise.resolve();
  runtime.setOnline(false);
  runtime.dispatchWindowEvent("offline");
  rejectRequest(new Error("offline"));
  await activeSync;
  const item = runtime.api.getSyncItems().find((entry) => entry.id === transaction.id);
  assert.equal(item.status, "pending");
  assert.equal(item.waitingForOnline, true);
  assert.equal(item.attempts, 0);
  assert.equal(item.nextRetryAt, 0);
  assert.equal(item.error, "");
});

test("drains more than 50 queued transactions in consecutive batches", async () => {
  const seed = connectedSeed();
  const batchSizes = [];
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    batchSizes.push(body.transactions.length);
    return { ok: true, json: async () => ({ ok: true, data: {
      saved: body.transactions.map((record) => ({ ...record, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" })),
      failed: [],
    } }) };
  });
  for (let index = 0; index < 70; index += 1) {
    runtime.api.queueTransaction({
      type: "expense", amount: index + 1, date: "2026-07-14", categoryId: "00000000-0000-4000-8000-000000000003",
      vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: `Entry ${index + 1}`,
    });
  }
  await runtime.api.syncOutbox();
  assert.equal(runtime.api.getOutboxStatus().total, 20);
  await runtime.api.syncOutbox();
  assert.deepEqual(batchSizes, [50, 20]);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("discards transaction creates and restores updates while waiting to retry", async () => {
  const seed = connectedSeed();
  const runtime = loadAPI(seed.values, async () => { throw new Error("offline"); });
  const created = runtime.api.queueTransaction({
    type: "expense", amount: 9, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Create",
  });
  await runtime.api.syncOutbox();
  runtime.api.discardTransactionChange(created.id);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
  assert.equal(runtime.events.some((event) => event.type === "budget:transaction-removed" && event.detail.id === created.id), true);

  const original = {
    id: "d23e4567-e89b-42d3-a456-426614174000", createdAt: "2026-07-13T12:00:00.000Z", createdBy: seed.userId,
    type: "expense", amount: 12, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Confirmed",
  };
  runtime.api.queueTransactionUpdate({ ...original, amount: 25 }, original);
  await runtime.api.syncOutbox();
  runtime.api.discardTransactionChange(original.id);
  const restored = runtime.events.filter((event) => event.type === "budget:transaction-restored").at(-1);
  assert.equal(restored.detail.transaction.amount, 12);
});

test("deduplicates an outbox entry already present in server history", async () => {
  const seed = connectedSeed();
  const record = {
    id: "323e4567-e89b-42d3-a456-426614174000", createdAt: "2026-07-13T12:00:00.000Z", createdBy: seed.userId,
    type: "expense", amount: 8, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Coffee",
  };
  seed.values["myFinance.transactionOutbox.v1"] = [{ record, status: "pending", attempts: 1, nextRetryAt: Date.now() + 60000, error: "Response lost" }];
  const runtime = loadAPI(seed.values, async () => ({ ok: true, json: async () => ({ ok: true, data: [{ ...record, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" }] }) }));
  const transactions = await runtime.api.listTransactions();
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].syncStatus, undefined);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("falls back to the compatible single-transaction action on an older deployment", async () => {
  const seed = connectedSeed();
  const actions = [];
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    actions.push(body.action);
    if (body.action === "addTransactions") {
      return { ok: true, json: async () => ({ ok: false, error: "Unknown action." }) };
    }
    return { ok: true, json: async () => ({ ok: true, data: { ...body.transaction, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" } }) };
  });
  runtime.api.queueTransaction({
    type: "expense", amount: 4, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Snack",
  });
  await runtime.api.syncOutbox();
  assert.deepEqual(actions, ["addTransactions", "addTransaction"]);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("creates entities optimistically and syncs them before dependent transactions", async () => {
  const seed = connectedSeed();
  const actions = [];
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    actions.push(body.action);
    if (body.action === "addEntities") {
      return { ok: true, json: async () => ({ ok: true, data: { saved: body.entities, reconciled: [], failed: [] } }) };
    }
    return { ok: true, json: async () => ({ ok: true, data: {
      saved: body.transactions.map((record) => ({ ...record, category: "Dining", vendor: "New Market", assignment: "Shared", createdByName: "Ada Byron" })), failed: [],
    } }) };
  });
  const vendor = runtime.api.addVendor({ name: "New Market" });
  assert.equal(runtime.api.listVendors().some((item) => item.id === vendor.id), true);
  assert.equal(runtime.api.getEntitySyncStatus("vendor", vendor.id).status, "pending");
  runtime.api.queueTransaction({
    type: "expense", amount: 30, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: vendor.id, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Groceries",
  });
  await runtime.api.syncOutbox();
  assert.deepEqual(actions, [], "a dependent transaction must wait for its entity");
  await runtime.api.syncEntityOutbox();
  await runtime.api.syncOutbox();
  assert.deepEqual(actions, ["addEntities", "addTransactions"]);
  assert.equal(runtime.api.getEntityOutboxStatus().total, 0);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("reconciles duplicate entity names and remaps queued transaction UUIDs", async () => {
  const seed = connectedSeed();
  const canonical = { id: "423e4567-e89b-42d3-a456-426614174000", name: "Costco", active: true, createdAt: "2026-07-13T10:00:00.000Z", updatedAt: "2026-07-13T10:00:00.000Z" };
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    const requested = body.entities[0];
    return { ok: true, json: async () => ({ ok: true, data: {
      saved: [], failed: [], reconciled: [{ kind: "vendor", requestedId: requested.record.id, record: canonical }],
    } }) };
  });
  const optimistic = runtime.api.addVendor({ name: "Costco" });
  runtime.api.queueTransaction({
    type: "expense", amount: 50, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: optimistic.id, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Supplies",
  });
  await runtime.api.syncEntityOutbox();
  const vendors = runtime.api.listVendors();
  assert.equal(vendors.some((item) => item.id === optimistic.id), false);
  assert.equal(vendors.some((item) => item.id === canonical.id), true);
  const queued = JSON.parse(runtime.values.get("myFinance.transactionOutbox.v2"));
  assert.equal(queued[0].record.vendorId, canonical.id);
  assert.equal(runtime.events.some((event) => event.type === "budget:vendors-changed" && event.detail.oldId === optimistic.id), true);
});

test("retains failed entities and blocks removal while a transaction depends on them", async () => {
  const seed = connectedSeed();
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    const item = body.entities[0];
    return { ok: true, json: async () => ({ ok: true, data: { saved: [], reconciled: [], failed: [{ kind: item.kind, id: item.record.id, error: "Sheet rejected the vendor." }] } }) };
  });
  const vendor = runtime.api.addVendor({ name: "Blocked Vendor" });
  runtime.api.queueTransaction({
    type: "expense", amount: 5, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: vendor.id, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Test",
  });
  await runtime.api.syncEntityOutbox();
  assert.equal(runtime.api.getEntitySyncStatus("vendor", vendor.id).status, "failed");
  await runtime.api.syncOutbox();
  assert.throws(() => runtime.api.removeFailedEntity("vendor", vendor.id), /dependent transactions/);
  runtime.api.retryEntity("vendor", vendor.id);
  assert.equal(runtime.api.getEntitySyncStatus("vendor", vendor.id).status, "pending");
});

test("supports retry-now and dependency-safe discard for entity transport failures", async () => {
  const seed = connectedSeed();
  let offline = true;
  const runtime = loadAPI(seed.values, async (url, options) => {
    if (offline) throw new Error("offline");
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, data: { saved: body.entities, reconciled: [], failed: [] } }) };
  });
  const vendor = runtime.api.addVendor({ name: "Retry Market" });
  await runtime.api.syncEntityOutbox();
  const retrying = runtime.api.getEntitySyncStatus("vendor", vendor.id);
  assert.equal(retrying.retrying, true);
  assert.equal(retrying.attempts, 1);
  assert.ok(retrying.nextRetryAt > Date.now());

  runtime.api.queueTransaction({
    type: "expense", amount: 7, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: vendor.id, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Dependent",
  });
  assert.throws(() => runtime.api.discardEntityChange("vendor", vendor.id), /dependent transactions/);

  offline = false;
  runtime.api.retryEntity("vendor", vendor.id);
  assert.equal(runtime.api.getEntitySyncStatus("vendor", vendor.id).nextRetryAt, 0);
  await runtime.api.syncEntityOutbox();
  assert.equal(runtime.api.getEntitySyncStatus("vendor", vendor.id), null);

  offline = true;
  const unused = runtime.api.addVendor({ name: "Unused Market" });
  await runtime.api.syncEntityOutbox();
  runtime.api.discardEntityChange("vendor", unused.id);
  assert.equal(runtime.api.getEntitySyncStatus("vendor", unused.id), null);
  assert.equal(runtime.api.listVendors().some((item) => item.id === unused.id), false);
});

test("restores optimistic entities from a durable outbox after reload", () => {
  const seed = connectedSeed();
  const record = { id: "523e4567-e89b-42d3-a456-426614174000", name: "Reload Market", active: true, createdAt: "2026-07-13T12:00:00.000Z", updatedAt: "2026-07-13T12:00:00.000Z" };
  seed.values["myFinance.entityOutbox.v1"] = [{ kind: "vendor", record, status: "pending", attempts: 1, nextRetryAt: Date.now() + 60000, error: "offline" }];
  const runtime = loadAPI(seed.values);
  assert.equal(runtime.api.listVendors().some((vendor) => vendor.id === record.id), true);
  assert.equal(runtime.api.getEntityOutboxStatus().pending, 1);
});

test("falls back to compatible single-entity actions on an older deployment", async () => {
  const seed = connectedSeed();
  const actions = [];
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    actions.push(body.action);
    if (body.action === "addEntities") return { ok: true, json: async () => ({ ok: false, error: "Unknown action." }) };
    return { ok: true, json: async () => ({ ok: true, data: body.vendor }) };
  });
  const vendor = runtime.api.addVendor({ name: "Legacy Market" });
  await runtime.api.syncEntityOutbox();
  assert.deepEqual(actions, ["addEntities", "addVendor"]);
  assert.equal(runtime.api.getEntitySyncStatus("vendor", vendor.id), null);
});

test("preserves an in-flight optimistic entity while reference data refreshes", async () => {
  const seed = connectedSeed();
  const record = { id: "623e4567-e89b-42d3-a456-426614174000", name: "In Flight", active: true, createdAt: "2026-07-13T12:00:00.000Z", updatedAt: "2026-07-13T12:00:00.000Z" };
  seed.values["myFinance.entityOutbox.v1"] = [{ kind: "vendor", record, status: "pending", attempts: 0, nextRetryAt: Date.now() + 60000, error: "" }];
  const runtime = loadAPI(seed.values, async (url) => {
    const action = new URL(String(url)).searchParams.get("action");
    const data = action === "listCategories"
      ? seed.values["myFinance.categories.v1"]
      : action === "listAssignments"
        ? seed.values["myFinance.people.v1"]
        : [];
    return { ok: true, json: async () => ({ ok: true, data }) };
  });
  await runtime.api.loadReferenceData();
  assert.equal(runtime.api.listVendors().some((vendor) => vendor.id === record.id), true);
});

test("queues durable transaction updates and restores confirmed values when discarded", async () => {
  const seed = connectedSeed();
  const original = {
    id: "723e4567-e89b-42d3-a456-426614174000", createdAt: "2026-07-13T12:00:00.000Z", createdBy: seed.userId,
    type: "expense", amount: 12, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Lunch",
    category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron",
  };
  const actions = [];
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body); actions.push(body.action);
    return { ok: true, json: async () => ({ ok: true, data: { saved: body.updates.map((update) => ({ ...update.transaction, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" })), failed: [] } }) };
  });
  const queued = runtime.api.queueTransactionUpdate({ ...original, amount: 18, notes: "Dinner" }, original);
  assert.equal(queued.syncStatus, "pending");
  assert.equal(queued.syncOperation, "update");
  assert.equal(runtime.api.getTransactionOutboxItem(original.id).baseRecord.amount, 12);
  runtime.api.discardTransactionChange(original.id);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
  assert.equal(runtime.events.find((event) => event.type === "budget:transaction-restored").detail.transaction.amount, 12);

  runtime.api.queueTransactionUpdate({ ...original, amount: 18 }, original);
  await runtime.api.syncOutbox();
  assert.deepEqual(actions, ["updateTransactions"]);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("coalesces an edit made while a create is in flight into a follow-up update", async () => {
  const seed = connectedSeed();
  let releaseCreate;
  const requests = [];
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    if (body.action === "addTransactions") {
      await new Promise((resolve) => { releaseCreate = () => resolve(); });
      return { ok: true, json: async () => ({ ok: true, data: { saved: body.transactions.map((record) => ({ ...record, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" })), failed: [] } }) };
    }
    return { ok: true, json: async () => ({ ok: true, data: { saved: body.updates.map((update) => ({ ...update.transaction, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" })), failed: [] } }) };
  });
  const created = runtime.api.queueTransaction({
    type: "expense", amount: 10, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "First",
  });
  const firstSync = runtime.api.syncOutbox();
  await Promise.resolve();
  assert.throws(() => runtime.api.retryTransaction(created.id), /already syncing/);
  assert.throws(() => runtime.api.discardTransactionChange(created.id), /already syncing/);
  runtime.api.queueTransactionUpdate({ ...created, amount: 20, notes: "Newer" }, created);
  releaseCreate();
  await firstSync;
  const followUp = runtime.api.getTransactionOutboxItem(created.id);
  assert.equal(followUp.operation, "update");
  assert.equal(followUp.record.amount, 20);
  assert.equal(followUp.baseRecord.amount, 10);
  await runtime.api.syncOutbox();
  assert.deepEqual(requests.map((body) => body.action), ["addTransactions", "updateTransactions"]);
  assert.equal(runtime.api.getOutboxStatus().total, 0);
});

test("keeps transaction conflicts failed with the latest Sheet record for review", async () => {
  const seed = connectedSeed();
  const original = {
    id: "823e4567-e89b-42d3-a456-426614174000", createdAt: "2026-07-13T12:00:00.000Z", createdBy: seed.userId,
    type: "expense", amount: 12, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Original",
  };
  const current = { ...original, amount: 15, notes: "Other computer", category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" };
  const runtime = loadAPI(seed.values, async (url, options) => {
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, data: { saved: [], failed: [{ id: body.updates[0].transaction.id, code: "conflict", error: "Changed elsewhere", current }] } }) };
  });
  runtime.api.queueTransactionUpdate({ ...original, amount: 20 }, original);
  await runtime.api.syncOutbox();
  const item = runtime.api.getTransactionOutboxItem(original.id);
  assert.equal(item.status, "failed");
  assert.equal(item.failureCode, "conflict");
  assert.equal(item.currentRecord.amount, 15);
});

test("merges server history with queued updates by UUID without dropping the optimistic edit", async () => {
  const seed = connectedSeed();
  const original = {
    id: "b23e4567-e89b-42d3-a456-426614174000", createdAt: "2026-07-13T12:00:00.000Z", createdBy: seed.userId,
    type: "expense", amount: 12, date: "2026-07-13", categoryId: "00000000-0000-4000-8000-000000000003",
    vendorId: seed.vendorId, assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Original",
  };
  seed.values["myFinance.transactionOutbox.v2"] = [{
    operation: "update", record: { ...original, amount: 22 }, baseRecord: original, revision: 1,
    status: "pending", attempts: 0, nextRetryAt: Date.now() + 60000, error: "",
  }];
  const runtime = loadAPI(seed.values, async () => ({ ok: true, json: async () => ({ ok: true, data: [{ ...original, category: "Dining", vendor: "Cafe", assignment: "Shared", createdByName: "Ada Byron" }] }) }));
  const transactions = await runtime.api.listTransactions();
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].amount, 22);
  assert.equal(transactions[0].syncOperation, "update");
  assert.equal(runtime.api.getOutboxStatus().total, 1);
});
