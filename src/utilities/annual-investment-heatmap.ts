import type { Account, AccountActivity } from "../api/account-api";
import {
  buildAnnualHeatmapFromDailyAmounts,
  type AnnualSpendingHeatmap,
} from "./annual-spending-heatmap";
import {
  aggregateContributionsByAccountDay,
  aggregatePortfolioContributionDays,
  normalizeContributionDate,
  type InvestmentContributionRecord,
} from "./investment-activity-insights";

/** Builds the shared heatmap model from positive investment contributions. */
export function buildAnnualInvestmentHeatmap(
  activities: ReadonlyArray<AccountActivity>,
  accounts: ReadonlyArray<Account>,
  year: number,
): AnnualSpendingHeatmap {
  const investmentAccountIds = new Set(
    accounts
      .filter((account) => account.type === "investment" && account.active !== false)
      .map((account) => account.id),
  );
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const accountDayContributions = aggregateContributionsByAccountDay(
    activities
      .filter(
        (activity) =>
          activity.activityType === "contribution" &&
          investmentAccountIds.has(activity.accountId) &&
          Number(activity.amount) > 0,
      )
      .map((activity) => {
        const date = normalizeContributionDate(activity.date);
        return date
          ? {
              accountId: activity.accountId,
              accountName: accountNames.get(activity.accountId) ?? "Investment account",
              date,
              month: date.slice(0, 7),
              amount: Number(activity.amount),
            } satisfies InvestmentContributionRecord
          : null;
      })
      .filter((item): item is InvestmentContributionRecord => Boolean(item)),
  );
  return buildAnnualHeatmapFromDailyAmounts(
    aggregatePortfolioContributionDays(accountDayContributions).map(({ date, amount }) => ({ date, amount })),
    year,
    "investment",
  );
}
