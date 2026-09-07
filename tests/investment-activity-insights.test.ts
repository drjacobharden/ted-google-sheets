import { describe, expect, test } from "bun:test";
import type { Account, AccountActivity, AccountBalance } from "../src/api/account-api";
import { buildAnnualInvestmentHeatmap } from "../src/utilities/annual-investment-heatmap";
import {
  aggregateContributionsByAccountDay,
  aggregatePortfolioContributionDays,
  analyzeInvestmentActivity,
  getInvestmentInsights,
  isContributionMilestone,
  sortInvestmentInsights,
} from "../src/utilities/investment-activity-insights";

const account = (id: string, name: string): Account => ({
  id,
  name,
  type: "investment",
  assignmentId: "shared",
  active: true,
  source: "manual",
  createdAt: "",
  updatedAt: "",
});

const activity = (
  id: string,
  accountId: string,
  date: string,
  amount: number,
): AccountActivity => ({
  id,
  accountId,
  date,
  month: date.slice(0, 7),
  amount,
  source: "manual",
  activityType: "contribution",
  createdAt: "",
  createdBy: "user",
});

const balance = (
  id: string,
  accountId: string,
  month: string,
  amount: number,
): AccountBalance => ({
  id,
  accountId,
  month,
  asOfDate: `${month}-28`,
  balance: amount,
  notes: "",
  createdAt: "",
  createdBy: "user",
  updatedAt: "",
  updatedBy: "user",
});

describe("investment activity insights", () => {
  test("aggregates positive contributions by day using the shared heatmap model", () => {
    const accounts = [account("401k", "401(k)")];
    const activities = [
      activity("one", "401k", "2025-01-15", 100),
      activity("two", "401k", "2025-01-15", 50),
      activity("withdrawal", "401k", "2025-01-16", -25),
    ];
    const heatmap = buildAnnualInvestmentHeatmap(activities, accounts, 2025);
    const day = heatmap.days.find((item) => item.date === "2025-01-15");

    expect(heatmap.variant).toBe("investment");
    expect(day?.spend).toBe(150);
    expect(heatmap.days.find((item) => item.date === "2025-01-16")?.spend).toBe(0);
  });

  test("normalizes account-day rows before deriving portfolio days", () => {
    const rows = [
      { accountId: "401k", accountName: "401(k)", date: "2025-08-15", month: "2025-08", amount: 500 },
      { accountId: "401k", accountName: "401(k)", date: "2025-08-15", month: "2025-08", amount: 250 },
      { accountId: "403b", accountName: "403(b)", date: "2025-08-15", month: "2025-08", amount: 100 },
    ];
    const accountDays = aggregateContributionsByAccountDay(rows);
    const portfolioDays = aggregatePortfolioContributionDays(accountDays);

    expect(accountDays).toHaveLength(2);
    expect(accountDays.find((item) => item.accountId === "401k")?.amount).toBe(750);
    expect(accountDays.reduce((sum, item) => sum + item.amount, 0)).toBe(
      rows.reduce((sum, item) => sum + item.amount, 0),
    );
    expect(portfolioDays.reduce((sum, item) => sum + item.amount, 0)).toBe(850);
    expect(portfolioDays).toEqual([{ date: "2025-08-15", amount: 850, accountCount: 2 }]);
  });

  test("calculates contribution and balance-change metrics from the selected year", () => {
    const accounts = [account("401k", "401(k)"), account("roth", "Roth IRA")];
    const activities = [
      activity("one", "401k", "2025-01-15", 100),
      activity("two", "401k", "2025-01-15", 50),
      activity("three", "roth", "2025-03-15", 500),
    ];
    const metrics = analyzeInvestmentActivity(
      activities,
      [
        balance("open-401k", "401k", "2024-12", 1000),
        balance("open-roth", "roth", "2024-12", 500),
        balance("close-401k", "401k", "2025-12", 1400),
        balance("close-roth", "roth", "2025-12", 800),
      ],
      accounts,
      2025,
    );

    expect(metrics.totalContributions).toBe(650);
    expect(metrics.contributionDays).toBe(2);
    expect(metrics.contributionCount).toBe(2);
    expect(metrics.aboveAverageContributionCount).toBe(1);
    expect(metrics.contributionDaysPerMonth).toBeCloseTo(2 / 12);
    expect(metrics.medianContributionDayAmount).toBe(325);
    expect(metrics.accountContributionStats.find((item) => item.accountId === "401k")?.contributionDays).toBe(1);
    expect(metrics.startingBalance).toBe(1500);
    expect(metrics.endingBalance).toBe(2200);
    expect(metrics.balanceChange).toBe(700);
    expect(metrics.nonContributionChange).toBe(50);
  });

  test("keeps every candidate while ranking the strongest insights first", () => {
    const accounts = [account("401k", "401(k)"), account("roth", "Roth IRA")];
    const activities = Array.from({ length: 12 }, (_, index) =>
      activity(`activity-${index}`, index % 2 ? "roth" : "401k", `2025-${String(index + 1).padStart(2, "0")}-15`, index === 5 ? 5000 : 500),
    );
    const metrics = analyzeInvestmentActivity(
      activities,
      [
        balance("open-401k", "401k", "2024-12", 1000),
        balance("open-roth", "roth", "2024-12", 1000),
        balance("close-401k", "401k", "2025-12", 7000),
        balance("close-roth", "roth", "2025-12", 5000),
      ],
      accounts,
      2025,
    );
    const candidates = getInvestmentInsights(metrics);
    const selected = sortInvestmentInsights(candidates);

    expect(candidates.length).toBeGreaterThan(3);
    expect(candidates.some((item) => item.id === "contribution-days")).toBe(true);
    expect(candidates.some((item) => item.id === "above-average-contributions")).toBe(true);
    expect(candidates.find((item) => item.id === "balance-vs-contributions")?.detail).toContain("growth alone");
    expect(selected).toHaveLength(candidates.length);
    expect(selected[0]?.score).toBe(
      Math.max(...selected.map((item) => item.score)),
    );
    expect(new Set(selected.slice(0, 3).map((item) => item.group)).size).toBeGreaterThan(1);
  });

  test("separates daily concentration from cadence and ignores evenly distributed days", () => {
    const accounts = [account("401k", "401(k)")];
    const concentrated = [
      activity("a", "401k", "2025-01-01", 700),
      activity("b", "401k", "2025-01-08", 200),
      activity("c", "401k", "2025-01-15", 100),
      ...Array.from({ length: 7 }, (_, index) => activity(`small-${index}`, "401k", `2025-02-${String(index + 1).padStart(2, "0")}`, 100)),
    ];
    const concentratedMetrics = analyzeInvestmentActivity(concentrated, [], accounts, 2025);
    expect(concentratedMetrics.top3ContributionDayShare).toBeGreaterThan(0.5);
    expect(getInvestmentInsights(concentratedMetrics).some((item) => item.id === "daily-contribution-concentration")).toBe(true);

    const even = Array.from({ length: 10 }, (_, index) => activity(`even-${index}`, "401k", `2025-01-${String(index + 1).padStart(2, "0")}`, 100));
    const evenMetrics = analyzeInvestmentActivity(even, [], accounts, 2025);
    expect(evenMetrics.top3ContributionDayShare).toBeCloseTo(0.3);
    expect(getInvestmentInsights(evenMetrics).some((item) => item.id === "daily-contribution-concentration")).toBe(false);
  });

  test("classifies frequent and sparse contribution cadence from timing", () => {
    const accounts = [account("401k", "401(k)")];
    const frequent = Array.from({ length: 18 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 0, 1 + index * 10)).toISOString().slice(0, 10);
      return activity(`frequent-${index}`, "401k", date, 300);
    });
    expect(getInvestmentInsights(analyzeInvestmentActivity(frequent, [], accounts, 2025)).some((item) => item.id === "frequent-contribution-cadence")).toBe(true);

    const sparse = [
      activity("sparse-1", "401k", "2025-01-01", 2_400),
      activity("sparse-2", "401k", "2025-05-01", 2_400),
      activity("sparse-3", "401k", "2025-09-01", 2_400),
    ];
    expect(getInvestmentInsights(analyzeInvestmentActivity(sparse, [], accounts, 2025)).some((item) => item.id === "sparse-contribution-cadence")).toBe(true);
  });

  test("uses the existing Modified Dietz chain for valid returns and omits undefined returns", () => {
    const accounts = [account("401k", "401(k)")];
    const positive = analyzeInvestmentActivity(
      [activity("flow", "401k", "2025-06-01", 100)],
      [
        balance("opening", "401k", "2024-12", 1_000),
        balance("closing", "401k", "2025-12", 1_200),
      ],
      accounts,
      2025,
    );
    expect(positive.modifiedDietzReturn).not.toBeNull();
    expect(getInvestmentInsights(positive).some((item) => item.id === "total-modified-dietz-return" || item.id === "total-all-time-high-with-return")).toBe(true);

    const negative = analyzeInvestmentActivity(
      [activity("flow", "401k", "2025-06-01", 100)],
      [
        balance("opening", "401k", "2024-12", 1_000),
        balance("closing", "401k", "2025-12", 800),
      ],
      accounts,
      2025,
    );
    expect(negative.modifiedDietzReturn).toBeLessThan(0);
    expect(getInvestmentInsights(negative).some((item) => item.id === "total-modified-dietz-return")).toBe(true);

    const invalid = analyzeInvestmentActivity(
      [activity("flow", "401k", "2025-06-01", 100)],
      [balance("closing", "401k", "2025-12", 1_200)],
      accounts,
      2025,
    );
    expect(invalid.modifiedDietzReturn).toBeNull();
    expect(getInvestmentInsights(invalid).some((item) => item.id === "total-modified-dietz-return")).toBe(false);
  });

  test("detects first, count, and historical contribution milestones", () => {
    const accounts = [account("401k", "401(k)")];
    const contributions = Array.from({ length: 20 }, (_, index) =>
      activity(
        `milestone-${index}`,
        "401k",
        new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
        100,
      ),
    );
    const metrics = analyzeInvestmentActivity(contributions, [], accounts, 2025);
    expect(metrics.firstContribution?.date).toBe("2025-01-01");
    expect(metrics.contributionMilestone?.count).toBe(20);
    const candidates = getInvestmentInsights(metrics);
    expect(candidates.some((item) => item.id === "first-contribution-milestone")).toBe(true);
    expect(candidates.some((item) => item.id === "contribution-count-milestone-20")).toBe(true);
    expect([1, 20, 50, 100, 500, 600, 1_000, 1_250].every(isContributionMilestone)).toBe(true);
    expect([2, 19, 21, 49, 501, 599, 1_001, 1_249].some(isContributionMilestone)).toBe(false);
  });

  test("reports largest contributions to date at portfolio and account levels", () => {
    const accounts = [account("401k", "401(k)"), account("roth", "Roth IRA")];
    const metrics = analyzeInvestmentActivity(
      [
        activity("historical-largest", "401k", "2024-06-10", 1_200),
        activity("current-401k", "401k", "2025-01-10", 500),
        activity("current-roth", "roth", "2025-02-10", 800),
      ],
      [],
      accounts,
      2025,
    );
    const insights = getInvestmentInsights(metrics);

    expect(insights.some((item) => item.id === "largest-contribution-to-date")).toBe(false);
    expect(insights.some((item) => item.id === "account-largest-contribution-to-date-401k")).toBe(false);
    expect(insights.some((item) => item.id === "account-largest-contribution-to-date-roth")).toBe(true);
  });

  test("detects total and account contribution resumptions but not normal quarterly cadence", () => {
    const accounts = [account("401k", "401(k)"), account("roth", "Roth IRA")];
    const resumed = [
      activity("old", "401k", "2024-01-01", 100),
      activity("return", "401k", "2025-08-12", 100),
      activity("roth-old", "roth", "2025-01-01", 100),
      activity("roth-return", "roth", "2025-08-12", 100),
    ];
    const candidates = getInvestmentInsights(analyzeInvestmentActivity(resumed, [], accounts, 2025));
    expect(candidates.some((item) => item.id === "total-contribution-resumption")).toBe(true);
    expect(candidates.some((item) => item.id.startsWith("account-contribution-resumption-"))).toBe(true);

    const quarterly = ["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01"]
      .map((date, index) => activity(`quarter-${index}`, "401k", date, 100));
    const quarterlyMetrics = analyzeInvestmentActivity(quarterly, [], [accounts[0]!], 2025);
    expect(quarterlyMetrics.accountContributionResumptions.get("401k")).toBeNull();
  });

  test("requires three declines for a reversal and detects all-time highs from historical balances", () => {
    const accounts = [account("401k", "401(k)")];
    const reversalBalances = [
      balance("opening", "401k", "2024-12", 1_000),
      balance("jan", "401k", "2025-01", 900),
      balance("feb", "401k", "2025-02", 800),
      balance("mar", "401k", "2025-03", 700),
      balance("apr", "401k", "2025-04", 750),
    ];
    expect(analyzeInvestmentActivity([], reversalBalances, accounts, 2025).totalBalanceReversal?.consecutiveDeclines).toBe(3);

    const shortReversal = reversalBalances.filter((item) => item.month !== "2025-01");
    expect(analyzeInvestmentActivity([], shortReversal, accounts, 2025).totalBalanceReversal).toBeNull();

    const allTime = [
      balance("y21", "401k", "2021-12", 500),
      balance("y22", "401k", "2022-12", 600),
      balance("y23", "401k", "2023-12", 700),
      balance("y24", "401k", "2024-12", 800),
      balance("y25", "401k", "2025-12", 900),
    ];
    const metrics = analyzeInvestmentActivity([], allTime, accounts, 2025);
    expect(metrics.totalAllTimeHigh?.balance).toBe(900);
    expect(getInvestmentInsights(metrics).some((item) => item.id === "total-all-time-high" || item.id === "total-all-time-high-with-return")).toBe(true);
  });

  test("keeps account highs distinct and composes consistent contributions with negative performance", () => {
    const accounts = [account("401k", "401(k)"), account("roth", "Roth IRA")];
    const accountBalances = [
      balance("a21", "401k", "2021-12", 100), balance("a22", "401k", "2022-12", 110),
      balance("a23", "401k", "2023-12", 120), balance("a24", "401k", "2024-12", 130), balance("a25", "401k", "2025-12", 150),
      balance("b21", "roth", "2021-12", 500), balance("b22", "roth", "2022-12", 550),
      balance("b23", "roth", "2023-12", 600), balance("b24", "roth", "2024-12", 650), balance("b25", "roth", "2025-12", 600),
    ];
    const accountHighMetrics = analyzeInvestmentActivity([], accountBalances, accounts, 2025);
    expect(accountHighMetrics.totalAllTimeHigh).toBeNull();
    expect(getInvestmentInsights(accountHighMetrics).some((item) => item.id === "account-all-time-high-401k")).toBe(true);

    const monthlyContributions = Array.from({ length: 12 }, (_, index) =>
      activity(`monthly-${index}`, "401k", `2025-${String(index + 1).padStart(2, "0")}-15`, 100),
    );
    const consistencyMetrics = analyzeInvestmentActivity(
      monthlyContributions,
      [balance("opening", "401k", "2024-12", 1_000), balance("closing", "401k", "2025-12", 900)],
      [accounts[0]!],
      2025,
    );
    expect(getInvestmentInsights(consistencyMetrics).some((item) => item.id === "consistent-contributions-with-return")).toBe(true);
  });

  test("does not resurface an old historical milestone or call insufficient highs meaningful", () => {
    const accounts = [account("401k", "401(k)")];
    const currentYear = new Date().getFullYear();
    const oldMilestone = Array.from({ length: 20 }, (_, index) =>
      activity(`old-${index}`, "401k", `2025-${String((index % 12) + 1).padStart(2, "0")}-01`, 100),
    );
    oldMilestone.push(activity("current", "401k", `${currentYear}-01-15`, 100));
    const candidates = getInvestmentInsights(analyzeInvestmentActivity(oldMilestone, [], accounts, currentYear));
    expect(candidates.some((item) => item.id === "contribution-count-milestone-20")).toBe(false);

    const insufficient = analyzeInvestmentActivity(
      [],
      [balance("opening", "401k", "2024-12", 1_000), balance("closing", "401k", "2025-12", 1_100)],
      accounts,
      2025,
    );
    expect(insufficient.totalAllTimeHigh).toBeNull();
  });
});
