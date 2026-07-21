const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadDateRange() {
  const context = {
    window: { dispatchEvent: () => {} },
    document: { addEventListener: () => {}, querySelectorAll: () => [] },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Intl, Date, Set,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/date-range.js", "utf8"), context);
  return context.window.DateRangeUI;
}

test("date presets use inclusive local calendar boundaries", () => {
  const ranges = loadDateRange();
  const today = new Date(2026, 6, 14);
  const week = ranges.presetRange("week", today);
  assert.equal(week.start, "2026-07-12");
  assert.equal(week.end, "2026-07-18");
  const month = ranges.presetRange("month", today);
  assert.equal(month.start, "2026-07-01");
  assert.equal(month.end, "2026-07-31");
  const quarter = ranges.presetRange("three-months", today);
  assert.equal(quarter.start, "2026-05-01");
  assert.equal(quarter.end, "2026-07-31");
  const year = ranges.presetRange("year", today);
  assert.equal(year.start, "2026-01-01");
  assert.equal(year.end, "2026-12-31");
  assert.equal(ranges.matches("2026-01-01", year), true);
  assert.equal(ranges.matches("2026-12-31", year), true);
  assert.equal(ranges.matches("2027-01-01", year), false);
  assert.equal(ranges.matches("1900-01-01", ranges.presetRange("all", today)), true);
});

test("custom date selection keeps draft ranges ordered and supports a single day", () => {
  const { resolveDraftSelection } = loadDateRange().__testing;
  const select = (...args) => JSON.parse(JSON.stringify(resolveDraftSelection(...args)));
  assert.deepEqual(select("", "", "2026-07-14"), { start: "2026-07-14", end: "" });
  assert.deepEqual(select("2026-07-14", "", "2026-07-20"), { start: "2026-07-14", end: "2026-07-20" });
  assert.deepEqual(select("2026-07-14", "", "2026-07-10"), { start: "2026-07-10", end: "2026-07-14" });
  assert.deepEqual(select("2026-07-14", "", "2026-07-14"), { start: "2026-07-14", end: "2026-07-14" });
  assert.deepEqual(select("2026-07-14", "2026-07-20", "2026-08-01"), { start: "2026-08-01", end: "" });
});

test("calendar clicks remain internal after the clicked day is replaced", () => {
  const { eventOccurredWithin } = loadDateRange().__testing;
  const root = { contains: () => false };
  const replacedDay = {};
  assert.equal(eventOccurredWithin(root, { target: replacedDay, composedPath: () => [replacedDay, root] }), true);
  assert.equal(eventOccurredWithin(root, { target: replacedDay, composedPath: () => [replacedDay] }), false);
  assert.equal(eventOccurredWithin({ contains: (target) => target === replacedDay }, { target: replacedDay }), true);
});

test("custom date Apply uses a disabled cursor rather than a loading cursor", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  assert.match(css, /\.range-calendar-actions \.primary-button:disabled\s*\{\s*cursor: not-allowed;/);
});

test("transaction entry exposes an accessible vendor combobox", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const vendor = fs.readFileSync("js/components/vendor-input.js", "utf8");
  const controller = fs.readFileSync(
    "js/components/select-create-controller.js",
    "utf8",
  );
  assert.match(html, /<vendor-input><\/vendor-input>/);
  assert.match(vendor, /role="combobox"/);
  assert.match(vendor, /role="listbox"/);
  assert.match(vendor, /aria-controls/);
  assert.match(vendor, /BudgetAPI\.addVendor\(\{ name \}\)/);
  assert.match(controller, /aria-selected/);
  assert.match(controller, /ArrowDown/);
});

test("entity lists drill down into a shared detail screen and rename drawer", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const category = fs.readFileSync("js/routes/categories.js", "utf8");
  const vendor = fs.readFileSync("js/routes/vendors.js", "utf8");
  const people = fs.readFileSync("js/routes/people.js", "utf8");
  const detail = fs.readFileSync("js/routes/entity-detail.js", "utf8");
  const editor = fs.readFileSync("js/entity-editor.js", "utf8");
  assert.match(html, /data-screen="entity-detail"/);
  assert.match(html, /id="entity-drawer-backdrop"/);
  assert.doesNotMatch(html, /id="focus-(category|vendor|person)-form"/);
  [category, vendor, people].forEach((source) => {
    assert.match(source, /AppRouter\.navigate\("entity-detail", \{/);
    assert.match(source, /kind:/);
    assert.match(source, /id:/);
  });
  assert.match(detail, /function mount\(root, \{ params = \{\} \} = \{\}\)/);
  assert.match(detail, /createTransactionRow/);
  assert.match(detail, /AppRouter\.updateParams/);
  assert.match(detail, /transactionId:/);
  assert.match(detail, /Total spent/);
  assert.match(detail, /Net activity/);
  assert.match(editor, /renameEntityTransactions/);
  assert.match(editor, /Discard your unsaved changes/);
});

test("vendor search and normalized select styling are present", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const vendor = fs.readFileSync("js/routes/vendors.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");
  assert.match(html, /id="vendor-search"/);
  assert.match(vendor, /\$\{vendors\.length\} of \$\{allVendors\.length\} vendors/);
  assert.match(css, /select \{[\s\S]*appearance: none/);
  assert.match(css, /border-radius: var\(--radius-small\)/);
  assert.match(css, /background-image: url\("data:image\/svg\+xml/);
});

test("transaction drawer overlay and panel animate in and out together", () => {
  const css = fs.readFileSync("styles.css", "utf8");

  assert.match(
    css,
    /#transaction-drawer-backdrop:not\(\[hidden\]\)::before[\s\S]*opacity: 0[\s\S]*transition: opacity 360ms ease-out/,
  );
  assert.match(
    css,
    /#transaction-drawer-backdrop:not\(\[hidden\]\) > \.transaction-drawer[\s\S]*translateX\(100%\)[\s\S]*transition: transform 360ms cubic-bezier\(0\.33, 1, 0\.68, 1\)/,
  );
  assert.match(
    css,
    /#transaction-drawer-backdrop\.is-open::before\s*\{\s*opacity: 1/,
  );
  assert.match(
    css,
    /#transaction-drawer-backdrop\.is-open > \.transaction-drawer\s*\{\s*transform: translateX\(0\)/,
  );
  assert.match(
    css,
    /#transaction-drawer-backdrop\.is-closing::before[\s\S]*opacity: 0[\s\S]*transition-duration: 260ms/,
  );
  assert.match(
    css,
    /#transaction-drawer-backdrop\.is-closing > \.transaction-drawer[\s\S]*translateX\(100%\)[\s\S]*transition-duration: 260ms/,
  );

  const drawer = fs.readFileSync(
    "js/routes/transaction-drawer.js",
    "utf8",
  );
  assert.match(drawer, /void drawer\.offsetWidth/);
  assert.match(drawer, /backdrop\.classList\.add\("is-open"\)/);
  assert.match(drawer, /backdrop\.classList\.add\("is-closing"\)/);
  assert.match(drawer, /event\.propertyName === "transform"/);
  assert.match(
    drawer,
    /closeTimer = window\.setTimeout\(finishClose, reducedMotion \? 0 : 320\)/,
  );
  assert.match(
    drawer,
    /function finishClose\(\)[\s\S]*backdrop\.hidden = true/,
  );
});
