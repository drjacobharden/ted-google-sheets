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
const categorySelect = await Bun.file(
  new URL(
    "../src/components/dropdowns/category-select.ts",
    import.meta.url,
  ),
).text();
const entityDrawer = await Bun.file(
  new URL(
    "../src/screens/entity-drawer-screen/entity-drawer-screen.ts",
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

  test("uses Budgeting and Accounts with the importer's combined category selector", () => {
    expect(source).toContain('{ key: "budgeting", title: "Budgeting"');
    expect(source).toContain('{ key: "account", title: "Accounts"');
    expect(source).not.toContain('{ key: "income", title: "Income"');
    expect(template).toContain('<category-select type="all"');
    expect(source).toContain('case "category-selected":');
    expect(source).toContain('isAccount ? "account" : this.#budgetKind');
  });

  test("uses category type for payment labels and hides income source as manual", () => {
    expect(source).toContain("this.#paymentType.kind = kind");
    expect(source).toContain('this.#sourceSelect.value = "manual"');
    expect(source).toContain("this.#sourceSelect.hidden = isIncome || isBalance");
  });

  test("routes a new category request to the type picker with its name prefilled", () => {
    expect(categorySelect).toContain("onAddRequest(name)");
    expect(categorySelect).toMatch(
      /if \(!name\) \{[\s\S]*?this\.#onAddRequest\(""\)/,
    );
    expect(categorySelect.indexOf("onAddRequest(name)")).toBeLessThan(
      categorySelect.indexOf("this.#createOption(name)"),
    );
    expect(source).toContain('drawer: "entity-new"');
    expect(source).toContain('entityKind: "category"');
    expect(source).toContain("entityDraftName: name");
    expect(entityDrawer).toContain("this.#form.elements.name.value = draftName");
    expect(entityDrawer).toContain('new CustomEvent("budget:category-created"');
    expect(source).toContain('case "budget:category-created":');
    expect(source).toContain("this.#categorySelect.select(category.id, true)");
    expect(categorySelect).toContain("select(categoryId, announce = false)");
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
