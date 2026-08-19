const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadDateRange() {
  const toISODate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const context = {
    window: { dispatchEvent: () => {} },
    document: { addEventListener: () => {}, querySelectorAll: () => [] },
    HTMLElement: class {},
    customElements: { define: () => {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    toISODate,
    fromISODate: (value) => value ? new Date(`${value}T00:00:00`) : null,
    shortDateFormatter: new Intl.DateTimeFormat("en-US"),
    monthFormatter: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }),
    Intl, Date, Set,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("src/components/date-range-picker/date-range-picker.ts", "utf8"), context);
  return context.window.DateRangePickerUtils;
}

test("date presets use inclusive local calendar boundaries", () => {
  const ranges = loadDateRange();
  const today = new Date(2026, 6, 14);
  const week = ranges.getPresetRange("week", today);
  assert.equal(week.start, "2026-07-12");
  assert.equal(week.end, "2026-07-18");
  const month = ranges.getPresetRange("month", today);
  assert.equal(month.start, "2026-07-01");
  assert.equal(month.end, "2026-07-31");
  const quarter = ranges.getPresetRange("three-months", today);
  assert.equal(quarter.start, "2026-05-01");
  assert.equal(quarter.end, "2026-07-31");
  const year = ranges.getPresetRange("year", today);
  assert.equal(year.start, "2026-01-01");
  assert.equal(year.end, "2026-12-31");
  assert.equal(year.start <= "2026-01-01" && year.end >= "2026-12-31", true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(ranges.getPresetRange("all", today))),
    { preset: "all", start: "", end: "", label: "All time" },
  );
});

test("custom date selection keeps draft ranges ordered and supports a single day", () => {
  const { resolveDraftSelection } = loadDateRange();
  const select = (...args) => JSON.parse(JSON.stringify(resolveDraftSelection(...args)));
  assert.deepEqual(select("", "", "2026-07-14"), { start: "2026-07-14", end: "" });
  assert.deepEqual(select("2026-07-14", "", "2026-07-20"), { start: "2026-07-14", end: "2026-07-20" });
  assert.deepEqual(select("2026-07-14", "", "2026-07-10"), { start: "2026-07-10", end: "2026-07-14" });
  assert.deepEqual(select("2026-07-14", "", "2026-07-14"), { start: "2026-07-14", end: "2026-07-14" });
  assert.deepEqual(select("2026-07-14", "2026-07-20", "2026-08-01"), { start: "2026-08-01", end: "" });
});

test("calendar day buttons remain attached across range updates", () => {
  const component = fs.readFileSync("src/components/date-range-picker/date-range-picker.ts", "utf8");
  assert.match(component, /this\.\#grid\.replaceChildren\(\.\.\.buttons\)/);
  assert.match(component, /const buttons = this\.\#grid\.children/);
  assert.doesNotMatch(component, /#renderCalendar\(\)[\s\S]*replaceChildren/);
});

test("custom date Apply uses a disabled cursor rather than a loading cursor", () => {
  const css = fs.readFileSync("styles.css", "utf8");
  assert.match(css, /\.range-calendar-actions \.primary-button:disabled\s*\{\s*cursor: not-allowed;/);
});

test("shell fills the viewport and elevates only the desktop workspace", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const styles = fs.readFileSync("styles.css", "utf8");
  const shell = fs.readFileSync("css/shell.css", "utf8");
  const navigation = fs.readFileSync("css/navigation-bar.css", "utf8");
  const responsive = fs.readFileSync("css/responsiveness.css", "utf8");
  const userForm = fs.readFileSync("src/components/user-form/user-form.ts", "utf8");

  assert.doesNotMatch(html, /class="topbar"/);
  assert.doesNotMatch(html, /id="profile-(?:name|monogram)"/);
  assert.doesNotMatch(userForm, /getElementById\("profile-(?:name|monogram)"\)/);
  assert.match(shell, /\.app-shell\s*\{[\s\S]*width: 100vw;[\s\S]*height: 100dvh;/);
  assert.match(shell, /\.app-shell\s*\{[\s\S]*background: var\(--sidebar-background\);/);
  assert.match(styles, /\.workspace\s*\{[\s\S]*margin: 12px 12px 12px 0;[\s\S]*box-shadow: var\(--shadow\);/);
  assert.match(styles, /\.content\s*\{[\s\S]*padding: 30px 36px 34px;/);
  assert.match(styles, /\.screen\s*\{[\s\S]*width: 100%;[\s\S]*max-width: none;/);
  assert.match(styles, /\.category-layout\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(280px, 360px\);/);
  assert.match(styles, /@media \(max-width: 860px\)[\s\S]*\.workspace\s*\{[\s\S]*margin: 0;[\s\S]*box-shadow: none;/);
  assert.match(responsive, /@media \(max-width: 860px\)[\s\S]*\.app-shell\s*\{[\s\S]*grid-template-columns: 1fr;[\s\S]*height: 100dvh;/);
  assert.match(navigation, /\.sidebar-nav\s*\{[\s\S]*padding: 26px 16px 20px;/);
  assert.doesNotMatch(navigation, /\.sidebar\s*\{[\s\S]*?border-right:/);
});

test("transaction entry exposes an accessible vendor combobox", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const vendor = fs.readFileSync("src/components/vendor-input/vendor-input.ts", "utf8");
  const controller = fs.readFileSync(
    "src/components/select-create-controller/select-create-controller.ts",
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
  const category = fs.readFileSync(
    "src/screens/category-screen/category-screen.ts",
    "utf8",
  );
  const vendor = fs.readFileSync("src/screens/vendors-screen/vendors-screen.ts", "utf8");
  const people = fs.readFileSync("src/screens/people-screen/people-screen.ts", "utf8");
  const detail = fs.readFileSync("src/screens/entity-detail-screen/entity-detail-screen.ts", "utf8");
  const detailTemplate = fs.readFileSync("src/screens/entity-detail-screen/template.html", "utf8");
  const editor = fs.readFileSync("src/screens/entity-drawer-screen/entity-drawer-screen.ts", "utf8");
  assert.match(html, /id="route-entity-detail"/);
  assert.match(detail, /this\.dataset\.screen = "entity-detail"/);
  assert.match(html, /id="entity-drawer-backdrop"/);
  assert.doesNotMatch(html, /id="focus-(category|vendor|person)-form"/);
  [category, vendor, people].forEach((source) => {
    assert.match(source, /appRouter\(\)\.navigate\("entity-detail", \{/);
    assert.match(source, /kind:/);
    assert.match(source, /id:/);
  });
  assert.match(detail, /class EntityDetailScreen extends HTMLElement/);
  assert.match(detail, /transactionRow\(\)\.create/);
  assert.match(detail, /appRouter\(\)\.updateParams/);
  assert.match(detail, /drawer: "entity-edit"/);
  assert.match(detail, /entityKind: this\.#selected\.kind/);
  assert.match(detail, /entityId: this\.#selected\.id/);
  assert.match(detail, /transactionId:/);
  assert.match(detail, /Total spent/);
  assert.match(detail, /Net activity/);
  assert.match(editor, /renameEntityTransactions/);
  assert.match(editor, /Discard your unsaved changes/);
});

test("category routing renders the TypeScript category-screen component", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const main = fs.readFileSync("src/main.ts", "utf8");
  const screen = fs.readFileSync(
    "src/screens/category-screen/category-screen.ts",
    "utf8",
  );
  const template = fs.readFileSync(
    "src/screens/category-screen/template.html",
    "utf8",
  );
  const style = fs.readFileSync(
    "src/screens/category-screen/style.css",
    "utf8",
  );

  assert.match(
    html,
    /<template id="route-categories">\s*<category-screen><\/category-screen>\s*<\/template>/,
  );
  assert.doesNotMatch(html, /js\/routes\/categories\.js/);
  assert.match(main, /screens\/category-screen\/category-screen\.ts/);
  assert.match(screen, /customElements\.define\("category-screen"/);
  assert.match(screen, /connectedCallback\(\): void/);
  assert.match(screen, /disconnectedCallback\(\): void/);
  assert.match(template, /id="category-form"/);
  assert.match(template, /id="category-list"/);
  assert.match(style, /\.category-screen__layout/);
  assert.equal(fs.existsSync("js/routes/categories.js"), false);
});

test("vendor search and normalized select styling are present", () => {
  const template = fs.readFileSync("src/screens/vendors-screen/template.html", "utf8");
  const vendor = fs.readFileSync("src/screens/vendors-screen/vendors-screen.ts", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");
  assert.match(template, /id="vendor-search"/);
  assert.match(vendor, /\$\{vendors\.length\} of \$\{allVendors\.length\} vendors/);
  assert.match(css, /select \{[\s\S]*appearance: none/);
  assert.match(css, /border-radius: var\(--radius-small\)/);
  assert.match(css, /background-image: url\("data:image\/svg\+xml/);
});

test("routed drawers share focus-safe entry and exit animations", () => {
  const css = fs.readFileSync("css/drawer.css", "utf8");

  assert.match(
    css,
    /\.drawer-overlay:not\(\[hidden\]\)::before[\s\S]*opacity: 0[\s\S]*transition: opacity 360ms ease-out/,
  );
  assert.match(
    css,
    /\.drawer-overlay:not\(\[hidden\]\) > \.transaction-drawer[\s\S]*translateX\(100%\)[\s\S]*transition: transform 360ms cubic-bezier\(0\.33, 1, 0\.68, 1\)/,
  );
  assert.match(
    css,
    /\.drawer-overlay\.is-open::before\s*\{\s*opacity: 1/,
  );
  assert.match(
    css,
    /\.drawer-overlay\.is-open > \.transaction-drawer\s*\{\s*transform: translateX\(0\)/,
  );
  assert.match(
    css,
    /\.drawer-overlay\.is-closing::before[\s\S]*opacity: 0[\s\S]*transition-duration: 260ms/,
  );
  assert.match(
    css,
    /\.drawer-overlay\.is-closing > \.transaction-drawer[\s\S]*translateX\(100%\)[\s\S]*transition-duration: 260ms/,
  );

  ["src/screens/transaction-drawer-screen/transaction-drawer-screen.ts", "src/screens/entity-drawer-screen/entity-drawer-screen.ts"].forEach(
    (path) => {
      const drawer = fs.readFileSync(path, "utf8");
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
    },
  );
});
