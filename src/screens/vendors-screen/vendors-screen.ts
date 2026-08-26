import { APIs } from "../../api/api";
import type { AvailableFilter } from "../../components/filter-bar/filter-bar";
import type { DataTableColumn } from "../../components/data-table/data-table";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { buildEntityLedgerRows, editorialPeriod, signedPercent, type EntityLedgerRow } from "../../utilities/entity-ledger";
import { escapeHTML, money } from "../../utilities/view-formatters";
import { EditorialEntityLedgerScreen } from "../editorial-entity-ledger";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

export class VendorsScreen extends EditorialEntityLedgerScreen<EntityLedgerRow> {
  protected get screenName() { return "vendors"; }
  protected get screenTemplate() { return template; }
  protected get monthSelectorId() { return "#vendor-month-selector"; }
  protected get searchId() { return "#vendor-search"; }
  protected get filterId() { return "#vendor-ledger-filter"; }
  protected get subtitleId() { return "#vendor-ledger-subtitle"; }

  protected availableFilters(year: number): AvailableFilter<EntityLedgerRow>[] {
    return [
      { key: "rank", title: "Rank", dataType: "number" },
      { key: "status", title: "Status", dataType: ["Active", "Archived"] },
      { key: "name", title: "Name", dataType: "string" },
      { key: "average", title: "Average transaction", dataType: "number" },
      { key: "total", title: "Total", dataType: "number" },
      { key: "comparison", title: `vs ${year - 1}`, dataType: "number" },
    ];
  }

  protected columns(year: number): DataTableColumn<EntityLedgerRow>[] {
    return [
      { key: "rank", title: "Rank", sizing: "narrow", cellClass: ["detail"] },
      {
        key: "name", title: "Name", sizing: 31,
        cellClass: ["primary", (row) => row.active ? "" : "is-muted"],
        formatter: (value) => escapeHTML(value),
        trailingIcon: (row) => row.active ? null : "box",
      },
      { key: "average", title: "Average transaction", sizing: 20, textAlign: "right", formatter: (value) => money(value), cellClass: ["numeric", "align-right"] },
      { key: "total", title: "Total", sizing: 20, textAlign: "right", formatter: (value) => money(value), cellClass: ["strong", "align-right"] },
      {
        key: "comparison", title: `vs ${year - 1}`, sizing: 20,
        textAlign: "right", formatter: (value) => signedPercent(value as number | null), cellClass: ["comparison", "align-right", (row) => row.comparison === null ? "is-muted" : row.comparison >= 0 ? "is-positive" : "is-negative"],
        sorter: (row) => row.comparison ?? Number.NEGATIVE_INFINITY,
      },
    ];
  }

  protected sourceRows(year: number): EntityLedgerRow[] {
    return buildEntityLedgerRows(APIs.budget.listAllVendors(), appController.getTransactions(), {
      year, month: this.selectedMonth, idKey: "vendorId", type: "expense",
    });
  }

  protected subtitle(year: number): string {
    return `Viewing vendor totals for ${editorialPeriod(year, this.selectedMonth)}`;
  }

  protected openRow(row: EntityLedgerRow, year: number): void {
    router.navigate("entity-detail", { kind: "vendor", id: row.id, year: String(year) });
  }
}

if (!customElements.get("vendors-screen")) customElements.define("vendors-screen", VendorsScreen);
