import { router } from "../../router/router";
import { appController } from "../../state/app-controller";
import { InvestmentView } from "../../utilities/investment-view";
import { createTransactionRow } from "../../utilities/transaction-row";
import {
  dateRangeDetail,
  eventTargetElement,
  isInvestmentSource,
  type DateRangePickerElement,
  type DateRangeValue,
} from "../../utilities/ui-utilities";
import { APIs } from "../../api/api";
import type { BudgetEntity, BudgetTransaction } from "../../api/budget-api";
import { CustomButton } from "../../components/button/button";
import { Checkbox } from "../../components/checkbox/checkbox";
import {
  DatePicker,
  DateRangeChangedEvent,
} from "../../components/date-range-picker/date-range-picker-2";
import {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import { OverlayManager } from "../../elements/overlay-manager/overlay-manager";
import { DatePickerStep, DateRange, DateUtils } from "../../utilities/date-utilities";
import { errorMessage } from "../../utilities/data-utilities";
import { money } from "../../utilities/view-formatters";
import {
  sortCategoryScreen,
  SortedEntityArrayFxn,
} from "./sort-category-screen";
import templateString from "./template.html" with { type: "text" };
import {
  AppliedFilter,
  FilterBar,
} from "../../components/filter-bar/filter-bar";
import { appState } from "../../state/app-state";
import {
  budgetingYearRange,
  filterForBudgetingContext,
} from "../budgeting/budgeting-context";

const template = document.createElement("template");
template.innerHTML = templateString;
type CategoryScreenTabs = "expense" | "income" | "archived";

interface CategoryFilterValues {
  name: string;
  status: string;
  count: number;
  average: number;
  total: number;
}

interface ActionButton extends HTMLButtonElement {
  dataset: {
    action: "filter" | "change-tab" | "clear-selection" | "new-category";
  };
}

/** Displays and manages the expense-category screen. */
export class CategoryScreen extends HTMLElement implements EventListenerObject {
  #listening = false;
  #usage = new Map<string, { count: number; total: number }>();
  #range: DateRange = DateUtils.defaultRange;
  #selected: string[] = [];
  #tableView: CategoryScreenTabs = "expense";
  #sortKey = "name";
  #sortFxn: SortedEntityArrayFxn = (data) => data;

  // Table action row
  #actionRow!: HTMLElement;
  #tableViewButtons!: NodeListOf<CustomButton>;
  #dateRangeStep: DatePickerStep = "year";
  #datePicker!: DatePicker;
  #sortButton!: CustomButton;

  // Table
  #list!: HTMLElement;

  // Bottom row
  #clearSelectionButton!: CustomButton;
  #totalCount!: HTMLElement;
  #totalSum!: HTMLElement;
  #avgSum!: HTMLElement;

  // Overlay
  #overlayManager!: OverlayManager;

  #sortDropdown!: DropdownMenu;
  #filterDropdown!: FilterBar<CategoryFilterValues>;
  #filters: AppliedFilter<CategoryFilterValues>[] = [
    { key: "status", value: "Active", operator: "Equals" },
  ];
  #unsubscribeBudgetingContext: (() => void) | null = null;

  /** Initializes the screen and subscribes to UI and budget events. */
  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "categories";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }

    if (this.#listening) return;
    this.#listening = true;
    this.#range = budgetingYearRange(appState.get("budgetingContext").year);
    this.#list.addEventListener("click", this);
    this.#list.addEventListener("keydown", this);
    this.#actionRow.addEventListener("click", this);
    this.#datePicker.addEventListener("date-range-changed", this);
    this.#clearSelectionButton.addEventListener("click", this);
    this.addEventListener("budgeting:header-action", this);

    this.#sortDropdown.addListener(this);
    this.#filterDropdown.addListener(this);

    window.addEventListener("budget:categories-changed", this);
    window.addEventListener("budget:entity-sync-changed", this);
    window.addEventListener("budget:transaction-sync-changed", this);
    window.addEventListener("budget:transaction-saved", this);
    this.#unsubscribeBudgetingContext = appState.subscribe(
      "budgetingContext",
      (context) => {
        this.#range = budgetingYearRange(context.year);
        this.#render();
      },
    );
    this.#render();
  }

  /** Removes every listener owned by the screen when routing detaches it. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#list.removeEventListener("click", this);
    this.#list.removeEventListener("keydown", this);
    this.#actionRow.removeEventListener("click", this);
    this.#datePicker.removeEventListener("date-range-changed", this);
    this.#clearSelectionButton.removeEventListener("click", this);
    this.removeEventListener("budgeting:header-action", this);

    this.#sortDropdown.removeListener(this);
    this.#filterDropdown.removeListener(this);

    window.removeEventListener("budget:categories-changed", this);
    window.removeEventListener("budget:entity-sync-changed", this);
    window.removeEventListener("budget:transaction-sync-changed", this);
    window.removeEventListener("budget:transaction-saved", this);
    this.#unsubscribeBudgetingContext?.();
    this.#unsubscribeBudgetingContext = null;
  }

  /** Routes subscribed events to the appropriate screen behavior. */
  handleEvent(event: Event): void {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      case "keydown":
        this.#handleKeydown(event);
        break;

      case "date-range-changed":
        this.#handleDateRangeChanged(event as CustomEvent);
        break;

      case "budget:categories-changed":
      case "budget:entity-sync-changed":
        this.#render();
        break;

      case "budget:transaction-sync-changed":
      case "budget:transaction-saved":
        this.#render();
        break;

      case "dropdown-selection":
        if (event.target === this.#sortDropdown) {
          this.#handleSortSelection(event);
        } else {
          void this.#handleCategoryMenuSelection(
            event as DropdownSelectionEvent,
          );
        }
        break;

      case "filters-changed":
        this.#handleFiltersChanged(event);
        break;

      case "budgeting:header-action": {
        const detail = (event as CustomEvent<{ action: string; anchor?: HTMLElement }>).detail;
        if (detail.action === "new-category" && detail.anchor) {
          this.#overlayManager.showEntityForm(detail.anchor, "category", {
            side: "bottom",
            align: "end",
            gap: 8,
            offset: 16,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Create elements for the screen
   *
   */

  /** Captures the typed elements rendered from the component template. */
  #captureElements(): void {
    // this.#form = this.querySelector<HTMLFormElement>("#category-form")!;
    this.#list = this.querySelector<HTMLElement>("#category-list")!;
    this.#actionRow = this.querySelector<HTMLElement>(".table-action-row")!;
    this.#tableViewButtons =
      this.querySelectorAll<CustomButton>("[data-table-view]");
    this.#datePicker = this.querySelector<DatePicker>("date-range-picker-2")!;
    this.#totalCount = this.querySelector(".total-count")!;
    this.#totalSum = this.querySelector(".total-sum")!;
    this.#avgSum = this.querySelector(".avg-sum")!;
    this.#clearSelectionButton = this.querySelector(
      '[data-action="clear-selection"]',
    )!;
    this.#overlayManager = document.querySelector("overlay-manager")!;

    // Set up sorting
    this.#sortDropdown = this.#actionRow.querySelector(
      "#sort-categories-dropdown",
    )!;
    this.#sortDropdown.items = [
      { key: "name", title: "Name", isDefaultValue: true },
      { key: "status", title: "Status" },
      { key: "count", title: "Transaction count" },
      { key: "total", title: "Total" },
    ];

    // Set up filtering
    this.#filterDropdown = this.#actionRow.querySelector(
      "#categories-filter-bar",
    )!;

    this.#filterDropdown.availableFilters = [
      { key: "name", dataType: "string", title: "Name" },
      { key: "status", dataType: ["Active", "Archived"], title: "Status" },
      { key: "count", dataType: "number", title: "Transaction count" },
      { key: "average", dataType: "number", title: "Average transaction" },
      { key: "total", dataType: "number", title: "Total" },
    ];
    this.#filterDropdown.filters = this.#filters;
  }

  /** Recalculates transaction usage counts before rendering categories. */
  #loadUsage(): void {
    this.#usage = new Map<string, { count: number; total: number }>();

    const transactions = this.#transactions();

    for (let i = 0, l = transactions.length; i < l; i++) {
      const transaction = transactions[i];

      if (!DateUtils.isInRange(transaction.date, this.#range)) {
        continue;
      }

      const item = this.#usage.get(transaction.categoryId);
      const count = (item?.count ?? 0) + 1;
      const total = (item?.total ?? 0) + transaction.amount;

      this.#usage.set(transaction.categoryId, { count, total });
    }
  }

  /** Returns the current application transaction collection. */
  #transactions(): BudgetTransaction[] {
    return filterForBudgetingContext(
      appController.getTransactions() ??
      APIs.budget.getCachedTransactions() ??
      [],
    );
  }

  /** Renders the current expense categories and their sync state. */
  #render(): void {
    this.#loadUsage();

    this.#selected = [];
    this.#list.toggleAttribute("selection-active", false);

    for (let i = 0, l = this.#tableViewButtons.length; i < l; i++) {
      const button = this.#tableViewButtons[i];

      if (this.#tableView === button.dataset.tableView) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    }

    const categories = this.#filterCategories();
    const sorted = this.#sortCategories(categories);

    this.#list.replaceChildren(
      ...sorted.map((item) => this.#createCategoryRow(item)),
    );

    this.#getSum();
  }

  #getSum() {
    let totalCount = 0;
    let totalSum = 0;

    const selection = this.#selected;
    const rows = this.#list.children;
    const array = selection.length === 0 ? rows : selection;

    // Loop over all categories
    if (selection.length === 0) {
      for (let i = 0, l = rows.length; i < l; i++) {
        const row = rows[i] as HTMLElement;
        const id = row.dataset.entityId!;
        const { count, total } = this.#usage.get(id) ?? {
          count: 0,
          total: 0,
        };

        totalCount += count;
        totalSum += total;
      }
    }

    // Loop over just the selected categories
    else {
      for (let i = 0, l = selection.length; i < l; i++) {
        const id = selection[i];
        const { count, total } = this.#usage.get(id) ?? {
          count: 0,
          total: 0,
        };

        totalCount += count;
        totalSum += total;
      }
    }

    this.#createSumLabels(totalCount, array.length, totalSum);
  }

  #createSumLabels(
    transactionCount: number,
    categoryCount: number,
    totalSum: number,
  ) {
    const range = this.#range;
    const step = this.#dateRangeStep;

    const transactionLabel =
      transactionCount === 1 ? "transaction" : "transactions";
    const categoryLabel = categoryCount === 1 ? "category" : "categories";
    const dateLabel = DateUtils.formatDateRange(range.start, range.end, {
      showDays: step === "week",
      showMonth: step !== "year",
      monthFormat: "long",
    });

    let countLabel = `Total of ${transactionCount} ${transactionLabel} across ${categoryCount} ${categoryLabel}`;

    if (step === "week") {
      countLabel += ` from ${dateLabel}`;
    } else {
      countLabel += ` during ${dateLabel}`;
    }

    const sumLabel = money(totalSum);

    this.#totalSum.textContent = sumLabel;
    this.#totalCount.textContent = countLabel;
    this.#avgSum.textContent = money(totalSum / transactionCount);
  }

  /** Creates one accessible category row without interpolating unsafe markup. */
  #createCategoryRow(category: BudgetEntity): HTMLElement {
    const { count, total } = this.#usage.get(category.id) ?? {
      count: 0,
      total: 0,
    };

    const row = document.createElement("article");
    row.className = "table-grid table-row";
    row.dataset.entityKind = "category";
    row.dataset.entityId = category.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `View ${category.name} category`);

    // Checkbox element to select items
    const checkbox = document.createElement("check-box");
    checkbox.className = "col-1";

    // Name of the category
    const name = document.createElement("span");
    name.textContent = category.name;
    name.dataset.data = "name";
    name.classList.add("col-2");

    // Total transaction count for the category in the time range
    const quantity = document.createElement("span");
    quantity.dataset.data = "count";
    quantity.textContent = count.toString();
    quantity.classList.add("col-4", "push-right");

    const average = document.createElement("span");
    average.dataset.data = "average";
    average.textContent = money(count === 0 ? 0 : total / count);
    average.classList.add("col-5", "push-right");

    // Total transaction sum for the category in the time range
    const sum = document.createElement("span");
    sum.dataset.data = "sum";
    sum.textContent = money(total);
    sum.classList.add("col-6", "push-right");

    // Option button to show popover to delete or edit
    const optionButton = document.createElement(
      "dropdown-menu",
    ) as DropdownMenu;
    optionButton.classList.add("col-7", "table-row-option-button");
    optionButton.classList.add("col-7", "option-button");
    optionButton.icon = "dotsHorizontal";
    optionButton.toggleAttribute("hide-trailing-chevron", true);

    optionButton.items = [
      { key: "detail", title: "View data", icon: "box" },
      { key: "edit", title: "Edit category", icon: "pencil" },
      category.active
        ? { key: "archive", title: "Archive category", icon: "pieChart" }
        : { key: "restore", title: "Reactivate category", icon: "restore" },
    ];
    optionButton.addListener(this);

    // Current status of the item: syncing, active, archived
    const status = document.createElement("span");
    status.className = "status col-3 push-right";

    const syncStatus = APIs.budget.getEntitySyncStatus("category", category.id);

    if (syncStatus) {
      status.textContent = "Syncing";
      status.setAttribute("status", "syncing");
    } else if (!category.active) {
      status.textContent = "Archived";
      status.setAttribute("status", "archived");
    } else {
      status.textContent = "Active";
      status.setAttribute("status", "active");
    }

    const selectionBackdrop = document.createElement("div");
    selectionBackdrop.className = "selection-backdrop";

    row.append(
      selectionBackdrop,
      checkbox,
      name,
      status,
      quantity,
      average,
      sum,
      optionButton,
    );

    return row;
  }

  /** Selects or deslects a row in the table */
  #handleSelection(selectedRow: HTMLElement | null) {
    // Clear the selection
    if (selectedRow === null) {
      this.#selected = [];
    }

    // Select or deselect the row
    else {
      const id = selectedRow.dataset.entityId!;

      if (this.#selected.includes(id)) {
        this.#selected = this.#selected.filter((item) => item !== id);
      } else {
        this.#selected.push(id);
      }
    }

    const isEmpty = this.#selected.length === 0;

    for (let i = 0, l = this.#list.children.length; i < l; i++) {
      const row = this.#list.children[i] as HTMLElement;
      const rowId = row.dataset.entityId!;
      const checkbox = row.querySelector<Checkbox>("check-box")!;

      // No selection made
      if (isEmpty) {
        row.setAttribute("selection-state", "empty");
        checkbox.isOn = false;
        this.#clearSelectionButton.toggleAttribute("hidden", true);
      }
      // Mark item selected
      else if (this.#selected.includes(rowId)) {
        row.setAttribute("selection-state", "selected");
        checkbox.isOn = true;
        this.#clearSelectionButton.toggleAttribute("hidden", false);
      }
      // Mark item deselected
      else {
        row.setAttribute("selection-state", "unselected");
        checkbox.isOn = false;
        this.#clearSelectionButton.toggleAttribute("hidden", false);
      }
    }

    this.#getSum();
  }

  /** Handles category navigation and synchronization button actions. */
  #handleClick(event: Event): void {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest<ActionButton>("[data-action]");

    if (button) {
      const action = button.dataset.action;

      if (action === "filter") {
        console.log("filter");
        return;
      }

      if (action === "change-tab") {
        this.#handleTableViewChange(button);
        return;
      }

      if (action === "clear-selection") {
        this.#handleSelection(null);
        return;
      }

      if (action === "new-category") {
        this.#overlayManager.showEntityForm(button, "category", {
          side: "bottom",
          align: "end",
          gap: 8,
          offset: 16,
        });
        return;
      }
    }

    const actionButton = event.target.closest<HTMLButtonElement>(
      "[data-entity-action]",
    );

    if (actionButton) {
      this.#handleEntityAction(actionButton);
      return;
    }

    const row = event.target.closest<HTMLElement>("[data-entity-id]");
    const checkbox = event.target.closest<Checkbox>("check-box");

    if (row && checkbox) {
      checkbox.isOn = !checkbox.isOn;
      this.#handleSelection(row);
      return;
    }

    if (row?.dataset.entityId) {
      this.#navigateToCategory(row.dataset.entityId);
    }
  }

  /** Handles keyboard activation for category rows. */
  #handleKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-entity-action], dropdown-menu")) return;

    const row = event.target.closest<HTMLElement>("[data-entity-id]");
    if (!row?.dataset.entityId) return;
    event.preventDefault();
    this.#navigateToCategory(row.dataset.entityId);
  }

  /** Retries or removes a failed category synchronization operation. */
  #handleEntityAction(button: HTMLButtonElement): void {
    const categoryId = button.dataset.entityId;
    if (!categoryId) return;

    try {
      if (button.dataset.entityAction === "retry") {
        APIs.budget.retryEntity("category", categoryId);
      } else if (
        button.dataset.entityAction === "remove" &&
        window.confirm("Remove this unsynced category from this computer?")
      ) {
        APIs.budget.removeFailedEntity("category", categoryId);
      }
    } catch (error: unknown) {
      // this.#setFormMessage(errorMessage(error), "error");
    }
  }

  /** Switches between expense, income, and archived category tables. */
  #handleTableViewChange(target: HTMLButtonElement): void {
    const view = target.dataset.tableView as CategoryScreenTabs;
    this.#tableView = view;
    this.#render();
  }

  #handleDateRangeChanged(event: DateRangeChangedEvent) {
    this.#range = event.detail.range;
    this.#dateRangeStep = event.detail.step;
    this.#render();
  }

  /** Navigates to the selected category's entity detail route. */
  #navigateToCategory(categoryId: string): void {
    router.navigate("budgeting/entity-detail", {
      kind: "category",
      id: categoryId,
      year: String(appState.get("budgetingContext").year),
      assignment: appState.get("budgetingContext").assignmentId ?? "all",
    });
  }

  /** Executes the action selected from a category row's option menu. */
  async #handleCategoryMenuSelection(
    event: DropdownSelectionEvent,
  ): Promise<void> {
    if (!(event.target instanceof DropdownMenu)) return;

    const row = event.target.closest<HTMLElement>("[data-entity-id]");
    const categoryId = row?.dataset.entityId;
    if (!categoryId) return;

    if (event.detail.value === "detail") {
      this.#navigateToCategory(categoryId);
      return;
    }

    if (event.detail.value === "edit") {
      router.updateParams({
        drawer: "entity-edit",
        entityKind: "category",
        entityId: categoryId,
      });
      return;
    }

    try {
      if (event.detail.value === "archive") {
        await APIs.budget.archiveCategory(categoryId);
      } else if (event.detail.value === "restore") {
        await APIs.budget.reactivateCategory({ id: categoryId });
      }
    } catch (error: unknown) {
      window.dispatchEvent(
        new CustomEvent("budget:api-warning", {
          detail: `Couldn’t ${event.detail.value} category: ${errorMessage(error)}`,
        }),
      );
    }
  }

  // Sets the sort function based on the item selected from the menu, re-renders the page, and removes the listener.
  #handleSortSelection(event: Event) {
    this.#sortDropdown.handleSelection(event, ({ value }) => {
      this.#sortKey = value;
      this.#sortFxn = sortCategoryScreen(value);
      this.#render();
      this.#sortDropdown.close();
    });
  }

  #handleFiltersChanged(event: Event) {
    this.#filterDropdown.handleFiltersChanged(event, ({ filters }) => {
      this.#filters = filters;
      this.#render();
    });
  }

  #filterCategories() {
    const categories = APIs.budget.listAllCategories();

    let filtered = categories;

    if (this.#filters.length > 0) {
      filtered = categories.filter((item) => {
        const { count, total } = this.#usage.get(item.id) ?? {
          count: 0,
          total: 0,
        };
        const values = {
          name: item.name.toLowerCase(),
          count,
          total,
          average: total === 0 ? 0 : total / count,
          status: item.active ? "Active" : "Archived",
        };

        return (
          item.type === this.#tableView &&
          this.#filters.every((filter) => {
            const filterKey = filter.key as keyof typeof values;
            const value = values[filterKey];

            if (filter.operator === "Equals") {
              return value === filter.value;
            }

            if (filter.operator === "Greater than") {
              return value > filter.value;
            }

            if (filter.operator === "Less than") {
              return value < filter.value;
            }

            if (filter.operator === "Contains") {
              const val = value as string;
              return val.includes(filter.value.toString().toLowerCase());
            }

            if (filter.operator === "Starts with") {
              const val = value as string;
              return val.startsWith(filter.value.toString().toLowerCase());
            }
          })
        );
      });
    }

    return filtered;
  }

  #sortCategories(categories: BudgetEntity[]) {
    return this.#sortFxn(categories, this.#usage);
  }
}

if (!customElements.get("category-screen")) {
  customElements.define("category-screen", CategoryScreen);
}
