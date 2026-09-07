import { describe, expect, test } from "bun:test";

const template = await Bun.file(
  new URL("../src/components/onboarding/template.html", import.meta.url),
).text();
const source = await Bun.file(
  new URL("../src/components/onboarding/onboarding.ts", import.meta.url),
).text();
const styles = await Bun.file(
  new URL("../src/components/onboarding/style.css", import.meta.url),
).text();

describe("editorial onboarding", () => {
  test("opts the modal into the shared editorial grammar", () => {
    expect(template).toContain("onboarding-overlay editorial-theme");
    expect(template).toContain('class="type-eyebrow"');
    expect(template).toContain('class="type-title"');
    expect(styles).toContain("border-radius: 0");
    expect(styles).toContain("var(--color-surface-raised)");
    expect(styles).not.toContain("var(--border-strong)");
    expect(styles).not.toContain("var(--accent-soft)");
  });

  test("uses the shared checkbox and semantic confirmation event", () => {
    expect(source).toContain("<check-box data-onboarding-confirm");
    expect(source).toContain('addEventListener("checkbox-selection"');
    expect(source).toContain("checkbox.isOn");
    expect(source).not.toContain('input type="checkbox"');
  });

  test("keeps progress legible without pill-shaped bars", () => {
    expect(styles).toContain("counter(list-item)");
    expect(styles).toContain("var(--rule-strong) solid var(--color-accent-strong)");
    expect(styles).not.toContain("999px");
  });
});
