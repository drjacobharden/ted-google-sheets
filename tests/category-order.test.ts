import { describe, expect, test } from "bun:test";
import {
  compareCategoriesByName,
  compareCategoryOptions,
  sortNeedsReviewLast,
} from "../src/utilities/category-order";

describe("category ordering", () => {
  const categories = [
    { name: "Needs Review", type: "income" },
    { name: "Utilities", type: "expense" },
    { name: "needs review", type: "expense" },
    { name: "Groceries", type: "expense" },
    { name: "Salary", type: "income" },
  ];

  test("keeps Needs Review after regular categories in single-type lists", () => {
    for (const type of ["income", "expense"]) {
      const sorted = categories
        .filter((category) => category.type === type)
        .sort(compareCategoriesByName);

      expect(sorted.at(-1)?.name.toLowerCase()).toBe("needs review");
    }
  });

  test("keeps both Needs Review categories at the end of a combined list", () => {
    const sorted = [...categories].sort(compareCategoryOptions);

    expect(sorted.slice(-2).map((category) => category.name.toLowerCase())).toEqual([
      "needs review",
      "needs review",
    ]);
  });

  test("keeps Needs Review last after the category ledger ranks rows by totals", () => {
    const rankedRows = [
      { name: "Needs Review", total: 900 },
      { name: "Rent", total: 700 },
      { name: "Food", total: 100 },
    ];

    expect(sortNeedsReviewLast(rankedRows).map((row) => row.name)).toEqual([
      "Rent",
      "Food",
      "Needs Review",
    ]);
  });
});
