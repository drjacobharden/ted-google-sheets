const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(
  "src/components/refresh-button/refresh-button.ts",
  "utf8",
);
const indicator = fs.readFileSync(
  "src/components/refresh-indicator/refresh-indicator.ts",
  "utf8",
);
const overlay = fs.readFileSync(
  "src/elements/overlay-manager/overlay-manager.ts",
  "utf8",
);
const splash = fs.readFileSync(
  "src/components/splash-indicator/splash-indicator.ts",
  "utf8",
);

test("refresh button explicitly refreshes the shared bootstrap data", () => {
  assert.match(source, /budgetUI\(\)\?\.initializeData\(\{ refresh: true \}\)/);
  assert.match(source, /target\.closest\("refresh-button"\)/);
});

test("refresh indicator explains an automatic bootstrap retry", () => {
  assert.match(indicator, /"retrying"/);
  assert.match(indicator, /Google didn’t return the data\. Retrying…/);
  assert.match(overlay, /budget:data-refresh-retrying/);
  assert.match(overlay, /state = "retrying"/);
});

test("failed bootstrap indicators expose a working retry action", () => {
  assert.match(indicator, /appController\.initializeData\(\{ refresh: true \}\)/);
  assert.match(splash, /appController\.initializeData\(\{ refresh: true \}\)/);
});
