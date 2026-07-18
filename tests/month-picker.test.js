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
    window: {},
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
  vm.runInContext(fs.readFileSync("js/month-picker.js", "utf8"), context);
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
  const investments = fs.readFileSync("js/investments.js", "utf8");
  const component = fs.readFileSync("js/month-picker.js", "utf8");
  assert.doesNotMatch(html, /type=["']month["']/);
  assert.doesNotMatch(investments, /type=["']month["']/);
  assert.match(html, /<month-picker\s+id="investment-entry-month"\s+label="Reporting month"/);
  assert.match(investments, /<month-picker label="From" data-month-start/);
  assert.match(investments, /<month-picker label="To" data-month-end/);
  assert.match(html, /<script src="js\/month-picker\.js"><\/script>[\s\S]*<script src="js\/investments\.js"><\/script>/);
  assert.match(investments, /entryMonth\.addEventListener\("change", renderMonthList\)/);
  assert.match(investments, /From month must be before or the same as To month\./);
  assert.match(investments, /data-month-range-error role="alert" aria-live="polite"/);
  assert.match(component, /new Event\("change", \{ bubbles: true \}\)/);
  assert.match(component, /removeEventListener\("click", this\._handleDocumentClick\)/);
});
