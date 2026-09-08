import { describe, expect, test } from "bun:test";

const template = await Bun.file(
  new URL(
    "../src/screens/new-transaction-screen/template.html",
    import.meta.url,
  ),
).text();
const source = await Bun.file(
  new URL(
    "../src/screens/new-transaction-screen/new-transaction-screen.ts",
    import.meta.url,
  ),
).text();
const styles = await Bun.file(
  new URL(
    "../src/screens/new-transaction-screen/style.css",
    import.meta.url,
  ),
).text();

describe("full-screen transaction entry presentation", () => {
  test("uses a hero amount followed by inline metadata controls", () => {
    expect(template).toContain('class="new-transaction-page__amount-editor"');
    expect(template).toContain('class="new-transaction-page__detail-list"');
    expect(template).toContain('id="new-transaction-payment-type"');
    expect(template).not.toContain("new-transaction-page__field-grid");
  });

  test("accepts a positive magnitude and delegates its stored sign to payment type", () => {
    expect(template).toContain('min="0.01"');
    expect(template).toContain("<payment-type-select");
    expect(source).toContain('this.#amountInput.min = "0.01"');
    expect(source).toContain("this.#paymentType.signedAmount(");
  });

  test("keeps the inline calendar on wide layouts and compact picker below it", () => {
    expect(template).toContain('variant="inline"');
    expect(template).toContain('alignment="right"');
    expect(styles).toContain(".new-transaction-page__date--inline");
    expect(styles).toContain(
      "> .new-transaction-page__date--compact {\n      display: block;",
    );
  });

  test("lets metadata tracks shrink with both the split and compact layouts", () => {
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(styles).toContain(
      "grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr)",
    );
    expect(styles).toContain(
      "grid-template-columns: minmax(0, 0.65fr) minmax(0, 1.35fr)",
    );
    expect(styles).toMatch(
      /#new-transaction-kind\s*\{[\s\S]*?min-width: 0/,
    );
  });
});
