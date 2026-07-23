const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadUtils() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("js/components/select-create-controller.js", "utf8"),
    context,
  );
  return context.window.SelectCreateUtils;
}

test("select-create normalizes category names for duplicate checks", () => {
  const { cleanName, normalizeName } = loadUtils();
  assert.equal(cleanName("  Home   Repairs  "), "Home Repairs");
  assert.equal(normalizeName("  HOME   Repairs  "), "home repairs");
});

test("select-create ranks exact, prefix, word-prefix, and substring matches", () => {
  const { filterOptions } = loadUtils();
  const records = [
    { id: "4", name: "Not Dining" },
    { id: "2", name: "Dining Out" },
    { id: "1", name: "Dining" },
    { id: "3", name: "Fine Dining" },
    { id: "5", name: "Groceries" },
  ];

  assert.deepEqual(
    Array.from(filterOptions(records, "dining"), (record) => record.id),
    ["1", "2", "3", "4"],
  );
});

test("an open select stays closed when its trigger is clicked", () => {
  const controller = fs.readFileSync(
    "js/components/select-create-controller.js",
    "utf8",
  );

  assert.match(
    controller,
    /#trigger\.addEventListener\("pointerdown", this\)/,
  );
  assert.match(
    controller,
    /event\.currentTarget === this\.#trigger && this\.isOpen[\s\S]*?event\.preventDefault\(\)/,
  );
});

test("category adapter keeps creation explicit and form-readable", () => {
  const source = fs.readFileSync("js/components/category-select.js", "utf8");
  const controller = fs.readFileSync(
    "js/components/select-create-controller.js",
    "utf8",
  );
  assert.match(source, /name="categoryId"/);
  assert.match(source, /Search or add category/);
  assert.match(
    source,
    /BudgetAPI\.addCategory\(\{ name, type: this\.#type === "all" \? this\.#createType : this\.#type \}\)/,
  );
  assert.match(source, /new CustomEvent\("category-created"/);
  assert.match(source, /was added\. Syncing…/);
  assert.doesNotMatch(source, /category-add-requested/);
  assert.match(controller, /#addButton\.addEventListener\("pointerdown", this\)/);
  assert.match(controller, /event\.currentTarget === this\.#addButton/);
  assert.match(source, /this\.#type === "all"[\s\S]*BudgetAPI\.listCategories\(\)/);
  assert.match(source, /create-type/);
  assert.match(source, /this\.#type === "all" \? this\.#createType : this\.#type/);
  assert.match(source, /allowCreate: true/);
  assert.match(controller, /#allowCreate/);
});

test("vendor and people adapters use searchable select-create fields", () => {
  const vendor = fs.readFileSync("js/components/vendor-input.js", "utf8");
  const people = fs.readFileSync("js/components/people-select.js", "utf8");
  const html = fs.readFileSync("index.html", "utf8");

  assert.match(vendor, /name="vendorId"/);
  assert.match(vendor, /Search or add vendor/);
  assert.match(vendor, /BudgetAPI\.addVendor\(\{ name \}\)/);
  assert.match(vendor, /new CustomEvent\("vendor-created"/);
  assert.match(vendor, /Object\.prototype\.hasOwnProperty\.call\(this, "value"\)/);
  assert.match(people, /name="assignmentId"/);
  assert.match(people, /Search or add person/);
  assert.match(people, /BudgetAPI\.addPerson\(\{ name \}\)/);
  assert.match(people, /new CustomEvent\("person-created"/);
  assert.match(people, /Object\.prototype\.hasOwnProperty\.call\(this, "value"\)/);
  assert.match(people, /hasAttribute\("allow-empty"\)/);
  assert.match(html, /<people-select><\/people-select>/);
  assert.doesNotMatch(html, /<select name="assignmentId"/);
});

test("searchable selectors expose import-only deferred option providers", () => {
  const controller = fs.readFileSync("js/components/select-create-controller.js", "utf8");
  assert.match(controller, /configure\(\{ getOptions, createOption, onCreate \}/);
  ["vendor-input.js", "category-select.js", "people-select.js"].forEach((file) => {
    assert.match(fs.readFileSync(`js/components/${file}`, "utf8"), /configureOptions\(options\)/);
  });
});

test("transaction drawer reads custom component values directly", () => {
  const drawer = fs.readFileSync(
    "js/routes/transaction-drawer.js",
    "utf8",
  );

  assert.match(drawer, /form\.querySelector\("vendor-input"\)/);
  assert.match(drawer, /form\.querySelector\("people-select"\)/);
  assert.match(drawer, /date: datePickerElement\.value/);
  assert.match(drawer, /categoryId: categorySelect\.value/);
  assert.match(drawer, /vendorId: type === "income" \? "" : vendorSelect\.value/);
  assert.match(drawer, /assignmentId: peopleSelect\.value/);
  assert.doesNotMatch(drawer, /closeInlinePerson|resetVendor|populateAssignments/);
});

test("transaction drawer preserves an expense draft across type changes", () => {
  const drawer = fs.readFileSync("js/routes/transaction-drawer.js", "utf8");

  assert.match(drawer, /let expenseDraft = \{ categoryId: "", vendorId: "" \}/);
  assert.match(
    drawer,
    /activeType === "expense" && nextType === "income"[\s\S]*categoryId: categorySelect\.value,[\s\S]*vendorId: vendorSelect\.value/,
  );
  assert.match(
    drawer,
    /categorySelect\.value = income[\s\S]*expenseDraft\.categoryId/,
  );
  assert.match(drawer, /vendorSelect\.value = income \? "" : expenseDraft\.vendorId/);
});

test("transaction drawer branches synchronously between create and edit", () => {
  const drawer = fs.readFileSync("js/routes/transaction-drawer.js", "utf8");

  assert.match(drawer, /if \(mode === "create"\) \{\s*createTransaction\(draft\)/);
  assert.match(drawer, /queueTransaction\(draft\)/);
  assert.match(drawer, /queueTransactionUpdate\(draft, openedBase\)/);
  assert.doesNotMatch(drawer, /async function (handleSubmit|createTransaction)/);
  assert.doesNotMatch(drawer, /Ready for another/);
});

test("transaction drawer validates custom fields and owns both create buttons", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const drawer = fs.readFileSync("js/routes/transaction-drawer.js", "utf8");

  assert.equal((html.match(/data-new-transaction/g) || []).length, 2);
  assert.match(drawer, /if \(!datePickerElement\.value\)/);
  assert.match(drawer, /if \(!categorySelect\.value\)/);
  assert.match(drawer, /type === "expense" && !vendorSelect\.value/);
  assert.match(drawer, /if \(!peopleSelect\.value\)/);
  assert.match(drawer, /if \(!form\.checkValidity\(\)\)/);
});

test("transaction drawer supports signed refunds and create-only batch entry", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const currency = fs.readFileSync("js/components/currency-input.js", "utf8");
  const drawer = fs.readFileSync("js/routes/transaction-drawer.js", "utf8");
  const row = fs.readFileSync("js/utils/transaction-row.js", "utf8");

  assert.match(html, /id="batch-entry-toggle"/);
  assert.match(html, /name="batchEntry" role="switch"/);
  assert.doesNotMatch(currency, /min="0\.01"/);
  assert.match(currency, /negative value for refunds/);
  assert.match(drawer, /batchEntryToggle\.hidden = false/);
  assert.match(drawer, /batchEntryToggle\.hidden = true/);
  assert.match(drawer, /resetForBatchEntry\(draft\.date\)/);
  assert.match(drawer, /datePickerElement\.value = date/);
  assert.match(row, /budgetEffect = isIncome \? amount : -amount/);
});

test("transaction drawer anchors controls and fully removes the income vendor row", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");
  const drawer = fs.readFileSync("js/routes/transaction-drawer.js", "utf8");

  assert.match(html, /class="transaction-drawer-controls"/);
  assert.match(
    html,
    /class="transaction-drawer-controls"[\s\S]*class="transaction-drawer-actions"[\s\S]*id="batch-entry-toggle"[\s\S]*class="transaction-metadata"/,
  );
  assert.match(css, /#transaction-edit-form\s*\{[\s\S]*flex: 1;[\s\S]*flex-direction: column/);
  assert.match(css, /\.transaction-drawer-controls\s*\{[\s\S]*margin-top: auto/);
  assert.match(drawer, /vendorSelect\.hidden = income/);
  assert.doesNotMatch(drawer, /vendorField\.hidden = income/);
});

test("select-create supports session-scoped archived fallback selections", () => {
  const controller = fs.readFileSync(
    "js/components/select-create-controller.js",
    "utf8",
  );
  const components = [
    "js/components/category-select.js",
    "js/components/vendor-input.js",
    "js/components/people-select.js",
  ].map((path) => fs.readFileSync(path, "utf8"));

  assert.match(controller, /setFallbackSelection\(selection\)/);
  assert.match(controller, /option\.archived \? " \(archived\)" : ""/);
  components.forEach((source) => {
    assert.match(source, /setFallbackSelection\(selection\)/);
    assert.match(source, /clearFallbackSelection\(\)/);
    assert.match(source, /reportSelectionError\(message\)/);
  });
});
