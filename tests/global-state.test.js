const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("dropdowns coordinate through transient application state", () => {
  const state = fs.readFileSync("src/state/app-state.ts", "utf8");
  const dropdown = fs.readFileSync(
    "src/components/dropdown-menu/dropdown-menu.ts",
    "utf8",
  );

  assert.match(state, /activeDropdownKey: string \| null/);
  assert.doesNotMatch(
    state,
    /activeDropdownKey[\s\S]*storage:\s*["'](?:local|session)["']/,
  );
  assert.match(dropdown, /appState\.subscribe\(\s*["']activeDropdownKey["']/);
  assert.match(dropdown, /appState\.set\(["']activeDropdownKey["'], this\.#menuKey\)/);
  assert.match(dropdown, /this\.#unsubscribeFromState\?\.\(\)/);
  assert.match(dropdown, /aria-expanded/);
});

test("the persistent shell closes dropdowns for global interactions", () => {
  const overlay = fs.readFileSync(
    "src/elements/overlay-manager/overlay-manager.ts",
    "utf8",
  );

  assert.match(overlay, /document\.addEventListener\(["']pointerdown["'], this, true\)/);
  assert.match(overlay, /document\.addEventListener\(["']keydown["'], this, true\)/);
  assert.match(overlay, /window\.addEventListener\(["']app:route-changed["'], this\)/);
  assert.match(overlay, /event\.composedPath\(\)/);
  assert.match(overlay, /key === ["']Escape["']/);
  assert.match(overlay, /document\.removeEventListener\(["']pointerdown["'], this, true\)/);
  assert.match(overlay, /document\.removeEventListener\(["']keydown["'], this, true\)/);
});
