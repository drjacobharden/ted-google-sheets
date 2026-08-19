const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(
  "src/components/filter-bar/filter-bar.ts",
  "utf8",
);
const template = fs.readFileSync(
  "src/components/filter-bar/template.ts",
  "utf8",
);
const styles = fs.readFileSync(
  "src/components/filter-bar/style.css",
  "utf8",
);
const main = fs.readFileSync("src/main.ts", "utf8");

test("filter bar exposes the requested typed filter contract", () => {
  assert.match(component, /dataType: FilterDataType/);
  assert.match(component, /value: string \| number/);
  assert.match(
    component,
    /const STRING_OPERATORS[\s\S]*"Contains"[\s\S]*"Starts with"[\s\S]*"Equals"/,
  );
  assert.match(
    component,
    /const NUMBER_OPERATORS[\s\S]*"Equals"[\s\S]*"Greater than"[\s\S]*"Less than"/,
  );
  assert.match(component, /const ENUM_OPERATORS[^;]*\["Equals"\]/);
});

test("filter bar composes the existing popover and dropdown components", () => {
  assert.match(template, /<pop-over/);
  assert.match(component, /document\.createElement\("dropdown-menu"\)/);
  assert.match(component, /dropdown\.addListener\(this\)/);
  assert.match(component, /dropdown\.removeListener\(this\)/);
});

test("nested fixed dropdowns retain viewport positioning", () => {
  assert.match(
    styles,
    /\.filter-bar__popover\.popover\.is-visible\s*\{\s*transform:\s*none;/,
  );
});

test("filter bar emits applied filters through the event utility", () => {
  assert.match(component, /createEventHandler<FiltersChangedEvent>/);
  assert.match(component, /"filters-changed"/);
  assert.match(
    component,
    /case "apply":[\s\S]*this\.#appliedFilters = this\.#completedDrafts\(\)/,
  );
  assert.match(component, /this\.#filtersChanged\.dispatch\(this\.filters\)/);
  assert.match(component, /addListener = this\.#filtersChanged\.addListener/);
});

test("active count changes only when drafts are applied or cleared", () => {
  assert.match(component, /const count = this\.#appliedFilters\.length/);
  assert.match(
    component,
    /case "clear":[\s\S]*this\.#appliedFilters = \[\];[\s\S]*this\.#filtersChanged\.dispatch\(this\.filters\)/,
  );
  assert.match(
    component,
    /#handleInput\(event: Event\)[\s\S]*draft\.value = input\.value;\s*this\.#updateControls\(\);\s*\}/,
  );
});

test("filter bar is registered and closes global listeners on disconnect", () => {
  assert.match(main, /components\/filter-bar\/filter-bar\.ts/);
  assert.match(component, /customElements\.define\("filter-bar", FilterBar\)/);
  assert.match(
    component,
    /document\.removeEventListener\("pointerdown", this, true\)/,
  );
  assert.match(component, /document\.removeEventListener\("keydown", this, true\)/);
});
