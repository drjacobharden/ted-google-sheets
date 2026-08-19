import { describe, expect, test } from "bun:test";
import { buildCurrencyAxisScale } from "../src/utilities/currency-axis-scale";

describe("currency axis scale", () => {
  test.each([
    [4_900, 1_000, 5_000],
    [6_700, 1_000, 7_000],
    [12_000, 2_500, 12_500],
    [24_900, 5_000, 25_000],
    [68_000, 10_000, 70_000],
  ])("uses a clean interval above a peak of %d", (peak, interval, maximum) => {
    const scale = buildCurrencyAxisScale(peak);
    expect(scale.interval).toBe(interval);
    expect(scale.maximum).toBe(maximum);
    expect(scale.maximum).toBeGreaterThan(peak);
    expect(scale.ticks.at(-1)).toBe(maximum);
  });

  test("places the top tick above an exact clean multiple", () => {
    expect(buildCurrencyAxisScale(5_000)).toEqual({
      interval: 1_000,
      maximum: 6_000,
      ticks: [0, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000],
    });
  });

  test("returns a safe zero scale when no positive values exist", () => {
    expect(buildCurrencyAxisScale(0)).toEqual({
      interval: 1,
      maximum: 1,
      ticks: [0, 1],
    });
  });
});
