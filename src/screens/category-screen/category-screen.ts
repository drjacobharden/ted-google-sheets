import { APIs } from "../../api/api";
import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type { AvailableFilter } from "../../components/filter-bar/filter-bar";
import type { DataTableColumn } from "../../components/data-table/data-table";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { sortNeedsReviewLast } from "../../utilities/category-order";
import {
  buildEntityLedgerRows,
  editorialPeriod,
  signedPercent,
  type EntityLedgerRow,
} from "../../utilities/entity-ledger";
import { escapeHTML, money } from "../../utilities/view-formatters";
import { EditorialEntityLedgerScreen } from "../editorial-entity-ledger";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

interface CategoryLedgerRow extends EntityLedgerRow {
  type: "Expense" | "Income";
}

export class CategoryScreen extends EditorialEntityLedgerScreen<CategoryLedgerRow> {
  #categoryType: "expense" | "income" = "expense";
  #categoryTypeSelector!: DropdownMenu;
  #categoryTypeListening = false;

  protected get screenName() { return "categories"; }
  protected get screenTemplate() { return template; }
  protected get monthSelectorId() { return "#category-month-selector"; }
  protected get searchId() { return "#category-search"; }
  protected get filterId() { return "#category-ledger-filter"; }
  protected get subtitleId() { return "#category-ledger-subtitle"; }

  connectedCallback(): void {
    super.connectedCallback();
    if (!this.#categoryTypeSelector) {
      this.#categoryTypeSelector = this.querySelector("#category-type-selector")!;
      this.#categoryTypeSelector.items = [
        { key: "expense", title: "Expense", isDefaultValue: true },
        { key: "income", title: "Income" },
      ];
    }
    if (!this.#categoryTypeListening) {
      this.#categoryTypeListening = true;
      this.#categoryTypeSelector.addListener(this);
    }
  }

  disconnectedCallback(): void {
    if (this.#categoryTypeListening) {
      this.#categoryTypeListening = false;
      this.#categoryTypeSelector.removeListener(this);
    }
    super.disconnectedCallback();
  }

  handleEvent(event: Event): void {
    if (
      event.type === "dropdown-selection" &&
      event.currentTarget === this.#categoryTypeSelector
    ) {
      this.#categoryType = (event as DropdownSelectionEvent).detail.value === "income"
        ? "income"
        : "expense";
      this.repaint();
      return;
    }
    super.handleEvent(event);
  }

  protected availableFilters(year: number): AvailableFilter<CategoryLedgerRow>[] {
    return [
      { key: "rank", title: "Rank", dataType: "number" },
      { key: "status", title: "Status", dataType: ["Active", "Archived"] },
      { key: "name", title: "Name", dataType: "string" },
      { key: "average", title: "Average transaction", dataType: "number" },
      { key: "total", title: "Total", dataType: "number" },
      { key: "comparison", title: `vs ${year - 1}`, dataType: "number" },
    ];
  }

  protected columns(year: number): DataTableColumn<CategoryLedgerRow>[] {
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

  protected sourceRows(year: number): CategoryLedgerRow[] {
    const type = this.#categoryType;
    const entities = APIs.budget.listAllCategories().filter((category) => category.type === type);
    const rowType: CategoryLedgerRow["type"] =
      type === "income" ? "Income" : "Expense";
    const rows = buildEntityLedgerRows(entities, appController.getTransactions(), {
      year,
      month: this.selectedMonth,
      idKey: "categoryId",
      type,
    }).map((row) => ({ ...row, type: rowType }));
    return sortNeedsReviewLast(rows);
  }

  protected subtitle(year: number): string {
    return `${this.#categoryType === "income" ? "Income" : "Spend"} by category in ${editorialPeriod(year, this.selectedMonth)}`;
  }

  protected openRow(row: CategoryLedgerRow, year: number): void {
    router.navigate("entity-detail", { kind: "category", id: row.id, year: String(year) });
  }
}

if (!customElements.get("category-screen")) customElements.define("category-screen", CategoryScreen);
