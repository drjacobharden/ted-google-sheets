import { APIs } from "../../api/api";
import type { AvailableFilter } from "../../components/filter-bar/filter-bar";
import type { DataTableColumn } from "../../components/data-table/data-table";
import { router } from "../../router/router";
import { signedPercent } from "../../utilities/entity-ledger";
import { escapeHTML, money } from "../../utilities/view-formatters";
import { EditorialEntityLedgerScreen } from "../editorial-entity-ledger";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface DebtLedgerRow {
  id: string;
  name: string;
  lender: string;
  interestRate: number;
  assignment: string;
  balance: number;
  comparison: number | null;
}

function percentageChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

function endMonth(year: number): string {
  const today = new Date();
  return year === today.getFullYear() ? String(today.getMonth() + 1).padStart(2, "0") : "12";
}

export class InvestmentDebtsScreen extends EditorialEntityLedgerScreen<DebtLedgerRow> {
  protected get screenName() { return "investment-debts"; }
  protected get screenTemplate() { return template; }
  protected get monthSelectorId() { return null; }
  protected get searchId() { return "#debt-search"; }
  protected get filterId() { return "#debt-filter"; }
  protected get subtitleId() { return "#debt-ledger-subtitle"; }

  protected currentYear(): number {
    const requested = Number(router.currentParams().year);
    return Number.isInteger(requested) ? requested : new Date().getFullYear();
  }

  protected dataEventNames(): string[] {
    return ["budget:accounts-changed", "budget:accounts-loaded", "budget:people-changed", "budget:reference-data-changed"];
  }

  protected availableFilters(year: number): AvailableFilter<DebtLedgerRow>[] {
    return [
      { key: "name", title: "Name", dataType: "string" },
      { key: "lender", title: "Lender", dataType: "string" },
      { key: "interestRate", title: "Interest rate", dataType: "number" },
      { key: "assignment", title: "Assignment", dataType: [...new Set(APIs.budget.listAllPeople().map((item) => item.name))].sort() },
      { key: "balance", title: "Balance", dataType: "number" },
      { key: "comparison", title: `vs ${year - 1}`, dataType: "number" },
    ];
  }

  protected columns(year: number): DataTableColumn<DebtLedgerRow>[] {
    return [
      { key: "name", title: "Name", sizing: 34, cellClass: ["primary"], formatter: (value) => escapeHTML(value), subline: (row) => escapeHTML([row.lender, row.assignment].filter(Boolean).join(" · ")) },
      { key: "interestRate", title: "Interest rate", sizing: 18, textAlign: "right", formatter: (value) => `${Number(value).toFixed(2)}%`, cellClass: ["numeric", "align-right"] },
      { key: "balance", title: "Balance", sizing: 24, textAlign: "right", formatter: (value) => money(value), cellClass: ["strong", "align-right"] },
      { key: "comparison", title: `vs ${year - 1}`, sizing: 24, textAlign: "right", formatter: (value) => signedPercent(value as number | null), cellClass: ["comparison", "align-right", (row) => row.comparison === null ? "is-muted" : row.comparison <= 0 ? "is-positive" : "is-negative"], sorter: (row) => row.comparison ?? Number.NEGATIVE_INFINITY },
    ];
  }

  protected sourceRows(year: number): DebtLedgerRow[] {
    const month = endMonth(year);
    const end = `${year}-${month}-31`;
    const previousEnd = `${year - 1}-${month}-31`;
    const assignments = new Map(APIs.budget.listAllPeople().map((item) => [item.id, item.name]));
    const latest = (id: string, through: string) => APIs.accounts.balances().filter((item) => item.accountId === id && item.asOfDate <= through).at(-1);
    return APIs.accounts.accounts().filter((item) => item.type === "debt" && item.active !== false).map((account) => {
      const balance = Number(latest(account.id, end)?.balance || 0);
      const previous = Number(latest(account.id, previousEnd)?.balance || 0);
      return { id: account.id, name: account.name, lender: account.lender || "", interestRate: account.interestRate || 0, assignment: assignments.get(account.assignmentId) ?? "Shared", balance, comparison: percentageChange(balance, previous) };
    }).sort((left, right) => right.balance - left.balance || left.name.localeCompare(right.name));
  }

  protected subtitle(year: number): string { return `Debt balances in ${year}`; }
  protected openRow(row: DebtLedgerRow, year: number): void { router.navigate("investment-debt-detail", { accountId: row.id, year: String(year) }); }
}

if (!customElements.get("investment-debts-screen")) customElements.define("investment-debts-screen", InvestmentDebtsScreen);
