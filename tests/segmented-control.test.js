const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(
  "src/components/segmented-control/segmented-control.ts",
  "utf8",
);
const styles = fs.readFileSync(
  "src/components/segmented-control/style.css",
  "utf8",
);

test("segmented control is registered and accepts typed variable-width items", () => {
  const main = fs.readFileSync("src/main.ts", "utf8");

  assert.match(main, /components\/segmented-control\/segmented-control\.ts/);
  assert.match(
    component,
    /interface SegmentedControlItem\s*\{\s*key: string;\s*title: string;/,
  );
  assert.match(component, /set items\(items: SegmentedControlItem\[\]\)/);
  assert.match(component, /connectedCallback\(\): void[\s\S]*this\.#renderItems\(\)/);
  assert.match(component, /button\.textContent = item\.title/);
  assert.match(styles, /\.segmented-control__item\s*\{[\s\S]*white-space: nowrap/);
});

test("selection uses createEventHandler and exposes the selected item", () => {
  assert.match(component, /createEventHandler<SegmentedControlSelectionEvent>/);
  assert.match(component, /["']segmented-control-selection["']/);
  assert.match(
    component,
    /this\.#selectionHandler\.dispatch\(\{ value: item\.key, title: item\.title \}\)/,
  );
  assert.match(component, /addListener = this\.#selectionHandler\.addListener/);
  assert.match(component, /removeListener = this\.#selectionHandler\.removeListener/);
  assert.match(component, /set selection\(key: string \| null\)/);
});

test("items can declare the initial selection", () => {
  assert.match(component, /isDefaultValue\?: boolean/);
  assert.match(
    component,
    /const defaultItem = this\.\#items\.find\(\(item\) => item\.isDefaultValue\)/,
  );
  assert.match(
    component,
    /this\.\#selection = defaultItem\?\.key \?\? this\.\#items\[0\]\?\.key \?\? null;/,
  );
});

test("indicator position and width animate with selection text opacity", () => {
  assert.match(component, /selected\.offsetWidth/);
  assert.match(component, /selected\.offsetLeft/);
  assert.match(component, /new ResizeObserver/);
  assert.match(styles, /\.segmented-control__item\s*\{[\s\S]*opacity: 0\.55/);
  assert.match(styles, /\.segmented-control__item\.is-selected\s*\{\s*opacity: 1/);
  assert.match(
    styles,
    /transition:\s*\n\s*width 240ms ease,\s*\n\s*transform 240ms ease/,
  );
  assert.match(styles, /transition: opacity 240ms ease/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("segmented control supports radio semantics and keyboard selection", () => {
  assert.match(component, /setAttribute\(["']role["'], ["']radiogroup["']\)/);
  assert.match(component, /button\.setAttribute\(["']role["'], ["']radio["']\)/);
  assert.match(component, /button\.setAttribute\(["']aria-checked["']/);
  assert.match(component, /["']ArrowLeft["']/);
  assert.match(component, /["']ArrowRight["']/);
  assert.match(component, /["']Home["']/);
  assert.match(component, /["']End["']/);
});
