import { describe, expect, test } from "bun:test";

const segmentedSource = await Bun.file(
  new URL(
    "../src/components/segmented-control/segmented-control.ts",
    import.meta.url,
  ),
).text();
const checkboxSource = await Bun.file(
  new URL("../src/components/checkbox/checkbox.ts", import.meta.url),
).text();
const checkboxStyles = await Bun.file(
  new URL("../src/components/checkbox/style.css", import.meta.url),
).text();

describe("shared progressive importer controls", () => {
  test("segmented items expose true disabled buttons and skip them in keyboard navigation", () => {
    expect(segmentedSource).toContain("disabled?: boolean");
    expect(segmentedSource).toContain(
      "button.disabled = item.disabled === true",
    );
    expect(segmentedSource).toContain(
      "this.#buttons().filter((button) => !button.disabled)",
    );
    expect(segmentedSource).toContain(
      'button.setAttribute("aria-disabled", "true")',
    );
  });

  test("checkbox keeps its contract while adding keyboard and ARIA behavior", () => {
    expect(checkboxSource).toContain(
      'static observedAttributes = ["active", "disabled"]',
    );
    expect(checkboxSource).toContain('this.setAttribute("role", "checkbox")');
    expect(checkboxSource).toContain('this.setAttribute("aria-checked"');
    expect(checkboxSource).toContain('keyboardEvent.key !== " "');
    expect(checkboxSource).toContain("disconnectedCallback()");
    expect(checkboxSource).toContain('new CustomEvent("checkbox-selection"');
    expect(checkboxStyles).toContain("border-radius: 0");
    expect(checkboxStyles).toContain("check-box:focus-visible");
  });
});
