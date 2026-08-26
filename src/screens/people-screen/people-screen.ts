import { APIs } from "../../api/api";
import type { AvailableFilter } from "../../components/filter-bar/filter-bar";
import type { DataTableColumn } from "../../components/data-table/data-table";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { buildPersonLedgerRows, editorialPeriod, signedPercent, type PersonLedgerRow } from "../../utilities/entity-ledger";
import { escapeHTML, money } from "../../utilities/view-formatters";
import { EditorialEntityLedgerScreen } from "../editorial-entity-ledger";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

export class PeopleScreen extends EditorialEntityLedgerScreen<PersonLedgerRow> {
  protected get screenName() { return "people"; }
  protected get screenTemplate() { return template; }
  protected get monthSelectorId() { return "#people-month-selector"; }
  protected get searchId() { return "#people-search"; }
  protected get filterId() { return "#people-ledger-filter"; }
  protected get subtitleId() { return "#people-ledger-subtitle"; }

  protected availableFilters(year: number): AvailableFilter<PersonLedgerRow>[] {
    return [
      { key: "name", title: "Name", dataType: "string" },
      { key: "rank", title: "Rank", dataType: "number" },
      { key: "status", title: "Status", dataType: ["Active", "Archived"] },
      { key: "balance", title: "Balance", dataType: "number" },
      { key: "income", title: "Income", dataType: "number" },
      { key: "expense", title: "Expenses", dataType: "number" },
      { key: "comparison", title: `vs ${year - 1}`, dataType: "number" },
    ];
  }

  protected columns(year: number): DataTableColumn<PersonLedgerRow>[] {
    return [
      {
        key: "name", title: "Name", sizing: 28,
        cellClass: ["primary", (row) => row.active ? "" : "is-muted"],
        formatter: (value) => escapeHTML(value),
        trailingIcon: (row) => row.active ? null : "box",
      },
      { key: "income", title: "Income", sizing: 18, textAlign: "right", formatter: (value) => money(value), cellClass: ["numeric", "align-right"] },
      { key: "expense", title: "Expense", sizing: 18, textAlign: "right", formatter: (value) => money(value), cellClass: ["numeric", "align-right"] },
      { key: "balance", title: "Balance", sizing: 18, textAlign: "right", formatter: (value) => money(value), cellClass: ["strong", "align-right"] },
      {
        key: "comparison", title: `vs ${year - 1}`, sizing: 18,
        textAlign: "right", formatter: (value) => signedPercent(value as number | null), cellClass: ["comparison", "align-right", (row) => row.comparison === null ? "is-muted" : row.comparison >= 0 ? "is-positive" : "is-negative"],
        sorter: (row) => row.comparison ?? Number.NEGATIVE_INFINITY,
      },
    ];
  }

  protected sourceRows(year: number): PersonLedgerRow[] {
    return buildPersonLedgerRows(APIs.budget.listAllPeople(), appController.getTransactions(), year, this.selectedMonth);
  }

  protected subtitle(year: number): string {
    return `Viewing balances per person in ${editorialPeriod(year, this.selectedMonth)}`;
  }

  protected openRow(row: PersonLedgerRow, year: number): void {
    router.navigate("entity-detail", { kind: "assignment", id: row.id, year: String(year) });
  }
}

if (!customElements.get("people-screen")) customElements.define("people-screen", PeopleScreen);
