import type { Account, AccountActivity, AccountBalance } from "../api/account-api";
import {
  formatTreemapCurrency,
  formatTreemapPercentage,
} from "../components/chart-treemap/formatters";
import {
  chainLinkedReturn,
  monthEnd,
  type DatedFlow,
  type DatedValue,
} from "./investment-returns";
import { DateUtils } from "./date-utilities";
import { sortInsightsWithDiversity } from "./insight-ordering";

export type InvestmentInsightGroup =
  | "performance"
  | "balance"
  | "balance-reversal"
  | "contribution-pattern"
  | "contribution-resumption"
  | "milestone"
  | "account-composition";

export interface InvestmentContributionRecord {
  accountId: string;
  accountName: string;
  date: string;
  month: string;
  amount: number;
}

export interface AccountDayContribution extends InvestmentContributionRecord {}

export interface PortfolioContributionDay {
  date: string;
  amount: number;
  accountCount: number;
}

/** Normalizes a stored activity date without allowing timezone conversion to change its day. */
export function normalizeContributionDate(value: unknown): string | null {
  const candidate = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = DateUtils.fromDateId(candidate);
  return DateUtils.toDateId(parsed) === candidate ? candidate : null;
}

/** Collapses same-account contribution rows into one immutable account-day event. */
export function aggregateContributionsByAccountDay(
  contributions: readonly InvestmentContributionRecord[],
): AccountDayContribution[] {
  const grouped = new Map<string, AccountDayContribution>();
  for (const contribution of contributions) {
    const date = normalizeContributionDate(contribution.date);
    const amount = Number(contribution.amount);
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;
    const key = `${contribution.accountId}\u0000${date}`;
    const current = grouped.get(key);
    if (current) {
      current.amount += amount;
      continue;
    }
    grouped.set(key, { ...contribution, date, month: date.slice(0, 7), amount });
  }
  return [...grouped.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.accountId.localeCompare(right.accountId),
  );
}

/** Collapses normalized account-day events into portfolio-level contribution days. */
export function aggregatePortfolioContributionDays(
  contributions: readonly AccountDayContribution[],
): PortfolioContributionDay[] {
  const grouped = new Map<string, { amount: number; accounts: Set<string> }>();
  for (const contribution of contributions) {
    const date = normalizeContributionDate(contribution.date);
    if (!date) continue;
    const current = grouped.get(date) ?? { amount: 0, accounts: new Set<string>() };
    current.amount += Number(contribution.amount) || 0;
    current.accounts.add(contribution.accountId);
    grouped.set(date, current);
  }
  return [...grouped.entries()]
    .map(([date, value]) => ({ date, amount: value.amount, accountCount: value.accounts.size }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export interface InvestmentAccountContributionStats {
  accountId: string;
  accountName: string;
  totalContributions: number;
  contributionShare: number;
  contributionCount: number;
  contributionDays: number;
  contributionMonths: number;
  largestContribution: number;
  meanContributionDayAmount: number;
  medianContributionDayAmount: number;
  longestMonthlyContributionStreak: number;
  historicalContributionCount: number;
  historicalContributionDates: readonly string[];
  medianDaysBetweenContributions: number | null;
  modifiedDietzReturn: number | null;
}

export interface InvestmentAccountBalanceStats {
  accountId: string;
  accountName: string;
  startingBalance: number | null;
  endingBalance: number | null;
  balanceChange: number | null;
  balanceChangeRate: number | null;
  endingBalanceShare: number | null;
  modifiedDietzReturn: number | null;
}

export interface InvestmentBalanceObservation {
  month: string;
  date: string;
  value: number;
}

export interface InvestmentBalanceReversal {
  month: string;
  date: string;
  balance: number;
  consecutiveDeclines: number;
}

export interface InvestmentAllTimeHigh {
  month: string;
  date: string;
  balance: number;
  priorObservationCount: number;
}

export interface InvestmentContributionMilestone {
  count: number;
  record: InvestmentContributionRecord;
}

export interface InvestmentActivityPeriodData {
  start: string;
  end: string;
  months: readonly string[];
  contributions: readonly InvestmentContributionRecord[];
}

export interface InvestmentActivityHistoricalData {
  contributions: readonly InvestmentContributionRecord[];
  firstContribution: InvestmentContributionRecord | null;
  latestContribution: InvestmentContributionRecord | null;
  previousContribution: InvestmentContributionRecord | null;
  contributionCount: number;
  totalBalanceHistory: readonly InvestmentBalanceObservation[];
  accountBalanceHistory: ReadonlyMap<string, readonly InvestmentBalanceObservation[]>;
}

export interface InvestmentActivityMetrics {
  year: number;
  periodStart: Date;
  periodEnd: Date;
  elapsedMonths: number;
  totalContributions: number;
  contributionDays: number;
  contributionMonths: number;
  averageContributionDayAmount: number;
  meanContributionDayAmount: number;
  medianContributionDayAmount: number;
  contributionDaysPerMonth: number;
  averageMonthlyContribution: number;
  medianContributionAmount: number;
  largestContribution: {
    date: string;
    accountId: string;
    accountName: string;
    amount: number;
  } | null;
  largestContributionDay: { date: string; amount: number } | null;
  largestContributionMonth: { month: string; amount: number } | null;
  top3ContributionDayShare: number;
  top5ContributionDayShare: number;
  top10PercentContributionDaysShare: number;
  top3ContributionMonthShare: number;
  dailyContributionTotals: ReadonlyMap<string, number>;
  portfolioContributionDays: readonly PortfolioContributionDay[];
  contributionCount: number;
  aboveAverageContributionCount: number;
  meanContributionAmount: number;
  medianDaysBetweenContributionDays: number | null;
  meanDaysBetweenContributionDays: number | null;
  contributionsPerActiveMonth: number;
  longestContributionMonthStreak: number;
  startingBalance: number | null;
  endingBalance: number | null;
  balanceChange: number | null;
  balanceChangeRate: number | null;
  nonContributionChange: number | null;
  accountContributionStats: InvestmentAccountContributionStats[];
  accountBalanceStats: InvestmentAccountBalanceStats[];
  recentContributionAverage: number | null;
  earlierContributionAverage: number | null;
  contributionMomentumRate: number | null;
  modifiedDietzReturn: number | null;
  accountModifiedDietzReturns: ReadonlyMap<string, number | null>;
  totalBalanceHistory: readonly InvestmentBalanceObservation[];
  accountBalanceHistory: ReadonlyMap<string, readonly InvestmentBalanceObservation[]>;
  totalBalanceReversal: InvestmentBalanceReversal | null;
  accountBalanceReversals: ReadonlyMap<string, InvestmentBalanceReversal | null>;
  totalAllTimeHigh: InvestmentAllTimeHigh | null;
  accountAllTimeHighs: ReadonlyMap<string, InvestmentAllTimeHigh | null>;
  totalContributionResumption: { date: string; daysSincePrevious: number } | null;
  accountContributionResumptions: ReadonlyMap<string, { date: string; daysSincePrevious: number } | null>;
  firstContribution: InvestmentContributionRecord | null;
  previousContribution: InvestmentContributionRecord | null;
  latestContribution: InvestmentContributionRecord | null;
  daysSincePreviousContribution: number | null;
  contributionMilestone: InvestmentContributionMilestone | null;
  periodData: InvestmentActivityPeriodData;
  historicalData: InvestmentActivityHistoricalData;
  monthlyContributions: ReadonlyMap<string, number>;
  monthlyBalanceTotals: ReadonlyMap<string, number | null>;
  contributions: readonly InvestmentContributionRecord[];
}

export interface InvestmentInsight {
  id: string;
  group: InvestmentInsightGroup | "fallback";
  score: number;
  headline: string;
  detail: string;
  dayIds?: readonly string[];
  isFallback?: boolean;
}

export const INVESTMENT_INSIGHT_THRESHOLDS = Object.freeze({
  minimumConsistencyMonths: 6,
  consistency: 0.75,
  concentration: 0.45,
  concentrationStrong: 0.65,
  notableDifference: 0.18,
  balanceChangeMinimum: 1000,
  balanceChangeRateMinimum: 0.03,
  balanceVsContributionMinimum: 0.15,
  accountConcentration: 0.5,
  accountBalanceConcentration: 0.6,
  accountChangeMinimum: 1000,
  contributionStreak: 6,
  unusualContributionRatio: 2.25,
  longLayoffDays: 90,
  strongLayoffDays: 180,
  contributionResumptionRecencyDays: 120,
  milestoneRecencyDays: 120,
  allTimeHighRecencyDays: 120,
  minimumAllTimeHighObservations: 3,
  minimumBalanceDeclines: 3,
  regularCadenceMonths: 6,
  frequentContributionCount: 12,
  frequentContributionDays: 31,
  sparseContributionCount: 8,
  sparseContributionDays: 45,
  compositeRecencyDays: 90,
  minimumMeaningfulReturn: 0.03,
} as const);

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

const HISTORICAL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const NICE_MILESTONES = [
  1_000,
  2_500,
  5_000,
  10_000,
  25_000,
  50_000,
  100_000,
  250_000,
  500_000,
  1_000_000,
  2_500_000,
  5_000_000,
];

const DAY_MS = 86_400_000;

function dateToTime(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function daysBetween(left: string, right: string): number {
  return Math.round((dateToTime(right) - dateToTime(left)) / DAY_MS);
}

function validNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateDifferences(dates: readonly string[]): number[] {
  const sorted = [...new Set(dates)].sort();
  return sorted.slice(1).map((date, index) => daysBetween(sorted[index]!, date));
}

export function isContributionMilestone(count: number): boolean {
  if (count === 1 || count === 20) return true;
  if (count >= 50 && count <= 500) return count % 50 === 0;
  if (count > 500 && count <= 1_000) return count % 100 === 0;
  return count > 1_000 && count % 250 === 0;
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function eventIsInPeriod(date: string, metrics: Pick<InvestmentActivityMetrics, "periodStart" | "periodEnd">): boolean {
  const start = metrics.periodStart.toISOString().slice(0, 10);
  const end = metrics.periodEnd.toISOString().slice(0, 10);
  return date >= start && date <= end;
}

function eventRecencyScore(
  date: string,
  metrics: Pick<InvestmentActivityMetrics, "periodStart" | "periodEnd">,
  maxDays: number,
): number {
  if (eventIsInPeriod(date, metrics)) return 1;
  const age = daysBetween(date, metrics.periodEnd.toISOString().slice(0, 10));
  return age >= 0 && age <= maxDays ? clamp(1 - age / maxDays) : 0;
}

function dateForMonth(month: string): string {
  return monthEnd(month);
}

function balanceHistory(
  balances: readonly AccountBalance[],
  accountId: string,
): InvestmentBalanceObservation[] {
  const rows = balances
    .filter((item) => item.accountId === accountId && validNumber(item.balance) !== null)
    .sort((left, right) => left.month.localeCompare(right.month));
  const byMonth = new Map<string, AccountBalance>();
  rows.forEach((row) => byMonth.set(row.month, row));
  return [...byMonth.values()].map((row) => ({
    month: row.month,
    date: dateForMonth(row.month),
    value: Number(row.balance),
  }));
}

function aggregateBalanceHistory(
  balances: readonly AccountBalance[],
  accountIds: readonly string[],
): InvestmentBalanceObservation[] {
  if (!accountIds.length) return [];
  const months = [...new Set(balances.map((item) => item.month))].sort();
  return months.flatMap((month) => {
    const rows = accountIds.map((accountId) => latestBalance(balances, accountId, month));
    if (rows.some((row) => !row || validNumber(row.balance) === null)) return [];
    return [{
      month,
      date: dateForMonth(month),
      value: rows.reduce((sum, row) => sum + Number(row!.balance), 0),
    }];
  });
}

function latestHistoryThrough(
  history: readonly InvestmentBalanceObservation[],
  month: string,
): InvestmentBalanceObservation[] {
  return history.filter((item) => item.month <= month);
}

function allTimeHigh(
  history: readonly InvestmentBalanceObservation[],
  throughMonth: string,
): InvestmentAllTimeHigh | null {
  const rows = latestHistoryThrough(history, throughMonth);
  if (rows.length < INVESTMENT_INSIGHT_THRESHOLDS.minimumAllTimeHighObservations) return null;
  const latest = rows.at(-1)!;
  const previous = rows.slice(0, -1);
  if (latest.value <= Math.max(...previous.map((item) => item.value))) return null;
  return {
    month: latest.month,
    date: latest.date,
    balance: latest.value,
    priorObservationCount: previous.length,
  };
}

function balanceReversal(
  history: readonly InvestmentBalanceObservation[],
  throughMonth: string,
): InvestmentBalanceReversal | null {
  const rows = latestHistoryThrough(history, throughMonth);
  if (rows.length < INVESTMENT_INSIGHT_THRESHOLDS.minimumBalanceDeclines + 1) return null;
  let declines = 0;
  let reversal: InvestmentBalanceReversal | null = null;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!;
    const current = rows[index]!;
    if (current.value < previous.value) {
      declines += 1;
      continue;
    }
    if (current.value > previous.value && declines >= INVESTMENT_INSIGHT_THRESHOLDS.minimumBalanceDeclines) {
      reversal = {
        month: current.month,
        date: current.date,
        balance: current.value,
        consecutiveDeclines: declines,
      };
    }
    declines = 0;
  }
  return reversal;
}

function periodReturn(
  history: readonly InvestmentBalanceObservation[],
  flows: readonly InvestmentContributionRecord[],
  startMonth: string,
  endMonth: string,
): number | null {
  const rows = latestHistoryThrough(history, endMonth);
  const opening = rows.filter((item) => item.month < startMonth).at(-1);
  const periodRows = rows.filter((item) => item.month >= startMonth && item.month <= endMonth);
  if (!opening || !periodRows.length) return null;
  const values: DatedValue[] = [
    { date: opening.date, value: opening.value },
    ...periodRows.map((item) => ({ date: item.date, value: item.value })),
  ];
  const datedFlows: DatedFlow[] = flows.map((item) => ({ date: item.date, amount: item.amount }));
  const result = chainLinkedReturn(values, datedFlows).rate;
  return result !== null && Number.isFinite(result) ? result : null;
}

function latestContributionResumption(
  contributions: readonly InvestmentContributionRecord[],
  periodEnd: string,
): { date: string; daysSincePrevious: number } | null {
  const rows = [...contributions]
    .filter((item) => item.date <= periodEnd)
    .sort((left, right) => left.date.localeCompare(right.date));
  const dates = [...new Set(rows.map((item) => item.date))];
  if (dates.length < 2) return null;
  const gaps = dateDifferences(dates);
  const candidates = dates.slice(1).map((date, index) => {
    const referenceGaps = gaps.filter((_, gapIndex) => gapIndex !== index);
    const typicalGap = median(referenceGaps);
    return {
      date,
      daysSincePrevious: gaps[index]!,
      isUnusual: gaps[index]! >= INVESTMENT_INSIGHT_THRESHOLDS.strongLayoffDays || !referenceGaps.length || typicalGap === 0 || gaps[index]! > typicalGap * 1.75,
    };
  }).filter((item) => item.daysSincePrevious >= INVESTMENT_INSIGHT_THRESHOLDS.longLayoffDays && item.isUnusual)
    .map(({ date, daysSincePrevious }) => ({ date, daysSincePrevious }));
  return candidates.at(-1) ?? null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function score(value: number, threshold: number, strong: number): number {
  return strong <= threshold
    ? value >= threshold ? 1 : 0
    : clamp((value - threshold) / (strong - threshold));
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function monthId(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthIds(year: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => monthId(year, index + 1));
}

function validDate(value: unknown): string | null {
  return normalizeContributionDate(value);
}

function latestBalance(
  balances: readonly AccountBalance[],
  accountId: string,
  month: string,
): AccountBalance | null {
  return balances
    .filter((item) => item.accountId === accountId && item.month <= month)
    .sort((left, right) => left.month.localeCompare(right.month))
    .at(-1) ?? null;
}

function contributionStreak(months: readonly string[], values: ReadonlyMap<string, number>): number {
  let current = 0;
  let longest = 0;
  for (const month of months) {
    current = (values.get(month) ?? 0) > 0 ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function contributionDayIds(
  contributions: readonly InvestmentContributionRecord[],
  predicate: (record: InvestmentContributionRecord) => boolean,
): string[] {
  return [...new Set(contributions.filter(predicate).map((record) => record.date))];
}

function aggregateShare(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function insight(
  id: string,
  group: InvestmentInsightGroup,
  rawScore: number,
  headline: string,
  detail: string,
  dayIds?: readonly string[],
): InvestmentInsight {
  return {
    id,
    group,
    score: clamp(rawScore),
    headline,
    detail,
    dayIds: dayIds?.length ? [...dayIds] : undefined,
  };
}

function formattingPercent(value: number): string {
  return formatTreemapPercentage(value * 100);
}

function balanceMilestone(
  metrics: InvestmentActivityMetrics,
): { threshold: number; month: string } | null {
  let crossed: { threshold: number; month: string } | null = null;
  for (const [month, balance] of metrics.monthlyBalanceTotals) {
    if (balance === null) continue;
    for (const threshold of NICE_MILESTONES) {
      const previous = [...metrics.monthlyBalanceTotals.entries()]
        .find(([candidateMonth]) => candidateMonth < month)?.[1] ?? metrics.startingBalance;
      if (balance >= threshold && (previous ?? 0) < threshold) {
        if (!crossed || threshold > crossed.threshold) crossed = { threshold, month };
      }
    }
  }
  return crossed;
}

export function analyzeInvestmentActivity(
  activities: readonly AccountActivity[],
  balances: readonly AccountBalance[],
  accounts: readonly Account[],
  year: number,
): InvestmentActivityMetrics {
  const investmentAccounts = accounts.filter(
    (account) => account.type === "investment" && account.active !== false,
  );
  const accountIds = new Set(investmentAccounts.map((account) => account.id));
  const accountNames = new Map(investmentAccounts.map((account) => [account.id, account.name]));
  const today = new Date();
  const currentYear = today.getFullYear();
  const elapsedMonths = year === currentYear ? today.getMonth() + 1 : year < currentYear ? 12 : 0;
  const periodStart = new Date(Date.UTC(year, 0, 1));
  const periodEnd = year === currentYear
    ? new Date(Date.UTC(year, today.getMonth(), today.getDate()))
    : new Date(Date.UTC(year, 11, 31));
  const startDate = periodStart.toISOString().slice(0, 10);
  const endDate = periodEnd.toISOString().slice(0, 10);
  const months = monthIds(year, elapsedMonths);

  const rawContributions = activities
    .filter(
      (activity) =>
        activity.activityType === "contribution" &&
        accountIds.has(activity.accountId) &&
        Number(activity.amount) > 0 &&
        validNumber(activity.amount) !== null,
    )
    .map((activity) => {
      const date = validDate(activity.date) ?? validDate(`${activity.month}-15`);
      if (!date) return null;
      return {
        accountId: activity.accountId,
        accountName: accountNames.get(activity.accountId) ?? "Investment account",
        date,
        month: date.slice(0, 7),
        amount: Number(activity.amount),
      } satisfies InvestmentContributionRecord;
    })
    .filter((item): item is InvestmentContributionRecord => Boolean(item))
    .filter((item) => item.date <= endDate)
    .sort((left, right) => left.date.localeCompare(right.date) || left.accountId.localeCompare(right.accountId));

  const allContributions = aggregateContributionsByAccountDay(rawContributions);

  // Keep the selected period and the historical record distinct. Period
  // insights describe the dashboard window; milestones, resumptions, and
  // record highs use the complete contribution/balance history up to it.
  const contributions = allContributions.filter(
    (item) => item.date >= startDate && item.date <= endDate && months.includes(item.month),
  );

  const monthlyContributions = new Map(months.map((month) => [month, 0]));
  const contributionDays = new Set<string>();
  const accountContributionTotals = new Map<string, InvestmentContributionRecord[]>();
  for (const contribution of contributions) {
    monthlyContributions.set(
      contribution.month,
      (monthlyContributions.get(contribution.month) ?? 0) + contribution.amount,
    );
    contributionDays.add(contribution.date);
    const rows = accountContributionTotals.get(contribution.accountId) ?? [];
    rows.push(contribution);
    accountContributionTotals.set(contribution.accountId, rows);
  }

  const totalContributions = contributions.reduce((sum, item) => sum + item.amount, 0);
  const activeContributionMonths = months.filter((month) => (monthlyContributions.get(month) ?? 0) > 0);
  const portfolioContributionDays = aggregatePortfolioContributionDays(contributions);
  const largestContribution = contributions.at(-1)
    ? contributions.reduce((largest, item) => item.amount > largest.amount ? item : largest)
    : null;
  const dayTotals = new Map(portfolioContributionDays.map((item) => [item.date, item.amount]));
  const monthTotals = [...monthlyContributions.entries()].filter(([, amount]) => amount > 0);
  const largestContributionDay = [...dayTotals.entries()].sort((left, right) => right[1] - left[1])[0];
  const largestContributionMonth = monthTotals.sort((left, right) => right[1] - left[1])[0];
  const topDays = [...dayTotals.values()].sort((left, right) => right - left).slice(0, 3);
  const topMonths = monthTotals.map(([, amount]) => amount).sort((left, right) => right - left).slice(0, 3);

  const startMonth = `${year}-01`;
  const endMonth = monthId(year, elapsedMonths);
  const historicalAccountContributionTotals = new Map<string, InvestmentContributionRecord[]>();
  for (const contribution of allContributions) {
    const rows = historicalAccountContributionTotals.get(contribution.accountId) ?? [];
    rows.push(contribution);
    historicalAccountContributionTotals.set(contribution.accountId, rows);
  }
  const accountBalanceHistory = new Map<string, readonly InvestmentBalanceObservation[]>(
    investmentAccounts.map((account) => [account.id, balanceHistory(balances, account.id)]),
  );
  const totalBalanceHistory = aggregateBalanceHistory(
    balances,
    investmentAccounts.map((account) => account.id),
  );
  const accountModifiedDietzReturns = new Map<string, number | null>();
  accountBalanceHistory.forEach((history, accountId) => {
    accountModifiedDietzReturns.set(
      accountId,
      elapsedMonths
        ? periodReturn(history, allContributions.filter((item) => item.accountId === accountId), startMonth, endMonth)
        : null,
    );
  });
  const modifiedDietzReturn = elapsedMonths
    ? periodReturn(totalBalanceHistory, allContributions, startMonth, endMonth)
    : null;
  const totalBalanceReversal = elapsedMonths
    ? balanceReversal(totalBalanceHistory, endMonth)
    : null;
  const accountBalanceReversals = new Map<string, InvestmentBalanceReversal | null>();
  accountBalanceHistory.forEach((history, accountId) => {
    accountBalanceReversals.set(accountId, elapsedMonths ? balanceReversal(history, endMonth) : null);
  });
  const totalAllTimeHigh = elapsedMonths ? allTimeHigh(totalBalanceHistory, endMonth) : null;
  const accountAllTimeHighs = new Map<string, InvestmentAllTimeHigh | null>();
  accountBalanceHistory.forEach((history, accountId) => {
    accountAllTimeHighs.set(accountId, elapsedMonths ? allTimeHigh(history, endMonth) : null);
  });
  const totalContributionResumption = latestContributionResumption(allContributions, endDate);
  const accountContributionResumptions = new Map<string, { date: string; daysSincePrevious: number } | null>();
  investmentAccounts.forEach((account) => {
    accountContributionResumptions.set(
      account.id,
      latestContributionResumption(historicalAccountContributionTotals.get(account.id) ?? [], endDate),
    );
  });
  const firstContribution = allContributions[0] ?? null;
  const latestContribution = allContributions.at(-1) ?? null;
  const previousContribution = allContributions.at(-2) ?? null;
  const contributionMilestone = [...allContributions.entries()]
    .filter(([, record]) => isContributionMilestone(allContributions.indexOf(record) + 1))
    .map(([index, record]) => ({ count: index + 1, record }))
    .at(-1) ?? null;
  const accountContributionStats = investmentAccounts.map((account) => {
    const rows = accountContributionTotals.get(account.id) ?? [];
    const historicalRows = historicalAccountContributionTotals.get(account.id) ?? [];
    const accountMonths = new Map(months.map((month) => [month, 0]));
    rows.forEach((row) => accountMonths.set(row.month, (accountMonths.get(row.month) ?? 0) + row.amount));
    const historicalDates = historicalRows.map((row) => row.date);
    const rowAmounts = rows.map((row) => row.amount);
    return {
      accountId: account.id,
      accountName: account.name,
      totalContributions: rows.reduce((sum, row) => sum + row.amount, 0),
      contributionShare: aggregateShare(rows.reduce((sum, row) => sum + row.amount, 0), totalContributions),
      contributionCount: rows.length,
      contributionDays: rows.length,
      contributionMonths: [...accountMonths.values()].filter((value) => value > 0).length,
      largestContribution: rows.reduce((max, row) => Math.max(max, row.amount), 0),
      meanContributionDayAmount: average(rowAmounts) ?? 0,
      medianContributionDayAmount: median(rowAmounts),
      longestMonthlyContributionStreak: contributionStreak(months, accountMonths),
      historicalContributionCount: historicalRows.length,
      historicalContributionDates: [...new Set(historicalDates)],
      medianDaysBetweenContributions: median(dateDifferences(historicalDates)) || null,
      modifiedDietzReturn: accountModifiedDietzReturns.get(account.id) ?? null,
    } satisfies InvestmentAccountContributionStats;
  });

  const accountBalanceStats: InvestmentAccountBalanceStats[] = investmentAccounts.map((account) => {
    const starting = latestBalance(balances, account.id, startMonth);
    const ending = elapsedMonths ? latestBalance(balances, account.id, endMonth) : null;
    const startingBalance = starting ? Number(starting.balance) : null;
    const endingBalance = ending ? Number(ending.balance) : null;
    const change = startingBalance !== null && endingBalance !== null ? endingBalance - startingBalance : null;
    return {
      accountId: account.id,
      accountName: account.name,
      startingBalance,
      endingBalance,
      balanceChange: change,
      balanceChangeRate: startingBalance && startingBalance !== 0 && change !== null ? change / Math.abs(startingBalance) : null,
      endingBalanceShare: null,
      modifiedDietzReturn: accountModifiedDietzReturns.get(account.id) ?? null,
    } satisfies InvestmentAccountBalanceStats;
  });
  const endingBalanceTotal = accountBalanceStats.every((item) => item.endingBalance !== null)
    ? accountBalanceStats.reduce((sum, item) => sum + (item.endingBalance ?? 0), 0)
    : null;
  const startingBalanceTotal = accountBalanceStats.every((item) => item.startingBalance !== null)
    ? accountBalanceStats.reduce((sum, item) => sum + (item.startingBalance ?? 0), 0)
    : null;
  accountBalanceStats.forEach((item) => {
    item.endingBalanceShare = endingBalanceTotal && item.endingBalance !== null
      ? item.endingBalance / endingBalanceTotal
      : null;
  });

  const monthlyBalanceTotals = new Map<string, number | null>();
  for (const month of months) {
    const rows = investmentAccounts.map((account) => latestBalance(balances, account.id, month));
    monthlyBalanceTotals.set(
      month,
      rows.every(Boolean) ? rows.reduce((sum, row) => sum + Number(row?.balance ?? 0), 0) : null,
    );
  }
  const balanceChange = startingBalanceTotal !== null && endingBalanceTotal !== null
    ? endingBalanceTotal - startingBalanceTotal
    : null;
  const completedMonths = year === currentYear ? months.slice(0, -1) : months;
  const recentMonths = completedMonths.slice(-3);
  const earlierMonths = completedMonths.slice(0, -3);
  const recentContributionAverage = recentMonths.length
    ? recentMonths.reduce((sum, month) => sum + (monthlyContributions.get(month) ?? 0), 0) / recentMonths.length
    : null;
  const earlierContributionAverage = earlierMonths.length
    ? earlierMonths.reduce((sum, month) => sum + (monthlyContributions.get(month) ?? 0), 0) / earlierMonths.length
    : null;
  const contributionDayValues = [...dayTotals.values()].sort((left, right) => right - left);
  const top10PercentDayCount = Math.max(1, Math.ceil(contributionDayValues.length * 0.1));
  const contributionCount = contributions.length;
  const meanContributionAmount = average(contributions.map((item) => item.amount)) ?? 0;
  const aboveAverageContributionCount = contributions.filter(
    (item) => item.amount > meanContributionAmount,
  ).length;
  const meanContributionDayAmount = average([...dayTotals.values()]) ?? 0;
  const medianContributionDayAmount = median([...dayTotals.values()]);
  const medianDaysBetweenContributionDays = median(dateDifferences([...dayTotals.keys()])) || null;
  const meanDaysBetweenContributionDays = average(dateDifferences([...dayTotals.keys()]));

  return {
    year,
    periodStart,
    periodEnd,
    elapsedMonths,
    totalContributions,
    contributionDays: contributionDays.size,
    contributionMonths: activeContributionMonths.length,
    averageContributionDayAmount: contributionDays.size ? totalContributions / contributionDays.size : 0,
    meanContributionDayAmount,
    medianContributionDayAmount,
    contributionDaysPerMonth: elapsedMonths ? contributionDays.size / elapsedMonths : 0,
    averageMonthlyContribution: elapsedMonths ? totalContributions / elapsedMonths : 0,
    medianContributionAmount: median(contributions.map((item) => item.amount)),
    largestContribution: largestContribution
      ? { date: largestContribution.date, accountId: largestContribution.accountId, accountName: largestContribution.accountName, amount: largestContribution.amount }
      : null,
    largestContributionDay: largestContributionDay ? { date: largestContributionDay[0], amount: largestContributionDay[1] } : null,
    largestContributionMonth: largestContributionMonth ? { month: largestContributionMonth[0], amount: largestContributionMonth[1] } : null,
    top3ContributionDayShare: aggregateShare(topDays.reduce((sum, value) => sum + value, 0), totalContributions),
    top5ContributionDayShare: aggregateShare(contributionDayValues.slice(0, 5).reduce((sum, value) => sum + value, 0), totalContributions),
    top10PercentContributionDaysShare: aggregateShare(contributionDayValues.slice(0, top10PercentDayCount).reduce((sum, value) => sum + value, 0), totalContributions),
    top3ContributionMonthShare: aggregateShare(topMonths.reduce((sum, value) => sum + value, 0), totalContributions),
    dailyContributionTotals: dayTotals,
    portfolioContributionDays,
    contributionCount,
    aboveAverageContributionCount,
    meanContributionAmount,
    medianDaysBetweenContributionDays,
    meanDaysBetweenContributionDays,
    contributionsPerActiveMonth: elapsedMonths ? contributionDays.size / elapsedMonths : 0,
    longestContributionMonthStreak: contributionStreak(months, monthlyContributions),
    startingBalance: startingBalanceTotal,
    endingBalance: endingBalanceTotal,
    balanceChange,
    balanceChangeRate: startingBalanceTotal && startingBalanceTotal !== 0 && balanceChange !== null ? balanceChange / Math.abs(startingBalanceTotal) : null,
    nonContributionChange: balanceChange === null ? null : balanceChange - totalContributions,
    accountContributionStats,
    accountBalanceStats,
    recentContributionAverage,
    earlierContributionAverage,
    contributionMomentumRate: recentContributionAverage !== null && earlierContributionAverage && earlierContributionAverage > 0
      ? (recentContributionAverage - earlierContributionAverage) / earlierContributionAverage
      : null,
    modifiedDietzReturn,
    accountModifiedDietzReturns,
    totalBalanceHistory,
    accountBalanceHistory,
    totalBalanceReversal,
    accountBalanceReversals,
    totalAllTimeHigh,
    accountAllTimeHighs,
    totalContributionResumption,
    accountContributionResumptions,
    firstContribution,
    previousContribution,
    latestContribution,
    daysSincePreviousContribution: previousContribution && latestContribution
      ? daysBetween(previousContribution.date, latestContribution.date)
      : null,
    contributionMilestone,
    periodData: {
      start: startDate,
      end: endDate,
      months,
      contributions,
    },
    historicalData: {
      contributions: allContributions,
      firstContribution,
      latestContribution,
      previousContribution,
      contributionCount: allContributions.length,
      totalBalanceHistory,
      accountBalanceHistory,
    },
    monthlyContributions,
    monthlyBalanceTotals,
    contributions,
  };
}

function fallback(metrics: InvestmentActivityMetrics): InvestmentInsight {
  if (!metrics.totalContributions && metrics.endingBalance === null) {
    return { id: "empty", group: "fallback", score: 0, headline: "No investment activity yet.", detail: "Contribution and balance patterns will appear here as data is added.", isFallback: true };
  }
  if (!metrics.totalContributions) {
    return { id: "balance-only", group: "fallback", score: 0, headline: "No contributions yet this period.", detail: metrics.endingBalance === null ? "Contribution patterns will appear here as data is added." : `Your current investment balance is ${formatTreemapCurrency(metrics.endingBalance)}.`, isFallback: true };
  }
  return {
    id: "investment-summary",
    group: "fallback",
    score: 0,
    headline: `You've contributed ${formatTreemapCurrency(metrics.totalContributions)} during this period.`,
    detail: metrics.endingBalance === null
      ? `Contributions were made across ${metrics.accountContributionStats.filter((item) => item.totalContributions > 0).length} investment accounts.`
      : `Your current investment balance is ${formatTreemapCurrency(metrics.endingBalance)}.`,
    isFallback: true,
  };
}

export function getInvestmentInsights(metrics: InvestmentActivityMetrics): InvestmentInsight[] {
  if (!metrics.elapsedMonths || (!metrics.totalContributions && metrics.endingBalance === null)) return [fallback(metrics)];
  const candidates: InvestmentInsight[] = [];
  const thresholds = INVESTMENT_INSIGHT_THRESHOLDS;
  const contributionMonthsRate = metrics.elapsedMonths ? metrics.contributionMonths / metrics.elapsedMonths : 0;

  const historicalLargestContribution = metrics.historicalData.contributions
    .slice()
    .sort((left, right) => right.amount - left.amount || left.date.localeCompare(right.date))[0];
  if (historicalLargestContribution && eventIsInPeriod(historicalLargestContribution.date, metrics)) {
    const date = new Date(`${historicalLargestContribution.date}T00:00:00Z`);
    candidates.push(insight(
      "largest-contribution-to-date",
      "milestone",
      0.82,
      `Your largest contribution to date was ${formatTreemapCurrency(historicalLargestContribution.amount)}.`,
      `It went to ${historicalLargestContribution.accountName} on ${HISTORICAL_DATE_FORMATTER.format(date)}.`,
      [historicalLargestContribution.date],
    ));
  }

  const largestContributionByAccount = new Map<string, InvestmentContributionRecord>();
  for (const contribution of metrics.historicalData.contributions) {
    const current = largestContributionByAccount.get(contribution.accountId);
    if (!current || contribution.amount > current.amount) {
      largestContributionByAccount.set(contribution.accountId, contribution);
    }
  }
  for (const contribution of largestContributionByAccount.values()) {
    if (!eventIsInPeriod(contribution.date, metrics)) continue;
    const date = new Date(`${contribution.date}T00:00:00Z`);
    candidates.push(insight(
      `account-largest-contribution-to-date-${contribution.accountId}`,
      "account-composition",
      0.72,
      `Your largest contribution to date in ${contribution.accountName} was ${formatTreemapCurrency(contribution.amount)}.`,
      `You made it on ${HISTORICAL_DATE_FORMATTER.format(date)}.`,
      [contribution.date],
    ));
  }

  if (metrics.contributionDays > 0) {
    candidates.push(insight(
      "contribution-days",
      "contribution-pattern",
      score(metrics.contributionDays, 1, Math.max(12, metrics.elapsedMonths * 4)),
      `You contributed on ${metrics.contributionDays} days.`,
      `Those contribution days added ${formatTreemapCurrency(metrics.totalContributions)} across ${metrics.contributionMonths} months.`,
      contributionDayIds(metrics.contributions, () => true),
    ));
  }

  if (metrics.aboveAverageContributionCount > 0) {
    candidates.push(insight(
      "above-average-contributions",
      "contribution-pattern",
      score(
        metrics.aboveAverageContributionCount / Math.max(1, metrics.contributionCount),
        0.2,
        0.5,
      ),
      `You made ${metrics.aboveAverageContributionCount} above-average contributions.`,
      `${metrics.aboveAverageContributionCount} of your ${metrics.contributionCount} contributions were above your average of ${formatTreemapCurrency(metrics.meanContributionAmount)}.`,
      contributionDayIds(metrics.contributions, (item) => item.amount > metrics.meanContributionAmount),
    ));
  }

  const topContributionDays = [...metrics.dailyContributionTotals.entries()]
    .sort((left, right) => right[1] - left[1]);
  const largestContributionDayShare = metrics.largestContributionDay
    ? aggregateShare(metrics.largestContributionDay.amount, metrics.totalContributions)
    : 0;
  if (metrics.top3ContributionDayShare >= thresholds.concentration) {
    const concentratedDays = topContributionDays.slice(0, 3).map(([date]) => date);
    const singleDay = largestContributionDayShare >= 0.3;
    candidates.push(insight(
      "daily-contribution-concentration",
      "contribution-pattern",
      Math.max(
        score(metrics.top3ContributionDayShare, thresholds.concentration, thresholds.concentrationStrong),
        score(largestContributionDayShare, 0.3, 0.6),
      ),
      singleDay ? "One day did a lot of the work." : "A few big days drove your investing.",
      singleDay
        ? `Your largest contribution day accounted for ${formattingPercent(largestContributionDayShare)} of this year's contributions.`
        : `Your three largest contribution days accounted for ${formattingPercent(metrics.top3ContributionDayShare)} of everything you invested.`,
      concentratedDays,
    ));
  }

  const cadenceDays = metrics.medianDaysBetweenContributionDays;
  const hasFrequentCadence = metrics.contributionDays >= thresholds.frequentContributionCount && cadenceDays !== null && cadenceDays <= thresholds.frequentContributionDays;
  const hasSparseCadence = metrics.contributionDays <= thresholds.sparseContributionCount && cadenceDays !== null && cadenceDays >= thresholds.sparseContributionDays;
  const hasRegularCadence = metrics.contributionMonths >= thresholds.regularCadenceMonths && cadenceDays !== null && cadenceDays >= 10 && cadenceDays <= 45;
  if (hasFrequentCadence || hasSparseCadence || hasRegularCadence) {
    const cadenceScore = hasFrequentCadence
      ? score(metrics.contributionDays, thresholds.frequentContributionCount, 52)
      : hasSparseCadence
        ? score(cadenceDays ?? 0, thresholds.sparseContributionDays, 180)
        : score(metrics.contributionMonths, thresholds.regularCadenceMonths, 12);
    candidates.push(insight(
      hasFrequentCadence
        ? "frequent-contribution-cadence"
        : hasSparseCadence
          ? "sparse-contribution-cadence"
          : "regular-contribution-cadence",
      "contribution-pattern",
      cadenceScore,
      hasFrequentCadence
        ? "You invest in small, frequent steps."
        : hasSparseCadence
          ? "Your investing happens in bigger chunks."
          : "Your contributions follow a steady rhythm.",
      hasRegularCadence
        ? `You've invested about ${metrics.contributionDaysPerMonth.toFixed(1)} days per month, with a typical contribution day of ${formatTreemapCurrency(metrics.medianContributionDayAmount)}.`
        : `You've invested on ${metrics.contributionDays} days this year, with a typical contribution day of ${formatTreemapCurrency(metrics.medianContributionDayAmount)}.`,
      contributionDayIds(metrics.contributions, () => true),
    ));
  }

  const totalResumption = metrics.totalContributionResumption;
  if (totalResumption) {
    const recency = eventRecencyScore(totalResumption.date, metrics, thresholds.contributionResumptionRecencyDays);
    if (recency > 0) {
      const date = new Date(`${totalResumption.date}T00:00:00Z`);
      candidates.push(insight(
        "total-contribution-resumption",
        "contribution-resumption",
        recency * score(totalResumption.daysSincePrevious, thresholds.longLayoffDays, thresholds.strongLayoffDays),
        "You started investing again.",
        `Your ${DATE_FORMATTER.format(date)} contribution was your first in ${totalResumption.daysSincePrevious} days.`,
        [totalResumption.date],
      ));
    }
  }

  const milestone = metrics.contributionMilestone;
  if (milestone && (eventIsInPeriod(milestone.record.date, metrics) || eventRecencyScore(milestone.record.date, metrics, thresholds.milestoneRecencyDays) > 0)) {
    const milestoneRecency = eventRecencyScore(milestone.record.date, metrics, thresholds.milestoneRecencyDays);
    const date = new Date(`${milestone.record.date}T00:00:00Z`);
    candidates.push(insight(
      `contribution-count-milestone-${milestone.count}`,
      "milestone",
      Math.max(0.45, milestoneRecency * score(milestone.count, 20, 1_000)),
      `That's contribution #${milestone.count}.`,
      `You made your ${formatTreemapCurrency(milestone.record.amount)} contribution to ${milestone.record.accountName} on ${DATE_FORMATTER.format(date)}.`,
      [milestone.record.date],
    ));
  }

  if (metrics.firstContribution && eventIsInPeriod(metrics.firstContribution.date, metrics)) {
    const date = new Date(`${metrics.firstContribution.date}T00:00:00Z`);
    candidates.push(insight(
      "first-contribution-milestone",
      "milestone",
      0.8,
      "This is where your investing started.",
      `Your first recorded investment contribution was ${formatTreemapCurrency(metrics.firstContribution.amount)} on ${HISTORICAL_DATE_FORMATTER.format(date)}.`,
      [metrics.firstContribution.date],
    ));
  }

  const accountResumption = [...metrics.accountContributionResumptions.entries()]
    .map(([accountId, value]) => ({ accountId, value }))
    .filter((item): item is { accountId: string; value: { date: string; daysSincePrevious: number } } => Boolean(item.value))
    .sort((left, right) => right.value.date.localeCompare(left.value.date))[0];
  if (accountResumption) {
    const account = metrics.accountContributionStats.find((item) => item.accountId === accountResumption.accountId);
    const recency = eventRecencyScore(accountResumption.value.date, metrics, thresholds.contributionResumptionRecencyDays);
    if (account && recency > 0) {
      candidates.push(insight(
        `account-contribution-resumption-${account.accountId}`,
        "contribution-resumption",
        recency * score(accountResumption.value.daysSincePrevious, thresholds.longLayoffDays, thresholds.strongLayoffDays),
        `${account.accountName} is active again.`,
        `You made your first contribution there in ${accountResumption.value.daysSincePrevious} days.`,
        [accountResumption.value.date],
      ));
    }
  }

  const totalReversal = metrics.totalBalanceReversal;
  if (totalReversal) {
    const recency = eventRecencyScore(totalReversal.date, metrics, thresholds.compositeRecencyDays);
    if (recency > 0) {
      candidates.push(insight(
        "total-balance-reversal",
        "balance-reversal",
        recency * score(totalReversal.consecutiveDeclines, thresholds.minimumBalanceDeclines, 6),
        "Your investments turned upward.",
        `Your total balance increased in ${MONTH_FORMATTER.format(new Date(`${totalReversal.month}-01T00:00:00Z`))} after declining for ${totalReversal.consecutiveDeclines} straight months.`,
      ));
    }
  }

  const accountReversal = [...metrics.accountBalanceReversals.entries()]
    .map(([accountId, value]) => ({ accountId, value }))
    .filter((item): item is { accountId: string; value: InvestmentBalanceReversal } => Boolean(item.value))
    .sort((left, right) => right.value.date.localeCompare(left.value.date))[0];
  if (accountReversal) {
    const account = metrics.accountBalanceStats.find((item) => item.accountId === accountReversal.accountId);
    const recency = eventRecencyScore(accountReversal.value.date, metrics, thresholds.compositeRecencyDays);
    if (account && recency > 0) {
      candidates.push(insight(
        `account-balance-reversal-${account.accountId}`,
        "balance-reversal",
        recency * score(accountReversal.value.consecutiveDeclines, thresholds.minimumBalanceDeclines, 6),
        `Your ${account.accountName} turned upward.`,
        `Its balance increased this month after ${accountReversal.value.consecutiveDeclines} consecutive monthly declines.`,
      ));
    }
  }

  const totalHigh = metrics.totalAllTimeHigh;
  const totalReturn = metrics.modifiedDietzReturn;
  const hasMeaningfulPositiveReturn = totalReturn !== null && totalReturn >= thresholds.minimumMeaningfulReturn;
  if (totalHigh && eventRecencyScore(totalHigh.date, metrics, thresholds.allTimeHighRecencyDays) > 0 && hasMeaningfulPositiveReturn) {
    candidates.push(insight(
      "total-all-time-high-with-return",
      "performance",
      0.98,
      "Your investments reached a new high.",
      `Your balance reached ${formatTreemapCurrency(totalHigh.balance)} with a ${formattingPercent(totalReturn)} ROI this period.`,
    ));
  } else if (totalReturn !== null && Math.abs(totalReturn) >= thresholds.minimumMeaningfulReturn) {
    candidates.push(insight(
      "total-modified-dietz-return",
      "performance",
      Math.max(0.35, score(Math.abs(totalReturn), 0.03, 0.1)),
      `Your investments returned ${formattingPercent(totalReturn)} this period.`,
      `That's the ROI across your investments for the selected period.`,
    ));
  }

  if (totalHigh && !hasMeaningfulPositiveReturn && eventRecencyScore(totalHigh.date, metrics, thresholds.allTimeHighRecencyDays) > 0) {
    candidates.push(insight(
      "total-all-time-high",
      "balance",
      0.9,
      "Your investments reached a new all-time high.",
      `Your combined investment balance reached ${formatTreemapCurrency(totalHigh.balance)} in ${MONTH_FORMATTER.format(new Date(`${totalHigh.month}-01T00:00:00Z`))} — the highest recorded balance yet.`,
    ));
  }

  const accountReturns = metrics.accountBalanceStats
    .map((account) => ({ account, rate: account.modifiedDietzReturn }))
    .filter((item): item is { account: InvestmentAccountBalanceStats; rate: number } => item.rate !== null && Number.isFinite(item.rate))
    .sort((left, right) => right.rate - left.rate);
  const strongestAccount = accountReturns[0];
  const weakestAccount = accountReturns.at(-1);
  if (strongestAccount && strongestAccount.account.accountId !== weakestAccount?.account.accountId) {
    candidates.push(insight(
      `account-modified-dietz-return-${strongestAccount.account.accountId}`,
      "performance",
      Math.max(0.3, score(Math.abs(strongestAccount.rate), thresholds.minimumMeaningfulReturn, 0.12)),
      `Your ${strongestAccount.account.accountName} has returned ${formattingPercent(strongestAccount.rate)}.`,
      `That's the strongest ROI among your investment accounts this period.`,
    ));
  }
  if (weakestAccount && weakestAccount.rate < -thresholds.minimumMeaningfulReturn) {
    candidates.push(insight(
      `account-modified-dietz-return-low-${weakestAccount.account.accountId}`,
      "performance",
      Math.max(0.3, score(Math.abs(weakestAccount.rate), thresholds.minimumMeaningfulReturn, 0.12)),
      `Your ${weakestAccount.account.accountName} has had the toughest year.`,
      `Its ROI is ${formattingPercent(weakestAccount.rate)} for the selected period.`,
      ));
  }

  const accountHighs = [...metrics.accountAllTimeHighs.entries()]
    .map(([accountId, value]) => ({ accountId, value }))
    .filter((item): item is { accountId: string; value: InvestmentAllTimeHigh } => Boolean(item.value))
    .filter((item) => eventRecencyScore(item.value.date, metrics, thresholds.allTimeHighRecencyDays) > 0)
    .sort((left, right) => right.value.balance - left.value.balance);
  const accountHigh = accountHighs[0];
  if (accountHigh && !totalHigh) {
    const account = metrics.accountBalanceStats.find((item) => item.accountId === accountHigh.accountId);
    if (account) {
      candidates.push(insight(
        `account-all-time-high-${account.accountId}`,
        "balance",
        0.88,
        `Your ${account.accountName} reached a new high.`,
        `Its balance reached ${formatTreemapCurrency(accountHigh.value.balance)} in ${MONTH_FORMATTER.format(new Date(`${accountHigh.value.month}-01T00:00:00Z`))} — its highest recorded balance yet.`,
      ));
    }
  }

  if (contributionMonthsRate >= 0.999 && totalReturn !== null && Math.abs(totalReturn) >= thresholds.minimumMeaningfulReturn) {
    candidates.push(insight(
      "consistent-contributions-with-return",
      "performance",
      Math.max(0.55, score(Math.abs(totalReturn), 0.03, 0.1)),
      totalReturn >= 0 ? "Consistent contributions paired with positive returns." : "You kept contributing through a down period.",
      `You contributed in every month while your ROI was ${formattingPercent(totalReturn)}.`,
      contributionDayIds(metrics.contributions, () => true),
    ));
  }

  if (totalResumption && totalReversal && Math.abs(daysBetween(totalResumption.date, totalReversal.date)) <= thresholds.compositeRecencyDays) {
    candidates.push(insight(
      "contribution-resumption-with-balance-reversal",
      "contribution-resumption",
      0.82,
      "Activity returned as your balance turned upward.",
      `You made your first contribution in ${totalResumption.daysSincePrevious} days, and your balance also posted its first monthly increase after ${totalReversal.consecutiveDeclines} declines.`,
      [totalResumption.date],
    ));
  }

  if (metrics.elapsedMonths >= thresholds.minimumConsistencyMonths && contributionMonthsRate >= thresholds.consistency) {
    candidates.push(insight(
      "contribution-consistency",
      "contribution-pattern",
      score(contributionMonthsRate, thresholds.consistency, 1),
      contributionMonthsRate >= 0.999 ? "You've been investing consistently." : "You've been investing regularly.",
      contributionMonthsRate >= 0.999
        ? `You contributed every month this year, totaling ${formatTreemapCurrency(metrics.totalContributions)}.`
        : `You contributed in ${metrics.contributionMonths} of ${metrics.elapsedMonths} months, adding ${formatTreemapCurrency(metrics.totalContributions)} in total.`,
      contributionDayIds(metrics.contributions, () => true),
    ));
  }

  if (metrics.top3ContributionMonthShare >= thresholds.concentration) {
    candidates.push(insight(
      "contribution-concentration",
      "contribution-pattern",
      score(metrics.top3ContributionMonthShare, thresholds.concentration, thresholds.concentrationStrong),
      "A few months drove your investing.",
      `Your three highest-contribution months accounted for ${formattingPercent(metrics.top3ContributionMonthShare)} of everything you invested.`,
      contributionDayIds(metrics.contributions, (item) => {
        const topMonths = [...metrics.monthlyContributions.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([month]) => month);
        return topMonths.includes(item.month);
      }),
    ));
  }

  if (metrics.largestContributionMonth && metrics.totalContributions > 0) {
    const averageActiveMonth = metrics.totalContributions / Math.max(1, metrics.contributionMonths);
    const ratio = metrics.largestContributionMonth.amount / averageActiveMonth;
    if (ratio >= thresholds.unusualContributionRatio) {
      const monthDate = new Date(`${metrics.largestContributionMonth.month}-01T00:00:00Z`);
      candidates.push(insight(
        "largest-contribution-month",
        "contribution-pattern",
        score(ratio, thresholds.unusualContributionRatio, 5),
        `${MONTH_FORMATTER.format(monthDate)} was your biggest investing month.`,
        `You contributed ${formatTreemapCurrency(metrics.largestContributionMonth.amount)} during ${MONTH_FORMATTER.format(monthDate)}.`,
        contributionDayIds(metrics.contributions, (item) => item.month === metrics.largestContributionMonth?.month),
      ));
    }
  }

  if (metrics.largestContribution && metrics.medianContributionAmount > 0) {
    const ratio = metrics.largestContribution.amount / metrics.medianContributionAmount;
    if (ratio >= thresholds.unusualContributionRatio) {
      const date = new Date(`${metrics.largestContribution.date}T00:00:00Z`);
      candidates.push(insight(
        "largest-contribution",
        "contribution-pattern",
        score(ratio, thresholds.unusualContributionRatio, 8),
        `Your biggest contribution was ${formatTreemapCurrency(metrics.largestContribution.amount)}.`,
        `It went into ${metrics.largestContribution.accountName} on ${DATE_FORMATTER.format(date)}.`,
        [metrics.largestContribution.date],
      ));
    }
  }

  if (metrics.contributionMomentumRate !== null && Math.abs(metrics.contributionMomentumRate) >= thresholds.notableDifference) {
    const increasing = metrics.contributionMomentumRate > 0;
    candidates.push(insight(
      increasing ? "contribution-momentum-up" : "contribution-momentum-down",
      "contribution-pattern",
      score(Math.abs(metrics.contributionMomentumRate), thresholds.notableDifference, 0.5),
      increasing ? "Your investing pace has picked up." : "Your contribution pace has slowed.",
      increasing
        ? `You've contributed ${formattingPercent(metrics.contributionMomentumRate)} more per month recently than earlier in the year.`
        : `Recent monthly contributions are ${formattingPercent(Math.abs(metrics.contributionMomentumRate))} lower than earlier in the year.`,
      contributionDayIds(metrics.contributions, (item) => item.month >= (metrics.year === new Date().getFullYear() ? monthId(metrics.year, Math.max(1, new Date().getMonth() - 2)) : monthId(metrics.year, 10))),
    ));
  }

  if (metrics.balanceChange !== null && metrics.balanceChangeRate !== null && (Math.abs(metrics.balanceChange) >= thresholds.balanceChangeMinimum || Math.abs(metrics.balanceChangeRate) >= thresholds.balanceChangeRateMinimum)) {
    const positive = metrics.balanceChange >= 0;
    candidates.push(insight(
      "total-balance-growth",
      "balance",
      Math.max(score(Math.abs(metrics.balanceChange), thresholds.balanceChangeMinimum, Math.max(5000, thresholds.balanceChangeMinimum * 5)), score(Math.abs(metrics.balanceChangeRate), thresholds.balanceChangeRateMinimum, 0.15)),
      `Your investment balance has ${positive ? "grown" : "declined"} by ${formatTreemapCurrency(Math.abs(metrics.balanceChange))}.`,
      `It moved from ${formatTreemapCurrency(metrics.startingBalance ?? 0)} to ${formatTreemapCurrency(metrics.endingBalance ?? 0)} during this period.`,
    ));
  }

  if (metrics.nonContributionChange !== null && metrics.totalContributions > 0) {
    const growth = metrics.nonContributionChange;
    const difference = growth - metrics.totalContributions;
    if (metrics.balanceChange !== null && (metrics.balanceChange < 0 || Math.abs(difference) >= Math.max(thresholds.balanceChangeMinimum, metrics.totalContributions * thresholds.balanceVsContributionMinimum))) {
      const growthOutpacedContributions = growth > metrics.totalContributions;
      const growthDescription = growth >= 0
        ? `growth alone brought in ${formatTreemapCurrency(growth)}`
        : `growth alone reduced your balance by ${formatTreemapCurrency(Math.abs(growth))}`;
      candidates.push(insight(
        "balance-vs-contributions",
        "balance",
        score(Math.abs(difference) / Math.max(1, metrics.totalContributions), thresholds.balanceVsContributionMinimum, 0.75),
        growthOutpacedContributions ? "Growth outpaced contributions." : "Contributions outpaced growth.",
        `You contributed ${formatTreemapCurrency(metrics.totalContributions)} while ${growthDescription} — a ${formatTreemapCurrency(Math.abs(difference))} difference.`,
      ));
    }
  }

  const largestContributionAccount = [...metrics.accountContributionStats].sort((left, right) => right.contributionShare - left.contributionShare)[0];
  if (largestContributionAccount && largestContributionAccount.contributionShare >= thresholds.accountConcentration) {
    candidates.push(insight(
      "account-contribution-concentration",
      "account-composition",
      score(largestContributionAccount.contributionShare, thresholds.accountConcentration, 0.8),
      `Most of your contributions went to your ${largestContributionAccount.accountName}.`,
      `Your ${largestContributionAccount.accountName} received ${formattingPercent(largestContributionAccount.contributionShare)} of all investment contributions this year.`,
      contributionDayIds(metrics.contributions, (item) => item.accountId === largestContributionAccount.accountId),
    ));
  }

  const largestBalanceAccount = [...metrics.accountBalanceStats].filter((item) => item.endingBalanceShare !== null).sort((left, right) => (right.endingBalanceShare ?? 0) - (left.endingBalanceShare ?? 0))[0];
  if (largestBalanceAccount && largestBalanceAccount.endingBalanceShare !== null && largestBalanceAccount.endingBalanceShare >= thresholds.accountBalanceConcentration) {
    candidates.push(insight(
      "account-balance-concentration",
      "account-composition",
      score(largestBalanceAccount.endingBalanceShare, thresholds.accountBalanceConcentration, 0.85),
      `Most of your investments sit in your ${largestBalanceAccount.accountName}.`,
      `It holds ${formattingPercent(largestBalanceAccount.endingBalanceShare)} of your total investment balance.`,
    ));
  }

  const largestAccountChange = [...metrics.accountBalanceStats].filter((item) => (item.balanceChange ?? 0) > 0).sort((left, right) => (right.balanceChange ?? 0) - (left.balanceChange ?? 0))[0];
  if (largestAccountChange && (largestAccountChange.balanceChange ?? 0) >= thresholds.accountChangeMinimum) {
    candidates.push(insight(
      "account-balance-growth",
      "account-composition",
      score(largestAccountChange.balanceChange ?? 0, thresholds.accountChangeMinimum, 10_000),
      `Your ${largestAccountChange.accountName} grew the most.`,
      `Its balance increased by ${formatTreemapCurrency(largestAccountChange.balanceChange ?? 0)} during this period.`,
    ));
  }

  const streakAccount = [...metrics.accountContributionStats].sort((left, right) => right.longestMonthlyContributionStreak - left.longestMonthlyContributionStreak)[0];
  if (streakAccount && streakAccount.longestMonthlyContributionStreak >= thresholds.contributionStreak) {
    candidates.push(insight(
      "account-contribution-streak",
      "contribution-pattern",
      score(streakAccount.longestMonthlyContributionStreak, thresholds.contributionStreak, 12),
      `You've contributed to your ${streakAccount.accountName} for ${streakAccount.longestMonthlyContributionStreak} straight months.`,
      "That's your longest active contribution streak among investment accounts.",
      contributionDayIds(metrics.contributions, (item) => item.accountId === streakAccount.accountId),
    ));
  }

  const contributionMilestone = [...metrics.monthlyContributions.entries()].reduce<{ threshold: number; month: string } | null>((crossed, [month], index) => {
    const total = [...metrics.monthlyContributions.entries()].slice(0, index + 1).reduce((sum, [, amount]) => sum + amount, 0);
    const threshold = NICE_MILESTONES.filter((value) => total >= value).at(-1);
    return threshold && (!crossed || threshold > crossed.threshold) ? { threshold, month } : crossed;
  }, null);
  if (contributionMilestone) {
    candidates.push(insight(
      "contribution-milestone",
      "milestone",
      0.55,
      `You've invested more than ${formatTreemapCurrency(contributionMilestone.threshold)} this year.`,
      `Your total contributions crossed that mark in ${MONTH_FORMATTER.format(new Date(`${contributionMilestone.month}-01T00:00:00Z`))}.`,
      contributionDayIds(metrics.contributions, (item) => item.month <= contributionMilestone!.month),
    ));
  }

  const crossedBalanceMilestone = balanceMilestone(metrics);
  if (crossedBalanceMilestone) {
    candidates.push(insight(
      "balance-milestone",
      "milestone",
      0.55,
      `Your investments crossed ${formatTreemapCurrency(crossedBalanceMilestone.threshold)}.`,
      `Your combined balance first moved above that mark in ${MONTH_FORMATTER.format(new Date(`${crossedBalanceMilestone.month}-01T00:00:00Z`))}.`,
    ));
  }

  const groupOrder: Record<InvestmentInsightGroup, number> = {
    performance: 0,
    balance: 1,
    "balance-reversal": 2,
    "contribution-resumption": 3,
    milestone: 4,
    "account-composition": 5,
    "contribution-pattern": 6,
  };
  return candidates.length
    ? sortInsightsWithDiversity(candidates, groupOrder)
    : [fallback(metrics)];
}

export function sortInvestmentInsights(
  candidates: readonly InvestmentInsight[],
): InvestmentInsight[] {
  return sortInsightsWithDiversity(candidates, {
    performance: 0,
    balance: 1,
    "balance-reversal": 2,
    "contribution-resumption": 3,
    milestone: 4,
    "account-composition": 5,
    "contribution-pattern": 6,
    fallback: 99,
  });
}
