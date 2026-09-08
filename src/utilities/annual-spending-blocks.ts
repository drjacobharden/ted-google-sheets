import type { AnnualMoneyFlow, MoneyFlowNode } from "./annual-money-flow";

export type MoneyBlockSection = "income" | "spent" | "saved";

export interface MoneyBlockDatum {
  id: string;
  label: string;
  amount: number;
  section: MoneyBlockSection;
  percentage: number;
  actualContribution?: number;
  contributionPercentage?: number;
  isCash?: boolean;
}

export interface AnnualSpendingBlocks {
  income: number;
  spent: number;
  saved: number;
  spendRate: number;
  savingsRate: number;
  incomeBlocks: MoneyBlockDatum[];
  spentBlocks: MoneyBlockDatum[];
  savedBlocks: MoneyBlockDatum[];
  hasData: boolean;
}

function total(nodes: ReadonlyArray<MoneyFlowNode>): number {
  return nodes.reduce((sum, node) => sum + Math.max(0, node.value), 0);
}

function percentage(amount: number, basis: number): number {
  return basis > 0 ? (amount / basis) * 100 : 0;
}

function sectionBlocks(
  nodes: ReadonlyArray<MoneyFlowNode>,
  section: MoneyBlockSection,
  basis: number,
): MoneyBlockDatum[] {
  return nodes
    .filter((node) => Number.isFinite(node.value) && node.value > 0)
    .map((node) => ({
      id: node.id,
      label: node.name,
      amount: node.value,
      section,
      percentage: percentage(node.value, basis),
    }));
}

/** Converts the annual money-flow graph into the proportional block-flow view. */
export function buildAnnualSpendingBlocks(
  flow: AnnualMoneyFlow,
): AnnualSpendingBlocks {
  const incomeNodes = flow.nodes.filter(
    (node) =>
      node.stage === 0 &&
      (node.id.startsWith("source:income:") ||
        node.id.startsWith("source:expense-deduction:") ||
        node.id.startsWith("source:investment-deduction:")),
  );
  const spentNodes = flow.nodes.filter(
    (node) => node.stage === 3 && node.palette === "expense",
  );
  const investmentNodes = flow.nodes.filter(
    (node) => node.stage === 4 && node.id.startsWith("investment:"),
  );

  const income = total(incomeNodes);
  const spent = total(spentNodes);
  const saved = Math.max(0, income - spent);
  const totalInvestmentContributions = total(investmentNodes);

  const incomeBlocks = sectionBlocks(incomeNodes, "income", income);
  const spentBlocks = sectionBlocks(spentNodes, "spent", spent);
  const savedBlocks: MoneyBlockDatum[] = [];

  if (saved > 0 && totalInvestmentContributions > 0) {
    const investmentsExceedSavings = totalInvestmentContributions > saved;
    for (const node of investmentNodes) {
      const contributionPercentage = percentage(
        node.value,
        totalInvestmentContributions,
      );
      const attributedAmount = investmentsExceedSavings
        ? saved * (node.value / totalInvestmentContributions)
        : node.value;
      savedBlocks.push({
        id: node.id,
        label: node.name,
        amount: attributedAmount,
        section: "saved",
        percentage: percentage(attributedAmount, saved),
        actualContribution: node.value,
        contributionPercentage,
      });
    }
  }

  const attributedInvestments = savedBlocks.reduce(
    (sum, block) => sum + block.amount,
    0,
  );
  const cash = Math.max(0, saved - attributedInvestments);
  if (cash > 0) {
    savedBlocks.push({
      id: "saved-cash",
      label: "Cash",
      amount: cash,
      section: "saved",
      percentage: percentage(cash, saved),
      isCash: true,
    });
  }

  return {
    income,
    spent,
    saved,
    spendRate: percentage(spent, income),
    savingsRate: percentage(saved, income),
    incomeBlocks,
    spentBlocks,
    savedBlocks,
    hasData: incomeBlocks.length > 0 || spentBlocks.length > 0 || savedBlocks.length > 0,
  };
}
