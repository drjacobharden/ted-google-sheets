import { describe, expect, test } from "bun:test";
import {
  amountForPaymentType,
  transactionEditPresentation,
} from "../src/screens/transaction-drawer-screen/transaction-edit-presentation";

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
const transactionListSource = await Bun.file(
  new URL(
    "../src/screens/transaction-list-screen/transactions.ts",
    import.meta.url,
  ),
).text();

describe("edit-only transaction drawer", () => {
  test("contains only editing controls and permanently rendered metadata", () => {
    expect(drawerTemplate).not.toContain("tabs=");
    expect(drawerTemplate).not.toContain("Batch input");
    expect(drawerTemplate).not.toContain('name="batchEntry"');
    expect(drawerTemplate).toContain('id="transaction-edit-id"');
    expect(drawerTemplate).toContain('id="transaction-created-footnote"');
    expect(drawerTemplate).not.toMatch(/<div class="metadata"[^>]*hidden/);
    expect(drawerTemplate).toContain('name="notes"');
    expect(drawerTemplate).toContain('placeholder="enter note..."');
    expect(drawerTemplate).toContain('min="0.01"');
    expect(drawerTemplate).toContain("<payment-type-select");
    expect(drawerTemplate).not.toContain("<textarea");
  });

  test("derives contextual titles and signed payment types", () => {
    expect(transactionEditPresentation("expense", 12)).toMatchObject({
      title: "Edit Expense",
      paymentType: "Payment",
      paymentTypeKey: "positive",
      paymentTypeOptions: ["Payment", "Refund"],
    });
    expect(transactionEditPresentation("expense", -12).paymentType).toBe(
      "Refund",
    );
    expect(transactionEditPresentation("income", 12)).toMatchObject({
      title: "Edit Income",
      paymentType: "Deposit",
    });
    expect(transactionEditPresentation("income", -12).paymentType).toBe(
      "Refund",
    );
    expect(
      transactionEditPresentation("account", 12, "investment"),
    ).toMatchObject({
      title: "Edit Account Activity",
      paymentType: "Contribution",
    });
    expect(
      transactionEditPresentation("account", -12, "investment").paymentType,
    ).toBe("Withdrawal");
    expect(
      transactionEditPresentation("account", 12, "debt").paymentType,
    ).toBe("Payment");
    expect(
      transactionEditPresentation("account", -12, "debt").paymentType,
    ).toBe("New Borrowing");
    expect(amountForPaymentType(-12, "positive")).toBe(12);
    expect(amountForPaymentType(12, "negative")).toBe(-12);
  });

  test("updates existing transactions without retaining a creation mode", () => {
    expect(drawerSource).toContain("queueTransactionUpdate");
    expect(drawerSource).toContain("Math.abs(signedAmount).toFixed(2)");
    expect(drawerSource).toContain("paymentTypeElement.signedAmount(");
    expect(drawerSource).not.toContain("openCreate");
    expect(drawerSource).not.toContain("resetForBatchEntry");
    expect(drawerSource).not.toMatch(/APIs\.budget\.queueTransaction\(/);
  });

  test("right-aligns every detail dropdown instead of inheriting centered selectors", () => {
    expect(drawerSource).toContain(
      '.querySelectorAll(".transaction-detail-list dropdown-menu")',
    );
    expect(drawerSource).toContain('removeAttribute("align-center")');
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

  test("opens ordinary and account-linked ledger rows in the same edit drawer", () => {
    const selectionHandler = transactionListSource.slice(
      transactionListSource.indexOf("#openSelectedRow"),
      transactionListSource.indexOf("if (!customElements.get"),
    );
    expect(selectionHandler).toContain(
      'router.updateParams({ drawer: "edit", transactionId: transaction.id });',
    );
    expect(selectionHandler).not.toContain("investment-ledger-entry");
  });
});
