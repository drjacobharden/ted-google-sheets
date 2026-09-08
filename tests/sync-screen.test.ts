import { describe, expect, test } from "bun:test";

const source = await Bun.file(
  new URL("../src/screens/sync-screen/sync-screen.ts", import.meta.url),
).text();

describe("account sync-center actions", () => {
  test("routes unified account outbox items through account retry and discard", () => {
    expect(source).toContain('item.source === "account" || item.source === "accountMonth" || item.source === "accountBalance"');
    expect(source).toContain("APIs.accounts.retry(item.source, item.id)");
    expect(source).toContain("APIs.accounts.discard(item.source, item.id)");
  });

  test("renders account-month conflicts with an account-specific title and detail", () => {
    expect(source).toContain('item.source === "accountMonth"');
    expect(source).toContain('return account?.type === "debt" ? "Debt monthly update" : account ? "Investment monthly update" : "Account monthly update"');
    expect(source).toContain('this.#recordString(item, "accountName") || this.#accountForSyncItem(item)?.name');
  });
});
