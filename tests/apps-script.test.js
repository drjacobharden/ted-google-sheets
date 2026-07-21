const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Range {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    this.sheet = sheet; this.row = row; this.column = column; this.rows = rows; this.columns = columns;
  }
  getValues() {
    this.sheet.reads.push({ row: this.row, column: this.column, rows: this.rows, columns: this.columns });
    return Array.from({ length: this.rows }, (_, y) => Array.from({ length: this.columns }, (_, x) => this.sheet.value(this.row + y, this.column + x)));
  }
  setValues(values) {
    this.sheet.writes.push({ row: this.row, column: this.column, rows: this.rows, columns: this.columns });
    values.forEach((row, y) => row.forEach((value, x) => this.sheet.setValue(this.row + y, this.column + x, value)));
    return this;
  }
  clearContent() {
    for (let y = 0; y < this.rows; y += 1) for (let x = 0; x < this.columns; x += 1) this.sheet.setValue(this.row + y, this.column + x, "");
    return this;
  }
  setNumberFormat() { this.sheet.formatCalls += 1; return this; }
  createFilter() { this.sheet.filter = {}; return this.sheet.filter; }
}

class Sheet {
  constructor(name, book) { this.name = name; this.book = book; this.data = []; this.writes = []; this.reads = []; this.filter = null; this.formatCalls = 0; this.freezeCalls = 0; this.hideCalls = 0; }
  value(row, column) { return this.data[row - 1]?.[column - 1] ?? ""; }
  setValue(row, column, value) { this.data[row - 1] ||= []; this.data[row - 1][column - 1] = value; }
  getRange(row, column, rows, columns) {
    if (typeof row === "string") return new Range(this, 1, 1, 1, 1);
    return new Range(this, row, column, rows, columns);
  }
  getLastRow() {
    for (let index = this.data.length - 1; index >= 0; index -= 1) if (this.data[index]?.some((value) => value !== "")) return index + 1;
    return 0;
  }
  getMaxRows() { return Math.max(1000, this.data.length); }
  getFilter() { return this.filter; }
  getParent() { return this.book; }
  setFrozenRows() { this.freezeCalls += 1; }
  hideColumns() { this.hideCalls += 1; }
  setName(name) { this.book.sheets.delete(this.name); this.name = name; this.book.sheets.set(name, this); return this; }
  hideSheet() { this.hidden = true; return this; }
}

class Spreadsheet {
  constructor(id = "spreadsheet-id", name = "Household Budget") { this.id = id; this.name = name; this.sheets = new Map(); }
  getId() { return this.id; }
  getName() { return this.name; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new Sheet(name, this); this.sheets.set(name, sheet); return sheet; }
}

function loadScript(options = {}) {
  const spreadsheet = options.spreadsheet || new Spreadsheet();
  const activeSpreadsheet = Object.prototype.hasOwnProperty.call(options, "activeSpreadsheet")
    ? options.activeSpreadsheet
    : spreadsheet;
  const spreadsheets = new Map((options.spreadsheets || [spreadsheet]).map((book) => [book.getId(), book]));
  const properties = new Map(Object.entries(options.properties || {}));
  const menu = { name: "", entries: [], added: false };
  const ui = {
    ButtonSet: { OK: "OK" },
    alerts: [], sidebars: [],
    createMenu(name) {
      menu.name = name;
      return {
        addItem(label, handler) { menu.entries.push({ label, handler }); return this; },
        addSeparator() { menu.entries.push({ separator: true }); return this; },
        addToUi() { menu.added = true; return this; },
      };
    },
    showSidebar(sidebar) { this.sidebars.push(sidebar); },
    alert(...args) { this.alerts.push(args); },
  };
  let deploymentUrl = options.deploymentUrl || "";
  let flushCalls = 0;
  let uuidCounter = 1000;
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || "",
      setProperty: (key, value) => properties.set(key, String(value)),
      deleteProperty: (key) => properties.delete(key),
    }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => activeSpreadsheet,
      openById: (id) => {
        const book = spreadsheets.get(id);
        if (!book) throw new Error(`Unknown spreadsheet ${id}`);
        return book;
      },
      getUi: () => ui,
      flush() { flushCalls += 1; },
    },
    ScriptApp: { getService: () => ({ getUrl: () => deploymentUrl }) },
    HtmlService: {
      createHtmlOutputFromFile: (file) => ({ file, title: "", setTitle(title) { this.title = title; return this; } }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => `10000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
      formatDate: (date) => date.toISOString(),
    },
    Session: { getScriptTimeZone: () => "UTC" },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (value) => ({ value, setMimeType() { return this; } }) },
    console,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("apps-script/Code.gs", "utf8"), context);
  vm.runInContext(fs.readFileSync("apps-script/Setup.gs", "utf8"), context);
  const call = (request) => JSON.parse(context.handleRequest_(request).value);
  return {
    context, call, spreadsheet, properties, menu, ui,
    setDeploymentUrl(value) { deploymentUrl = value; },
    getFlushCalls() { return flushCalls; },
  };
}

test("creates a My Finance menu that initializes directly", () => {
  const { context, menu, ui } = loadScript();
  context.onOpen();
  assert.equal(menu.name, "My Finance");
  assert.equal(menu.added, true);
  assert.deepEqual(menu.entries, [
    { label: "Set up budget", handler: "setupBudget" },
    { separator: true },
    { label: "Rebuild Ledger", handler: "rebuildLedgerFromMenu" },
  ]);
  const status = context.setupBudget();
  assert.equal(status.initialized, true);
  assert.equal(ui.alerts[0][0], "Budget initialized");
});

test("initializes the active copy, reports deployment status, and remains idempotent", () => {
  const template = new Spreadsheet("template-id", "Budget Template");
  const copy = new Spreadsheet("copy-id", "Alex's Budget");
  const runtime = loadScript({
    spreadsheet: copy,
    spreadsheets: [template, copy],
    properties: {
      SPREADSHEET_ID: "template-id",
      SETUP_VERSION: "1",
      WEB_APP_URL: "https://script.google.com/macros/s/template-deployment/exec",
    },
  });

  assert.equal(runtime.context.getSetupStatus().initialized, false);
  const initialized = runtime.context.setupBudget();
  assert.equal(initialized.initialized, true);
  assert.equal(initialized.spreadsheetId, "copy-id");
  assert.equal(runtime.properties.get("SPREADSHEET_ID"), "copy-id");
  assert.equal(runtime.properties.get("SETUP_VERSION"), "6");
  assert.equal(runtime.properties.has("WEB_APP_URL"), false);
  assert.equal(template.sheets.size, 0);
  assert.equal(copy.getSheetByName("Categories").getLastRow(), 11);
  assert.equal(copy.getSheetByName("Assignments").getLastRow(), 2);

  const userId = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(runtime.call({ action: "addUser", user: { id: userId, firstName: "Alex", lastName: "Smith" } }).ok, true);
  assert.equal(runtime.call({ action: "addTransaction", transaction: {
    id: "223e4567-e89b-42d3-a456-426614174000", createdBy: userId,
    type: "income", amount: 50, date: "2026-07-13",
    categoryId: "00000000-0000-4000-8000-000000000001",
    vendorId: "", assignmentId: "00000000-0000-4000-8000-000000000101", notes: "Gift",
  } }).ok, true);
  runtime.context.setupBudget();
  assert.equal(copy.getSheetByName("Categories").getLastRow(), 11);
  assert.equal(copy.getSheetByName("Assignments").getLastRow(), 2);
  assert.equal(copy.getSheetByName("Transactions").getLastRow(), 2);
  assert.equal(copy.getSheetByName("Ledger").data.slice(1).filter((row) => row[8]).length, 1);

  const setupStatus = runtime.context.getSetupStatus();
  assert.equal("deployed" in setupStatus, false);
  assert.equal("deploymentUrl" in setupStatus, false);
  assert.equal(runtime.call({ action: "health" }).data.status, "ok");

  copy.getSheetByName("Ledger").getRange(2, 1, 1, 14).clearContent();
  const rebuilt = runtime.context.rebuildLedgerFromMenu();
  assert.equal(rebuilt.rows, 1);
  assert.equal(copy.getSheetByName("Ledger").data[1][8], "223e4567-e89b-42d3-a456-426614174000");
  assert.equal(copy.getSheetByName("Transactions").getLastRow(), 2);
  assert.equal(runtime.ui.alerts.filter((alert) => alert[0] === "Budget initialized").length, 2);
  assert.equal(runtime.ui.alerts.filter((alert) => alert[0] === "Ledger rebuilt").length, 1);
});

test("setupBudget reports failures with a native alert", () => {
  const runtime = loadScript({ activeSpreadsheet: null });
  assert.throws(() => runtime.context.setupBudget(), /Open the copied budget Sheet/);
  assert.equal(runtime.ui.alerts.length, 1);
  assert.equal(runtime.ui.alerts[0][0], "Setup failed");
  assert.match(runtime.ui.alerts[0][1], /Open the copied budget Sheet/);
});

test("setup and setupBudget create equivalent initialized state", () => {
  const menuRuntime = loadScript();
  const editorRuntime = loadScript();
  const menuStatus = menuRuntime.context.setupBudget();
  const editorStatus = editorRuntime.context.setup();

  assert.equal(menuStatus.initialized, true);
  assert.equal(editorStatus.initialized, true);
  assert.deepEqual(
    [...menuRuntime.spreadsheet.sheets].map(([name, sheet]) => [name, sheet.getLastRow()]),
    [...editorRuntime.spreadsheet.sheets].map(([name, sheet]) => [name, sheet.getLastRow()]),
  );
});

test("removes sidebar and deployment URL registration dependencies", () => {
  const code = fs.readFileSync("apps-script/Code.gs", "utf8");
  const setup = fs.readFileSync("apps-script/Setup.gs", "utf8");
  const settings = fs.readFileSync("index.html", "utf8");
  assert.equal(fs.existsSync("apps-script/SetupSidebar.html"), false);
  assert.doesNotMatch(code + setup, /HtmlService|showSetupSidebar|saveWebAppUrl|webAppUrlProperty/);
  assert.match(setup, /deleteProperty\('WEB_APP_URL'\)/);
  assert.doesNotMatch(settings, /My Finance → Connection details/);
});

test("validates normalized references, rebuilds Ledger, and batch-renames 1,000 rows", () => {
  const { context, call, spreadsheet } = loadScript();
  context.setup();
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const vendorId = "223e4567-e89b-42d3-a456-426614174000";
  assert.equal(call({ action: "addUser", user: { id: userId, firstName: "Ada", lastName: "Byron" } }).ok, true);
  assert.equal(call({ action: "addVendor", vendor: { id: vendorId, name: "Cafe" } }).ok, true);
  const categories = call({ action: "listCategories" }).data;
  const dining = categories.find((category) => category.name === "Dining");
  const income = categories.find((category) => category.name === "Income");
  const assignments = call({ action: "listAssignments" }).data;
  const shared = assignments.find((assignment) => assignment.name === "Shared");
  const base = {
    createdBy: userId, type: "expense", amount: 12.5, date: "2026-07-13",
    categoryId: dining.id, vendorId, assignmentId: shared.id, notes: "Lunch",
  };
  const first = call({ action: "addTransaction", transaction: { ...base, id: "323e4567-e89b-42d3-a456-426614174000" } });
  assert.equal(first.ok, true);
  assert.equal(first.data.vendor, "Cafe");
  const incrementalLedger = spreadsheet.getSheetByName("Ledger").data.slice(1).map((row) => row.slice());
  context.rebuildLedger();
  assert.deepEqual(spreadsheet.getSheetByName("Ledger").data.slice(1, 2), incrementalLedger);

  const transactions = spreadsheet.getSheetByName("Transactions");
  const rows = Array.from({ length: 999 }, (_, index) => [
    `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    "2026-07-13T12:00:00.000Z", userId, "expense", 10, "2026-07-13",
    dining.id, vendorId, shared.id, "Test",
  ]);
  transactions.getRange(transactions.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  context.rebuildLedger();
  const ledger = spreadsheet.getSheetByName("Ledger");
  ledger.writes = [];
  const renamed = call({ action: "updateVendor", vendor: { id: vendorId, name: "Coffee House" } });
  assert.equal(renamed.ok, true);
  assert.equal(ledger.data.slice(1, 1001).every((row) => row[3] === "Coffee House"), true);
  assert.equal(ledger.writes.filter((write) => write.column === 4 && write.rows === 1000).length, 1);
  assert.ok(ledger.getFilter());
  assert.equal(ledger.data.slice(1).filter((row) => row[8]).length, 1000);

  const refund = call({ action: "addTransaction", transaction: {
    ...base, id: "823e4567-e89b-42d3-a456-426614174000", amount: -7.25,
  } });
  assert.equal(refund.ok, true);
  assert.equal(refund.data.type, "expense");
  assert.equal(refund.data.amount, -7.25);

  assert.equal(call({ action: "archiveVendor", id: vendorId }).ok, true);
  const archivedVendorTransaction = call({ action: "addTransaction", transaction: {
    ...base, id: "723e4567-e89b-42d3-a456-426614174000",
  } });
  assert.equal(archivedVendorTransaction.ok, false);
  assert.match(archivedVendorTransaction.error, /active vendor/);
  const archiveDefaultCategory = call({ action: "archiveCategory", id: income.id });
  assert.equal(archiveDefaultCategory.ok, false);
  assert.match(archiveDefaultCategory.error, /Default records/);

  const invalidIncome = call({ action: "addTransaction", transaction: {
    ...base, id: "523e4567-e89b-42d3-a456-426614174000", type: "income", categoryId: dining.id, vendorId: "",
  } });
  assert.equal(invalidIncome.ok, false);
  assert.match(invalidIncome.error, /matching the transaction type/);
  const validIncome = call({ action: "addTransaction", transaction: {
    ...base, id: "623e4567-e89b-42d3-a456-426614174000", type: "income", categoryId: income.id, vendorId: "",
  } });
  assert.equal(validIncome.ok, true);

});

test("batch-adds transactions with idempotency, partial failure, and two grouped writes", () => {
  const runtime = loadScript();
  runtime.context.setup();
  const { call, spreadsheet } = runtime;
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const vendorId = "223e4567-e89b-42d3-a456-426614174000";
  call({ action: "addUser", user: { id: userId, firstName: "Ada", lastName: "Byron" } });
  call({ action: "addVendor", vendor: { id: vendorId, name: "Cafe" } });
  const dining = call({ action: "listCategories" }).data.find((item) => item.name === "Dining");
  const shared = call({ action: "listAssignments" }).data.find((item) => item.name === "Shared");
  const transactions = spreadsheet.getSheetByName("Transactions");
  const ledger = spreadsheet.getSheetByName("Ledger");
  [...spreadsheet.sheets.values()].forEach((sheet) => {
    sheet.writes = []; sheet.reads = []; sheet.formatCalls = 0; sheet.freezeCalls = 0; sheet.hideCalls = 0;
  });
  const records = Array.from({ length: 49 }, (_, index) => ({
    id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    createdAt: "2026-07-13T12:00:00.000Z", createdBy: userId, type: "expense", amount: index + 1,
    date: "2026-07-13", categoryId: dining.id, vendorId, assignmentId: shared.id, notes: `Row ${index}`,
  }));
  records.push({ ...records[0], id: "not-a-uuid" });
  const result = call({ action: "addTransactions", transactions: records });
  assert.equal(result.ok, true);
  assert.equal(result.data.saved.length, 49);
  assert.equal(result.data.failed.length, 1);
  assert.equal(transactions.writes.filter((write) => write.rows === 49).length, 1);
  assert.equal(ledger.writes.filter((write) => write.rows === 49).length, 1);
  assert.ok(transactions.reads.length <= 1);
  assert.equal(spreadsheet.getSheetByName("Categories").reads.length, 1);
  assert.equal(spreadsheet.getSheetByName("Vendors").reads.length, 1);
  assert.equal(spreadsheet.getSheetByName("Assignments").reads.length, 1);
  assert.equal(spreadsheet.getSheetByName("Users").reads.length, 1);
  assert.equal(ledger.reads.length, 0);
  assert.equal([...spreadsheet.sheets.values()].reduce((sum, sheet) => sum + sheet.formatCalls + sheet.freezeCalls + sheet.hideCalls, 0), 0);
  assert.equal(runtime.getFlushCalls(), 1, "only setup/rebuild should have flushed");

  transactions.writes = []; ledger.writes = [];
  const retry = call({ action: "addTransactions", transactions: records.slice(0, 2) });
  assert.equal(retry.data.saved.length, 2);
  assert.equal(retry.data.failed.length, 0);
  assert.equal(transactions.writes.length, 0);
  assert.equal(ledger.writes.length, 0);

  const conflict = call({ action: "addTransaction", transaction: { ...records[0], amount: 999 } });
  assert.equal(conflict.ok, false);
  assert.match(conflict.error, /different data/);
  const oversized = call({ action: "addTransactions", transactions: Array.from({ length: 51 }, () => records[0]) });
  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /maximum of 50/);
  assert.equal(call({ action: "health" }).data.features.includes("batchTransactions"), true);
});

test("keeps normalized transactions authoritative when a Ledger append fails", () => {
  const runtime = loadScript();
  runtime.context.setup();
  const { call, spreadsheet } = runtime;
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  call({ action: "addUser", user: { id: userId, firstName: "Ada", lastName: "Byron" } });
  const income = call({ action: "listCategories" }).data.find((item) => item.name === "Income");
  const shared = call({ action: "listAssignments" }).data.find((item) => item.name === "Shared");
  const ledger = spreadsheet.getSheetByName("Ledger");
  const originalGetRange = ledger.getRange.bind(ledger);
  ledger.getRange = function (row, column, rows, columns) {
    if (typeof row === "number" && row > 1) throw new Error("Ledger write unavailable");
    return originalGetRange(row, column, rows, columns);
  };
  const result = call({ action: "addTransaction", transaction: {
    id: "423e4567-e89b-42d3-a456-426614174000", createdAt: "2026-07-13T12:00:00.000Z", createdBy: userId,
    type: "income", amount: 100, date: "2026-07-13", categoryId: income.id, vendorId: "",
    assignmentId: shared.id, notes: "Deposit",
  } });
  ledger.getRange = originalGetRange;
  assert.equal(result.ok, true);
  assert.match(result.warning, /Ledger needs to be rebuilt/);
  assert.equal(spreadsheet.getSheetByName("Transactions").getLastRow(), 2);
  assert.equal(call({ action: "health" }).data.ledgerNeedsRebuild, true);
});

test("batch-adds mixed entities with grouped writes, retries, and name reconciliation", () => {
  const runtime = loadScript();
  runtime.context.setup();
  const { call, spreadsheet } = runtime;
  [...spreadsheet.sheets.values()].forEach((sheet) => {
    sheet.writes = []; sheet.reads = []; sheet.formatCalls = 0; sheet.freezeCalls = 0; sheet.hideCalls = 0;
  });
  const timestamp = "2026-07-13T12:00:00.000Z";
  const entities = [
    { kind: "category", record: { id: "123e4567-e89b-42d3-a456-426614174010", name: "Pets", type: "expense", isDefault: false, active: true, createdAt: timestamp, updatedAt: timestamp } },
    { kind: "vendor", record: { id: "223e4567-e89b-42d3-a456-426614174010", name: "Pet Store", active: true, createdAt: timestamp, updatedAt: timestamp } },
    { kind: "assignment", record: { id: "323e4567-e89b-42d3-a456-426614174010", name: "Alex", isDefault: false, active: true, createdAt: timestamp, updatedAt: timestamp } },
    { kind: "vendor", record: { id: "not-a-uuid", name: "Broken", active: true, createdAt: timestamp, updatedAt: timestamp } },
  ];
  const result = call({ action: "addEntities", entities });
  assert.equal(result.ok, true);
  assert.equal(result.data.saved.length, 3);
  assert.equal(result.data.failed.length, 1);
  assert.equal(result.data.reconciled.length, 0);
  ["Categories", "Vendors", "Assignments"].forEach((name) => {
    const sheet = spreadsheet.getSheetByName(name);
    assert.ok(sheet.reads.length <= 1);
    assert.equal(sheet.writes.filter((write) => write.rows === 1).length, 1);
  });
  assert.equal([...spreadsheet.sheets.values()].reduce((sum, sheet) => sum + sheet.formatCalls + sheet.freezeCalls + sheet.hideCalls, 0), 0);

  ["Categories", "Vendors", "Assignments"].forEach((name) => { spreadsheet.getSheetByName(name).writes = []; });
  const retry = call({ action: "addEntities", entities: entities.slice(0, 3) });
  assert.equal(retry.data.saved.length, 3);
  assert.equal(retry.data.failed.length, 0);
  assert.equal(["Categories", "Vendors", "Assignments"].reduce((sum, name) => sum + spreadsheet.getSheetByName(name).writes.length, 0), 0);

  const reconciled = call({ action: "addEntities", entities: [{
    kind: "vendor", record: { ...entities[1].record, id: "423e4567-e89b-42d3-a456-426614174010", name: "pet store" },
  }] });
  assert.equal(reconciled.data.saved.length, 0);
  assert.equal(reconciled.data.reconciled.length, 1);
  assert.equal(reconciled.data.reconciled[0].record.id, entities[1].record.id);
  assert.equal(call({ action: "health" }).data.apiVersion, 8);
  assert.equal(call({ action: "health" }).data.features.includes("batchEntities"), true);
});

test("batch-updates transactions with immutable metadata, conflict detection, and Ledger synchronization", () => {
  const runtime = loadScript();
  runtime.context.setup();
  const { call, spreadsheet } = runtime;
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const vendorId = "223e4567-e89b-42d3-a456-426614174000";
  call({ action: "addUser", user: { id: userId, firstName: "Ada", lastName: "Byron" } });
  call({ action: "addVendor", vendor: { id: vendorId, name: "Cafe" } });
  const dining = call({ action: "listCategories" }).data.find((item) => item.name === "Dining");
  const income = call({ action: "listCategories" }).data.find((item) => item.name === "Income");
  const shared = call({ action: "listAssignments" }).data.find((item) => item.name === "Shared");
  const original = {
    id: "923e4567-e89b-42d3-a456-426614174000", createdAt: "2026-07-13T12:00:00.000Z", createdBy: userId,
    type: "expense", amount: 12, date: "2026-07-13", categoryId: dining.id, vendorId,
    assignmentId: shared.id, notes: "Lunch",
  };
  call({ action: "addTransaction", transaction: original });
  const transactions = spreadsheet.getSheetByName("Transactions");
  const ledger = spreadsheet.getSheetByName("Ledger");
  transactions.writes = []; ledger.writes = []; transactions.reads = []; ledger.reads = [];

  const draft = { ...original, createdAt: "2099-01-01T00:00:00.000Z", createdBy: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", amount: 18, notes: "Dinner" };
  const result = call({ action: "updateTransactions", updates: [{ transaction: draft, base: original }] });
  assert.equal(result.ok, true);
  assert.equal(result.data.saved.length, 1);
  assert.equal(result.data.saved[0].amount, 18);
  assert.equal(result.data.saved[0].createdAt, original.createdAt);
  assert.equal(result.data.saved[0].createdBy, original.createdBy);
  assert.equal(transactions.writes.length, 1);
  assert.equal(ledger.writes.length, 1);
  assert.equal(ledger.data[1][7], 18);
  assert.equal(ledger.data[1][6], "Dinner");

  const retry = call({ action: "updateTransactions", updates: [{ transaction: draft, base: original }] });
  assert.equal(retry.data.saved.length, 1, "an exact retry is idempotent");
  assert.equal(retry.data.failed.length, 0);

  const conflict = call({ action: "updateTransactions", updates: [{ transaction: { ...draft, amount: 25 }, base: original }] });
  assert.equal(conflict.data.saved.length, 0);
  assert.equal(conflict.data.failed[0].code, "conflict");
  assert.equal(conflict.data.failed[0].current.amount, 18);

  call({ action: "archiveVendor", id: vendorId });
  const unchangedArchivedReference = call({ action: "updateTransactions", updates: [{ transaction: { ...result.data.saved[0], amount: 19 }, base: result.data.saved[0] }] });
  assert.equal(unchangedArchivedReference.data.saved.length, 1);
  const updatedRefund = call({ action: "updateTransactions", updates: [{
    transaction: { ...unchangedArchivedReference.data.saved[0], amount: -19 },
    base: unchangedArchivedReference.data.saved[0],
  }] });
  assert.equal(updatedRefund.data.saved[0].amount, -19);
  const changedToIncome = call({ action: "updateTransactions", updates: [{
    transaction: { ...updatedRefund.data.saved[0], type: "income", categoryId: income.id, vendorId: "", amount: 20 },
    base: updatedRefund.data.saved[0],
  }] });
  assert.equal(changedToIncome.data.saved.length, 1);
  assert.equal(changedToIncome.data.saved[0].type, "income");
  assert.equal(changedToIncome.data.saved[0].vendorId, "");
  assert.equal(call({ action: "health" }).data.features.includes("batchTransactionUpdates"), true);
});

test("keeps normalized updates authoritative when Ledger synchronization fails", () => {
  const runtime = loadScript();
  runtime.context.setup();
  const { call, spreadsheet } = runtime;
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  call({ action: "addUser", user: { id: userId, firstName: "Ada", lastName: "Byron" } });
  const income = call({ action: "listCategories" }).data.find((item) => item.name === "Income");
  const shared = call({ action: "listAssignments" }).data.find((item) => item.name === "Shared");
  const original = {
    id: "a23e4567-e89b-42d3-a456-426614174000", createdAt: "2026-07-13T12:00:00.000Z", createdBy: userId,
    type: "income", amount: 100, date: "2026-07-13", categoryId: income.id, vendorId: "",
    assignmentId: shared.id, notes: "Deposit",
  };
  call({ action: "addTransaction", transaction: original });
  const ledger = spreadsheet.getSheetByName("Ledger");
  const originalGetRange = ledger.getRange.bind(ledger);
  ledger.getRange = function (row, column, rows, columns) {
    if (typeof row === "number" && row > 1) throw new Error("Ledger update unavailable");
    return originalGetRange(row, column, rows, columns);
  };
  const result = call({ action: "updateTransactions", updates: [{ transaction: { ...original, amount: 125 }, base: original }] });
  ledger.getRange = originalGetRange;
  assert.equal(result.ok, true);
  assert.equal(result.data.saved[0].amount, 125);
  assert.match(result.warning, /Ledger needs to be rebuilt/);
  assert.equal(spreadsheet.getSheetByName("Transactions").data[1][4], 125);
  assert.equal(call({ action: "health" }).data.ledgerNeedsRebuild, true);
});

test("batch-saves one monthly balance with itemized contributions and withdrawals", () => {
  const { context, call, spreadsheet } = loadScript();
  context.setup();
  assert.ok(spreadsheet.getSheetByName("InvestmentAccounts"));
  assert.ok(spreadsheet.getSheetByName("InvestmentBalances"));
  assert.ok(spreadsheet.getSheetByName("InvestmentContributions"));
  const userId = "123e4567-e89b-42d3-a456-426614174099";
  assert.equal(call({ action: "addUser", user: { id: userId, firstName: "Ira", lastName: "Investor" } }).ok, true);
  const accountId = "223e4567-e89b-42d3-a456-426614174099";
  const accountResult = call({ action: "addInvestmentAccounts", accounts: [{
    id: accountId, name: "Roth IRA", source: "manual", active: true,
    createdAt: "2026-07-01T12:00:00.000Z", updatedAt: "2026-07-01T12:00:00.000Z",
  }] });
  assert.equal(accountResult.data.saved.length, 1);
  const accountReconciliation = call({ action: "addInvestmentAccounts", accounts: [{
    id: "623e4567-e89b-42d3-a456-426614174099", name: "roth ira", source: "paycheck",
    createdAt: "2026-07-01T12:00:00.000Z", updatedAt: "2026-07-01T12:00:00.000Z",
  }] });
  assert.equal(accountReconciliation.data.reconciled[0].record.id, accountId);
  const balance = {
    id: "323e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", balance: 12000,
    notes: "July", createdBy: userId, updatedBy: userId,
    createdAt: "2026-07-31T12:00:00.000Z", updatedAt: "2026-07-31T12:00:00.000Z",
  };
  const flows = [
    { id: "423e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", amount: 500, createdBy: userId, updatedBy: userId },
    { id: "523e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", amount: 350, createdBy: userId, updatedBy: userId },
    { id: "623e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", amount: -100, createdBy: userId, updatedBy: userId },
  ];
  const operationId = "723e4567-e89b-42d3-a456-426614174099";
  const saved = call({ action: "saveInvestmentMonths", months: [{ id: operationId, accountId, month: "2026-07", balance: { record: balance, base: null }, upserts: flows.map((record) => ({ record, base: null })), deletes: [] }] });
  assert.equal(saved.data.saved.length, 1);
  assert.equal(saved.data.failed.length, 0);
  assert.equal(call({ action: "listInvestmentBalances" }).data[0].balance, 12000);
  assert.deepEqual(call({ action: "listInvestmentContributions" }).data.map((item) => item.amount), [500, 350, -100]);
  assert.equal(call({ action: "listInvestmentSnapshots" }).data[0].contribution, 750);
  assert.equal(call({ action: "health" }).data.features.includes("batchInvestmentMonths"), true);

  const confirmed = saved.data.saved[0];
  const updatedBalance = { ...confirmed.balance, balance: 13000 };
  const updatedFlow = { ...confirmed.contributions[0], amount: 600 };
  const updated = call({ action: "saveInvestmentMonths", months: [{ id: operationId, accountId, month: "2026-07", balance: { record: updatedBalance, base: confirmed.balance }, upserts: [{ record: updatedFlow, base: confirmed.contributions[0] }], deletes: [{ id: confirmed.contributions[1].id, base: confirmed.contributions[1] }] }] });
  assert.equal(updated.data.saved[0].balance.balance, 13000);
  assert.deepEqual(updated.data.saved[0].contributions.map((item) => item.amount), [600, -100]);
  const retryDelete = call({ action: "saveInvestmentMonths", months: [{ id: "823e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", balance: { record: updated.data.saved[0].balance, base: updated.data.saved[0].balance }, upserts: [], deletes: [{ id: confirmed.contributions[1].id, base: confirmed.contributions[1] }] }] });
  assert.equal(retryDelete.data.failed.length, 0, "a repeated hard delete is idempotent");
  const conflict = call({ action: "saveInvestmentMonths", months: [{ id: "923e4567-e89b-42d3-a456-426614174099", accountId, month: "2026-07", balance: { record: { ...balance, balance: 14000 }, base: balance }, upserts: [], deletes: [] }] });
  assert.equal(conflict.data.failed[0].code, "conflict");
  assert.equal(conflict.data.failed[0].current.balance.balance, 13000);
  assert.equal(call({ action: "saveInvestmentSnapshots", snapshots: [] }).ok, false);
});

test("setup migrates legacy investment columns without overstating savings", () => {
  const spreadsheet = new Spreadsheet();
  const accounts = spreadsheet.insertSheet("InvestmentAccounts");
  accounts.data = [
    ["ID", "Name", "Institution", "Account Type", "Assignment ID", "Active", "Created At", "Updated At"],
    ["223e4567-e89b-42d3-a456-426614174099", "Roth IRA", "Vanguard", "ira", "00000000-0000-4000-8000-000000000101", true, "2026-06-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"],
  ];
  const snapshots = spreadsheet.insertSheet("InvestmentSnapshots");
  snapshots.data = [
    ["ID", "Account ID", "Month", "Balance Date", "Balance", "Employee Payroll", "Employer Match", "Manual Deposits", "Withdrawals", "Notes", "Created At", "Created By", "Updated At", "Updated By"],
    ["323e4567-e89b-42d3-a456-426614174099", "223e4567-e89b-42d3-a456-426614174099", "2026-06", "2026-06-30", 12000, 500, 250, 100, 50, "Legacy", "2026-06-30T00:00:00.000Z", "123e4567-e89b-42d3-a456-426614174099", "2026-06-30T00:00:00.000Z", "123e4567-e89b-42d3-a456-426614174099"],
  ];
  const runtime = loadScript({ spreadsheet });
  runtime.context.setup();
  assert.equal(runtime.call({ action: "listInvestmentAccounts" }).data[0].source, "manual");
  assert.equal(runtime.call({ action: "listInvestmentSnapshots" }).data[0].contribution, 800);
  assert.deepEqual(accounts.data[0].slice(0, 6), ["ID", "Name", "Source", "Active", "Created At", "Updated At"]);
  const balances = spreadsheet.getSheetByName("InvestmentBalances");
  const contributions = spreadsheet.getSheetByName("InvestmentContributions");
  assert.deepEqual(balances.data[0].slice(0, 9), ["ID", "Account ID", "Month", "Ending Balance", "Notes", "Created At", "Created By", "Updated At", "Updated By"]);
  assert.equal(balances.data[1][3], 12000);
  assert.equal(contributions.data[1][3], 800);
  assert.equal(spreadsheet.getSheetByName("InvestmentSnapshots"), null);
  assert.equal(spreadsheet.getSheetByName("InvestmentSnapshots_Legacy_v5").hidden, true);
});

test("setup migrates signed and zero monthly aggregates into separate flow records", () => {
  const spreadsheet = new Spreadsheet();
  const snapshots = spreadsheet.insertSheet("InvestmentSnapshots");
  snapshots.data = [
    ["ID", "Account ID", "Month", "Balance Date", "Balance", "Contribution", "Notes", "Created At", "Created By", "Updated At", "Updated By"],
    ["323e4567-e89b-42d3-a456-426614174099", "223e4567-e89b-42d3-a456-426614174099", "2026-07", "2026-07-15", 5000, -300, "Current", "2026-07-15T00:00:00.000Z", "123e4567-e89b-42d3-a456-426614174099", "2026-07-15T00:00:00.000Z", "123e4567-e89b-42d3-a456-426614174099"],
    ["423e4567-e89b-42d3-a456-426614174099", "223e4567-e89b-42d3-a456-426614174099", "2026-08", "2026-08-15", 5100, 0, "Zero", "2026-08-15T00:00:00.000Z", "123e4567-e89b-42d3-a456-426614174099", "2026-08-15T00:00:00.000Z", "123e4567-e89b-42d3-a456-426614174099"],
  ];
  const runtime = loadScript({ spreadsheet });
  runtime.context.setup();
  const balances = runtime.call({ action: "listInvestmentBalances" }).data;
  const contributions = runtime.call({ action: "listInvestmentContributions" }).data;
  assert.equal(balances.length, 2);
  assert.equal(balances[0].balance, 5000);
  assert.equal(balances[0].notes, "Current");
  assert.equal(contributions.length, 1);
  assert.equal(contributions[0].amount, -300);
});
