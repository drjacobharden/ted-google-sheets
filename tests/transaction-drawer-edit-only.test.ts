import { describe, expect, test } from "bun:test";

const drawerSource = await Bun.file(
  new URL(
    "../src/screens/transaction-drawer-screen/transaction-drawer-screen.ts",
    import.meta.url,
  ),
).text();
const drawerTemplate = await Bun.file(
  new URL(
    "../src/screens/transaction-drawer-screen/template.html",
    import.meta.url,
  ),
).text();
const budgetingHeaderSource = await Bun.file(
  new URL("../src/screens/budgeting/budgeting-shell.ts", import.meta.url),
).text();
const routerTypes = await Bun.file(
  new URL("../src/router/types.ts", import.meta.url),
).text();

describe("edit-only transaction drawer", () => {
  test("contains only editing controls and permanently rendered metadata", () => {
    expect(drawerTemplate).not.toContain("Batch input");
    expect(drawerTemplate).not.toContain('name="batchEntry"');
    expect(drawerTemplate).toContain('id="transaction-edit-id"');
    expect(drawerTemplate).toContain('id="transaction-created-footnote"');
    expect(drawerTemplate).not.toMatch(/<div class="metadata"[^>]*hidden/);
  });

  test("updates existing transactions without retaining a creation mode", () => {
    expect(drawerSource).toContain("queueTransactionUpdate");
    expect(drawerSource).not.toContain("openCreate");
    expect(drawerSource).not.toContain("resetForBatchEntry");
    expect(drawerSource).not.toMatch(/APIs\.budget\.queueTransaction\(/);
  });

  test("routes every create action to the full-screen entry screen", () => {
    expect(budgetingHeaderSource).toContain(
      'if (action === "new-transaction") {\n      router.navigate("new-transaction");',
    );
    expect(drawerSource).toContain(
      'if (action === "new") {\n      router.navigate("new-transaction");',
    );
    expect(routerTypes).not.toContain('| "new"');
  });
});
