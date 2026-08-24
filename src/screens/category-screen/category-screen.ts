import { APIs } from "../../api/api";
import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type { AvailableFilter } from "../../components/filter-bar/filter-bar";
import type { TableColumn } from "../../components/table/table";
import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import {
  buildEntityLedgerRows,
  editorialPeriod,
  signedPercent,
  type EntityLedgerRow,
} from "../../utilities/entity-ledger";
import { money } from "../../utilities/view-formatters";
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

  protected columns(year: number): TableColumn<CategoryLedgerRow>[] {
    return [
      { key: "rank", title: "Rank", dataType: "number", sizing: "narrow", cellClass: "entity-rank" },
      {
        key: "name", title: "Name", dataType: "string", sizing: 31,
        prominence: "bold", cellClass: "entity-name",
        color: (row) => row.active ? "var(--color-text)" : "var(--color-text-subtle)",
        trailingIcon: (row) => row.active ? null : "box",
      },
      { key: "average", title: "Average transaction", dataType: "number", sizing: 20, textAlign: "right", formatter: (value) => money(value), cellClass: "entity-average" },
      { key: "total", title: "Total", dataType: "number", sizing: 20, textAlign: "right", formatter: (value) => money(value), cellClass: "entity-total" },
      {
        key: "comparison", title: `vs ${year - 1}`, dataType: "number", sizing: 20,
        textAlign: "right", formatter: signedPercent, cellClass: "entity-comparison",
        color: comparisonColor,
        sorter: (row) => row.comparison ?? Number.NEGATIVE_INFINITY,
      },
    ];
  }

  protected sourceRows(year: number): CategoryLedgerRow[] {
    const type = this.#categoryType;
    const entities = APIs.budget.listAllCategories().filter((category) => category.type === type);
    return buildEntityLedgerRows(entities, appController.getTransactions(), {
      year,
      month: this.selectedMonth,
      idKey: "categoryId",
      type,
    }).map((row) => ({ ...row, type: type === "income" ? "Income" : "Expense" }));
  }

  protected subtitle(year: number): string {
    return `${this.#categoryType === "income" ? "Income" : "Spend"} by category in ${editorialPeriod(year, this.selectedMonth)}`;
  }

  protected openRow(row: CategoryLedgerRow, year: number): void {
    router.navigate("entity-detail", { kind: "category", id: row.id, year: String(year) });
  }
}

function comparisonColor(row: CategoryLedgerRow): string {
  if (row.comparison === null) return "var(--color-text-subtle)";
  return row.comparison >= 0 ? "var(--color-positive)" : "var(--color-negative)";
}

if (!customElements.get("category-screen")) customElements.define("category-screen", CategoryScreen);
