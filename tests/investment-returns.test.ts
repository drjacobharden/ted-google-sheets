import { describe, expect, test } from "bun:test";
import { annualBoundaries, chainLinkedReturn, commonCutoff, dollarReturn, interpolateValue, midpoint, modifiedDietz, monthEnd } from "../src/utilities/investment-returns";

describe("investment returns", () => {
  test("migrated dates use midpoint and real month end", () => {
    expect(midpoint("2024-02")).toBe("2024-02-15");
    expect(monthEnd("2024-02")).toBe("2024-02-29");
  });

  test("Modified Dietz weights a mid-period flow", () => {
    const rate = modifiedDietz(
      { date: "2026-01-01", value: 1000 },
      { date: "2026-01-31", value: 1150 },
      [{ date: "2026-01-16", amount: 100 }],
    );
    expect(rate).toBeCloseTo(50 / 1050, 8);
  });

  test("returns unavailable for a nonpositive denominator", () => {
    expect(modifiedDietz({ date: "2026-01-01", value: 0 }, { date: "2026-01-31", value: 5 }, [])).toBeNull();
  });

  test("chain links intervals geometrically", () => {
    const result = chainLinkedReturn([
      { date: "2025-12-31", value: 100 },
      { date: "2026-01-31", value: 110 },
      { date: "2026-02-28", value: 121, interpolated: true },
    ], []);
    expect(result.rate).toBeCloseTo(0.21, 8);
    expect(result.estimated).toBe(true);
  });

  test("interpolates only between observations", () => {
    const values = [{ date: "2026-01-01", value: 100 }, { date: "2026-01-11", value: 200 }];
    expect(interpolateValue(values, "2026-01-06")?.value).toBe(150);
    expect(interpolateValue(values, "2025-12-31")).toBeNull();
    expect(interpolateValue(values, "2026-01-12")).toBeNull();
  });

  test("dollar bridge and cutoff remain exact", () => {
    expect(dollarReturn(1000, 1300, [{ date: "2026-06-01", amount: 200 }])).toBe(100);
    expect(commonCutoff(["2026-08-20", "2026-08-12", "2026-08-19"])).toBe("2026-08-12");
    expect(annualBoundaries(2024, "2024-03-15")).toEqual(["2023-12-31", "2024-01-31", "2024-02-29", "2024-03-15"]);
  });
});
