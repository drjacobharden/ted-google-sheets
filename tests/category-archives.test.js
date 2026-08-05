const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const screen = fs.readFileSync(
  "src/screens/category-screen/category-screen.ts",
  "utf8",
);

test("category screen renders active categories before loading archives", () => {
  assert.match(
    screen,
    /this\.#loadUsage\(\);\s*this\.#render\(\);\s*this\.#loadArchivedCategories\(\);/,
  );
  assert.match(
    screen,
    /#loadArchivedCategories\(\): void[\s\S]*APIs\.budget[\s\S]*\.listArchivedEntities\(\)/,
  );
  assert.match(screen, /if \(this\.isConnected\) this\.#render\(\)/);
});

test("default views exclude archived categories and archive view includes them", () => {
  assert.match(
    screen,
    /this\.#tableView === "archived"\s*\? item\.active === false\s*:\s*item\.active !== false && item\.type === this\.#tableView/,
  );
});
