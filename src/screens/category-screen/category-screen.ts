import { APIs } from "../../api/api";
import type { BudgetEntity, BudgetTransaction } from "../../api/budget-api";
import { Breadcrumbs } from "../../components/breadcrumbs/breadcrumbs";
import { CustomButton } from "../../components/button/button";
import { registerLegacyRouteAdapter } from "../../utilities/legacy-route-adapter";
import { appRouter, budgetUI } from "../../utilities/legacy-runtime";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

type CategoryScreenTabs = "expense" | "income" | "archived";

/** Displays and manages the expense-category screen. */
export class CategoryScreen extends HTMLElement implements EventListenerObject {
  // #form!: HTMLFormElement;
  #list!: HTMLElement;
  #count!: HTMLElement;
  // #formMessage!: HTMLElement;
  // #nameInput!: HTMLInputElement;
  #breadcrumbs!: Breadcrumbs;
  #usage = new Map<string, number>();
  #listening = false;
  #tableView: CategoryScreenTabs = "expense";
  #actionRow!: HTMLElement;
  #tableViewButtons!: NodeListOf<CustomButton>;

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
    // this.#form.addEventListener("submit", this);
    this.#list.addEventListener("click", this);
    this.#list.addEventListener("keydown", this);
    this.#actionRow.addEventListener("click", this);
    window.addEventListener("budget:categories-changed", this);
    window.addEventListener("budget:entity-sync-changed", this);
    window.addEventListener("budget:transaction-sync-changed", this);
    window.addEventListener("budget:transaction-saved", this);
    this.#loadUsage();
    this.#setBreadcrumbs();
  }

  /** Removes every listener owned by the screen when routing detaches it. */
  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    // this.#form.removeEventListener("submit", this);
    this.#list.removeEventListener("click", this);
    this.#list.removeEventListener("keydown", this);
    this.#actionRow.removeEventListener("click", this);
    window.removeEventListener("budget:categories-changed", this);
    window.removeEventListener("budget:entity-sync-changed", this);
    window.removeEventListener("budget:transaction-sync-changed", this);
    window.removeEventListener("budget:transaction-saved", this);
  }

  /** Routes subscribed events to the appropriate screen behavior. */
  handleEvent(event: Event): void {
    switch (event.type) {
      // case "submit":
      //   void this.#handleSubmit(event);
      //   break;
      case "click":
        this.#handleClick(event);
        break;
      case "keydown":
        this.#handleKeydown(event);
        break;
      case "budget:categories-changed":
      case "budget:entity-sync-changed":
        this.#render();
        break;
      case "budget:transaction-sync-changed":
      case "budget:transaction-saved":
        this.#loadUsage();
        break;
    }
  }

  /** Captures the typed elements rendered from the component template. */
  #captureElements(): void {
    // this.#form = this.querySelector<HTMLFormElement>("#category-form")!;
    this.#list = this.querySelector<HTMLElement>("#category-list")!;
    this.#count = this.querySelector<CustomButton>("#category-count")!;
    this.#actionRow = this.querySelector<HTMLElement>(".table-action-row")!;
    this.#tableViewButtons =
      this.querySelectorAll<CustomButton>("[data-table-view]");
    // this.#formMessage = this.querySelector<HTMLElement>(
    //   "#category-form-message",
    // )!;
    // this.#nameInput = this.#form.elements.namedItem(
    //   "categoryName",
    // ) as HTMLInputElement;
    this.#breadcrumbs = this.querySelector<Breadcrumbs>("breadcrumbs-header")!;
  }

  /** Sets the breadcrumbs at the top of the page */
  #setBreadcrumbs(): void {
    this.#breadcrumbs.setPath([
      { title: "Budgeting" },
      { title: "Categories", key: "categories" },
    ]);
  }

  /** Recalculates transaction usage counts before rendering categories. */
  #loadUsage(): void {
    this.#usage = new Map<string, number>();
    this.#transactions()
      .filter((transaction) => transaction.type !== "income")
      .forEach((transaction) => {
        const count = this.#usage.get(transaction.categoryId) ?? 0;
        this.#usage.set(transaction.categoryId, count + 1);
      });
    this.#render();
  }

  /** Returns the current application transaction collection. */
  #transactions(): BudgetTransaction[] {
    return (
      budgetUI()?.getTransactions() ??
      APIs.budget.getCachedTransactions() ??
      []
    );
  }

  /** Renders the current expense categories and their sync state. */
  #render(): void {
    for (let i = 0, l = this.#tableViewButtons.length; i < l; i++) {
      const button = this.#tableViewButtons[i];

      if (this.#tableView === button.dataset.tableView) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    }

    const categories = APIs.budget.listAllCategories();

    const filtered = categories.filter((item) => {
      if (this.#tableView === "archived") {
        return item.active === false;
      }

      return item.type === this.#tableView;
    });

    const label = filtered.length === 1 ? "category" : "categories";
    this.#count.textContent = `Showing ${filtered.length} ${label}`;
    this.#list.replaceChildren(
      ...filtered.map((category) => this.#createCategoryRow(category)),
    );
  }

  /** Creates one accessible category row without interpolating unsafe markup. */
  #createCategoryRow(category: BudgetEntity): HTMLElement {
    const transactionCount = this.#usage.get(category.id) ?? 0;
    const row = document.createElement("article");
    row.className = "category-screen__item";
    row.dataset.entityKind = "category";
    row.dataset.entityId = category.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `View ${category.name} category`);

    const avatar = document.createElement("span");
    avatar.className = "category-screen__avatar";
    avatar.ariaHidden = "true";
    avatar.textContent = category.name.charAt(0).toUpperCase();

    // const details = document.createElement("div");
    // details.className = "category-screen__details";
    const name = document.createElement("strong");
    name.textContent = category.name;
    const usage = document.createElement("span");
    usage.textContent = `${transactionCount} ${
      transactionCount === 1 ? "transaction" : "transactions"
    }`;
    // details.append(name, usage);
    row.append(avatar, name, usage);

    const syncStatus = APIs.budget.getEntitySyncStatus("category", category.id);
    if (syncStatus) row.append(this.#createSyncControls(category, syncStatus));
    return row;
  }

  /** Creates retry and removal controls for a category awaiting synchronization. */
  #createSyncControls(
    category: BudgetEntity,
    syncStatus: NonNullable<ReturnType<typeof APIs.budget.getEntitySyncStatus>>,
  ): HTMLElement {
    const controls = document.createElement("div");
    controls.className = `category-screen__sync-state ${syncStatus.status}`;
    const label = document.createElement("span");
    label.textContent =
      syncStatus.status === "failed" ? "Needs attention" : "Pending";
    controls.append(label);

    if (syncStatus.status === "failed") {
      controls.append(
        this.#createSyncButton("retry", "Retry", category.id),
        this.#createSyncButton("remove", "Remove", category.id),
      );
    }
    return controls;
  }

  /** Creates a typed category synchronization action button. */
  #createSyncButton(
    action: "retry" | "remove",
    label: string,
    categoryId: string,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.entityAction = action;
    button.dataset.entityId = categoryId;
    button.textContent = label;
    return button;
  }

  /** Validates and submits a new expense category. */
  // async #handleSubmit(event: Event): Promise<void> {
  //   event.preventDefault();
  //   this.#setFormMessage("");
  //   if (!this.#form.checkValidity()) {
  //     this.#form.reportValidity();
  //     return;
  //   }

  //   try {
  //     const category = await APIs.budget.addCategory({
  //       name: this.#nameInput.value,
  //       type: "expense",
  //     });
  //     this.#form.reset();
  //     this.#nameInput.focus();
  //     this.#setFormMessage(
  //       APIs.budget.getConfig().endpoint
  //         ? `${category.name} was added. Syncing…`
  //         : `${category.name} was added.`,
  //       "success",
  //     );
  //     this.#render();
  //   } catch (error: unknown) {
  //     this.#setFormMessage(errorMessage(error), "error");
  //   }
  // }

  /** Handles category navigation and synchronization button actions. */
  #handleClick(event: Event): void {
    if (!(event.target instanceof Element)) return;

    const tabButton =
      event.target.closest<HTMLButtonElement>("[data-table-view]");

    if (tabButton) {
      this.#handleTableViewChange(tabButton);
      return;
    }

    const actionButton = event.target.closest<HTMLButtonElement>(
      "[data-entity-action]",
    );
    if (actionButton) {
      this.#handleEntityAction(actionButton);
      return;
    }

    const row = event.target.closest<HTMLElement>("[data-entity-id]");
    if (row?.dataset.entityId) this.#navigateToCategory(row.dataset.entityId);
  }

  /** Handles keyboard activation for category rows. */
  #handleKeydown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-entity-action]")) return;

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

  /** Navigates to the selected category's entity detail route. */
  #navigateToCategory(categoryId: string): void {
    appRouter().navigate("entity-detail", {
      kind: "category",
      id: categoryId,
    });
  }

  /** Updates the form's accessible status message and visual state. */
  // #setFormMessage(message: string, state?: "success" | "error"): void {
  //   this.#formMessage.textContent = message;
  //   if (state) this.#formMessage.dataset.state = state;
  //   else delete this.#formMessage.dataset.state;
  // }
}

if (!customElements.get("category-screen")) {
  customElements.define("category-screen", CategoryScreen);
}

registerLegacyRouteAdapter("CategoryRoute");
