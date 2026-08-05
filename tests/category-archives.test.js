const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const screen = fs.readFileSync(
  "src/screens/category-screen/category-screen.ts",
  "utf8",
);

test("category screen renders archives from bootstrap without a page-load request", () => {
  assert.match(screen, /this\.#render\(\);\s*this\.#setBreadcrumbs\(\);/);
  assert.doesNotMatch(screen, /#loadArchivedCategories/);
  assert.doesNotMatch(screen, /\.listArchivedEntities\(\)/);
});

test("category status filters operate on the inclusive category cache", () => {
  assert.match(screen, /APIs\.budget\.listAllCategories\(\)/);
  assert.match(screen, /status: item\.active \? "Active" : "Archived"/);
  assert.match(screen, /value === filter\.value/);
});

test("category row menus route, edit, archive, and restore their own category", () => {
  assert.match(screen, /optionButton\.addListener\(this\)/);
  assert.match(
    screen,
    /event\.target\.closest<HTMLElement>\("\[data-entity-id\]"\)/,
  );
  assert.match(screen, /this\.#navigateToCategory\(categoryId\)/);
  assert.match(
    screen,
    /drawer: "entity-edit",\s*entityKind: "category",\s*entityId: categoryId/,
  );
  assert.match(screen, /APIs\.budget\.archiveCategory\(categoryId\)/);
  assert.match(
    screen,
    /APIs\.budget\.reactivateCategory\(\{ id: categoryId \}\)/,
  );
});
