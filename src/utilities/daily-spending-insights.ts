import type {
  AnnualSpendingHeatmap,
  SpendingHeatmapDay,
} from "./annual-spending-heatmap";
import { formatTreemapPercentage } from "../components/chart-treemap/formatters";

export type InsightGroup =
  | "overview"
  | "timing"
  | "category"
  | "vendor"
  | "person"
  | "cross-dimensional"
  | "concentration"
  | "frequency"
  | "calendar-pattern"
  | "streak";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WeekdaySpendingStats {
  weekday: Weekday;
  days: number;
  totalSpend: number;
  meanSpend: number;
  medianSpend: number;
}

export interface DailySpendingMetrics {
  year: number;
  dailyData: readonly SpendingHeatmapDay[];
  elapsedDays: number;
  spendingDays: number;
  noSpendDays: number;
  spendingDayRate: number;
  noSpendDayRate: number;
  totalSpend: number;
  meanDailySpend: number;
  medianDailySpend: number;
  meanSpendingDaySpend: number;
  medianSpendingDaySpend: number;
  daysAboveAverage: number;
  daysAboveAverageRate: number;
  maxDay: SpendingHeatmapDay | null;
  maxDayShare: number;
  top3DayShare: number;
  top5DayShare: number;
  top10PercentDaysShare: number;
  longestSpendingStreak: number;
  longestNoSpendStreak: number;
  weekdayStats: Record<Weekday, WeekdaySpendingStats>;
  weekdayMeanSpend: number;
  weekendMeanSpend: number;
  weekdayMedianSpend: number;
  weekendMedianSpend: number;
  weekendVsWeekdayRatio: number | null;
  outlierScore: number;
}

export interface DailySpendingInsight {
  id: string;
  group: InsightGroup | "fallback";
  score: number;
  headline: string;
  detail: string;
  dayIds?: readonly string[];
  highlightZeroSpendDays?: boolean;
  isFallback?: boolean;
}

/** Tune the detector boundaries here without changing the rendering layer. */
export const DAILY_SPENDING_INSIGHT_THRESHOLDS = Object.freeze({
  minimumPatternDays: 14,
  concentration: 0.35,
  concentrationStrong: 0.52,
  concentrationLow: 0.3,
  concentrationVeryLow: 0.22,
  outlier: 2.5,
  outlierStrong: 6,
  frequent: 0.8,
  frequentStrong: 0.98,
  sparse: 0.55,
  sparseStrong: 0.9,
  calendarPattern: 0.2,
  calendarPatternStrong: 0.6,
  weekdaySpecific: 1.25,
  weekdaySpecificStrong: 1.75,
  noSpendStreakLong: 7,
  spendingStreakLong: 14,
} as const);

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const wholeCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeScore(
  value: number,
  threshold: number,
  strongThreshold: number,
): number {
  if (strongThreshold <= threshold) return value >= threshold ? 1 : 0;
  return clamp((value - threshold) / (strongThreshold - threshold));
}

function inverseScore(
  value: number,
  threshold: number,
  strongThreshold: number,
): number {
  return normalizeScore(strongThreshold - value, strongThreshold - threshold, strongThreshold - threshold);
}

function streakLength(days: readonly SpendingHeatmapDay[], isSpending: boolean): number {
  let current = 0;
  let longest = 0;
  for (const day of days) {
    const matches = isSpending ? day.spend > 0 : day.spend <= 0;
    current = matches ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function matchingDayIds(
  days: readonly SpendingHeatmapDay[],
  predicate: (day: SpendingHeatmapDay) => boolean,
): string[] {
  return days.filter(predicate).map((day) => day.id);
}

function topDayIds(
  days: readonly SpendingHeatmapDay[],
  count: number,
): string[] {
  return days
    .filter((day) => day.spend > 0)
    .slice()
    .sort((left, right) => right.spend - left.spend || left.date.localeCompare(right.date))
    .slice(0, count)
    .map((day) => day.id);
}

function longestStreakDayIds(
  days: readonly SpendingHeatmapDay[],
  isSpending: boolean,
): string[] {
  let current: SpendingHeatmapDay[] = [];
  let longest: SpendingHeatmapDay[] = [];
  for (const day of days) {
    const matches = isSpending ? day.spend > 0 : day.spend <= 0;
    current = matches ? [...current, day] : [];
    if (current.length > longest.length) longest = current;
  }
  return longest.map((day) => day.id);
}

function shareOfTopDays(
  days: readonly SpendingHeatmapDay[],
  totalSpend: number,
  count: number,
): number {
  if (totalSpend <= 0) return 0;
  return days
    .slice()
    .sort((left, right) => right.spend - left.spend)
    .slice(0, count)
    .reduce((sum, day) => sum + day.spend, 0) / totalSpend;
}

function percent(value: number): string {
  return formatTreemapPercentage(value * 100);
}

function currency(value: number): string {
  return wholeCurrency.format(Number.isFinite(value) ? value : 0);
}

function insight(
  id: string,
  group: InsightGroup,
  score: number,
  headline: string,
  detail: string,
  dayIds?: readonly string[],
  highlightZeroSpendDays = false,
): DailySpendingInsight {
  return {
    id,
    group,
    score: clamp(score),
    headline,
    detail,
    dayIds: dayIds?.length ? [...dayIds] : undefined,
    highlightZeroSpendDays,
  };
}

function topDayPercent(metrics: DailySpendingMetrics, count: number): string {
  const dayCount = Math.max(1, Math.min(metrics.elapsedDays, count));
  return `${Math.max(1, Math.round((dayCount / Math.max(1, metrics.elapsedDays)) * 100))}%`;
}

export function analyzeDailySpending(
  data: AnnualSpendingHeatmap,
): DailySpendingMetrics {
  const days = data.days
    .map((day) => ({ ...day, spend: Math.max(0, Number(day.spend) || 0) }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const elapsedDays = days.length;
  const spends = days.map((day) => day.spend);
  const spendingDaySpends = spends.filter((spend) => spend > 0);
  const totalSpend = spends.reduce((sum, spend) => sum + spend, 0);
  const spendingDays = spendingDaySpends.length;
  const noSpendDays = Math.max(0, elapsedDays - spendingDays);
  const meanDailySpend = elapsedDays ? totalSpend / elapsedDays : 0;
  const daysAboveAverage = spends.filter((spend) => spend > meanDailySpend).length;

  const weekdayStats = {} as Record<Weekday, WeekdaySpendingStats>;
  for (let weekday = 0 as Weekday; weekday <= 6; weekday = (weekday + 1) as Weekday) {
    const weekdayDays = days.filter((day) => day.weekday === weekday);
    const weekdaySpends = weekdayDays.map((day) => day.spend);
    weekdayStats[weekday] = {
      weekday,
      days: weekdayDays.length,
      totalSpend: weekdaySpends.reduce((sum, spend) => sum + spend, 0),
      meanSpend: weekdayDays.length
        ? weekdaySpends.reduce((sum, spend) => sum + spend, 0) / weekdayDays.length
        : 0,
      medianSpend: median(weekdaySpends),
    };
  }

  const weekdayDays = days.filter((day) => day.weekday >= 1 && day.weekday <= 5);
  const weekendDays = days.filter((day) => day.weekday === 0 || day.weekday === 6);
  const weekdaySpends = weekdayDays.map((day) => day.spend);
  const weekendSpends = weekendDays.map((day) => day.spend);
  const maxDay = days.reduce<SpendingHeatmapDay | null>(
    (current, day) => (current === null || day.spend > current.spend ? day : current),
    null,
  );
  const medianSpendingDaySpend = median(spendingDaySpends);

  return {
    year: data.year,
    dailyData: days,
    elapsedDays,
    spendingDays,
    noSpendDays,
    spendingDayRate: elapsedDays ? spendingDays / elapsedDays : 0,
    noSpendDayRate: elapsedDays ? noSpendDays / elapsedDays : 0,
    totalSpend,
    meanDailySpend,
    medianDailySpend: median(spends),
    meanSpendingDaySpend: spendingDays ? totalSpend / spendingDays : 0,
    medianSpendingDaySpend,
    daysAboveAverage,
    daysAboveAverageRate: elapsedDays ? daysAboveAverage / elapsedDays : 0,
    maxDay: maxDay && maxDay.spend > 0 ? maxDay : null,
    maxDayShare: totalSpend && maxDay ? maxDay.spend / totalSpend : 0,
    top3DayShare: shareOfTopDays(days, totalSpend, 3),
    top5DayShare: shareOfTopDays(days, totalSpend, 5),
    top10PercentDaysShare: shareOfTopDays(
      days,
      totalSpend,
      Math.max(1, Math.ceil(elapsedDays * 0.1)),
    ),
    longestSpendingStreak: streakLength(days, true),
    longestNoSpendStreak: streakLength(days, false),
    weekdayStats,
    weekdayMeanSpend: weekdayDays.length
      ? weekdaySpends.reduce((sum, spend) => sum + spend, 0) / weekdayDays.length
      : 0,
    weekendMeanSpend: weekendDays.length
      ? weekendSpends.reduce((sum, spend) => sum + spend, 0) / weekendDays.length
      : 0,
    weekdayMedianSpend: median(weekdaySpends),
    weekendMedianSpend: median(weekendSpends),
    weekendVsWeekdayRatio:
      weekdayDays.length && weekdaySpends.length &&
      weekdaySpends.reduce((sum, spend) => sum + spend, 0) > 0
        ? (weekendSpends.reduce((sum, spend) => sum + spend, 0) / Math.max(1, weekendDays.length)) /
          (weekdaySpends.reduce((sum, spend) => sum + spend, 0) / weekdayDays.length)
        : null,
    outlierScore: medianSpendingDaySpend
      ? (maxDay?.spend ?? 0) / medianSpendingDaySpend
      : 0,
  };
}

function fallbackInsight(metrics: DailySpendingMetrics): DailySpendingInsight {
  if (metrics.totalSpend <= 0) {
    return {
      id: "empty",
      group: "fallback",
      score: 1,
      headline: "No spending yet.",
      detail: "Daily spending patterns will appear here as transactions are added.",
      isFallback: true,
    };
  }
  return {
    id: "average-daily-spend",
    group: "fallback",
    score: 0,
    headline: `Your average daily spend is ${currency(metrics.meanDailySpend)}.`,
    detail: `${percent(metrics.daysAboveAverageRate)} of days are above that average.`,
    dayIds: metrics.dailyData
      .filter((day) => day.spend > metrics.meanDailySpend)
      .map((day) => day.id),
    isFallback: true,
  };
}

/** Returns every valid deterministic insight, ordered from strongest to weakest. */
export function getDailySpendingInsights(
  metrics: DailySpendingMetrics,
): DailySpendingInsight[] {
  if (!metrics.elapsedDays || !metrics.totalSpend) return [fallbackInsight(metrics)];

  const candidates: DailySpendingInsight[] = [];
  const thresholds = DAILY_SPENDING_INSIGHT_THRESHOLDS;

  const top10Score = normalizeScore(
    metrics.top10PercentDaysShare,
    thresholds.concentration,
    thresholds.concentrationStrong,
  );
  const top5Score = normalizeScore(
    metrics.top5DayShare,
    thresholds.concentration,
    thresholds.concentrationStrong,
  );
  if (Math.max(top10Score, top5Score) > 0) {
    if (top5Score > top10Score) {
      candidates.push(
        insight(
          "top-five-concentration",
          "concentration",
          top5Score,
          "A handful of days drove your spending.",
          `Your five highest-spending days accounted for ${percent(metrics.top5DayShare)} of your total spending.`,
          topDayIds(metrics.dailyData, 5),
        ),
      );
    } else {
      const topCount = Math.max(1, Math.ceil(metrics.elapsedDays * 0.1));
      candidates.push(
        insight(
          "top-ten-percent-concentration",
          "concentration",
          top10Score,
          "Your spending came in bursts.",
          `Just ${topDayPercent(metrics, topCount)} of days accounted for ${percent(metrics.top10PercentDaysShare)} of your spending.`,
          topDayIds(metrics.dailyData, topCount),
        ),
      );
    }
  }

  if (
    metrics.top10PercentDaysShare <= thresholds.concentrationLow &&
    metrics.top10PercentDaysShare <= thresholds.concentrationVeryLow
  ) {
    candidates.push(
      insight(
        "consistent-spending",
        "concentration",
        inverseScore(
          metrics.top10PercentDaysShare,
          thresholds.concentrationVeryLow,
          thresholds.concentrationLow,
        ),
        "Your spending stayed remarkably steady.",
        `The highest-spending 10% of days accounted for only ${percent(metrics.top10PercentDaysShare)} of your spending.`,
        topDayIds(metrics.dailyData, Math.max(1, Math.ceil(metrics.elapsedDays * 0.1))),
      ),
    );
  }

  if (metrics.maxDay && metrics.outlierScore >= thresholds.outlier) {
    const maxDate = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${metrics.maxDay.date}T00:00:00Z`));
    candidates.push(
      insight(
        "single-day-outlier",
        "concentration",
        normalizeScore(metrics.outlierScore, thresholds.outlier, thresholds.outlierStrong),
        "One day changed the picture.",
        `${maxDate} was your biggest spending day at ${currency(metrics.maxDay.spend)} — ${percent(metrics.maxDayShare)} of all spending.`,
        [metrics.maxDay.id],
      ),
    );
  }

  if (metrics.elapsedDays >= thresholds.minimumPatternDays) {
    if (metrics.spendingDayRate >= thresholds.frequent) {
      candidates.push(
        insight(
          "frequent-spending",
          "frequency",
          normalizeScore(metrics.spendingDayRate, thresholds.frequent, thresholds.frequentStrong),
          "Spending was an almost-daily occurrence.",
          `You spent money on ${percent(metrics.spendingDayRate)} of days during this period.`,
          matchingDayIds(metrics.dailyData, (day) => day.spend > 0),
        ),
      );
    } else if (metrics.noSpendDayRate >= thresholds.sparse) {
      candidates.push(
        insight(
          "sparse-spending",
          "frequency",
          normalizeScore(metrics.noSpendDayRate, thresholds.sparse, thresholds.sparseStrong),
          "Most days passed without spending.",
          `You had ${metrics.noSpendDays} no-spend days — ${percent(metrics.noSpendDayRate)} of the period.`,
          matchingDayIds(metrics.dailyData, (day) => day.spend <= 0),
          true,
        ),
      );
    }

    if (metrics.daysAboveAverage > 0) {
      candidates.push(
        insight(
          "above-average-spending-days",
          "frequency",
          normalizeScore(metrics.daysAboveAverageRate, 0.1, 0.5),
          `You spent above average on ${metrics.daysAboveAverage} days.`,
          `${percent(metrics.daysAboveAverageRate)} of days were above your average daily spending of ${currency(metrics.meanDailySpend)}.`,
          matchingDayIds(metrics.dailyData, (day) => day.spend > metrics.meanDailySpend),
        ),
      );
    }
  }

  if (
    metrics.elapsedDays >= thresholds.minimumPatternDays &&
    metrics.weekendVsWeekdayRatio !== null
  ) {
    const ratio = metrics.weekendVsWeekdayRatio;
    const difference = Math.abs(ratio - 1);
    if (difference >= thresholds.calendarPattern) {
      const score = normalizeScore(
        difference,
        thresholds.calendarPattern,
        thresholds.calendarPatternStrong,
      );
      if (ratio > 1) {
        candidates.push(
          insight(
            "weekend-heavy",
            "calendar-pattern",
            score,
            "Weekends cost you more.",
            `Daily spending averaged ${percent(difference)} more on weekends than weekdays.`,
            matchingDayIds(metrics.dailyData, (day) => day.weekday === 0 || day.weekday === 6),
          ),
        );
      } else {
        candidates.push(
          insight(
            "weekday-heavy",
            "calendar-pattern",
            score,
            "Your spending leans toward weekdays.",
            `Daily spending averaged ${percent(difference)} more on weekdays than weekends.`,
            matchingDayIds(metrics.dailyData, (day) => day.weekday >= 1 && day.weekday <= 5),
          ),
        );
      }
    }
  }

  if (metrics.elapsedDays >= thresholds.minimumPatternDays && metrics.weekdayMeanSpend > 0) {
    const strongestWeekday = ([0, 1, 2, 3, 4, 5, 6] as Weekday[])
      .map((weekday) => metrics.weekdayStats[weekday])
      .filter((stats) => stats.days >= 3)
      .sort((left, right) => right.meanSpend - left.meanSpend)[0];
    if (strongestWeekday) {
      const ratio = strongestWeekday.meanSpend / metrics.meanDailySpend;
      if (ratio >= thresholds.weekdaySpecific) {
        const difference = ratio - 1;
        candidates.push(
          insight(
            "weekday-specific",
            "calendar-pattern",
            normalizeScore(difference, thresholds.weekdaySpecific - 1, thresholds.weekdaySpecificStrong - 1),
            `${WEEKDAY_NAMES[strongestWeekday.weekday]} is your biggest spending day.`,
            `A typical ${WEEKDAY_NAMES[strongestWeekday.weekday]} costs about ${percent(difference)} more than a typical day.`,
            matchingDayIds(metrics.dailyData, (day) => day.weekday === strongestWeekday.weekday),
          ),
        );
      }
    }
  }

  const noSpendThreshold = metrics.elapsedDays >= 365
    ? thresholds.noSpendStreakLong
    : metrics.elapsedDays >= 90
      ? 6
      : 5;
  if (metrics.elapsedDays >= thresholds.minimumPatternDays && metrics.longestNoSpendStreak > 0) {
    candidates.push(
      insight(
        "no-spend-streak",
        "streak",
        normalizeScore(metrics.longestNoSpendStreak, 1, Math.max(2, noSpendThreshold * 2)),
        `You went ${metrics.longestNoSpendStreak} days without spending.`,
        "That was your longest no-spend stretch during this period.",
        longestStreakDayIds(metrics.dailyData, false),
        true,
      ),
    );
  }

  const spendingThreshold = metrics.elapsedDays >= 365
    ? thresholds.spendingStreakLong
    : metrics.elapsedDays >= 90
      ? 10
      : 7;
  if (metrics.elapsedDays >= thresholds.minimumPatternDays && metrics.longestSpendingStreak > 0) {
    candidates.push(
      insight(
        "spending-streak",
        "streak",
        normalizeScore(metrics.longestSpendingStreak, 1, Math.max(2, spendingThreshold * 2)),
        `You spent money ${metrics.longestSpendingStreak} days in a row.`,
        "That was your longest uninterrupted spending streak during this period.",
        longestStreakDayIds(metrics.dailyData, true),
      ),
    );
  }

  const groupOrder: Partial<Record<InsightGroup, number>> = {
    concentration: 0,
    frequency: 1,
    "calendar-pattern": 2,
    streak: 3,
  };
  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      (groupOrder[left.group as InsightGroup] ?? 99) - (groupOrder[right.group as InsightGroup] ?? 99) ||
      left.id.localeCompare(right.id),
  );
  return candidates.length ? candidates : [fallbackInsight(metrics)];
}

export function buildDailySpendingInsights(
  data: AnnualSpendingHeatmap,
): { metrics: DailySpendingMetrics; insights: DailySpendingInsight[] } {
  const metrics = analyzeDailySpending(data);
  return { metrics, insights: getDailySpendingInsights(metrics) };
}
