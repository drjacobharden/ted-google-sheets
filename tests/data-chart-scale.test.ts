import { describe, expect, test } from "bun:test";
import { buildDataChartScale } from "../src/utilities/data-chart-scale";

describe("data chart currency scale", () => {
  test("uses 25k intervals for values through 200k", () => {
    const scale = buildDataChartScale([0, 105_000]);
    expect(scale.max).toBe(125_000);
    expect(scale.ticks).toEqual([0, 25_000, 50_000, 75_000, 100_000, 125_000]);
  });

  test("uses wider natural intervals above 200k", () => {
    const scale = buildDataChartScale([0, 205_000]);
    expect(scale.ticks).toEqual([0, 100_000, 200_000, 300_000]);
  });
});
