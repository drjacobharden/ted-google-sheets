const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const component = fs.readFileSync(
  "src/elements/new-entity-popover/new-entity-popover.ts",
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
