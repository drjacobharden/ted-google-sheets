const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadUtils() {
  const window = {};
  vm.runInNewContext(fs.readFileSync("js/import-utils.js", "utf8"), {
    window, String, Number, Date, Math, JSON, Map, Set, Error,
  });
  return window.ImportUtils;
}

test("CSV parser preserves quoted commas, escaped quotes, embedded newlines, duplicate headers, and source lines", () => {
  const utils = loadUtils();
  const parsed = utils.parseCSV('\uFEFFDate,Description,Description,Note\r\n2026-01-02,"Store, Inc.",Card,"first\nsecond"\r\n2026-01-03,"A ""quote""",Other,ok\r\n\r\n');
  assert.equal(parsed.headers.length, 4);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].values[1], "Store, Inc.");
  assert.equal(parsed.rows[0].values[3], "first\nsecond");
  assert.equal(parsed.rows[1].values[1], 'A "quote"');
  assert.equal(parsed.rows[1].sourceRowNumber, 4);
  assert.equal(parsed.signature, '["DATE","DESCRIPTION","DESCRIPTION","NOTE"]');
});

test("CSV parser rejects malformed quotes and reports uneven internal rows", () => {
  const utils = loadUtils();
  assert.throws(() => utils.parseCSV('A,B\n"unfinished'), /Unclosed quoted field/);
  const parsed = utils.parseCSV("A,B\n1\n\n2,3");
  assert.equal(parsed.rows.length, 2);
  assert.match(parsed.warnings.join(" "), /Row 2 has 1 columns/);
  assert.match(parsed.warnings.join(" "), /Blank row 3/);
});

test("import values normalize descriptions and strictly parse configured dates and money", () => {
  const utils = loadUtils();
  assert.equal(utils.normalizeDescription("  Acme   store  "), "ACME STORE");
  assert.equal(utils.parseNumber("($1,234.50)"), -1234.5);
  assert.equal(utils.parseNumber("not money"), Number.NaN);
  assert.equal(utils.parseDate("02/29/2024", "MM/DD/YYYY"), "2024-02-29");
  assert.equal(utils.parseDate("29/02/2024", "DD/MM/YYYY"), "2024-02-29");
  assert.equal(utils.parseDate("02/29/2023", "MM/DD/YYYY"), null);
  assert.equal(utils.parseDate("2026-13", "YYYY-MM"), null);
  assert.equal(utils.parseDate("02/03/24", "MM/DD/YYYY"), null);
  assert.equal(utils.parseDate("02/03/2024", "MM/DD/YY"), null);
});

test("date inference filters impossible and invalid formats while retaining genuine ambiguity", () => {
  const utils = loadUtils();
  assert.deepEqual(Array.from(utils.validDateFormats(utils.parseCSV("When\n02/13/2024\n11/30/2024"), 0)), ["MM/DD/YYYY"]);
  assert.deepEqual(Array.from(utils.validDateFormats(utils.parseCSV("When\n13/02/2024\n29/02/2024"), 0)), ["DD/MM/YYYY"]);
  assert.deepEqual(Array.from(utils.validDateFormats(utils.parseCSV("When\n02/03/2024\n11/12/2024"), 0)), ["MM/DD/YYYY", "DD/MM/YYYY"]);
  assert.deepEqual(Array.from(utils.validDateFormats(utils.parseCSV("When\n02/29/2023"), 0)), []);
  assert.deepEqual(Array.from(utils.validDateFormats(utils.parseCSV("When\n02/03/24"), 0)), ["MM/DD/YY", "DD/MM/YY"]);
});

test("transaction suggestions prioritize headings and only offer numeric amount columns", () => {
  const utils = loadUtils();
  const unified = utils.parseCSV("Memo,Posted Date,Merchant,Amount,Card Member\nlunch,07/13/2026,Cafe,-12.50,Alex");
  const suggestion = utils.suggestBudgetMapping(unified);
  assert.equal(suggestion.date, 1);
  assert.equal(suggestion.amountMode, "unified");
  assert.equal(suggestion.amount, 3);
  assert.equal(suggestion.vendorDescription, 2);
  assert.equal(suggestion.categoryDescription, null);
  assert.equal(suggestion.personDescription, 4);
  assert.equal(suggestion.notes, 0);
  assert.equal(suggestion.amountSignConvention, "expensesNegative");

  const split = utils.suggestBudgetMapping(utils.parseCSV("Date,Description,Debit,Credit\n07/13/2026,Cafe,12.50,\n07/14/2026,Refund,,4.00"));
  assert.equal(split.amountMode, "debitCredit");
  assert.equal(split.debit, 2);
  assert.equal(split.credit, 3);
});

test("budget staging applies exact saved mappings, debit-credit math, and Shared fallback without mutating CSV rows", () => {
  const utils = loadUtils();
  const parsed = utils.parseCSV("Date,Vendor,Debit,Credit,Note\n07/01/2026,Coffee Shop,12.50,,Latte");
  const original = parsed.rows[0].values.slice();
  const profile = {
    amountMode: "debitCredit", amountMultiplier: -1, dateFormat: "MM/DD/YYYY",
    columnMapping: { date: 0, vendorDescription: 1, debit: 2, credit: 3, notes: 4 },
  };
  const rows = utils.createBudgetRows(parsed, profile, {
    vendorMappings: [{ normalizedSourceDescription: "COFFEE SHOP", vendorId: "vendor", active: true }],
    personMappings: [],
  }, { sharedAssignmentId: "shared" });
  assert.equal(rows[0].date, "2026-07-01");
  assert.equal(rows[0].amount, 12.5);
  assert.equal(rows[0].sourceDirection, "debit");
  assert.equal(rows[0].vendorId, "vendor");
  assert.equal(rows[0].personId, "shared");
  assert.deepEqual(parsed.rows[0].values, original);
});

test("budget staging reuses and stages source-named vendors, categories, and people", () => {
  const utils = loadUtils();
  const parsed = utils.parseCSV("Date,Vendor,Category,Person,Amount\n07/01/2026,Cafe,Dining,Alex,-12.50\n07/02/2026,Cafe,Dining,Alex,-8.00");
  const profile = {
    amountMode: "unified", amountMultiplier: -1, dateFormat: "MM/DD/YYYY",
    columnMapping: {
      date: 0, vendorDescription: 1, categoryDescription: 2, personDescription: 3, amount: 4,
      amountSignConvention: "expensesNegative", autoPopulateVendor: true,
      autoPopulateCategory: true, autoPopulatePerson: true,
    },
  };
  const staged = new Map();
  const create = (kind, name, type) => {
    const key = `${kind}|${type || ""}|${utils.normalizeDescription(name)}`;
    if (!staged.has(key)) staged.set(key, { id: `draft-${staged.size + 1}`, name, type });
    return staged.get(key);
  };
  const rows = utils.createBudgetRows(parsed, profile, { vendorMappings: [], personMappings: [] }, {
    categories: [{ id: "dining", name: "Dining", type: "expense", active: true }],
    vendors: [], people: [], sharedAssignmentId: "shared",
  }, create);
  assert.equal(rows[0].categoryId, "dining");
  assert.equal(rows[0].vendorId, rows[1].vendorId);
  assert.equal(rows[0].personId, rows[1].personId);
  assert.equal(staged.size, 2);
  assert.equal(rows[0].categoryDescription, "Dining");
});

test("first-match propagation fills blanks without overwriting independent selections", () => {
  const utils = loadUtils();
  const rows = [
    { key: "A", personId: "", queued: false },
    { key: "A", personId: "custom", queued: false },
    { key: "A", personId: "", queued: true },
    { key: "B", personId: "", queued: false },
  ];
  const changed = utils.fillBlankMatches(rows, "personId", "A", (row) => row.key, "shared");
  assert.deepEqual(Array.from(changed, (row) => rows.indexOf(row)), [0]);
  assert.deepEqual(rows.map((row) => row.personId), ["shared", "custom", "", ""]);
  rows[0].personId = "alex";
  assert.deepEqual(rows.map((row) => row.personId), ["alex", "custom", "", ""]);
});

test("budget amounts follow category direction and preserve manual edits", () => {
  const utils = loadUtils();
  const base = { sourceDirection: "unified", sourceAmount: -25, amountSignConvention: "expensesNegative", amount: -25, amountEdited: false };
  assert.equal(utils.deriveBudgetAmount(base, "expense"), 25);
  assert.equal(utils.deriveBudgetAmount(base, "income"), -25);
  assert.equal(utils.deriveBudgetAmount({ ...base, sourceAmount: 8 }, "expense"), -8);
  assert.equal(utils.deriveBudgetAmount({ ...base, sourceAmount: 8 }, "income"), 8);
  assert.equal(utils.deriveBudgetAmount({ ...base, sourceDirection: "debit", sourceAmount: 11 }, "income"), -11);
  assert.equal(utils.deriveBudgetAmount({ ...base, sourceDirection: "credit", sourceAmount: 11 }, "expense"), -11);
  assert.equal(utils.deriveBudgetAmount({ ...base, amount: 7.25, amountEdited: true }, "expense"), 7.25);
  assert.equal(utils.suggestBudgetType(base), "expense");
  assert.equal(utils.suggestBudgetType({ ...base, sourceAmount: 25 }), "income");
  assert.equal(utils.suggestBudgetType({ ...base, sourceDirection: "debit" }), "expense");
  assert.equal(utils.suggestBudgetType({ ...base, sourceDirection: "credit" }), "income");
});

test("split amount staging flags rows with both or neither debit and credit", () => {
  const utils = loadUtils();
  const parsed = utils.parseCSV("Date,Vendor,Debit,Credit\n07/13/2026,Cafe,10,2\n07/14/2026,Store,,");
  const rows = utils.createBudgetRows(parsed, {
    amountMode: "debitCredit", dateFormat: "MM/DD/YYYY",
    columnMapping: { date: 0, vendorDescription: 1, debit: 2, credit: 3 },
  }, { vendorMappings: [], personMappings: [] }, { sharedAssignmentId: "shared" });
  assert.match(rows[0].amountLayoutError, /both debit and credit/);
  assert.match(rows[1].amountLayoutError, /either a debit or credit/);
});

test("investment staging keeps multiple signed flows and flags duplicate account-months", () => {
  const utils = loadUtils();
  const parsed = utils.parseCSV("Month,Balance,Employee,Withdrawal\n2026-06,1000,50,-10\n2026-06,1100,60,");
  const rows = utils.createInvestmentRows(parsed, {
    investmentAccountId: "account", dateFormat: "YYYY-MM",
    columnMapping: { month: 0, balance: 1, contributions: [2, 3] },
  }, []);
  assert.deepEqual(Array.from(rows[0].contributions), [50, -10]);
  assert.match(rows[0].errors[0], /more than once/);
  assert.match(rows[1].errors[0], /more than once/);
});

test("import route and scripts are wired for direct index loading", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const router = fs.readFileSync("js/router.js", "utf8");
  assert.match(html, /data-tab="import"/);
  assert.match(html, /id="route-import"/);
  assert.match(html, /js\/import-utils\.js[\s\S]*js\/api\.js[\s\S]*js\/import-api\.js/);
  assert.match(router, /"import"/);
  const route = fs.readFileSync("js/routes/import.js", "utf8");
  assert.match(route, /Step 1 of 6 · Date/);
  assert.match(route, /Step 4 of 6 · Category/);
  assert.match(route, /Match or create vendors using these values/);
  assert.match(route, /Match or create categories using these values/);
  assert.match(route, /Match or create people using these values/);
  assert.match(route, /data-import-action="commit"/);
  assert.doesNotMatch(route, /data-import-action="save-mappings"/);
  assert.equal((route.match(/ImportAPI\.saveProfile\(/g) || []).length, 1);
  assert.match(route, /profileMappingIsUsable\(state\.profile\)[\s\S]*stageRows\(\)/);
  assert.match(route, /Creating or updating the import profile[\s\S]*Creating new vendors[\s\S]*Creating categories[\s\S]*Creating people[\s\S]*Saving imported records/);
  assert.match(route, /Expenses are negative; deposits are positive/);
  assert.match(route, /No, use Shared/);
  assert.doesNotMatch(route, /External reference/i);
  assert.match(route, /Vendor name[\s\S]*Category[\s\S]*Person[\s\S]*Amount[\s\S]*Notes/);
  assert.match(route, /<vendor-input data-row-field="vendorId"/);
  assert.match(route, /<category-select data-row-field="categoryId" type="all" create-type=/);
  assert.match(route, /<people-select data-row-field="personId" allow-empty/);
  assert.match(route, /include-column[\s\S]*date-column[\s\S]*vendor-column[\s\S]*category-column[\s\S]*person-column[\s\S]*amount-column[\s\S]*notes-column/);
  assert.match(route, /number\.toFixed\(2\)/);
});
