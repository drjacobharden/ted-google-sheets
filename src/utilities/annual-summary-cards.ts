import type { BudgetTransaction } from "../api/budget-api";
import type {
  InvestmentAccount,
  InvestmentContribution,
} from "../api/investment-api";

export type AnnualSummaryMetricKey =
  | "spend"
  | "income"
  | "paycheckDeductions"
  | "totalSavings";

export interface AnnualSummaryMonth {
  monthId: string;
  value: number | null;
  hasData: boolean;
}

export interface AnnualSummaryMetric {
  key: AnnualSummaryMetricKey;
  total: number;
  months: AnnualSummaryMonth[];
  comparison: number | null;
  comparisonYear: number;
  averagePerMonth: number;
  hasData: boolean;
}

export interface AnnualSummaryCardYear {
  year: number;
  metrics: Record<AnnualSummaryMetricKey, AnnualSummaryMetric>;
}

export type AnnualSummaryCards = Record<number, AnnualSummaryCardYear>;

export interface AnnualSummaryCardResult {
  summaries: AnnualSummaryCards;
  hasPaycheckDeductionHistory: boolean;
}

export interface AnnualSummaryCardOptions {
  today?: Date;
  assignmentId?: string | null;
}

interface DatedValue {
  year: number;
  month: number;
  day: number;
  value: number;
  type: "expense" | "income";
}

interface MonthlyValues {
  values: number[];
  hasData: boolean[];
}

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    ? { year, month, day }
    : null;
}

function parseMonth(value: string): { year: number; month: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

function emptyMonthlyValues(): MonthlyValues {
  return {
    values: Array.from({ length: 12 }, () => 0),
    hasData: Array.from({ length: 12 }, () => false),
  };
}

function total(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/** Builds selected-year totals, prior-year comparisons, and monthly card series. */
export function buildAnnualSummaryCards(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<InvestmentAccount>,
  contributions: ReadonlyArray<InvestmentContribution>,
  options: AnnualSummaryCardOptions = {},
): AnnualSummaryCardResult {
  const today = options.today ?? new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  const datedTransactions = transactions.flatMap((transaction): DatedValue[] => {
    const date = parseDate(transaction.date);
    const value = Number(transaction.amount);
    return date && date.year <= currentYear && Number.isFinite(value)
      ? [{ ...date, value, type: transaction.type }]
      : [];
  });
  const paycheckAccountIds = new Set(
    accounts
      .filter(
        (account) =>
          account.source === "paycheck"
          && (options.assignmentId == null
            || account.assignmentId === options.assignmentId),
      )
      .map((account) => account.id),
  );
  const paycheckContributions = contributions.flatMap((contribution) => {
    const date = parseMonth(contribution.month);
    const value = Number(contribution.amount);
    return date
      && date.year <= currentYear
      && Number.isFinite(value)
      && paycheckAccountIds.has(contribution.accountId)
      ? [{ ...date, value }]
      : [];
  });
  const hasPaycheckDeductionHistory = paycheckContributions.length > 0;
  const years = new Set<number>([currentYear]);
  datedTransactions.forEach((item) => years.add(item.year));
  paycheckContributions.forEach((item) => years.add(item.year));
  const earliestYear = Math.min(...years);
  for (let year = earliestYear; year <= currentYear; year += 1) years.add(year);

  const raw = new Map<number, {
    spend: MonthlyValues;
    income: MonthlyValues;
    paycheckDeductions: MonthlyValues;
  }>();
  [...years].forEach((year) => raw.set(year, {
    spend: emptyMonthlyValues(),
    income: emptyMonthlyValues(),
    paycheckDeductions: emptyMonthlyValues(),
  }));
  datedTransactions.forEach((item) => {
    if (item.year === currentYear && (
      item.month > currentMonth || (item.month === currentMonth && item.day > currentDay)
    )) return;
    const metric = item.type === "expense" ? "spend" : "income";
    const bucket = raw.get(item.year)![metric];
    bucket.values[item.month - 1] += item.value;
    bucket.hasData[item.month - 1] = true;
  });
  paycheckContributions.forEach((item) => {
    if (item.year === currentYear && item.month > currentMonth) return;
    const bucket = raw.get(item.year)!.paycheckDeductions;
    bucket.values[item.month - 1] += item.value;
    bucket.hasData[item.month - 1] = true;
  });

  function cutoffValues(
    year: number,
    metric: AnnualSummaryMetricKey,
    comparisonForCurrentYear: boolean,
  ): { values: number[]; hasData: boolean } {
    const yearData = raw.get(year);
    if (!yearData) return { values: Array.from({ length: 12 }, () => 0), hasData: false };
    const monthLimit = comparisonForCurrentYear ? currentMonth : 12;
    const spend = yearData.spend.values.slice();
    const income = yearData.income.values.slice();
    const deductions = yearData.paycheckDeductions.values.slice();
    const spendData = yearData.spend.hasData.slice();
    const incomeData = yearData.income.hasData.slice();
    const deductionData = yearData.paycheckDeductions.hasData.slice();
    if (comparisonForCurrentYear) {
      datedTransactions.forEach((item) => {
        if (item.year !== year || item.month !== currentMonth || item.day <= currentDay) return;
        if (item.type === "expense") {
          spend[item.month - 1] -= item.value;
        } else {
          income[item.month - 1] -= item.value;
        }
      });
    }
    const trim = (values: number[]) => values.map((value, index) => index < monthLimit ? value : 0);
    if (metric === "spend") return {
      values: trim(spend),
      hasData: spendData.slice(0, monthLimit).some(Boolean),
    };
    if (metric === "income") return {
      values: trim(income),
      hasData: incomeData.slice(0, monthLimit).some(Boolean),
    };
    if (metric === "paycheckDeductions") return {
      values: trim(deductions),
      hasData: deductionData.slice(0, monthLimit).some(Boolean),
    };
    return {
      values: trim(income.map((value, index) => value - spend[index] + deductions[index])),
      hasData: [spendData, incomeData, deductionData]
        .some((flags) => flags.slice(0, monthLimit).some(Boolean)),
    };
  }

  const summaries: AnnualSummaryCards = {};
  [...years].sort((a, b) => a - b).forEach((year) => {
    const isCurrentYear = year === currentYear;
    const divisor = isCurrentYear ? currentMonth : 12;
    const metrics = {} as Record<AnnualSummaryMetricKey, AnnualSummaryMetric>;
    (["spend", "income", "paycheckDeductions", "totalSavings"] as const).forEach((key) => {
      const current = cutoffValues(year, key, false);
      const previous = cutoffValues(year - 1, key, isCurrentYear);
      const visibleMonthLimit = isCurrentYear ? currentMonth : 12;
      const currentHasData = cutoffValues(year, key, isCurrentYear).hasData;
      const currentTotal = total(current.values.slice(0, visibleMonthLimit));
      metrics[key] = {
        key,
        total: currentTotal,
        months: current.values.map((value, index) => ({
          monthId: `${year}-${String(index + 1).padStart(2, "0")}`,
          value: isCurrentYear && index + 1 > currentMonth ? null : value,
          hasData: isCurrentYear && index + 1 > currentMonth
            ? false
            : (key === "totalSavings"
                ? raw.get(year)!.spend.hasData[index]
                  || raw.get(year)!.income.hasData[index]
                  || raw.get(year)!.paycheckDeductions.hasData[index]
                : raw.get(year)![key].hasData[index]),
        })),
        comparison: previous.hasData ? currentTotal - total(previous.values) : null,
        comparisonYear: year - 1,
        averagePerMonth: currentTotal / divisor,
        hasData: currentHasData,
      };
    });
    summaries[year] = { year, metrics };
  });

  return { summaries, hasPaycheckDeductionHistory };
}
