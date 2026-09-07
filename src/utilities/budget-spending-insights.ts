import type { Account } from "../api/account-api";
import type { BudgetEntity, BudgetTransaction } from "../api/budget-api";
import type {
  AnnualSpendingHeatmap,
  SpendingHeatmapDay,
} from "./annual-spending-heatmap";
import {
  ledgerVendorLabel,
  reportingTransactions,
} from "./activity-effects";
import {
  analyzeDailySpending,
  getDailySpendingInsights,
  type DailySpendingInsight,
  type DailySpendingMetrics,
  type InsightGroup,
} from "./daily-spending-insights";
import {
  formatTreemapCurrency,
  formatTreemapPercentage,
} from "../components/chart-treemap/formatters";
import { sortInsightsWithDiversity } from "./insight-ordering";

export type CategorySemanticKind =
  | "discretionary"
  | "dining"
  | "shopping"
  | "subscriptions"
  | "housing"
  | "groceries"
  | "gas"
  | "transportation"
  | "utilities"
  | "health"
  | "travel"
  | "other";

/**
 * The budget API currently stores categories as flat entities without a
 * semantic field. Keep the vocabulary in one place so detectors never grow
 * scattered name checks as categories evolve.
 */
const CATEGORY_SEMANTICS: ReadonlyArray<readonly [CategorySemanticKind, readonly string[]]> = [
  ["housing", ["housing", "rent", "mortgage"]],
  ["subscriptions", ["subscription", "subscriptions", "membership"]],
  ["dining", ["dining", "restaurant", "restaurants", "takeout", "delivery", "coffee"]],
  ["shopping", ["shopping", "clothing", "retail", "amazon"]],
  ["groceries", ["grocery", "groceries", "supermarket"]],
  ["gas", ["gas", "fuel"]],
  ["transportation", ["transportation", "transport", "parking", "transit", "car"]],
  ["utilities", ["utility", "utilities", "electric", "water", "internet"]],
  ["health", ["health", "medical", "doctor", "pharmacy", "dental"]],
  ["travel", ["travel", "hotel", "flight", "vacation"]],
  ["discretionary", ["discretionary", "entertainment", "hobby", "hobbies", "fun", "personal"]],
];

export function classifyCategoryKind(name: string): CategorySemanticKind {
  const normalized = String(name)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  for (const [kind, terms] of CATEGORY_SEMANTICS) {
    if (terms.some((term) => normalized.includes(term))) return kind;
  }
  return "other";
}

export const BUDGET_SPENDING_INSIGHT_THRESHOLDS = Object.freeze({
  minimumPeriodDays: 14,
  minimumEntityTransactions: 3,
  minimumCategoryShare: 0.08,
  minimumVendorShare: 0.035,
  minimumPersonShare: 0.12,
  minimumMeaningfulChange: 50,
  minimumComparisonBase: 100,
  minimumChangeRate: 0.2,
  frequentStopTransactions: 30,
  minimumWeekendShare: 0.35,
  minimumWeekendDifference: 0.1,
  minimumMonthlyRatio: 1.8,
  minimumConcentration: 0.35,
} as const);

export interface BudgetSpendingInsightContext {
  data: AnnualSpendingHeatmap;
  transactions: ReadonlyArray<BudgetTransaction>;
  accounts: ReadonlyArray<Account>;
  categories?: ReadonlyArray<BudgetEntity>;
  vendors?: ReadonlyArray<BudgetEntity>;
  people?: ReadonlyArray<BudgetEntity>;
}

export interface BudgetSpendingInsightResult {
  dailyMetrics: DailySpendingMetrics;
  insights: DailySpendingInsight[];
}

interface SpendingMetric {
  id: string;
  label: string;
  total: number;
  previousTotal: number;
  count: number;
  medianTransaction: number;
  share: number;
  previousShare: number;
  changeRate: number | null;
  shareChange: number;
  activeDays: number;
  activeMonths: number;
  dailyTotals: Map<string, number>;
  monthTotals: Map<string, number>;
  weekendTotal: number;
  semantic?: CategorySemanticKind;
}

interface SpendingEvent {
  id: string;
  date: string;
  amount: number;
  weekday: number;
  month: string;
  categoryId: string;
  categoryLabel: string;
  vendorId: string;
  vendorLabel: string;
  personId: string;
  personLabel: string;
}

interface Candidate extends DailySpendingInsight {
  eventKey: string;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const GROUP_ORDER: Record<InsightGroup | "fallback", number> = {
  overview: 0,
  category: 1,
  person: 2,
  vendor: 3,
  "cross-dimensional": 4,
  timing: 5,
  concentration: 6,
  frequency: 7,
  "calendar-pattern": 8,
  streak: 9,
  fallback: 10,
};

function isNoSpendInsight(insight: Candidate): boolean {
  return insight.id === "overview:no-spend-days" ||
    insight.id === "daily:sparse-spending" ||
    insight.id === "daily:no-spend-streak";
}

function orderBudgetInsights(candidates: readonly Candidate[]): Candidate[] {
  const ordered = sortInsightsWithDiversity(candidates, GROUP_ORDER);
  if (ordered.length < 2 || !isNoSpendInsight(ordered[0]!)) return ordered;

  const firstNonNoSpendIndex = ordered.findIndex((item) => !isNoSpendInsight(item));
  if (firstNonNoSpendIndex <= 0) return ordered;
  [ordered[0], ordered[firstNonNoSpendIndex]] = [
    ordered[firstNonNoSpendIndex]!,
    ordered[0]!,
  ];
  return ordered;
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function percent(value: number): string {
  return formatTreemapPercentage(value * 100);
}

function currency(value: number): string {
  return formatTreemapCurrency(value);
}

function score(value: number, threshold: number, strongThreshold: number): number {
  if (strongThreshold <= threshold) return value >= threshold ? 1 : 0;
  return Math.max(0, Math.min(1, (value - threshold) / (strongThreshold - threshold)));
}

function validDate(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
}

function dateInRange(date: string, start: string, end: string): boolean {
  return validDate(date) && date >= start && date <= end;
}

function priorDateForCurrentEnd(date: string, year: number): string {
  const monthDay = date.slice(5);
  const candidate = `${year - 1}-${monthDay}`;
  if (validDate(candidate)) return candidate;
  return `${year - 1}-02-28`;
}

function metricChangeRate(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

function changeDescription(current: number, previous: number): string {
  if (previous <= 0) return "new spending";
  const rate = Math.abs((current - previous) / previous);
  return `${rate >= 0.01 ? percent(rate) : "less than 1%"} ${current >= previous ? "higher" : "lower"} than the comparable period`;
}

function entityMap(entities: ReadonlyArray<BudgetEntity> | undefined): Map<string, string> {
  return new Map((entities ?? []).map((entity) => [entity.id, entity.name.trim()]));
}

function periodEnd(data: AnnualSpendingHeatmap): string {
  return data.days[data.days.length - 1]?.date ?? `${data.year}-01-01`;
}

function eventForTransaction(
  transaction: BudgetTransaction,
  categoryNames: Map<string, string>,
  vendorNames: Map<string, string>,
  peopleNames: Map<string, string>,
): SpendingEvent | null {
  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !validDate(transaction.date)) return null;
  const categoryId = String(transaction.categoryId ?? "").trim() || "uncategorized";
  const vendorId = String(transaction.vendorId ?? "").trim();
  const personId = String(transaction.assignmentId ?? "").trim();
  const categoryLabel = categoryNames.get(categoryId) || String(transaction.category ?? "").trim() || "Uncategorized";
  const vendorLabel = vendorNames.get(vendorId) || ledgerVendorLabel(transaction) || "Unassigned vendor";
  const personLabel = peopleNames.get(personId) || String(transaction.assignment ?? "").trim() || "Unassigned";
  return {
    id: transaction.id,
    date: transaction.date,
    amount,
    weekday: new Date(`${transaction.date}T00:00:00Z`).getUTCDay(),
    month: transaction.date.slice(0, 7),
    categoryId,
    categoryLabel,
    vendorId: vendorId || `vendor:${vendorLabel.toLocaleLowerCase()}`,
    vendorLabel,
    personId,
    personLabel,
  };
}

function createMetric(id: string, label: string, semantic?: CategorySemanticKind): SpendingMetric {
  return {
    id,
    label,
    total: 0,
    previousTotal: 0,
    count: 0,
    medianTransaction: 0,
    share: 0,
    previousShare: 0,
    changeRate: null,
    shareChange: 0,
    activeDays: 0,
    activeMonths: 0,
    dailyTotals: new Map(),
    monthTotals: new Map(),
    weekendTotal: 0,
    semantic,
  };
}

function buildMetrics(
  currentEvents: readonly SpendingEvent[],
  previousEvents: readonly SpendingEvent[],
  key: "categoryId" | "vendorId" | "personId",
  labelKey: "categoryLabel" | "vendorLabel" | "personLabel",
  total: number,
  previousTotal: number,
  semanticForCategory = false,
): SpendingMetric[] {
  const values = new Map<string, SpendingMetric>();
  const transactions = new Map<string, number[]>();
  const previousValues = new Map<string, number>();

  for (const event of previousEvents) {
    if (key === "personId" && !event.personId) continue;
    previousValues.set(event[key], (previousValues.get(event[key]) ?? 0) + event.amount);
  }
  for (const event of currentEvents) {
    if (key === "personId" && !event.personId) continue;
    const id = event[key];
    const label = event[labelKey];
    const current = values.get(id) ?? createMetric(
      id,
      label,
      semanticForCategory ? classifyCategoryKind(label) : undefined,
    );
    current.total += event.amount;
    current.count += 1;
    current.dailyTotals.set(event.date, (current.dailyTotals.get(event.date) ?? 0) + event.amount);
    current.monthTotals.set(event.month, (current.monthTotals.get(event.month) ?? 0) + event.amount);
    if (event.weekday === 0 || event.weekday === 6) current.weekendTotal += event.amount;
    values.set(id, current);
    const amounts = transactions.get(id) ?? [];
    amounts.push(event.amount);
    transactions.set(id, amounts);
  }

  return [...values.values()].map((metric) => {
    metric.previousTotal = previousValues.get(metric.id) ?? 0;
    metric.count = transactions.get(metric.id)?.length ?? 0;
    metric.medianTransaction = median(transactions.get(metric.id) ?? []);
    metric.share = total > 0 ? metric.total / total : 0;
    metric.previousShare = previousTotal > 0 ? metric.previousTotal / previousTotal : 0;
    metric.changeRate = metricChangeRate(metric.total, metric.previousTotal);
    metric.shareChange = metric.share - metric.previousShare;
    metric.activeDays = metric.dailyTotals.size;
    metric.activeMonths = metric.monthTotals.size;
    return metric;
  }).sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
}

function topDayShare(metric: SpendingMetric): number {
  if (!metric.total) return 0;
  return Math.max(...metric.dailyTotals.values(), 0) / metric.total;
}

function recentMomentum(metric: SpendingMetric): number | null {
  const months = [...metric.monthTotals.keys()].sort();
  if (months.length < 4) return null;
  const recent = months.slice(-3).map((month) => metric.monthTotals.get(month) ?? 0);
  const earlier = months.slice(0, -3).map((month) => metric.monthTotals.get(month) ?? 0);
  const recentAverage = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const earlierAverage = earlier.reduce((sum, value) => sum + value, 0) / earlier.length;
  return earlierAverage > 0 ? (recentAverage - earlierAverage) / earlierAverage : null;
}

function biggestMonthlySpike(metric: SpendingMetric): { month: string; ratio: number } | null {
  const values = [...metric.monthTotals.entries()];
  if (values.length < 3) return null;
  const baseline = median(values.map(([, value]) => value).filter((value) => value > 0));
  if (!baseline) return null;
  const [month, amount] = values.sort((left, right) => right[1] - left[1])[0]!;
  return { month, ratio: amount / baseline };
}

function datesForMetric(metric: SpendingMetric, predicate?: (date: string) => boolean): string[] {
  return [...metric.dailyTotals.keys()].filter((date) => predicate?.(date) ?? true);
}

function eventDayIds(
  events: readonly SpendingEvent[],
  predicate: (event: SpendingEvent) => boolean,
): string[] {
  return [...new Set(events.filter(predicate).map((event) => event.date))];
}

function semanticLabel(kind: CategorySemanticKind): string {
  return {
    discretionary: "Discretionary spending",
    dining: "Dining out",
    shopping: "Shopping",
    subscriptions: "Subscriptions",
    housing: "Housing",
    groceries: "Groceries",
    gas: "Gas",
    transportation: "Transportation",
    utilities: "Utilities",
    health: "Health",
    travel: "Travel",
    other: "Spending",
  }[kind];
}

function metricIsMeaningful(metric: SpendingMetric, minimumShare: number): boolean {
  return metric.count >= BUDGET_SPENDING_INSIGHT_THRESHOLDS.minimumEntityTransactions && metric.share >= minimumShare;
}

export function buildBudgetSpendingInsights(
  context: BudgetSpendingInsightContext,
): BudgetSpendingInsightResult {
  const dailyMetrics = analyzeDailySpending(context.data);
  if (!dailyMetrics.totalSpend) {
    return { dailyMetrics, insights: getDailySpendingInsights(dailyMetrics) };
  }

  const categoryNames = entityMap(context.categories);
  const vendorNames = entityMap(context.vendors);
  const peopleNames = entityMap(context.people);
  const end = periodEnd(context.data);
  const start = `${context.data.year}-01-01`;
  const previousStart = `${context.data.year - 1}-01-01`;
  const previousEnd = priorDateForCurrentEnd(end, context.data.year);
  const events = reportingTransactions(context.transactions, context.accounts)
    .filter((transaction) => transaction.type === "expense")
    .map((transaction) => eventForTransaction(transaction, categoryNames, vendorNames, peopleNames))
    .filter((event): event is SpendingEvent => Boolean(event));
  const currentEvents = events.filter((event) => dateInRange(event.date, start, end));
  const previousEvents = events.filter((event) => dateInRange(event.date, previousStart, previousEnd));
  const total = currentEvents.reduce((sum, event) => sum + event.amount, 0);
  const previousTotal = previousEvents.reduce((sum, event) => sum + event.amount, 0);
  if (!total) return { dailyMetrics, insights: getDailySpendingInsights(dailyMetrics) };

  const categories = buildMetrics(currentEvents, previousEvents, "categoryId", "categoryLabel", total, previousTotal, true);
  const vendors = buildMetrics(currentEvents, previousEvents, "vendorId", "vendorLabel", total, previousTotal);
  const people = buildMetrics(currentEvents, previousEvents, "personId", "personLabel", total, previousTotal);
  const candidates: Candidate[] = getDailySpendingInsights(dailyMetrics).map((item) => ({
    ...item,
    eventKey: `daily:${item.id}`,
  }));
  const seen = new Set(candidates.map((item) => item.eventKey));
  const add = (
    eventKey: string,
    group: InsightGroup,
    insightScore: number,
    headline: string,
    detail: string,
    dayIds?: readonly string[],
    highlightZeroSpendDays = false,
  ): void => {
    if (seen.has(eventKey)) return;
    seen.add(eventKey);
    candidates.push({
      id: eventKey,
      eventKey,
      group,
      score: Math.max(0, Math.min(1, insightScore)),
      headline,
      detail,
      dayIds: dayIds?.length ? [...dayIds] : undefined,
      highlightZeroSpendDays,
    });
  };

  const thresholds = BUDGET_SPENDING_INSIGHT_THRESHOLDS;
  const overallChange = metricChangeRate(total, previousTotal);
  if (overallChange !== null && previousTotal >= thresholds.minimumComparisonBase && Math.abs(total - previousTotal) >= Math.max(thresholds.minimumMeaningfulChange, total * 0.02) && Math.abs(overallChange) >= thresholds.minimumChangeRate) {
    add(
      "overview:year-over-year",
      "overview",
      score(Math.abs(overallChange), thresholds.minimumChangeRate, 0.75),
      `Your spending was ${overallChange >= 0 ? "higher" : "lower"} this year.`,
      `You spent ${currency(total)} — ${changeDescription(total, previousTotal)} than the comparable period.`,
    );
  }

  if (dailyMetrics.elapsedDays >= thresholds.minimumPeriodDays && dailyMetrics.noSpendDays >= Math.max(7, Math.ceil(dailyMetrics.elapsedDays * 0.15))) {
    add(
      "overview:no-spend-days",
      "overview",
      score(dailyMetrics.noSpendDayRate, 0.15, 0.5),
      `You had ${dailyMetrics.noSpendDays} no-spend days.`,
      `${percent(dailyMetrics.noSpendDayRate)} of the days in this period passed without a spending transaction.`,
      dailyMetrics.dailyData.filter((day) => day.spend <= 0).map((day) => day.id),
      true,
    );
  }

  const weekendSpend = dailyMetrics.dailyData
    .filter((day) => day.weekday === 0 || day.weekday === 6)
    .reduce((sum, day) => sum + day.spend, 0);
  const weekendShare = weekendSpend / dailyMetrics.totalSpend;
  if (weekendShare >= thresholds.minimumWeekendShare) {
    add(
      "timing:weekend-total",
      "timing",
      score(weekendShare, thresholds.minimumWeekendShare, 0.65),
      "Weekends account for a meaningful share of spending.",
      `${currency(weekendSpend)} — ${percent(weekendShare)} of your spending — happened on weekends.`,
      dailyMetrics.dailyData.filter((day) => day.weekday === 0 || day.weekday === 6).map((day) => day.id),
    );
  }

  const weekdayStats = Object.values(dailyMetrics.weekdayStats).filter((stats) => stats.days >= 3 && stats.medianSpend > 0);
  const lightestWeekday = weekdayStats.sort((left, right) => left.medianSpend - right.medianSpend)[0];
  if (lightestWeekday && dailyMetrics.medianSpendingDaySpend > 0) {
    const difference = 1 - lightestWeekday.medianSpend / dailyMetrics.medianSpendingDaySpend;
    if (difference >= 0.2) {
      add(
        "timing:lightest-weekday",
        "timing",
        score(difference, 0.2, 0.6),
        `${WEEKDAY_NAMES[lightestWeekday.weekday]}s are your lightest spending day.`,
        `A typical ${WEEKDAY_NAMES[lightestWeekday.weekday]} costs ${currency(lightestWeekday.medianSpend)} — ${percent(difference)} less than a typical spending day.`,
        dailyMetrics.dailyData.filter((day) => day.weekday === lightestWeekday.weekday).map((day) => day.id),
      );
    }
  }

  const categoryMinimum = thresholds.minimumCategoryShare;
  const largestCategory = categories.find((metric) => metricIsMeaningful(metric, categoryMinimum));
  if (largestCategory) {
    if (largestCategory.semantic && largestCategory.semantic !== "other") {
      const label = semanticLabel(largestCategory.semantic);
      add(
        `category:semantic:${largestCategory.id}`,
        "category",
        score(largestCategory.share, categoryMinimum, 0.4),
        `${label} was your largest spending area.`,
        `${label} accounted for ${percent(largestCategory.share)} of spending at ${currency(largestCategory.total)}.`,
        datesForMetric(largestCategory),
      );
    } else {
      add(
        `category:largest:${largestCategory.id}`,
        "category",
        score(largestCategory.share, categoryMinimum, 0.4),
        `${largestCategory.label} was your largest spending category.`,
        `It accounted for ${percent(largestCategory.share)} of spending at ${currency(largestCategory.total)}.`,
        datesForMetric(largestCategory),
      );
    }
  }

  const frequentCategory = categories
    .filter((metric) => metric.count >= thresholds.minimumEntityTransactions)
    .sort((left, right) => right.count - left.count || right.total - left.total)[0];
  if (frequentCategory && frequentCategory.count / Math.max(1, currentEvents.length) >= 0.2) {
    add(
      `category:frequent:${frequentCategory.id}`,
      "category",
      score(frequentCategory.count / Math.max(1, currentEvents.length), 0.2, 0.5),
      `${frequentCategory.label} was your most frequent category.`,
      `${frequentCategory.count} of your ${currentEvents.length} spending transactions were in this category.`,
      datesForMetric(frequentCategory),
    );
  }

  for (const metric of categories) {
    if (!metricIsMeaningful(metric, categoryMinimum)) continue;
    if (metric.changeRate !== null && metric.previousTotal >= thresholds.minimumComparisonBase && Math.abs(metric.total - metric.previousTotal) >= Math.max(thresholds.minimumMeaningfulChange, total * 0.01) && Math.abs(metric.changeRate) >= thresholds.minimumChangeRate) {
      add(
        `category:yoy:${metric.id}`,
        "category",
        score(Math.abs(metric.changeRate), thresholds.minimumChangeRate, 0.8),
        `${metric.label} changed meaningfully this year.`,
        `Spending was ${metric.changeRate >= 0 ? "up" : "down"} ${percent(Math.abs(metric.changeRate))} to ${currency(metric.total)} — ${changeDescription(metric.total, metric.previousTotal)}.`,
        datesForMetric(metric),
      );
    }
    if (metric.id !== largestCategory?.id && metric.share >= categoryMinimum) {
      add(
        `category:share:${metric.id}`,
        "category",
        score(metric.share, categoryMinimum, 0.4),
        `${metric.label} made up ${percent(metric.share)} of total spending.`,
        `You spent ${currency(metric.total)} on ${metric.label.toLocaleLowerCase()}.`,
        datesForMetric(metric),
      );
    }
    const momentum = recentMomentum(metric);
    if (momentum !== null && Math.abs(momentum) >= 0.3) {
      const momentumDirection = momentum > 0 ? "greater" : "lower";
      add(
        `category:momentum:${metric.id}`,
        "category",
        score(Math.abs(momentum), 0.3, 1),
        `${metric.label} has ${momentum > 0 ? "accelerated" : "slowed"} recently.`,
        `Spending over the last 3 months was ${percent(Math.abs(momentum))} ${momentumDirection} than in previous months.`,
        datesForMetric(metric),
      );
    }
    const spike = biggestMonthlySpike(metric);
    if (spike && spike.ratio >= thresholds.minimumMonthlyRatio) {
      const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(`${spike.month}-01T00:00:00Z`));
      add(
        `category:monthly-spike:${metric.id}`,
        "category",
        score(spike.ratio, thresholds.minimumMonthlyRatio, 4),
        `${metric.label} spiked in ${month}.`,
        `That month was ${spike.ratio.toFixed(1)} times its typical monthly spending for this category.`,
        datesForMetric(metric, (date) => date.startsWith(spike.month)),
      );
    }
    const concentration = topDayShare(metric);
    if (concentration >= thresholds.minimumConcentration && metric.count >= 5) {
      add(
        `category:concentration:${metric.id}`,
        "category",
        score(concentration, thresholds.minimumConcentration, 0.75),
        `${metric.label} was concentrated on a few days.`,
        `The biggest day accounted for ${percent(concentration)} of your ${metric.label.toLocaleLowerCase()} spending.`,
        datesForMetric(metric),
      );
    }
    const categoryWeekendShare = metric.weekendTotal / Math.max(1, metric.total);
    if (categoryWeekendShare >= 0.55 && categoryWeekendShare - weekendShare >= 0.1) {
      add(
        `category:weekend:${metric.id}`,
        "category",
        score(categoryWeekendShare, 0.55, 0.85),
        `${metric.label} leans toward weekends.`,
        `${percent(categoryWeekendShare)} of this category's spending happened on weekends.`,
        eventDayIds(currentEvents, (event) =>
          event.categoryId === metric.id && (event.weekday === 0 || event.weekday === 6),
        ),
      );
    }
  }

  const vendorMinimum = thresholds.minimumVendorShare;
  const largestVendor = vendors.find((metric) => metricIsMeaningful(metric, vendorMinimum));
  const maxVendorTransactionCount = Math.max(...vendors.map((metric) => metric.count), 1);
  if (largestVendor) {
    add(
      `vendor:largest:${largestVendor.id}`,
      "vendor",
      score(largestVendor.share, vendorMinimum, 0.25),
      `${largestVendor.label} was your largest vendor.`,
      `You spent ${currency(largestVendor.total)} there — ${percent(largestVendor.share)} of your total spending.`,
      datesForMetric(largestVendor),
    );
  }
  for (const metric of vendors) {
    if (metric.count > thresholds.frequentStopTransactions) {
      add(
        `vendor:frequent:${metric.id}`,
        "vendor",
        score(metric.count, thresholds.frequentStopTransactions, Math.max(thresholds.frequentStopTransactions + 1, maxVendorTransactionCount)),
        `${metric.label} was a frequent stop.`,
        `You made ${metric.count} transactions there, averaging ${currency(metric.total / metric.count)} each.`,
        datesForMetric(metric),
      );
    }
    if (!metricIsMeaningful(metric, vendorMinimum)) continue;
    if (metric.changeRate !== null && metric.previousTotal >= thresholds.minimumComparisonBase && Math.abs(metric.total - metric.previousTotal) >= Math.max(thresholds.minimumMeaningfulChange, total * 0.01) && Math.abs(metric.changeRate) >= thresholds.minimumChangeRate) {
      add(
        `vendor:yoy:${metric.id}`,
        "vendor",
        score(Math.abs(metric.changeRate), thresholds.minimumChangeRate, 1),
        `${metric.label} changed meaningfully this year.`,
        `Spending was ${metric.changeRate >= 0 ? "up" : "down"} ${percent(Math.abs(metric.changeRate))} there, reaching ${currency(metric.total)}.`,
        datesForMetric(metric),
      );
    }
  }

  const personMinimum = thresholds.minimumPersonShare;
  for (const metric of people.filter((item) => metricIsMeaningful(item, personMinimum))) {
    if (metric.changeRate !== null && metric.previousTotal >= thresholds.minimumComparisonBase && Math.abs(metric.total - metric.previousTotal) >= Math.max(thresholds.minimumMeaningfulChange, total * 0.01) && Math.abs(metric.changeRate) >= thresholds.minimumChangeRate) {
      add(
        `person:yoy:${metric.id}`,
        "person",
        score(Math.abs(metric.changeRate), thresholds.minimumChangeRate, 1),
        `${metric.label}'s spending changed meaningfully.`,
        `Spending associated with ${metric.label} was ${metric.changeRate >= 0 ? "up" : "down"} ${percent(Math.abs(metric.changeRate))} to ${currency(metric.total)}.`,
        datesForMetric(metric),
      );
    }
  }

  const comboMetrics = (
    leftKey: "categoryId" | "personId",
    rightKey: "vendorId" | "categoryId" | "personId",
  ): Map<string, { total: number; left: string; right: string }> => {
    const combos = new Map<string, { total: number; left: string; right: string }>();
    for (const event of currentEvents) {
      const left = event[leftKey];
      const right = event[rightKey];
      if (!left || !right || left === right) continue;
      const key = `${left}|${right}`;
      const current = combos.get(key) ?? { total: 0, left, right };
      current.total += event.amount;
      combos.set(key, current);
    }
    return combos;
  };

  const categoryVendor = comboMetrics("categoryId", "vendorId");
  for (const category of categories.slice(0, 10)) {
    const rows = [...categoryVendor.values()].filter((row) => row.left === category.id).sort((left, right) => right.total - left.total);
    const top = rows[0];
    const vendor = top && vendors.find((item) => item.id === top.right);
    if (!top || !vendor || category.total <= 0 || top.total / category.total < 0.45 || top.total >= category.total) continue;
    add(
      `cross:category-vendor:${category.id}`,
      "cross-dimensional",
      score(top.total / category.total, 0.45, 0.8),
      `${vendor.label} drove much of your ${category.label} spending.`,
      `${currency(top.total)} of ${category.label.toLocaleLowerCase()} spending — ${percent(top.total / category.total)} — went there.`,
      eventDayIds(currentEvents, (event) => event.categoryId === category.id && event.vendorId === top.right),
    );
  }

  const personVendor = comboMetrics("personId", "vendorId");
  for (const person of people) {
    const rows = [...personVendor.values()].filter((row) => row.left === person.id).sort((left, right) => right.total - left.total);
    const top = rows[0];
    const vendor = top && vendors.find((item) => item.id === top.right);
    const personTotal = people.find((item) => item.id === person.id)?.total ?? 0;
    if (!top || !vendor || personTotal <= 0 || top.total / personTotal < 0.55) continue;
    add(
      `cross:person-vendor:${person.id}`,
      "cross-dimensional",
      score(top.total / personTotal, 0.55, 0.9),
      `${vendor.label} drove most of ${person.label}'s spending.`,
      `${vendor.label} accounted for ${percent(top.total / personTotal)} of spending associated with ${person.label}.`,
      eventDayIds(currentEvents, (event) => event.personId === person.id && event.vendorId === top.right),
    );
  }

  const categoryDeltas = categories
    .map((metric) => ({ metric, delta: metric.total - metric.previousTotal }))
    .filter(({ delta }) => Math.abs(delta) >= thresholds.minimumMeaningfulChange)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
  const totalDelta = total - previousTotal;
  const driver = categoryDeltas[0];
  if (driver && (totalDelta <= 0 || previousTotal >= thresholds.minimumComparisonBase) && Math.abs(totalDelta) >= thresholds.minimumMeaningfulChange && Math.abs(driver.delta) / Math.abs(totalDelta) >= 0.4) {
    add(
      `cross:change-driver:${driver.metric.id}`,
      "cross-dimensional",
      score(Math.abs(driver.delta) / Math.max(1, Math.abs(totalDelta)), 0.4, 0.8),
      `${driver.metric.label} was the biggest driver of the change.`,
      `Its spending moved ${driver.delta >= 0 ? "up" : "down"} ${currency(Math.abs(driver.delta))}, accounting for ${percent(Math.abs(driver.delta) / Math.max(1, Math.abs(totalDelta)))} of the overall change.`,
      datesForMetric(driver.metric),
    );
  }

  return {
    dailyMetrics,
    insights: orderBudgetInsights(candidates),
  };
}
