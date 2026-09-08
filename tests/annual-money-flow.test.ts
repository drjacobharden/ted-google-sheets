import { describe, expect, test } from "bun:test";
import type { Account } from "../src/api/account-api";
import type { BudgetEntity, BudgetTransaction } from "../src/api/budget-api";
import { buildAnnualMoneyFlow } from "../src/utilities/annual-money-flow";

const categories: BudgetEntity[] = [
  { id: "pay", name: "Paychecks", type: "income", active: true, createdAt: "", updatedAt: "" },
  { id: "interest", name: "Interest", type: "income", active: true, createdAt: "", updatedAt: "" },
  { id: "food", name: "Food", type: "expense", active: true, createdAt: "", updatedAt: "" },
  { id: "home", name: "Housing", type: "expense", active: true, createdAt: "", updatedAt: "" },
];

const accounts: Account[] = [
  { id: "brokerage", name: "Brokerage", type: "investment", assignmentId: "shared", active: true, source: "manual", createdAt: "", updatedAt: "" },
  { id: "retired-ira", name: "Archived IRA", type: "investment", assignmentId: "shared", active: false, source: "manual", createdAt: "", updatedAt: "" },
  { id: "mortgage", name: "Mortgage", type: "debt", assignmentId: "shared", categoryId: "home", active: true, source: "manual", createdAt: "", updatedAt: "" },
];

function row(
  id: string,
  amount: number,
  values: Partial<BudgetTransaction> = {},
): BudgetTransaction {
  return {
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
  };
}

function nodeValue(flow: ReturnType<typeof buildAnnualMoneyFlow>, id: string): number {
  return flow.nodes.find((node) => node.id === id)?.value ?? 0;
}

function assertBalanced(flow: ReturnType<typeof buildAnnualMoneyFlow>): void {
  for (const node of flow.nodes) {
    const incoming = flow.links
      .filter((link) => link.target === node.id)
      .reduce((total, link) => total + (link.displayValue ?? link.value), 0);
    const outgoing = flow.links
      .filter((link) => link.source === node.id)
      .reduce((total, link) => total + (link.displayValue ?? link.value), 0);
    if (incoming && outgoing) expect(incoming).toBeCloseTo(outgoing, 8);
    expect(node.displayValue ?? node.value).toBeCloseTo(Math.max(incoming, outgoing), 8);
  }
}

describe("annual money flow", () => {
  test("groups annual income and splits saved money from category spending", () => {
    const flow = buildAnnualMoneyFlow([
      row("salary", 5_000, { type: "income", categoryId: "pay" }),
      row("interest", 100, { type: "income", categoryId: "interest" }),
      row("food", 900),
      row("refund", -100),
      row("housing", 1_000, { categoryId: "home" }),
      row("invest", 750, { type: "", accountId: "brokerage", categoryId: "" }),
      row("payment", 500, { type: "", accountId: "mortgage", categoryId: "" }),
      row("prior-year", 9_999, { type: "income", categoryId: "pay", date: "2025-01-01" }),
    ], accounts, categories, 2026);

    expect(flow.totalInflows).toBe(5_100);
    expect(nodeValue(flow, "source:income:pay")).toBe(5_000);
    expect(nodeValue(flow, "expense:food")).toBe(800);
    expect(nodeValue(flow, "spendable-cash")).toBe(5_100);
    expect(nodeValue(flow, "savings")).toBe(2_800);
    expect(nodeValue(flow, "total-savings")).toBe(2_800);
    expect(flow.nodes.find((node) => node.id === "total-savings")?.name).toBe("Total savings");
    expect(nodeValue(flow, "spend")).toBe(2_300);
    expect(nodeValue(flow, "expense:home")).toBe(1_500);
    expect(nodeValue(flow, "debt:mortgage")).toBe(500);
    expect(nodeValue(flow, "expense-other:home")).toBe(1_000);
    expect(nodeValue(flow, "investment:brokerage")).toBe(750);
    expect(nodeValue(flow, "cash")).toBe(2_050);
    expect(flow.priorCash).toBe(0);
    expect(flow.nodes.some((node) => node.id === "debt-payments")).toBe(false);
    expect(flow.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "spend", target: "expense:home", value: 1_500 }),
      expect.objectContaining({ source: "expense:home", target: "debt:mortgage", value: 500 }),
      expect.objectContaining({ source: "expense:home", target: "expense-other:home", value: 1_000 }),
    ]));
    assertBalanced(flow);
  });

  test("keeps the dominant saved path first within every top-spine stage", () => {
    const flow = buildAnnualMoneyFlow([
      row("salary", 5_000, { type: "income", categoryId: "pay" }),
      row("interest", 100, { type: "income", categoryId: "interest" }),
      row("food", 1_000),
      row("invest", 2_000, { type: "", accountId: "brokerage", categoryId: "" }),
    ], accounts, categories, 2026);

    expect(flow.nodes.filter((node) => node.stage === 0).map((node) => node.name)).toEqual([
      "Paychecks",
      "Interest",
    ]);
    expect(flow.nodes.filter((node) => node.stage === 2).map((node) => node.id)).toEqual([
      "savings",
      "spend",
    ]);
    expect(flow.nodes.filter((node) => node.stage === 3).map((node) => node.id)).toEqual([
      "total-savings",
      "expense:food",
    ]);
  });

  test("keeps true income above a larger supplemental funding source", () => {
    const flow = buildAnnualMoneyFlow([
      row("salary", 100, { type: "income", categoryId: "pay" }),
      row("large-withdrawal", -1_000, { type: "", accountId: "brokerage", categoryId: "" }),
    ], accounts, categories, 2026);

    expect(flow.nodes.filter((node) => node.stage === 0).map((node) => node.id)).toEqual([
      "source:income:pay",
      "source:withdrawal:brokerage",
    ]);
  });

  test("nets account contributions and preserves inactive referenced accounts", () => {
    const flow = buildAnnualMoneyFlow([
      row("salary", 2_000, { type: "income", categoryId: "pay" }),
      row("ira-in", 500, { type: "", accountId: "retired-ira", categoryId: "" }),
      row("ira-out", -125, { type: "", accountId: "retired-ira", categoryId: "" }),
    ], accounts, categories, 2026);

    expect(nodeValue(flow, "investment:retired-ira")).toBe(375);
    expect(flow.nodes.find((node) => node.id === "investment:retired-ira")?.name).toBe("Archived IRA");
    expect(nodeValue(flow, "cash")).toBe(1_625);
    assertBalanced(flow);
  });

  test("uses stable fallback labels when referenced names are missing", () => {
    const unnamedAccounts: Account[] = [
      { ...accounts[0], id: "unnamed-investment", name: "" },
    ];
    const flow = buildAnnualMoneyFlow([
      row("income", 200, { type: "income", categoryId: "missing", category: "" }),
      row("investment", 50, { type: "", accountId: "unnamed-investment", account: "", categoryId: "" }),
    ], unnamedAccounts, [], 2026);

    expect(flow.nodes.find((node) => node.id === "source:income:missing")?.name).toBe("Income");
    expect(flow.nodes.find((node) => node.id === "investment:unnamed-investment")?.name).toBe("Unknown investment account");
    assertBalanced(flow);
  });

  test("turns net refunds, withdrawals, and borrowing into funding sources", () => {
    const flow = buildAnnualMoneyFlow([
      row("refund", -80),
      row("withdrawal", -300, { type: "", accountId: "brokerage", categoryId: "" }),
      row("borrowing", -200, { type: "", accountId: "mortgage", categoryId: "" }),
      row("spend", 400, { categoryId: "home" }),
    ], accounts, categories, 2026);

    expect(nodeValue(flow, "source:refund:food")).toBe(80);
    expect(nodeValue(flow, "source:withdrawal:brokerage")).toBe(300);
    expect(nodeValue(flow, "source:borrowing:mortgage")).toBe(200);
    expect(nodeValue(flow, "cash")).toBe(180);
    expect(flow.priorCash).toBe(0);
    assertBalanced(flow);
  });

  test("shows overspending without inventing prior cash", () => {
    const flow = buildAnnualMoneyFlow([
      row("income-reversal", -100, { type: "income", categoryId: "interest" }),
      row("food", 500),
    ], accounts, categories, 2026);

    expect(nodeValue(flow, "income-reversal:interest")).toBe(100);
    expect(nodeValue(flow, "source:prior-cash:prior-cash")).toBe(0);
    expect(flow.priorCash).toBe(0);
    expect(nodeValue(flow, "spendable-cash")).toBe(0);
    expect(nodeValue(flow, "spend")).toBe(600);
    expect(nodeValue(flow, "cash")).toBe(0);
    assertBalanced(flow);
  });

  test("grosses up deduction-funded uses and nests debt beneath its expense category", () => {
    const flow = buildAnnualMoneyFlow([
      row("salary", 1_000, { type: "income", categoryId: "pay" }),
      row("health", 200, { source: "deduction" }),
      row("401k", 300, { type: "", accountId: "brokerage", categoryId: "", source: "deduction" }),
      row("loan", 150, { type: "", accountId: "mortgage", categoryId: "", source: "deduction" }),
    ], accounts, categories, 2026);

    expect(flow.totalInflows).toBe(1_350);
    expect(nodeValue(flow, "source:income:pay")).toBe(1_000);
    expect(nodeValue(flow, "source:expense-deduction:expense-deductions")).toBe(350);
    expect(nodeValue(flow, "source:investment-deduction:investment-deductions")).toBe(300);
    expect(flow.nodes.filter((node) => node.stage === 0).map((node) => node.id)).toEqual([
      "source:investment-deduction:investment-deductions",
      "source:expense-deduction:expense-deductions",
      "source:income:pay",
    ]);
    expect(flow.nodes.find((node) => node.id === "source:investment-deduction:investment-deductions")?.palette).toBe("savings");
    expect(flow.nodes.find((node) => node.id === "source:expense-deduction:expense-deductions")?.palette).toBe("income");
    expect(nodeValue(flow, "spendable-cash")).toBe(1_350);
    expect(flow.nodes.some((node) => node.id === "total-income")).toBe(false);
    expect(nodeValue(flow, "spend")).toBe(350);
    expect(nodeValue(flow, "expense:food")).toBe(200);
    expect(nodeValue(flow, "expense:home")).toBe(150);
    expect(nodeValue(flow, "debt:mortgage")).toBe(150);
    expect(nodeValue(flow, "expense-other:home")).toBe(0);
    expect(nodeValue(flow, "total-savings")).toBe(1_300);
    expect(nodeValue(flow, "cash")).toBe(1_000);
    expect(flow.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "source:expense-deduction:expense-deductions", target: "spendable-cash", value: 350, palette: "income" }),
      expect.objectContaining({ source: "source:investment-deduction:investment-deductions", target: "total-savings", value: 300, palette: "savings" }),
    ]));
    assertBalanced(flow);
  });

  test("uses prior cash only for investment needs beyond spendable savings", () => {
    const flow = buildAnnualMoneyFlow([
      row("salary", 1_000, { type: "income", categoryId: "pay" }),
      row("spend", 700),
      row("manual-investment", 500, { type: "", accountId: "brokerage", categoryId: "" }),
    ], accounts, categories, 2026);

    expect(nodeValue(flow, "spendable-cash")).toBe(1_000);
    expect(nodeValue(flow, "spend")).toBe(700);
    expect(nodeValue(flow, "savings")).toBe(300);
    expect(flow.priorCash).toBe(200);
    expect(nodeValue(flow, "total-savings")).toBe(500);
    expect(flow.nodes.find((node) => node.id === "total-savings")?.name).toBe("Total investments");
    expect(nodeValue(flow, "cash")).toBe(0);
    expect(flow.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "source:prior-cash:prior-cash", target: "total-savings", value: 200 }),
      expect.objectContaining({ source: "savings", target: "total-savings", value: 300 }),
    ]));
    expect(flow.links.some((link) => link.source === "source:prior-cash:prior-cash" && link.target === "total-savings")).toBe(true);
  });

  test("keeps overspending visible while prior cash funds manual investments", () => {
    const flow = buildAnnualMoneyFlow([
      row("salary", 500, { type: "income", categoryId: "pay" }),
      row("overspend", 800),
      row("manual-investment", 300, { type: "", accountId: "brokerage", categoryId: "" }),
    ], accounts, categories, 2026);

    expect(nodeValue(flow, "spendable-cash")).toBe(500);
    expect(nodeValue(flow, "spend")).toBe(800);
    expect(nodeValue(flow, "savings")).toBe(0);
    expect(flow.priorCash).toBe(300);
    expect(nodeValue(flow, "total-savings")).toBe(300);
    expect(flow.nodes.find((node) => node.id === "total-savings")?.name).toBe("Total investments");
    expect(nodeValue(flow, "investment:brokerage")).toBe(300);
    expect(nodeValue(flow, "cash")).toBe(0);
    expect(flow.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "spendable-cash", target: "spend", value: 800, displayValue: 500 }),
      expect.objectContaining({ source: "source:prior-cash:prior-cash", target: "total-savings", value: 300 }),
    ]));
    expect(flow.nodes.find((node) => node.id === "spend")?.displayValue).toBe(500);
    expect(flow.nodes.find((node) => node.id === "expense:food")?.displayValue).toBe(500);
    expect(flow.nodes.filter((node) => node.stage === 0).map((node) => node.id)[0]).toBe("source:prior-cash:prior-cash");
    assertBalanced(flow);
  });

  test("ignores invalid dates, invalid amounts, and zero-value groups deterministically", () => {
    const first = buildAnnualMoneyFlow([
      row("bad-date", 100, { type: "income", date: "2026-13-01" }),
      row("bad-amount", Number.NaN, { type: "income", categoryId: "pay" }),
      row("income", 100, { type: "income", categoryId: "pay" }),
      row("expense", 100),
      row("refund", -100),
    ], accounts, categories, 2026);
    const second = buildAnnualMoneyFlow([
      row("refund", -100),
      row("expense", 100),
      row("income", 100, { type: "income", categoryId: "pay" }),
    ], accounts, categories, 2026);

    expect(first.nodes).toEqual(second.nodes);
    expect(first.links).toEqual(second.links);
    expect(first.nodes.some((node) => node.id === "expense:food")).toBe(false);
    expect(nodeValue(first, "cash")).toBe(100);
    assertBalanced(first);
  });
});
