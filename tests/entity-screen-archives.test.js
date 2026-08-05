const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const api = fs.readFileSync("src/api/budget-api.ts", "utf8");
const vendors = fs.readFileSync(
  "src/screens/vendors-screen/vendors-screen.ts",
  "utf8",
);
const people = fs.readFileSync(
  "src/screens/people-screen/people-screen.ts",
  "utf8",
);
const accounts = fs.readFileSync(
  "src/screens/investment-accounts-screen/investment-accounts-screen.ts",
  "utf8",
);

test("budget API exposes inclusive vendor and people collections", () => {
  assert.match(api, /listAllVendors\(\): BudgetEntity\[\]/);
  assert.match(api, /listAllPeople\(\): BudgetEntity\[\]/);
  assert.match(api, /function listAllVendors\(\)[\s\S]*readArray\(KEYS\.vendors\)/);
  assert.match(api, /function listAllPeople\(\)[\s\S]*readArray\(KEYS\.assignments\)/);
  assert.match(api, /listVendors[\s\S]*return active\(listAllVendors\(\)\)/);
  assert.match(api, /listPeople[\s\S]*return active\(listAllPeople\(\)\)/);
});

test("vendor and people screens load archives after their initial render", () => {
  [vendors, people].forEach((screen) => {
    assert.match(screen, /this\.#loadUsage\(\);\s*this\.#loadArchivedEntities\(\)/);
    assert.match(screen, /\.listArchivedEntities\(\)/);
    assert.match(screen, /if \(this\.isConnected\) this\.#render\(\)/);
    assert.match(screen, /#includeArchived \|\| [a-z]+\.active !== false/);
  });
  assert.match(vendors, /\.listAllVendors\(\)/);
  assert.match(people, /\.listAllPeople\(\)/);
});

test("investment accounts reuse their inclusive bootstrap collection", () => {
  assert.match(accounts, /#includeArchived = false/);
  assert.match(accounts, /APIs\.investment[\s\S]*\.accounts\(\)/);
  assert.match(accounts, /this\.#includeArchived \|\| account\.active !== false/);
  assert.doesNotMatch(accounts, /listArchivedEntities/);
});
