import { describe, expect, test } from "bun:test";

const screenTemplate = await Bun.file(
  new URL("../src/screens/settings-screen/template.html", import.meta.url),
).text();
const screenStyles = await Bun.file(
  new URL("../src/screens/settings-screen/style.css", import.meta.url),
).text();
const userForm = await Bun.file(
  new URL("../src/components/user-form/user-form.ts", import.meta.url),
).text();
const urlForm = await Bun.file(
  new URL("../src/components/url-form/url-form.ts", import.meta.url),
).text();

describe("editorial settings screen", () => {
  test("contains only the name and Google Sheet settings sections", () => {
    expect(screenTemplate.match(/<section/g)?.length).toBe(2);
    expect(screenTemplate).toContain("<user-form></user-form>");
    expect(screenTemplate).toContain("<url-form></url-form>");
    expect(screenTemplate).not.toContain("Apps Script contract");
    expect(userForm).not.toContain("user-switcher");
    expect(userForm).not.toContain("Add another user");
    expect(urlForm).not.toContain("Test connection");
    expect(urlForm).not.toContain("Copy connection URL");
  });

  test("uses the shared editorial grammar for layout and controls", () => {
    expect(screenTemplate).toContain(
      'class="settings-screen__page editorial-theme"',
    );
    expect(screenTemplate).toContain('class="type-eyebrow"');
    expect(screenTemplate).toContain('class="type-section-title"');
    expect(screenStyles).toContain("var(--rule-thin)");
    expect(screenStyles).toContain("var(--color-rule-strong)");
    expect(screenStyles).toContain("border-radius: 0");
    expect(screenStyles).toContain("box-shadow: none");
  });
});
