const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadMonthPicker() {
  let MonthPicker;
  class FakeHTMLElement {
    constructor() {
      this.attributes = new Map();
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
  }
  const context = {
    window: { DateUtils: { shortMonthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] } },
    HTMLElement: FakeHTMLElement,
    customElements: {
      define: (name, constructor) => {
        assert.equal(name, "month-picker");
        MonthPicker = constructor;
      },
    },
    Date,
    Event,
    Number,
    String,
    Math,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/components/month-picker.js", "utf8"), context);
  return { helpers: context.window.MonthPickerUI, MonthPicker };
}

test("month picker normalizes and formats canonical month values", () => {
  const { helpers } = loadMonthPicker();
  assert.equal(helpers.normalizeMonth("2026-07"), "2026-07");
  assert.equal(helpers.formatMonth("2026-07"), "July 2026");
  assert.equal(helpers.normalizeMonth("2026-7"), "");
  assert.equal(helpers.normalizeMonth("2026-13"), "");
  assert.equal(helpers.normalizeMonth("0000-01"), "");
  assert.equal(helpers.formatMonth("not-a-month"), "Select a month");
});

test("month picker movement crosses year boundaries without date parsing", () => {
  const { helpers } = loadMonthPicker();
  assert.equal(helpers.shiftMonth("2026-01", -1), "2025-12");
  assert.equal(helpers.shiftMonth("2026-11", 4), "2027-03");
  assert.equal(helpers.shiftMonth("0001-01", -1), "");
  assert.equal(helpers.shiftMonth("9999-12", 1), "");
});

test("optional month bounds are inclusive", () => {
  const { helpers } = loadMonthPicker();
  assert.equal(helpers.isWithinBounds("2026-03", "2026-03", "2026-09"), true);
  assert.equal(helpers.isWithinBounds("2026-09", "2026-03", "2026-09"), true);
  assert.equal(helpers.isWithinBounds("2026-02", "2026-03", "2026-09"), false);
  assert.equal(helpers.isWithinBounds("2026-10", "2026-03", "2026-09"), false);
  assert.equal(helpers.isWithinBounds("2026-10"), true);
});

test("value, min, and max properties reflect valid values and clear invalid ones", () => {
  const { MonthPicker } = loadMonthPicker();
  const picker = new MonthPicker();
  picker.value = "2026-07";
  picker.min = "2000-01";
  picker.max = "2099-12";
  assert.equal(picker.value, "2026-07");
  assert.equal(picker.getAttribute("value"), "2026-07");
  assert.equal(picker.min, "2000-01");
  assert.equal(picker.max, "2099-12");
  picker.value = "July 2026";
  picker.min = "bad";
  assert.equal(picker.value, "");
  assert.equal(picker.getAttribute("value"), null);
  assert.equal(picker.min, "");
});

test("month picker is wired into all investment month selections", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const overview = fs.readFileSync("js/routes/investment-overview.js", "utf8");
  const monthDrawer = fs.readFileSync("js/routes/investment-month-drawer.js", "utf8");
  const component = fs.readFileSync("js/components/month-picker.js", "utf8");
  assert.doesNotMatch(html, /type=["']month["']/);
  assert.doesNotMatch(overview + monthDrawer, /type=["']month["']/);
  assert.match(html, /<month-picker\s+label="Reporting month"\s+alignment="right"/);
  assert.match(overview, /<month-picker label="From" data-month-start/);
  assert.match(overview, /<month-picker label="To" data-month-end/);
  assert.match(html, /<script src="js\/components\/month-picker\.js" defer><\/script>[\s\S]*<script src="js\/routes\/investment-month-drawer\.js"><\/script>/);
  assert.match(monthDrawer, /monthPicker\.addEventListener\("change", changeTarget\)/);
  assert.match(overview, /From month must be before or the same as To month\./);
  assert.match(overview, /data-month-range-error role="alert" aria-live="polite"/);
  assert.match(component, /new Event\("change", \{ bubbles: true \}\)/);
  assert.doesNotMatch(component, /document\.addEventListener\("click"/);
});
