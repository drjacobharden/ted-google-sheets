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
      listUsers: () => [
        {
          id: "123e4567-e89b-42d3-a456-426614174000",
          firstName: "Test",
          lastName: "User",
        },
      ],
      listPeople: () => [
        { id: "00000000-0000-4000-8000-000000000101", name: "Shared" },
      ],
      getSyncItems: () => [],
    },
    addEventListener: (name, listener) => {
      listeners.set(name, listener);
    },
    dispatchEvent: (event) => {
      events.push(event);
    },
  };
  const context = {
    window,
    localStorage: {
      getItem: (key) => (values.has(key) ? values.get(key) : null),
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    navigator: { onLine: options.online !== false },
    crypto: {
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(uuidIndex++).padStart(12, "0")}`,
    },
    fetch: async (_url, request) => {
      const body = JSON.parse(request.body);
      requests.push(body);
      if (options.fetch) return options.fetch(body);
      if (body.action === "addInvestmentAccounts")
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: { saved: body.accounts, reconciled: [], failed: [] },
          }),
        };
      if (body.action === "saveInvestmentMonths")
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data: {
              saved: body.months.map((item) => ({
                id: item.id,
                accountId: item.accountId,
                month: item.month,
                balance: item.balance.record,
                contributions: item.upserts.map((entry) => entry.record),
              })),
              failed: [],
            },
          }),
        };
      throw new Error(`Unexpected ${body.action}`);
    },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    setTimeout: (callback, delay) => {
      timerId += 1;
      timers.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    Date,
    Map,
    Set,
    JSON,
    Number,
    String,
    Math,
    Promise,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("src/api/investment-api.ts", "utf8"), context);
  return {
    api: window.InvestmentAPI,
    values,
    requests,
    events,
    timers,
    context,
    listeners,
  };
}

function loadInvestmentView(data) {
  const window = {
    AppUtils: {
      escapeHTML: (value) => String(value),
      money: (value) => `$${Number(value).toFixed(2)}`,
      netFlows: (flows) =>
        flows.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    },
    DateUtils: {
      shortMonthNames: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
    },
    InvestmentAPI: {
      balances: () => data.balances || [],
      contributions: () => data.contributions || [],
      accounts: () => data.accounts || [],
    },
  };
  const context = { window, Date, Map, Set, Number, String, Math, Array };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("src/utilities/investment-view.ts", "utf8"),
    context,
  );
  return window.InvestmentView;
}

test("investment trend interpolates gaps, carries balances, and accumulates lifetime flows", () => {
  const view = loadInvestmentView({
    accounts: [{ id: "first" }, { id: "second" }],
    balances: [
      { accountId: "first", month: "2026-01", balance: 100 },
      { accountId: "first", month: "2026-03", balance: 300 },
      { accountId: "second", month: "2026-02", balance: 50 },
    ],
    contributions: [
      { accountId: "first", month: "2025-12", amount: 25 },
      { accountId: "first", month: "2026-02", amount: 75 },
      { accountId: "second", month: "2026-03", amount: -10 },
    ],
  });
  const result = view.buildTrendSeries({
    balances: [
      { accountId: "first", month: "2026-01", balance: 100 },
      { accountId: "first", month: "2026-03", balance: 300 },
      { accountId: "second", month: "2026-02", balance: 50 },
    ],
    contributions: [
      { accountId: "first", month: "2025-12", amount: 25 },
      { accountId: "first", month: "2026-02", amount: 75 },
      { accountId: "second", month: "2026-03", amount: -10 },
    ],
    accounts: [{ id: "first" }, { id: "second" }],
    range: { start: "2026-01", end: "2026-04" },
  });

  assert.deepEqual(Array.from(result.months), [
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
  ]);
  assert.deepEqual(Array.from(result.balances), [100, 250, 350, 350]);
  assert.deepEqual(Array.from(result.contributions), [25, 100, 90, 90]);
});

test("all-time investment trend inserts missing calendar months", () => {
  const view = loadInvestmentView({});
  const result = view.buildTrendSeries({
    balances: [
      { accountId: "account", month: "2026-01", balance: 100 },
      { accountId: "account", month: "2026-03", balance: 300 },
    ],
    accounts: [{ id: "account" }],
  });

  assert.deepEqual(Array.from(result.months), [
    "2026-01",
    "2026-02",
    "2026-03",
  ]);
  assert.deepEqual(Array.from(result.balances), [100, 200, 300]);
});

test("bootstrap investment hydration preserves pending drafts and satisfies the shared loader without refetching", async () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const pendingAccount = {
    id: "223e4567-e89b-42d3-a456-426614174000",
    name: "Pending IRA",
    source: "manual",
    active: true,
  };
  const serverAccount = {
    id: "323e4567-e89b-42d3-a456-426614174000",
    name: "401k",
    source: "paycheck",
    active: true,
  };
  const draftBalance = {
    id: "423e4567-e89b-42d3-a456-426614174000",
    accountId: serverAccount.id,
    month: "2026-06",
    balance: 250,
    notes: "",
    createdAt: "2026-06-30T12:00:00.000Z",
    createdBy: userId,
    updatedAt: "2026-06-30T12:00:00.000Z",
    updatedBy: userId,
  };
  const runtime = loadInvestments({
    endpoint: "https://script.google.com/macros/s/id/exec",
    values: {
      "myFinance.investmentAccountOutbox.v1": JSON.stringify([
        {
          record: pendingAccount,
          status: "pending",
          attempts: 0,
          nextRetryAt: 0,
        },
      ]),
      "myFinance.investmentMonthOutbox.v1": JSON.stringify([
        {
          id: "523e4567-e89b-42d3-a456-426614174000",
          accountId: serverAccount.id,
          month: "2026-06",
          draft: {
            accountId: serverAccount.id,
            month: "2026-06",
            balance: draftBalance,
            contributions: [],
          },
          base: null,
          current: null,
          revision: 1,
          status: "pending",
          attempts: 0,
          nextRetryAt: 0,
        },
      ]),
    },
  });

  runtime.api.applyBootstrapData({
    investmentAccounts: [serverAccount],
    investmentBalances: [{ ...draftBalance, balance: 100 }],
    investmentContributions: [],
  });

  assert.deepEqual(
    Array.from(runtime.api.accounts(), (item) => item.name).sort(),
    ["401k", "Pending IRA"],
  );
  assert.equal(runtime.api.balances()[0].balance, 250);
  assert.equal(runtime.api.isLoaded(), true);
  await runtime.api.load();
  assert.equal(runtime.requests.length, 0);
  assert.equal(
    runtime.events.some((event) => event.type === "budget:investments-loaded"),
    true,
  );
});

test("investment loading is deduplicated and marks disconnected local data as loaded", async () => {
  const connected = loadInvestments({
    endpoint: "https://script.google.com/macros/s/test/exec",
    fetch: async () => ({
      ok: true,
      json: async () => ({ ok: true, data: [] }),
    }),
  });
  const first = connected.api.load();
  const second = connected.api.load();
  assert.equal(first, second);
  await first;
  assert.equal(connected.requests.length, 3);

  const runtime = loadInvestments();
  assert.equal(runtime.api.isLoaded(), false);
  const result = await runtime.api.load();
  assert.equal(runtime.api.isLoaded(), true);
  assert.deepEqual(Array.from(result.accounts), []);
  assert.equal(runtime.requests.length, 0);
  assert.equal(
    runtime.events.filter((event) => event.type === "budget:investments-loaded")
      .length,
    1,
  );
});

test("atomically queues imported investment months with multiple signed flows", () => {
  const runtime = loadInvestments();
  const account = runtime.api.addAccount({
    name: "Retirement",
    source: "paycheck",
  });
  const saved = runtime.api.queueImportedMonths([
    {
      accountId: account.id,
      month: "2026-06",
      balance: 1000,
      notes: "June",
      contributions: [{ amount: 50 }, { amount: -10 }],
    },
    {
      accountId: account.id,
      month: "2026-07",
      balance: 1100,
      notes: "July",
      contributions: [{ amount: 60 }],
    },
  ]);
  assert.equal(saved.length, 2);
  const contributions = JSON.parse(
    runtime.values.get("myFinance.investmentContributions.v1"),
  );
  assert.deepEqual(
    contributions.map((item) => item.amount),
    [50, -10, 60],
  );

  const beforeBalances = runtime.values.get("myFinance.investmentBalances.v1");
  assert.throws(
    () =>
      runtime.api.queueImportedMonths([
        {
          accountId: account.id,
          month: "2026-08",
          balance: 1200,
          contributions: [],
        },
        {
          accountId: account.id,
          month: "bad",
          balance: 1300,
          contributions: [],
        },
      ]),
    /reporting month/,
  );
  assert.equal(
    runtime.values.get("myFinance.investmentBalances.v1"),
    beforeBalances,
  );
});

test("awaiting imported investment months resolves after Sheet confirmation", async () => {
  const accountId = "00000000-0000-4000-8000-000000000777";
  const runtime = loadInvestments({
    endpoint: "https://script.google.com/macros/s/test/exec",
    values: {
      "myFinance.investmentAccounts.v1": JSON.stringify([
        { id: accountId, name: "Brokerage", source: "manual", active: true },
      ]),
    },
  });
  const [queued] = runtime.api.queueImportedMonths([
    {
      accountId,
      month: "2026-07",
      balance: 1500,
      contributions: [{ amount: 100 }],
    },
  ]);
  assert.ok(queued.syncOperationId);
  await runtime.api.awaitImportedMonths([queued.syncOperationId]);
  assert.equal(runtime.api.hasUnsynced(), false);
});

test("investment overview trend renders two series and a currency y axis", () => {
  const view = loadInvestmentView({
    accounts: [{ id: "account" }],
    balances: [{ accountId: "account", month: "2026-01", balance: 1000 }],
    contributions: [{ accountId: "account", month: "2026-01", amount: 100 }],
  });
  const svg = view.trendSVG({
    range: { start: "2026-01", end: "2026-02" },
    includeContributions: true,
  });

  assert.match(svg, /trend-balance-line/);
  assert.match(svg, /trend-contribution-line/);
  assert.match(svg, /trend-y-axis/);
  assert.match(svg, /Net contributions/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test("investment trend exposes monthly flow details and stretches one point", () => {
  const view = loadInvestmentView({
    accounts: [{ id: "account" }],
    balances: [{ accountId: "account", month: "2026-01", balance: 1000 }],
    contributions: [
      { accountId: "account", month: "2026-01", amount: 250 },
      { accountId: "account", month: "2026-01", amount: -75 },
    ],
  });
  const series = view.buildTrendSeries({
    accounts: [{ id: "account" }],
    balances: [{ accountId: "account", month: "2026-01", balance: 1000 }],
    contributions: [
      { accountId: "account", month: "2026-01", amount: 250 },
      { accountId: "account", month: "2026-01", amount: -75 },
    ],
    range: { start: "2026-01", end: "2026-01" },
  });
  const svg = view.trendSVG({
    range: { start: "2026-01-05", end: "2026-01-11" },
    includeContributions: true,
  });

  assert.deepEqual(Array.from(series.monthlyContributions), [250]);
  assert.deepEqual(Array.from(series.monthlyWithdrawals), [75]);
  assert.deepEqual(Array.from(series.monthlyNetFlows), [175]);
  assert.deepEqual(Array.from(series.contributions), [175]);
  assert.match(svg, /M76,[\d.]+ L736,[\d.]+/);
  assert.match(svg, /trend-scrub-hitbox/);
});

test("investment savings excludes manual transfers from the combined total", () => {
  const runtime = loadInvestments({
    values: {
      "myFinance.investmentAccounts.v1": JSON.stringify([
        { id: "paycheck-account", name: "401(k)", source: "paycheck" },
        { id: "manual-account", name: "Brokerage", source: "manual" },
      ]),
      "myFinance.investmentSnapshots.v1": JSON.stringify([
        { accountId: "paycheck-account", month: "2026-07", contribution: 750 },
        { accountId: "manual-account", month: "2026-07", contribution: 300 },
      ]),
    },
  });
  const totals = runtime.api.calculate(
    [
      { type: "income", amount: 5000, date: "2026-07-01" },
      { type: "expense", amount: 3500, date: "2026-07-02" },
      { type: "expense", amount: -100, date: "2026-07-03" },
    ],
    { start: "2026-07", end: "2026-07" },
  );
  assert.equal(totals.spending, 3400);
  assert.equal(totals.budgetSurplus, 1600);
  assert.equal(totals.paycheckContributions, 750);
  assert.equal(totals.totalSavings, 2350);
  assert.equal(totals.manualContributions, 300);
});

test("dashboard savings uses exact transaction dates and touched investment months", () => {
  const runtime = loadInvestments({
    values: {
      "myFinance.investmentAccounts.v1": JSON.stringify([
        { id: "paycheck-account", name: "401(k)", source: "paycheck" },
      ]),
      "myFinance.investmentBalances.v1": JSON.stringify([]),
      "myFinance.investmentContributions.v1": JSON.stringify([
        {
          id: "flow",
          accountId: "paycheck-account",
          month: "2026-02",
          amount: 50,
        },
      ]),
    },
  });
  const result = runtime.api.calculate(
    [
      { type: "income", amount: 100, date: "2026-01-31" },
      { type: "expense", amount: 25, date: "2026-02-01" },
      { type: "income", amount: 999, date: "2026-02-08" },
    ],
    {
      start: "2026-01-31",
      end: "2026-02-06",
    },
  );

  assert.equal(result.income, 100);
  assert.equal(result.spending, 25);
  assert.equal(result.paycheckContributions, 50);
  assert.equal(result.totalSavings, 125);
});

test("investment growth removes signed net flows", () => {
  const runtime = loadInvestments();
  const growth = runtime.api.calculateGrowth(10000, 11200, [
    { amount: 1000 },
    { amount: -50 },
  ]);
  assert.equal(growth, 250);
  assert.equal(runtime.api.calculateGrowth(null, 11200, []), null);
});

test("legacy local investment records migrate to manual source and net contribution", () => {
  const runtime = loadInvestments({
    values: {
      "myFinance.investmentAccounts.v1": JSON.stringify([
        {
          id: "legacy",
          name: "Brokerage",
          institution: "Old Bank",
          accountType: "brokerage",
        },
      ]),
      "myFinance.investmentSnapshots.v1": JSON.stringify([
        {
          id: "snapshot",
          accountId: "legacy",
          month: "2026-06",
          balance: 5000,
          employeeContribution: 100,
          employerContribution: 50,
          manualContribution: 200,
          withdrawals: 25,
        },
      ]),
    },
  });
  assert.equal(runtime.api.accounts()[0].source, "manual");
  assert.equal(runtime.api.snapshots()[0].contribution, 325);
  assert.equal("institution" in runtime.api.accounts()[0], false);
});

test("investment account synchronization precedes its dependent monthly update", async () => {
  const runtime = loadInvestments({
    endpoint: "https://script.google.com/macros/s/test/exec",
    online: false,
  });
  const account = runtime.api.addAccount({
    name: "Roth IRA",
    source: "manual",
  });
  runtime.api.queueSnapshots([
    {
      accountId: account.id,
      month: "2026-07",
      balance: 1000,
      contribution: 100,
    },
  ]);
  assert.equal(runtime.requests.length, 0);
  runtime.context.navigator.onLine = true;
  await runtime.api.sync();
  assert.deepEqual(
    runtime.requests.map((item) => item.action),
    ["addInvestmentAccounts", "saveInvestmentMonths"],
  );
  assert.equal(runtime.api.hasUnsynced(), false);
});

test("snapshot cache and conflicted draft migrate to balances, flows, and a monthly operation", () => {
  const id = "323e4567-e89b-42d3-a456-426614174099";
  const current = {
    id,
    accountId: "account",
    month: "2026-07",
    balanceDate: "2026-07-15",
    balance: 5000,
    contribution: 3000,
  };
  const draft = {
    ...current,
    balanceDate: "2026-07-10",
    balance: 4500,
    contribution: 1000,
  };
  const runtime = loadInvestments({
    values: {
      "myFinance.investmentAccounts.v1": JSON.stringify([
        { id: "account", name: "Roth IRA", source: "manual" },
      ]),
      "myFinance.investmentSnapshots.v1": JSON.stringify([draft]),
      "myFinance.investmentSnapshotOutbox.v1": JSON.stringify([
        {
          record: draft,
          base: null,
          current,
          status: "failed",
          failureCode: "conflict",
          error: "changed",
        },
      ]),
    },
  });
  assert.equal(runtime.api.snapshots()[0].balance, 5000);
  assert.equal("balanceDate" in runtime.api.snapshots()[0], false);
  assert.equal(runtime.api.getConflict(id).draft.balance.balance, 4500);
  assert.equal(runtime.api.getConflict(id).draft.contributions[0].amount, 1000);
  assert.equal(
    runtime.api.getConflict(id).current.contributions[0].amount,
    3000,
  );
  assert.equal(
    runtime.values.has("myFinance.investmentSnapshotOutbox.v1"),
    false,
  );
});

test("a conflict stores Sheet values canonically and schedules no failed-item loop", async () => {
  const id = "323e4567-e89b-42d3-a456-426614174099";
  const accountId = "account";
  const base = {
    id,
    accountId,
    month: "2026-07",
    balance: 4000,
    contribution: 800,
  };
  const draft = { ...base, balance: 4500, contribution: 1000 };
  const currentSnapshot = { ...base, balance: 5000, contribution: 3000 };
  const current = {
    accountId,
    month: "2026-07",
    balance: { id, accountId, month: "2026-07", balance: 5000 },
    contributions: [{ id: "flow", accountId, month: "2026-07", amount: 3000 }],
  };
  const runtime = loadInvestments({
    endpoint: "https://script.google.com/macros/s/test/exec",
    online: false,
    values: {
      "myFinance.investmentAccounts.v1": JSON.stringify([
        { id: accountId, name: "Roth IRA", source: "manual" },
      ]),
      "myFinance.investmentSnapshots.v2": JSON.stringify([draft]),
      "myFinance.investmentSnapshotOutbox.v2": JSON.stringify([
        {
          record: draft,
          base,
          revision: 1,
          status: "pending",
          attempts: 0,
          nextRetryAt: 0,
        },
      ]),
    },
    fetch: async (body) => ({
      ok: true,
      json: async () => ({
        ok: true,
        data:
          body.action === "saveInvestmentMonths"
            ? {
                saved: [],
                failed: [{ id, code: "conflict", error: "changed", current }],
              }
            : [],
      }),
    }),
  });
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
  const current = {
    id,
    accountId,
    month: "2026-07",
    balance: 5000,
    contribution: 3000,
    createdAt: "2026-07-31T00:00:00.000Z",
    createdBy: "123e4567-e89b-42d3-a456-426614174000",
  };
  const draft = { ...current, balance: 4500, contribution: 1000 };
  const seeded = {
    "myFinance.investmentAccounts.v1": JSON.stringify([
      { id: accountId, name: "Roth IRA", source: "manual" },
    ]),
    "myFinance.investmentSnapshots.v2": JSON.stringify([current]),
    "myFinance.investmentSnapshotOutbox.v2": JSON.stringify([
      {
        record: draft,
        base: null,
        current,
        revision: 1,
        status: "failed",
        failureCode: "conflict",
        error: "changed",
      },
    ]),
  };
  const discarded = loadInvestments({ values: seeded });
  discarded.api.discard("investmentMonth", id);
  assert.equal(discarded.api.snapshots()[0].balance, 5000);
  assert.equal(discarded.api.hasUnsynced(), false);

  const saved = loadInvestments({
    endpoint: "https://script.google.com/macros/s/test/exec",
    online: false,
    values: seeded,
  });
  const draftFlowId = saved.api.getConflict(id).draft.contributions[0].id;
  saved.api.resolveConflict(id, {
    balance: 4600,
    contributions: [{ id: draftFlowId, amount: 1100 }],
  });
  saved.context.navigator.onLine = true;
  await saved.api.sync();
  assert.equal(saved.requests[0].months[0].balance.base.balance, 5000);
  assert.equal(saved.requests[0].months[0].balance.record.balance, 4600);
  assert.equal(saved.api.snapshots()[0].balance, 4600);
  assert.equal(saved.api.hasUnsynced(), false);
});

test("a slower response cannot overwrite a newer monthly edit", async () => {
  let release;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const runtime = loadInvestments({
    endpoint: "https://script.google.com/macros/s/test/exec",
    online: false,
    values: {
      "myFinance.investmentAccounts.v1": JSON.stringify([
        { id: "account", name: "Roth IRA", source: "manual" },
      ]),
    },
    fetch: async () => response,
  });
  runtime.api.queueSnapshots([
    {
      accountId: "account",
      month: "2026-07",
      balance: 1000,
      contribution: 100,
    },
  ]);
  runtime.context.navigator.onLine = true;
  const firstSync = runtime.api.sync();
  runtime.api.queueSnapshots([
    {
      accountId: "account",
      month: "2026-07",
      balance: 1200,
      contribution: 150,
    },
  ]);
  const firstOperation = runtime.requests[0].months[0];
  release({
    ok: true,
    json: async () => ({
      ok: true,
      data: {
        saved: [
          {
            id: firstOperation.id,
            accountId: firstOperation.accountId,
            month: firstOperation.month,
            balance: firstOperation.balance.record,
            contributions: firstOperation.upserts.map((entry) => entry.record),
          },
        ],
        failed: [],
      },
    }),
  });
  await firstSync;
  assert.equal(runtime.api.snapshots()[0].balance, 1200);
  assert.equal(runtime.api.hasUnsynced(), true);
});

test("rebasing a conflict retains a contribution independently added in the Sheet", () => {
  const accountId = "223e4567-e89b-42d3-a456-426614174099";
  const operationId = "723e4567-e89b-42d3-a456-426614174099";
  const balance = {
    id: "323e4567-e89b-42d3-a456-426614174099",
    accountId,
    month: "2026-07",
    balance: 5000,
  };
  const original = {
    id: "423e4567-e89b-42d3-a456-426614174099",
    accountId,
    month: "2026-07",
    amount: 500,
  };
  const remote = {
    id: "523e4567-e89b-42d3-a456-426614174099",
    accountId,
    month: "2026-07",
    amount: 250,
  };
  const month = {
    accountId,
    month: "2026-07",
    balance,
    contributions: [original],
  };
  const runtime = loadInvestments({
    endpoint: "https://script.google.com/macros/s/test/exec",
    online: false,
    values: {
      "myFinance.investmentAccounts.v1": JSON.stringify([
        { id: accountId, name: "403(b)", source: "paycheck" },
      ]),
      "myFinance.investmentBalances.v1": JSON.stringify([balance]),
      "myFinance.investmentContributions.v1": JSON.stringify([
        original,
        remote,
      ]),
      "myFinance.investmentMonthOutbox.v1": JSON.stringify([
        {
          id: operationId,
          accountId,
          month: "2026-07",
          draft: { ...month, balance: { ...balance, balance: 5100 } },
          base: month,
          current: { ...month, contributions: [original, remote] },
          status: "failed",
          failureCode: "conflict",
          error: "changed",
          revision: 1,
        },
      ]),
    },
  });
  runtime.api.resolveConflict(operationId, {
    balance: 5100,
    contributions: [{ id: original.id, amount: 500 }],
  });
  assert.equal(
    runtime.api.monthData(accountId, "2026-07").contributions.length,
    2,
  );
  assert.equal(
    runtime.api
      .monthData(accountId, "2026-07")
      .contributions.some((item) => item.id === remote.id),
    true,
  );
});

test("hydrated balances resolve their cached creator name with an unknown fallback", () => {
  const runtime = loadInvestments({
    values: {
      "myFinance.investmentBalances.v1": JSON.stringify([
        {
          id: "known",
          accountId: "account",
          month: "2026-06",
          balance: 1000,
          createdBy: "123e4567-e89b-42d3-a456-426614174000",
        },
        {
          id: "unknown",
          accountId: "account",
          month: "2026-07",
          balance: 1200,
          createdBy: "removed-user",
        },
      ]),
    },
  });

  assert.equal(runtime.api.snapshots()[0].createdByName, "Test User");
  assert.equal(runtime.api.snapshots()[1].createdByName, "Unknown");
  assert.equal(
    runtime.api.monthData("account", "2026-06").balance.createdByName,
    "Test User",
  );
});

test("Sheet timestamps normalize to canonical reporting months", () => {
  const runtime = loadInvestments({
    values: {
      "myFinance.investmentBalances.v1": JSON.stringify([
        {
          id: "balance",
          accountId: "account",
          month: "2026-07-01T00:00:00.000Z",
          balance: 1000,
        },
      ]),
      "myFinance.investmentContributions.v1": JSON.stringify([
        {
          id: "flow",
          accountId: "account",
          month: "2026-07-01T00:00:00.000Z",
          amount: 100,
        },
      ]),
    },
  });

  assert.equal(runtime.api.balances()[0].month, "2026-07");
  assert.equal(runtime.api.contributions()[0].month, "2026-07");
  assert.equal(
    runtime.api.monthData("account", "2026-07").balance.id,
    "balance",
  );
});

test("investment routes and drawers replace the legacy global screens", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const source = [
    "src/screens/dashboard-screen/dashboard-screen.ts",
    "src/api/investment-api.ts",
    "src/utilities/investment-view.ts",
    "src/screens/investment-overview-screen/investment-overview-screen.ts",
    "src/screens/investment-accounts-screen/investment-accounts-screen.ts",
    "src/screens/investment-account-detail-screen/investment-account-detail-screen.ts",
    "src/screens/investment-account-drawer-screen/investment-account-drawer-screen.ts",
    "src/screens/investment-month-drawer-screen/investment-month-drawer-screen.ts",
  ]
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  assert.match(html, /<template id="route-dashboard">\s*<dashboard-screen>/);
  assert.doesNotMatch(html, /js\/investments\.js/);
  assert.doesNotMatch(html, /js\/routes\/dashboard\.js/);
  assert.match(html, /id="route-investment-overview"/);
  assert.match(html, /id="route-investment-accounts"/);
  assert.match(html, /id="route-investment-account-detail"/);
  assert.doesNotMatch(html, /data-screen="investment-balances"/);
  assert.doesNotMatch(html, /data-screen="investment-update"/);
  assert.doesNotMatch(html, /Balance as of|Balance date/);
  assert.match(html, /id="investment-month-drawer"/);
  assert.match(html, /<select name="accountId" required>/);
  assert.match(
    html,
    /<month-picker\s+label="Reporting month"\s+alignment="right"/,
  );
  assert.match(html, /id="investment-contribution-list"/);
  assert.match(html, /id="investment-withdrawal-list"/);
  assert.match(html, /Add another contribution/);
  assert.match(html, /Add another withdrawal/);
  assert.match(html, /id="investment-batch-toggle"/);
  assert.match(html, /id="investment-balance-created"/);
  assert.doesNotMatch(html, /id="investment-import-overlay"/);
  assert.match(source, /totalSavings: budgetSurplus \+ paycheckContributions/);
  assert.doesNotMatch(
    html,
    /Employee payroll|Employer match|Institution|Account Type/,
  );
  assert.doesNotMatch(source, /parseDelimited/);
  assert.match(source, /investment-account-detail/);
  assert.match(source, /investmentReviewId/);
  assert.match(source, /createdByName/);
  assert.match(source, /formatMonth\(series\.months\[0\]\)/);
  assert.match(source, /mountTrend\(this\.#trend, \{ range, includeContributions: true/);
  assert.match(source, /monthRangeFromDates/);
  assert.match(source, /trend-scrub-tooltip/);
  assert.match(source, /registerLegacyRouteAdapter\("DashboardRoute"/);
  assert.match(source, /budget:transaction-queued/);
  assert.match(
    source,
    /removeEventListener\("budget:investments-changed", this\)/,
  );
  assert.doesNotMatch(source, /window\.InvestmentUI/);
  assert.match(source, /formatMonth\(balance\.month\)/);
  assert.match(source, /amount:\s*sign \* amount/);
  assert.match(source, /suppressSingleDefault = true/);
  assert.match(
    source,
    /monthPicker\.contains\(event\.target\)[\s\S]*?aria-expanded[\s\S]*?trigger\.click\(\)/,
  );
});

test("primary navigation groups budgeting and investment destinations", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const source = fs.readFileSync("src/main.ts", "utf8");
  const styles =
    fs.readFileSync("styles.css", "utf8") +
    fs.readFileSync("css/navigation-bar.css", "utf8");
  assert.match(html, /data-nav-section="budgeting"/);
  assert.match(html, /data-tab="transactions"/);
  assert.match(html, /data-new-transaction/);
  assert.match(html, /data-nav-section="investments"/);
  assert.match(html, /data-tab="investment-overview"/);
  assert.match(html, /data-tab="investment-accounts"/);
  assert.match(html, /data-balance/);
  assert.doesNotMatch(html, /data-tab="investment-balances"/);
  assert.doesNotMatch(html, /data-tab="investment-update"/);
  assert.doesNotMatch(html, /data-tab="investments"/);
  assert.match(source, /name\.startsWith\("investment-"\)/);
  assert.match(
    source,
    /name === "investment-account-detail" \? "investment-accounts"/,
  );
  assert.match(source, /delete contentParams\.investmentAccountId/);
  assert.match(source, /delete contentParams\.investmentMonth/);
  assert.match(source, /delete contentParams\.investmentReviewId/);
  assert.match(source, /data-nav-section-toggle/);
  assert.match(styles, /\.nav-section\.collapsed \.nav-submenu/);
  assert.match(styles, /\.nav-footer \{/);
});
