const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadInvestments(options = {}) {
  const values = new Map(Object.entries(options.values || {}));
  const requests = [];
  const events = [];
  const timers = new Map();
  let timerId = 0;
  let uuidIndex = 1;
  const listeners = new Map();
  const window = {
    BudgetAPI: {
      getConfig: () => ({ endpoint: options.endpoint || "" }),
      getActiveUser: () => ({ id: "123e4567-e89b-42d3-a456-426614174000" }),
      listPeople: () => [{ id: "00000000-0000-4000-8000-000000000101", name: "Shared" }],
      getSyncItems: () => [],
    },
    addEventListener: (name, listener) => { listeners.set(name, listener); },
    dispatchEvent: (event) => { events.push(event); },
  };
  const context = {
    window,
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    navigator: { onLine: options.online !== false },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(uuidIndex++).padStart(12, "0")}` },
    fetch: async (_url, request) => {
      const body = JSON.parse(request.body); requests.push(body);
      if (options.fetch) return options.fetch(body);
      if (body.action === "addInvestmentAccounts") return { ok: true, json: async () => ({ ok: true, data: { saved: body.accounts, reconciled: [], failed: [] } }) };
      if (body.action === "saveInvestmentMonths") return { ok: true, json: async () => ({ ok: true, data: { saved: body.months.map((item) => ({ id: item.id, accountId: item.accountId, month: item.month, balance: item.balance.record, contributions: item.upserts.map((entry) => entry.record) })), failed: [] } }) };
      throw new Error(`Unexpected ${body.action}`);
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout: (callback, delay) => { timerId += 1; timers.set(timerId, { callback, delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id), Date, Map, Set, JSON, Number, String, Math, Promise,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/investments-api.js", "utf8"), context);
  return { api: window.InvestmentAPI, values, requests, events, timers, context, listeners };
}

test("investment savings excludes manual transfers from the combined total", () => {
  const runtime = loadInvestments({ values: {
    "myFinance.investmentAccounts.v1": JSON.stringify([
      { id: "paycheck-account", name: "401(k)", source: "paycheck" },
      { id: "manual-account", name: "Brokerage", source: "manual" },
    ]),
    "myFinance.investmentSnapshots.v1": JSON.stringify([
      { accountId: "paycheck-account", month: "2026-07", contribution: 750 },
      { accountId: "manual-account", month: "2026-07", contribution: 300 },
    ]),
  } });
  const totals = runtime.api.calculate([
    { type: "income", amount: 5000, date: "2026-07-01" },
    { type: "expense", amount: 3500, date: "2026-07-02" },
    { type: "expense", amount: -100, date: "2026-07-03" },
  ], { start: "2026-07", end: "2026-07" });
  assert.equal(totals.spending, 3400);
  assert.equal(totals.budgetSurplus, 1600);
  assert.equal(totals.paycheckContributions, 750);
  assert.equal(totals.totalSavings, 2350);
  assert.equal(totals.manualContributions, 300);
});

test("investment growth removes signed net flows", () => {
  const runtime = loadInvestments();
  const growth = runtime.api.calculateGrowth(10000, 11200, [{ amount: 1000 }, { amount: -50 }]);
  assert.equal(growth, 250);
  assert.equal(runtime.api.calculateGrowth(null, 11200, []), null);
});

test("legacy local investment records migrate to manual source and net contribution", () => {
  const runtime = loadInvestments({ values: {
    "myFinance.investmentAccounts.v1": JSON.stringify([{ id: "legacy", name: "Brokerage", institution: "Old Bank", accountType: "brokerage" }]),
    "myFinance.investmentSnapshots.v1": JSON.stringify([{ id: "snapshot", accountId: "legacy", month: "2026-06", balance: 5000, employeeContribution: 100, employerContribution: 50, manualContribution: 200, withdrawals: 25 }]),
  } });
  assert.equal(runtime.api.accounts()[0].source, "manual");
  assert.equal(runtime.api.snapshots()[0].contribution, 325);
  assert.equal("institution" in runtime.api.accounts()[0], false);
});

test("investment account synchronization precedes its dependent monthly update", async () => {
  const runtime = loadInvestments({ endpoint: "https://script.google.com/macros/s/test/exec", online: false });
  const account = runtime.api.addAccount({ name: "Roth IRA", source: "manual" });
  runtime.api.queueSnapshots([{ accountId: account.id, month: "2026-07", balance: 1000, contribution: 100 }]);
  assert.equal(runtime.requests.length, 0);
  runtime.context.navigator.onLine = true;
  await runtime.api.sync();
  assert.deepEqual(runtime.requests.map((item) => item.action), ["addInvestmentAccounts", "saveInvestmentMonths"]);
  assert.equal(runtime.api.hasUnsynced(), false);
});

test("snapshot cache and conflicted draft migrate to balances, flows, and a monthly operation", () => {
  const id = "323e4567-e89b-42d3-a456-426614174099";
  const current = { id, accountId: "account", month: "2026-07", balanceDate: "2026-07-15", balance: 5000, contribution: 3000 };
  const draft = { ...current, balanceDate: "2026-07-10", balance: 4500, contribution: 1000 };
  const runtime = loadInvestments({ values: {
    "myFinance.investmentAccounts.v1": JSON.stringify([{ id: "account", name: "Roth IRA", source: "manual" }]),
    "myFinance.investmentSnapshots.v1": JSON.stringify([draft]),
    "myFinance.investmentSnapshotOutbox.v1": JSON.stringify([{ record: draft, base: null, current, status: "failed", failureCode: "conflict", error: "changed" }]),
  } });
  assert.equal(runtime.api.snapshots()[0].balance, 5000);
  assert.equal("balanceDate" in runtime.api.snapshots()[0], false);
  assert.equal(runtime.api.getConflict(id).draft.balance.balance, 4500);
  assert.equal(runtime.api.getConflict(id).draft.contributions[0].amount, 1000);
  assert.equal(runtime.api.getConflict(id).current.contributions[0].amount, 3000);
  assert.equal(runtime.values.has("myFinance.investmentSnapshotOutbox.v1"), false);
});

test("a conflict stores Sheet values canonically and schedules no failed-item loop", async () => {
  const id = "323e4567-e89b-42d3-a456-426614174099";
  const accountId = "account";
  const base = { id, accountId, month: "2026-07", balance: 4000, contribution: 800 };
  const draft = { ...base, balance: 4500, contribution: 1000 };
  const currentSnapshot = { ...base, balance: 5000, contribution: 3000 };
  const current = { accountId, month: "2026-07", balance: { id, accountId, month: "2026-07", balance: 5000 }, contributions: [{ id: "flow", accountId, month: "2026-07", amount: 3000 }] };
  const runtime = loadInvestments({ endpoint: "https://script.google.com/macros/s/test/exec", online: false, values: {
    "myFinance.investmentAccounts.v1": JSON.stringify([{ id: accountId, name: "Roth IRA", source: "manual" }]),
    "myFinance.investmentSnapshots.v2": JSON.stringify([draft]),
    "myFinance.investmentSnapshotOutbox.v2": JSON.stringify([{ record: draft, base, revision: 1, status: "pending", attempts: 0, nextRetryAt: 0 }]),
  }, fetch: async (body) => ({ ok: true, json: async () => ({ ok: true, data: body.action === "saveInvestmentMonths"
    ? { saved: [], failed: [{ id, code: "conflict", error: "changed", current }] }
    : [] }) }) });
  runtime.context.navigator.onLine = true;
  await runtime.api.sync();
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.timers.size, 0);
  assert.equal(runtime.api.snapshots()[0].balance, 5000);
  assert.equal(runtime.api.getConflict(id).draft.balance.balance, 4500);
  assert.equal(runtime.api.getConflict(id).current.balance.balance, 5000);
});

test("discard keeps Sheet values while review-and-save rebases the local draft", async () => {
  const id = "323e4567-e89b-42d3-a456-426614174099";
  const accountId = "account";
  const current = { id, accountId, month: "2026-07", balance: 5000, contribution: 3000, createdAt: "2026-07-31T00:00:00.000Z", createdBy: "123e4567-e89b-42d3-a456-426614174000" };
  const draft = { ...current, balance: 4500, contribution: 1000 };
  const seeded = {
    "myFinance.investmentAccounts.v1": JSON.stringify([{ id: accountId, name: "Roth IRA", source: "manual" }]),
    "myFinance.investmentSnapshots.v2": JSON.stringify([current]),
    "myFinance.investmentSnapshotOutbox.v2": JSON.stringify([{ record: draft, base: null, current, revision: 1, status: "failed", failureCode: "conflict", error: "changed" }]),
  };
  const discarded = loadInvestments({ values: seeded });
  discarded.api.discard("investmentMonth", id);
  assert.equal(discarded.api.snapshots()[0].balance, 5000);
  assert.equal(discarded.api.hasUnsynced(), false);

  const saved = loadInvestments({ endpoint: "https://script.google.com/macros/s/test/exec", online: false, values: seeded });
  const draftFlowId = saved.api.getConflict(id).draft.contributions[0].id;
  saved.api.resolveConflict(id, { balance: 4600, contributions: [{ id: draftFlowId, amount: 1100 }] });
  saved.context.navigator.onLine = true;
  await saved.api.sync();
  assert.equal(saved.requests[0].months[0].balance.base.balance, 5000);
  assert.equal(saved.requests[0].months[0].balance.record.balance, 4600);
  assert.equal(saved.api.snapshots()[0].balance, 4600);
  assert.equal(saved.api.hasUnsynced(), false);
});

test("a slower response cannot overwrite a newer monthly edit", async () => {
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const runtime = loadInvestments({ endpoint: "https://script.google.com/macros/s/test/exec", online: false, values: {
    "myFinance.investmentAccounts.v1": JSON.stringify([{ id: "account", name: "Roth IRA", source: "manual" }]),
  }, fetch: async () => response });
  runtime.api.queueSnapshots([{ accountId: "account", month: "2026-07", balance: 1000, contribution: 100 }]);
  runtime.context.navigator.onLine = true;
  const firstSync = runtime.api.sync();
  runtime.api.queueSnapshots([{ accountId: "account", month: "2026-07", balance: 1200, contribution: 150 }]);
  const firstOperation = runtime.requests[0].months[0];
  release({ ok: true, json: async () => ({ ok: true, data: { saved: [{ id: firstOperation.id, accountId: firstOperation.accountId, month: firstOperation.month, balance: firstOperation.balance.record, contributions: firstOperation.upserts.map((entry) => entry.record) }], failed: [] } }) });
  await firstSync;
  assert.equal(runtime.api.snapshots()[0].balance, 1200);
  assert.equal(runtime.api.hasUnsynced(), true);
});

test("rebasing a conflict retains a contribution independently added in the Sheet", () => {
  const accountId = "223e4567-e89b-42d3-a456-426614174099";
  const operationId = "723e4567-e89b-42d3-a456-426614174099";
  const balance = { id: "323e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", balance: 5000 };
  const original = { id: "423e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", amount: 500 };
  const remote = { id: "523e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", amount: 250 };
  const month = { accountId, month: "2026-07", balance, contributions: [original] };
  const runtime = loadInvestments({ endpoint: "https://script.google.com/macros/s/test/exec", online: false, values: {
    "myFinance.investmentAccounts.v1": JSON.stringify([{ id: accountId, name: "403(b)", source: "paycheck" }]),
    "myFinance.investmentBalances.v1": JSON.stringify([balance]),
    "myFinance.investmentContributions.v1": JSON.stringify([original, remote]),
    "myFinance.investmentMonthOutbox.v1": JSON.stringify([{ id: operationId, accountId, month: "2026-07", draft: { ...month, balance: { ...balance, balance: 5100 } }, base: month, current: { ...month, contributions: [original, remote] }, status: "failed", failureCode: "conflict", error: "changed", revision: 1 }]),
  } });
  runtime.api.resolveConflict(operationId, { balance: 5100, contributions: [{ id: original.id, amount: 500 }] });
  assert.equal(runtime.api.monthData(accountId, "2026-07").contributions.length, 2);
  assert.equal(runtime.api.monthData(accountId, "2026-07").contributions.some((item) => item.id === remote.id), true);
});

test("investment UI includes monthly account summaries and the contribution-withdrawal drawer", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const source = fs.readFileSync("js/investments.js", "utf8") + fs.readFileSync("js/investments-api.js", "utf8");
  assert.match(html, /data-screen="dashboard"/);
  assert.match(html, /data-screen="investment-overview"/);
  assert.match(html, /data-screen="investment-accounts"/);
  assert.match(html, /data-screen="investment-balances"/);
  assert.match(html, /data-screen="investment-update"/);
  assert.match(html, /id="investment-month-list"/);
  assert.doesNotMatch(html, /Balance as of|Balance date/);
  assert.match(html, /id="investment-month-drawer"/);
  assert.match(html, /id="investment-contribution-list"/);
  assert.match(html, /id="investment-withdrawal-list"/);
  assert.match(html, /Add another contribution/);
  assert.match(html, /Add another withdrawal/);
  assert.match(html, /id="investment-import-overlay"/);
  assert.match(source, /totalSavings: budgetSurplus \+ paycheckContributions/);
  assert.doesNotMatch(html, /Employee payroll|Employer match|Institution|Account Type/);
  assert.match(source, /parseDelimited/);
  assert.match(source, /duplicate account and month/);
  assert.match(source, /amount:sign\*amount/);
});

test("primary navigation groups budgeting and investment destinations", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const source = fs.readFileSync("js/main.js", "utf8");
  const styles = fs.readFileSync("styles.css", "utf8");
  assert.match(html, /data-nav-section="budgeting"/);
  assert.match(html, /data-tab="transactions"/);
  assert.match(html, /data-tab="new-transaction"/);
  assert.match(html, /data-nav-section="investments"/);
  assert.match(html, /data-tab="investment-overview"/);
  assert.match(html, /data-tab="investment-accounts"/);
  assert.match(html, /data-tab="investment-balances"/);
  assert.match(html, /data-tab="investment-update"/);
  assert.doesNotMatch(html, /data-tab="investments"/);
  assert.match(source, /name\.startsWith\("investment-"\)/);
  assert.match(source, /data-nav-section-toggle/);
  assert.match(styles, /\.nav-section\.collapsed \.nav-submenu/);
  assert.match(styles, /\.sidebar-footer \{[\s\S]*?display: grid/);
});
