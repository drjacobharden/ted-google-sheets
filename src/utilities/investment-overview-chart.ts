import type { Account, AccountActivity, AccountBalance } from "../api/account-api";
import type { DataChartData } from "../components/data-chart/data-chart";

export type InvestmentOverviewChartDisplay =
  | "balance"
  | "total-contributions"
  | "yearly-contributions"
  | "monthly-contributions";

export interface InvestmentOverviewChartMonth {
  monthId: string;
  balance: number;
  contributions: number;
  monthlyContributions: number;
  hasBalance: boolean;
}

export function buildInvestmentOverviewChartMonths(
  balances: readonly AccountBalance[],
  activities: readonly AccountActivity[],
  accounts: readonly Account[],
  year: number,
  endMonth = 12,
): InvestmentOverviewChartMonth[] {
  const investmentAccounts = accounts.filter(
    (account) => account.type === "investment" && account.active !== false,
  );
  const investmentAccountIds = new Set(
    investmentAccounts.map((account) => account.id),
  );
  const yearStart = `${year}-01`;
  let cumulative = activities.reduce((total, item) => {
    if (
      item.month >= yearStart ||
      item.activityType !== "contribution" ||
      !investmentAccountIds.has(item.accountId)
    ) {
      return total;
    }
    const amount = Number(item.amount || 0);
    return amount > 0 ? total + amount : total;
  }, 0);
  const rows = Array.from({ length: Math.max(0, Math.min(12, endMonth)) }, (_, index) => {
    const monthId = `${year}-${String(index + 1).padStart(2, "0")}`;
    const accountBalances = investmentAccounts.map((account) =>
      balances
        .filter((item) => item.accountId === account.id && item.month <= monthId)
        .sort((left, right) => left.month.localeCompare(right.month))
        .at(-1),
    );
    const monthActivities = activities.filter(
      (item) =>
        item.month === monthId &&
        item.activityType === "contribution" &&
        investmentAccountIds.has(item.accountId),
    );
    const monthlyContributions = monthActivities.reduce((total, item) => {
      const amount = Number(item.amount || 0);
      return amount > 0 ? total + amount : total;
    }, 0);
    return {
      monthId,
      balance: accountBalances.reduce(
        (total, item) => total + Number(item?.balance || 0),
        0,
      ),
      contributions: monthlyContributions,
      monthlyContributions,
      hasBalance: accountBalances.some(Boolean),
    };
  });

  return rows.map((row) => {
    cumulative += row.contributions;
    return { ...row, contributions: cumulative };
  });
}

function hasBalanceData(rows: readonly InvestmentOverviewChartMonth[]): boolean {
  return rows.some((row) => row.hasBalance);
}

function balancePoints(rows: readonly InvestmentOverviewChartMonth[]) {
  return rows
    .filter((row) => row.hasBalance)
    .map((row) => ({ date: row.monthId, value: row.balance }));
}

export function investmentOverviewChartData(
  rows: readonly InvestmentOverviewChartMonth[],
  display: InvestmentOverviewChartDisplay,
  year: number,
  previousRows: readonly InvestmentOverviewChartMonth[] = [],
): DataChartData {
  const currentBalance = balancePoints(rows);
  const previousBalance = balancePoints(previousRows);
  const currentActivity = rows.map((row) => ({ date: row.monthId, value: row.monthlyContributions }));
  const previousActivity = previousRows.map((row) => ({ date: row.monthId, value: row.monthlyContributions }));
  const base = { year, format: "monthly" as const };

  if (display === "balance") {
    return {
      ...base,
      ariaLabel: `Investment balance compared with ${year - 1}`,
      series: [
        { type: "line", palette: "comparison", label: "Balance", points: currentBalance },
        ...(hasBalanceData(previousRows)
          ? [{ type: "line" as const, palette: "comparison" as const, variant: "secondary" as const, label: "Previous year", points: previousBalance }]
          : []),
      ],
    };
  }

  if (display === "total-contributions") {
    return {
      ...base,
      ariaLabel: `Total investment contributions compared with ${year - 1}`,
      series: [
        { type: "line", palette: "income", label: "Total contributions", points: rows.map((row) => ({ date: row.monthId, value: row.contributions })) },
        ...(previousRows.some((row) => row.contributions !== 0)
          ? [{ type: "line" as const, palette: "income" as const, variant: "secondary" as const, label: "Previous year", points: previousRows.map((row) => ({ date: row.monthId, value: row.contributions })) }]
          : []),
      ],
    };
  }

  if (display === "monthly-contributions") {
    return {
      ...base,
      ariaLabel: `Monthly investment contributions for ${year}`,
      series: [
        { type: "bar", palette: "income", label: "Contributions", points: currentActivity },
        ...(previousRows.some((row) => row.monthlyContributions !== 0)
          ? [{ type: "value-marker" as const, palette: "income" as const, variant: "secondary" as const, label: "Previous year", points: previousActivity }]
          : []),
      ],
    };
  }

  return {
    ...base,
    ariaLabel: `Yearly investment contributions compared with ${year - 1}`,
    series: [
      { type: "line", palette: "income", label: "Yearly contributions", points: currentActivity.map((point, index, points) => ({ date: point.date, value: points.slice(0, index + 1).reduce((total, item) => total + item.value, 0) })) },
      ...(previousRows.some((row) => row.monthlyContributions !== 0)
        ? [{ type: "line" as const, palette: "income" as const, variant: "secondary" as const, label: "Previous year", points: previousActivity.map((point, index, points) => ({ date: point.date, value: points.slice(0, index + 1).reduce((total, item) => total + item.value, 0) })) }]
        : []),
    ],
  };
}
