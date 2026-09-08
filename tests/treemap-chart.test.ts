import { describe, expect, test } from "bun:test";
import type { Account } from "../src/api/account-api";
import type { BudgetEntity, BudgetTransaction } from "../src/api/budget-api";
import { treemapGrowthTone } from "../src/components/chart-treemap/treemap-colors";
import { formatTreemapCompactCurrency, formatTreemapPercentage } from "../src/components/chart-treemap/formatters";
import { createTreemapLayout } from "../src/components/chart-treemap/treemap-layout";
import { layoutMoneyBlocks } from "../src/components/money-block-chart/money-block-layout";
import {
  calculateBubbleRadius,
  calculateMean,
  generateLinearTicks,
  mapLinearValue,
} from "../src/components/vendor-scatter-chart/category-scatter-layout";
import {
  buildAnnualCategoryScatter,
  buildAnnualCategorySpending,
} from "../src/utilities/annual-category-spending";
import {
  buildAnnualVendorSpending,
  collapseVendorSpending,
  splitVendorSpendingForPie,
} from "../src/utilities/annual-vendor-spending";
import { buildAnnualSpendingBlocks } from "../src/utilities/annual-spending-blocks";
import type { AnnualMoneyFlow } from "../src/utilities/annual-money-flow";

const moneyFlowFixture = (investmentValues: number[]): AnnualMoneyFlow => ({
  year: 2026,
  totalInflows: 1_000,
  priorCash: 0,
  hasData: true,
  links: [],
  nodes: [
    { id: "source:income:pay", name: "Pay", value: 1_000, stage: 0, palette: "income", kind: "source" },
    { id: "category:food", name: "Food", value: 600, stage: 3, palette: "expense", kind: "category" },
    ...investmentValues.map((value, index) => ({
      id: `investment:${index}`,
      name: `Investment ${index + 1}`,
      value,
      stage: 4 as const,
      palette: "savings" as const,
      kind: "account" as const,
    })),
  ],
});

test("builds proportional income, spending, and saved-income blocks", () => {
  const blocks = buildAnnualSpendingBlocks(moneyFlowFixture([500, 300]));

  expect(blocks).toMatchObject({ income: 1_000, spent: 600, saved: 400 });
  expect(blocks.savedBlocks.map((block) => block.amount)).toEqual([250, 150]);
  expect(blocks.savedBlocks.every((block) => block.actualContribution !== undefined)).toBe(true);
  expect(blocks.savedBlocks.some((block) => block.isCash)).toBe(false);
});

test("counts paycheck deductions in gross income and savings allocation", () => {
  const flow = moneyFlowFixture([]);
  flow.nodes.push(
    { id: "source:expense-deduction:health", name: "Health deduction", value: 200, stage: 0, palette: "income", kind: "source" },
    { id: "source:investment-deduction:401k", name: "401(k) deduction", value: 300, stage: 0, palette: "savings", kind: "source" },
    { id: "investment:401k", name: "401(k)", value: 300, stage: 4, palette: "savings", kind: "account" },
  );

  const blocks = buildAnnualSpendingBlocks(flow);

  expect(blocks.income).toBe(1_500);
  expect(blocks.incomeBlocks.map((block) => block.label)).toEqual([
    "Pay",
    "Health deduction",
    "401(k) deduction",
  ]);
  expect(blocks.saved).toBe(900);
  expect(blocks.savedBlocks.find((block) => block.label === "401(k)")).toMatchObject({
    amount: 300,
    actualContribution: 300,
  });
});

test("adds the uninvested saved-income remainder as cash", () => {
  const blocks = buildAnnualSpendingBlocks(moneyFlowFixture([200]));

  expect(blocks.savedBlocks.map((block) => [block.label, block.amount])).toEqual([
    ["Investment 1", 200],
    ["Cash", 200],
  ]);
  expect(blocks.savedBlocks.at(-1)?.isCash).toBe(true);
});

test("keeps money-block geometry proportional while leaving visible gaps", () => {
  const blocks = layoutMoneyBlocks([
    { id: "large", label: "Large", amount: 600, section: "spent", percentage: 60 },
    { id: "small", label: "Small", amount: 400, section: "spent", percentage: 40 },
  ], {
    x: 0,
    y: 0,
    maxWidth: 500,
    targetHeight: 180,
    areaScale: 1,
    orientation: "horizontal",
    gap: 8,
  });

  expect(blocks.blocks).toHaveLength(2);
  expect(blocks.blocks[0]?.x).toBe(0);
  expect(blocks.blocks[1]!.x).toBeGreaterThan(blocks.blocks[0]!.x + blocks.blocks[0]!.width);
  expect(blocks.blocks[0]!.width * blocks.blocks[0]!.height).toBeCloseTo(600, 0);
  expect(blocks.blocks[1]!.width * blocks.blocks[1]!.height).toBeCloseTo(400, 0);
});

test("can keep all horizontal blocks on one line with a visible small-source width", () => {
  const blocks = layoutMoneyBlocks([
    { id: "large", label: "Large", amount: 990, section: "spent", percentage: 99 },
    { id: "small", label: "Small", amount: 10, section: "spent", percentage: 1 },
  ], {
    x: 0,
    y: 0,
    maxWidth: 500,
    targetHeight: 100,
    areaScale: 1,
    orientation: "horizontal",
    gap: 8,
    singleRow: true,
  });

  expect(blocks.blocks.every((block) => block.y === 0)).toBe(true);
  expect(blocks.blocks[1]?.width).toBeGreaterThanOrEqual(6);
});

describe("treemap layout", () => {
  test("normalizes duplicate IDs, filters non-positive values, and calculates percentages", () => {
    const nodes = createTreemapLayout([
      { id: "food", label: "Food", amount: 5 },
      { id: "food", label: "Food", amount: 7 },
      { id: "housing", label: "Housing", amount: 8 },
      { id: "zero", label: "Zero", amount: 0 },
      { id: "negative", label: "Negative", amount: -20 },
    ], 800, 400);

    expect(nodes.map((node) => node.id)).toEqual(["food", "housing"]);
    expect(nodes[0]?.amount).toBe(12);
    expect(nodes.reduce((sum, node) => sum + node.percentage, 0)).toBeCloseTo(100);
    nodes.forEach((node) => {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(800.001);
      expect(node.y + node.height).toBeLessThanOrEqual(400.001);
    });
  });

  test("returns no rectangles when dimensions cannot render a chart", () => {
    expect(createTreemapLayout([{ id: "food", label: "Food", amount: 10 }], 0, 300)).toEqual([]);
    expect(createTreemapLayout([{ id: "food", label: "Food", amount: 10 }], 300, 0)).toEqual([]);
    expect(createTreemapLayout([{ id: "food", label: "Food", amount: 0 }], 300, 200)).toEqual([]);
  });

  test("keeps a descending category sequence in compact top-left to bottom-right blocks", () => {
    const nodes = createTreemapLayout([
      { id: "housing", label: "Housing", amount: 24_000 },
      { id: "groceries", label: "Groceries", amount: 12_000 },
      { id: "travel", label: "Travel", amount: 9_000 },
      { id: "utilities", label: "Utilities", amount: 7_000 },
      { id: "other", label: "Other", amount: 4_000 },
    ], 900, 420);

    expect(nodes[0]).toMatchObject({ id: "housing", x: 0, y: 0 });
    expect(nodes.at(-1)?.id).toBe("other");
    expect(nodes.at(-1)!.x).toBeGreaterThan(nodes[0]!.x);
    expect(nodes.at(-1)!.y).toBeGreaterThan(nodes[0]!.y);
    expect(Math.max(...nodes.map((node) => Math.max(
      node.width / node.height,
      node.height / node.width,
    )))).toBeLessThan(3);
  });

  test("keeps geometry based on amount while exposing year-over-year growth", () => {
    const nodes = createTreemapLayout([
      { id: "up", label: "Up", amount: 30, previousAmount: 10 },
      { id: "down", label: "Down", amount: 20, previousAmount: 40 },
    ], 600, 300);

    expect(nodes[0]?.percentage).toBeCloseTo(60);
    expect(nodes[0]?.growthPercentage).toBe(200);
    expect(nodes[1]?.percentage).toBeCloseTo(40);
    expect(nodes[1]?.growthPercentage).toBe(-50);
  });
});

test("maps growth sign and magnitude to ordered color tones", () => {
  expect(treemapGrowthTone(0)).toBe("growth-positive-0");
  expect(treemapGrowthTone(4.9)).toBe("growth-positive-0");
  expect(treemapGrowthTone(5)).toBe("growth-positive-1");
  expect(treemapGrowthTone(14.9)).toBe("growth-positive-1");
  expect(treemapGrowthTone(15)).toBe("growth-positive-2");
  expect(treemapGrowthTone(24.9)).toBe("growth-positive-2");
  expect(treemapGrowthTone(25)).toBe("growth-positive-3");
  expect(treemapGrowthTone(-4.9)).toBe("growth-negative-0");
  expect(treemapGrowthTone(-9)).toBe("growth-negative-1");
  expect(treemapGrowthTone(-60)).toBe("growth-negative-3");
  expect(treemapGrowthTone(null)).toBe("growth-neutral");
});

test("uses linear category scatter means and inset positioning", () => {
  expect(calculateMean([10, 20, 30])).toBe(20);
  expect(calculateMean([42])).toBe(42);
  expect(mapLinearValue(0, 100, 0, 100)).toBe(8);
  expect(mapLinearValue(50, 100, 0, 100)).toBe(50);
  expect(mapLinearValue(100, 100, 0, 100)).toBe(92);
  expect(generateLinearTicks(187)).toEqual([0, 50, 100, 150, 200]);
  expect(mapLinearValue(42, 42, 0, 100, false, true)).toBe(50);
  expect(calculateBubbleRadius(100, 100, 100, 6, 24)).toBe(15);
  expect(calculateBubbleRadius(900, 100, 900, 6, 24)).toBeGreaterThan(
    calculateBubbleRadius(100, 100, 900, 6, 24),
  );
});

describe("annual category spending", () => {
  const categories: BudgetEntity[] = [
    { id: "food", name: "Food", type: "expense", active: true, createdAt: "", updatedAt: "" },
    { id: "home", name: "Housing", type: "expense", active: true, createdAt: "", updatedAt: "" },
  ];

  const row = (id: string, amount: number, values: Partial<BudgetTransaction> = {}): BudgetTransaction => ({
    id,
    createdAt: "",
    createdBy: "user",
    type: "expense",
    amount,
    date: "2026-06-15",
    categoryId: "food",
    source: "manual",
    notes: "",
    ...values,
  });

  test("groups selected-year spending and keeps category labels from reference data", () => {
    const data = buildAnnualCategorySpending([
      row("food-1", 125),
      row("food-2", 75),
      row("home-1", 900, { categoryId: "home" }),
      row("prior-year", 10_000, { date: "2025-06-15" }),
      row("income", 500, { type: "income" }),
    ], [] as Account[], categories, 2026);

    expect(data).toEqual([
      { id: "home", label: "Housing", amount: 900, previousAmount: 0 },
      { id: "food", label: "Food", amount: 200, previousAmount: 10_000 },
    ]);
  });

  test("builds category scatter values from frequency, average, and total spend", () => {
    expect(buildAnnualCategoryScatter([
      row("food-1", 125),
      row("food-2", 75),
      row("home-1", 900, { categoryId: "home" }),
      row("prior-year", 10_000, { date: "2025-06-15" }),
    ], [] as Account[], categories, 2026)).toEqual([
      {
        id: "home",
        label: "Housing",
        transactionCount: 1,
        averageTransaction: 900,
        totalSpend: 900,
      },
      {
        id: "food",
        label: "Food",
        transactionCount: 2,
        averageTransaction: 100,
        totalSpend: 200,
      },
    ]);
  });
});

test("formats treemap labels for full and compact values", () => {
  expect(formatTreemapCompactCurrency(12_413)).toBe("$12.4k");
  expect(formatTreemapCompactCurrency(413)).toBe("$413");
  expect(formatTreemapPercentage(14.25)).toBe("14.3%");
});

test("groups annual spending by vendor with prior-year totals", () => {
  const vendors: BudgetEntity[] = [
    { id: "grocer", name: "Grocer", type: "expense", active: true, createdAt: "", updatedAt: "" },
  ];
  const vendorRow = (id: string, amount: number, values: Partial<BudgetTransaction> = {}): BudgetTransaction => ({
    id,
    createdAt: "",
    createdBy: "user",
    type: "expense",
    amount,
    date: "2026-06-15",
    categoryId: "food",
    vendorId: "",
    vendor: "",
    source: "manual",
    notes: "",
    ...values,
  });
  const data = buildAnnualVendorSpending([
    vendorRow("current-grocer", 125, { vendorId: "grocer", vendor: "Grocer" }),
    vendorRow("prior-grocer", 100, { date: "2025-06-15", vendorId: "grocer", vendor: "Grocer" }),
    vendorRow("current-other", 75, { vendor: "Other" }),
  ], [] as Account[], vendors, 2026);

  expect(data).toEqual([
    { id: "grocer", label: "Grocer", amount: 125, previousAmount: 100 },
    { id: "vendor:other", label: "Other", amount: 75, previousAmount: 0 },
  ]);
});

test("groups the bottom quarter of vendor spend into non-empty amount intervals", () => {
  expect(collapseVendorSpending([
    { id: "top", label: "Top", amount: 60_000, previousAmount: 0 },
    { id: "under-100", label: "Under 100", amount: 100, previousAmount: 0 },
    { id: "under-100-2", label: "Under 100 2", amount: 50, previousAmount: 0 },
    { id: "100-to-500", label: "100 to 500", amount: 500, previousAmount: 0 },
    { id: "500-to-1000", label: "500 to 1000", amount: 1_000, previousAmount: 0 },
    { id: "1000-to-5000", label: "1000 to 5000", amount: 5_000, previousAmount: 0 },
    { id: "5000-to-10000", label: "5000 to 10000", amount: 10_000, previousAmount: 0 },
  ])).toEqual([
    { id: "top", label: "Top", amount: 60_000, previousAmount: 0 },
    {
      id: "vendor-100-or-less",
      label: "2 vendors w/ $100 or less",
      amount: 150,
      chartValue: 100,
      isInterval: true,
      vendorCount: 2,
      previousAmount: 0,
    },
    { id: "vendor-100-to-500", label: "1 vendor w/ $100 - $500", amount: 500, chartValue: 500, isInterval: true, vendorCount: 1, previousAmount: 0 },
    { id: "vendor-500-to-1000", label: "1 vendor w/ $500 - $1000", amount: 1_000, chartValue: 1_000, isInterval: true, vendorCount: 1, previousAmount: 0 },
    { id: "vendor-1000-to-5000", label: "1 vendor w/ $1000 - $5000", amount: 5_000, chartValue: 5_000, isInterval: true, vendorCount: 1, previousAmount: 0 },
    { id: "vendor-5000-to-10000", label: "1 vendor w/ $5000 - $10,000", amount: 10_000, chartValue: 10_000, isInterval: true, vendorCount: 1, previousAmount: 0 },
  ]);
});

test("splits vendors at the top three quarters of annual spend for the pie chart", () => {
  expect(splitVendorSpendingForPie([
    { id: "a", label: "A", amount: 40 },
    { id: "b", label: "B", amount: 30 },
    { id: "c", label: "C", amount: 20 },
    { id: "d", label: "D", amount: 10 },
  ])).toEqual([
    { id: "a", label: "A", amount: 40 },
    { id: "b", label: "B", amount: 30 },
    { id: "c", label: "C", amount: 20 },
    { id: "all-other-vendors", label: "All other vendors", amount: 10, isOther: true },
  ]);
});
