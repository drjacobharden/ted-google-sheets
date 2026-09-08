import { describe, expect, test } from "bun:test";
import {
  amountForPaymentType,
  paymentTypeKeyForAmount,
  paymentTypeOptions,
} from "../src/components/dropdowns/payment-type";

const componentSource = await Bun.file(
  new URL(
    "../src/components/dropdowns/payment-type-select.ts",
    import.meta.url,
  ),
).text();
const dropdownStyles = await Bun.file(
  new URL("../src/components/dropdown-menu/style.css", import.meta.url),
).text();

describe("shared payment type select", () => {
  test("provides contextual positive and negative labels", () => {
    expect(paymentTypeOptions("expense")).toEqual(["Payment", "Refund"]);
    expect(paymentTypeOptions("income")).toEqual(["Deposit", "Refund"]);
    expect(paymentTypeOptions("account", "investment")).toEqual([
      "Contribution",
      "Withdrawal",
      "Balance",
    ]);
    expect(paymentTypeOptions("account", "debt")).toEqual([
      "Payment",
      "New Borrowing",
      "Balance",
    ]);
  });

  test("keeps the visible magnitude positive and derives the stored sign", () => {
    expect(paymentTypeKeyForAmount(-25)).toBe("negative");
    expect(paymentTypeKeyForAmount(25)).toBe("positive");
    expect(amountForPaymentType(-25, "positive")).toBe(25);
    expect(amountForPaymentType(25, "negative")).toBe(-25);
  });

  test("updates its selected value and emits a reusable change event", () => {
    expect(componentSource).toContain('event.type !== "dropdown-selection"');
    expect(componentSource).toContain("this.#setValue(");
    expect(componentSource).toContain('new CustomEvent("payment-type-change"');
  });

  test("limits vendor menus to six option rows", () => {
    expect(dropdownStyles).toContain(
      "dropdown-menu.vendor-select-menu",
    );
    expect(dropdownStyles).toContain("max-height: 228px");
  });
});
