import { APIs } from "../../api/api";
import type { AvailableFilter } from "../../components/filter-bar/filter-bar";
import type { DataTableColumn } from "../../components/data-table/data-table";
import { router } from "../../router/router";
import { InvestmentView } from "../../utilities/investment-view";
import { signedPercent } from "../../utilities/entity-ledger";
import { escapeHTML, netFlows, summaryMoney } from "../../utilities/view-formatters";
import { EditorialEntityLedgerScreen } from "../editorial-entity-ledger";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface InvestmentAccountLedgerRow {
  id: string;
  name: string;
  source: string;
  assignment: string;
  contributions: number;
  balance: number;
  previousBalance: number;
  growth: number | null;
  roi: number | null;
}

function endMonthForYear(year: number): string {
  const today = new Date();
  return year === today.getFullYear()
    ? String(today.getMonth() + 1).padStart(2, "0")
    : "12";
}

function percentageChange(current: number, previous: number): number | null {
  return previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}

/** Displays investment accounts in the shared editorial entity-ledger format. */
export class InvestmentAccountsScreen extends EditorialEntityLedgerScreen<InvestmentAccountLedgerRow> {
  protected get screenName() { return "investment-accounts"; }
  protected get screenTemplate() { return template; }
  protected get monthSelectorId() { return null; }
  protected get searchId() { return "#investment-account-search"; }
  protected get filterId() { return "#investment-account-filter"; }
  protected get subtitleId() { return "#investment-account-ledger-subtitle"; }

  protected currentYear(): number {
    const requested = Number(router.currentParams().year);
    return Number.isInteger(requested) ? requested : new Date().getFullYear();
  }

  protected dataEventNames(): string[] {
    return [
      "budget:accounts-changed",
      "budget:accounts-loaded",
      "budget:people-changed",
      "budget:reference-data-changed",
    ];
  }

  protected availableFilters(year: number): AvailableFilter<InvestmentAccountLedgerRow>[] {
    const assignments = [...new Set(
      APIs.budget.listAllPeople().map((item) => item.name),
    )].sort((left, right) => left.localeCompare(right));
    return [
      { key: "name", title: "Name", dataType: "string" },
      {
        key: "source",
        title: "Source",
        dataType: ["Manual transfer", "Paycheck deduction"],
      },
      { key: "assignment", title: "Assignment", dataType: assignments },
      { key: "contributions", title: "Contributions", dataType: "number" },
      { key: "balance", title: "Balance", dataType: "number" },
      { key: "growth", title: "Account growth", dataType: "number" },
      { key: "roi", title: "ROI", dataType: "number" },
    ];
  }

  protected columns(year: number): DataTableColumn<InvestmentAccountLedgerRow>[] {
    return [
      {
        key: "name",
        title: "Name",
        sizing: 32,
        cellClass: ["primary"],
        formatter: (value) => escapeHTML(value),
        subline: (row) => escapeHTML(`${row.source} · ${row.assignment}`),
      },
      {
        key: "contributions",
        title: "Contributions",
        sizing: 17,
        textAlign: "right",
        formatter: (value) => summaryMoney(value),
        cellClass: ["numeric", "align-right"],
      },
      {
        key: "balance",
        title: "Balance",
        sizing: 17,
        textAlign: "right",
        formatter: (value) => summaryMoney(value),
        cellClass: ["strong", "align-right"],
      },
      {
        key: "growth",
        title: "Account growth",
        sizing: 17,
        textAlign: "right",
        formatter: (value) => signedPercent(value as number | null),
        cellClass: ["comparison", "align-right", (row) => row.growth === null ? "is-muted" : row.growth >= 0 ? "is-positive" : "is-negative"],
        sorter: (row) => row.growth ?? Number.NEGATIVE_INFINITY,
      },
      {
        key: "roi",
        title: "ROI",
        sizing: 17,
        textAlign: "right",
        formatter: (value) => signedPercent(value as number | null),
        cellClass: ["comparison", "align-right", (row) => row.roi === null ? "is-muted" : row.roi >= 0 ? "is-positive" : "is-negative"],
        sorter: (row) => row.roi ?? Number.NEGATIVE_INFINITY,
      },
    ];
  }

  protected sourceRows(year: number): InvestmentAccountLedgerRow[] {
    const month = endMonthForYear(year);
    const end = `${year}-${month}`;
    const previousEnd = `${year - 1}-${month}`;
    const balances = InvestmentView.latestByAccount(end);
    const previousBalances = InvestmentView.latestByAccount(previousEnd);
    const contributions = APIs.accounts.investmentActivity();
    const assignments = new Map(
      APIs.budget.listAllPeople().map((item) => [item.id, item.name]),
    );

    return APIs.accounts.accounts().filter((item) => item.type === "investment")
      .filter((account) => account.active !== false)
      .map((account) => {
        const balance = Number(balances.get(account.id)?.balance ?? 0);
        const previousBalance = Number(
          previousBalances.get(account.id)?.balance ?? 0,
        );
        return {
          id: account.id,
          name: account.name,
          source: InvestmentView.sourceLabel(account.source),
          assignment: assignments.get(account.assignmentId) ?? "Shared",
          contributions: netFlows(contributions.filter((item) =>
            item.accountId === account.id &&
            item.month >= `${year}-01` &&
            item.month <= end,
          )),
          balance,
          previousBalance,
          growth: percentageChange(balance, previousBalance),
          roi: (() => {
            const rate = InvestmentView.accountPerformance(account.id, year).rate;
            return rate === null ? null : rate * 100;
          })(),
        };
      })
      .sort((left, right) =>
        right.balance - left.balance || left.name.localeCompare(right.name),
      );
  }

  protected subtitle(year: number): string {
    return `Investment balances and contributions in ${year}`;
  }

  protected openRow(row: InvestmentAccountLedgerRow, year: number): void {
    router.navigate("investment-account-detail", {
      accountId: row.id,
      year: String(year),
    });
  }
}

if (!customElements.get("investment-accounts-screen")) {
  customElements.define("investment-accounts-screen", InvestmentAccountsScreen);
}
