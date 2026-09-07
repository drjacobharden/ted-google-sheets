import { describe, expect, test } from "bun:test";
import { sortInsightsWithDiversity } from "../src/utilities/insight-ordering";

describe("insight ordering", () => {
  test("spaces repeated detector families without removing strong insights", () => {
    const ordered = sortInsightsWithDiversity(
      [
        { id: "vendor:yoy:one", group: "vendor", score: 1 },
        { id: "vendor:yoy:two", group: "vendor", score: 0.99 },
        { id: "vendor:yoy:three", group: "vendor", score: 0.98 },
        { id: "category:largest:food", group: "category", score: 0.97 },
        { id: "person:total:alex", group: "person", score: 0.96 },
      ],
      { category: 1, person: 2, vendor: 3 },
    );

    expect(ordered).toHaveLength(5);
    expect(ordered[0]?.id).toBe("vendor:yoy:one");
    expect(ordered.slice(0, 3).map((item) => item.id)).toEqual([
      "vendor:yoy:one",
      "category:largest:food",
      "person:total:alex",
    ]);
  });
});

