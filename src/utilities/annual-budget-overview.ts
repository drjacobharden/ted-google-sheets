import type { BudgetTransaction } from "../api/budget-api";

export interface AnnualSpendingRank {
  id: string;
  name: string;
  total: number;
  priorYearTotal: number | null;
  inflationRate: number | null;
}

export interface AnnualBudgetOverview {
  year: number;
  totalSpend: number;
  totalIncome: number;
  netBalance: number;
  savingsRate: number | null;
  topVendors: AnnualSpendingRank[];
  topCategories: AnnualSpendingRank[];
  hasData: boolean;
}

export type AnnualBudgetOverviews = Record<number, AnnualBudgetOverview>;

function transactionYear(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? year
    : null;
}

function ranked(
  totals: Map<string, { name: string; total: number }>,
  priorTotals: Map<string, { name: string; total: number }>,
): AnnualSpendingRank[] {
  return [...totals.entries()]
    .map(([id, value]) => {
      const priorYearTotal = priorTotals.get(id)?.total ?? null;
      return {
        id,
        ...value,
        priorYearTotal,
        inflationRate:
          priorYearTotal !== null && priorYearTotal !== 0
            ? ((value.total - priorYearTotal) / Math.abs(priorYearTotal)) * 100
            : null,
      };
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 5);
}

/** Builds annual spending rankings and savings metrics for each available year. */
export function buildAnnualBudgetOverviews(
  transactions: ReadonlyArray<BudgetTransaction>,
  years: ReadonlyArray<number>,
  today = new Date(),
): AnnualBudgetOverviews {
  const overviews = Object.fromEntries(
    years.map((year) => [
      year,
      {
        year,
        totalSpend: 0,
        totalIncome: 0,
        netBalance: 0,
        savingsRate: null,
        topVendors: [],
        topCategories: [],
        hasData: false,
      } satisfies AnnualBudgetOverview,
    ]),
  ) as AnnualBudgetOverviews;
  const vendors = new Map<
    number,
    Map<string, { name: string; total: number }>
  >();
  const categories = new Map<
    number,
    Map<string, { name: string; total: number }>
  >();

  transactions.forEach((transaction) => {
    const year = transactionYear(transaction.date);
    const amount = Number(transaction.amount);
    if (year === null || !Number.isFinite(amount)) return;
    const overview = overviews[year];
    if (overview) overview.hasData = true;

    if (transaction.type === "income") {
      if (overview) overview.totalIncome += amount;
      return;
    }
    if (transaction.type !== "expense") return;
    if (overview) overview.totalSpend += amount;

    const vendorId = transaction.vendorId || "unassigned-vendor";
    const vendorName = transaction.vendor?.trim() || "Unassigned vendor";
    const vendorTotals = vendors.get(year) ?? new Map();
    const vendor = vendorTotals.get(vendorId) ?? { name: vendorName, total: 0 };
    vendor.total += amount;
    vendorTotals.set(vendorId, vendor);
    vendors.set(year, vendorTotals);

    const categoryId = transaction.categoryId || "uncategorized";
    const categoryName = transaction.category?.trim() || "Uncategorized";
    const categoryTotals = categories.get(year) ?? new Map();
    const category = categoryTotals.get(categoryId) ?? {
      name: categoryName,
      total: 0,
    };
    category.total += amount;
    categoryTotals.set(categoryId, category);
    categories.set(year, categoryTotals);
  });

  const todayIso = today.toISOString().slice(0, 10);
  const latestCurrentYearDate = transactions
    .map((transaction) => transaction.date)
    .filter(
      (date) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        date.startsWith(`${today.getFullYear()}-`) &&
        date <= todayIso,
    )
    .sort()
    .at(-1);

  const priorTotalsFor = (
    totalsByYear: Map<number, Map<string, { name: string; total: number }>>,
    dimension: "vendor" | "category",
    year: number,
  ) => {
    const totals = totalsByYear.get(year - 1) ?? new Map();
    if (year !== today.getFullYear() || !latestCurrentYearDate) return totals;
    const cutoff = `${year - 1}${latestCurrentYearDate.slice(4)}`;
    const filtered = new Map<string, { name: string; total: number }>();
    transactions.forEach((transaction) => {
      if (
        transaction.type !== "expense" ||
        transactionYear(transaction.date) !== year - 1 ||
        transaction.date > cutoff
      )
        return;
      const amount = Number(transaction.amount);
      if (!Number.isFinite(amount)) return;
      const id =
        dimension === "vendor"
          ? transaction.vendorId || "unassigned-vendor"
          : transaction.categoryId || "uncategorized";
      const name =
        dimension === "vendor"
          ? transaction.vendor?.trim() || "Unassigned vendor"
          : transaction.category?.trim() || "Uncategorized";
      const item = filtered.get(id) ?? { name, total: 0 };
      item.total += amount;
      filtered.set(id, item);
    });
    return filtered;
  };

  Object.values(overviews).forEach((overview) => {
    overview.netBalance = overview.totalIncome - overview.totalSpend;
    overview.savingsRate =
      overview.totalIncome > 0
        ? (overview.netBalance / overview.totalIncome) * 100
        : null;
    overview.topVendors = ranked(
      vendors.get(overview.year) ?? new Map(),
      priorTotalsFor(vendors, "vendor", overview.year),
    );
    overview.topCategories = ranked(
      categories.get(overview.year) ?? new Map(),
      priorTotalsFor(categories, "category", overview.year),
    );
  });
  return overviews;
}
