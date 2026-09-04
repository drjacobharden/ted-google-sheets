import { describe, expect, test } from "bun:test";

const template = await Bun.file(
  new URL("../src/screens/import-screen/template.html", import.meta.url),
).text();
const source = await Bun.file(
  new URL("../src/screens/import-screen/import-screen.ts", import.meta.url),
).text();
const styles = await Bun.file(
  new URL("../src/screens/import-screen/style.css", import.meta.url),
).text();

describe("segmented vendor-group importer", () => {
  test("uses four single-pane section tabs with inaccessible future steps", () => {
    expect(template).toContain('id="import-workflow-stepper"');
    expect(template).toContain('variant="section-tabs"');
    expect(template.match(/data-workflow-step=/g)?.length).toBe(4);
    expect(source).toContain(
      'const WORKFLOW_STEPS = ["upload", "mapping", "review", "summary"]',
    );
    expect(source).toContain("disabled: index > state.maxWorkflowStep");
  });

  test("uses domain-neutral profiles while preserving legacy remapping", () => {
    expect(template).toContain('name="target" type="hidden" value="transaction"');
    expect(template).not.toContain("Investment months");
    expect(source).toContain(
      "return state.profiles;",
    );
    expect(source).toContain("profileMappingIsUsable(state.profile)");
    expect(source).toContain('showWorkflowStep("review", 2)');
  });

  test("renders searchable bulk and row controls with a weighted fixed footer", () => {
    expect(source).toContain('data-group-field="payeeKey"');
    expect(source).toContain("Vendor / Account");
    expect(source).toContain("accountId: row.accountId ?? \"\"");
    expect(source).toContain('data-group-field="personId"');
    expect(source).toContain("vendorGroupProgress(state.vendorGroups)");
    expect(source).toContain("groupHasBlockingErrors(group)");
    expect(styles).toMatch(
      /\.import-group-footer\s*\{[\s\S]*?position: fixed/,
    );
    expect(styles).toContain("border-radius: 0");
    expect(styles).toContain("box-shadow: none");
  });

  test("stacks collapsed review rows beneath a check, date, and amount header", () => {
    expect(source).toContain('<td class="payee-column">');
    expect(source).toContain('<td class="category-column">');
    expect(source).toContain('<td class="person-column">');
    expect(styles).toContain('"include date amount"');
    expect(styles).toContain('"payee payee payee"');
    expect(styles).toContain('"description description description"');
    expect(styles).toMatch(
      /@media \(max-width: 620px\)[\s\S]*?\.import-group-table\s*\{[\s\S]*?min-width: 0/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 620px\)[\s\S]*?\.import-group-fields\s*\{[\s\S]*?gap: var\(--space-sm\)/,
    );
  });

  test("keeps remapping destructive only to downstream review edits", () => {
    expect(source).toContain(
      "Changing the column mapping will reset vendor review edits",
    );
    expect(source).toContain("state.completedVendorGroups.clear()");
    expect(source).toContain("state.reviewDirty = false");
  });
});
