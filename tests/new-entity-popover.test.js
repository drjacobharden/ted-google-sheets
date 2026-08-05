const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(
  "src/elements/new-entity-popover/new-entity-popover.ts",
  "utf8",
);
const overlayManager = fs.readFileSync(
  "src/elements/overlay-manager/overlay-manager.ts",
  "utf8",
);

test("rerendered form controls receive fresh listeners", () => {
  assert.match(
    component,
    /#renderForm\(entity: NewEntityOptions\)\s*\{\s*this\.#disconnectFormListeners\(\);\s*this\.#typeSelector = null;/,
  );
  assert.match(
    component,
    /#renderForm\(entity: NewEntityOptions\)[\s\S]*this\.#connectFormListeners\(\);\s*\}/,
  );
  assert.match(
    component,
    /#connectFormListeners\(\)[\s\S]*this\.#input\.addEventListener\("input", this\)/,
  );
  assert.match(
    component,
    /#connectFormListeners\(\)[\s\S]*this\.#typeSelector\.addListener\(this\)/,
  );
  assert.match(component, /this\.#typeSelector\.selection = this\.#type/);
});

test("dynamic listeners are removed from old controls before replacement", () => {
  assert.match(
    component,
    /#disconnectFormListeners\(\)[\s\S]*this\.#input\.removeEventListener\("input", this\)/,
  );
  assert.match(
    component,
    /#disconnectFormListeners\(\)[\s\S]*this\.#typeSelector\.removeListener\(this\)/,
  );
  assert.match(
    component,
    /#disconnectListeners\(\)[\s\S]*this\.#disconnectFormListeners\(\)/,
  );
});

test("the overlay manager closes the form only for outside interactions", () => {
  assert.match(
    component,
    /containsFormInteraction\(event: Event\): boolean\s*\{\s*return event\.composedPath\(\)\.includes\(this\.#popover\);/,
  );
  assert.match(
    overlayManager,
    /if \(!this\.#newEntityPopover\.containsFormInteraction\(event\)\)\s*\{\s*this\.hideEntityForm\(\);/,
  );
});
