import { appState, type BudgetingContext } from "../../state/app-state";
import { router } from "../../router/router";
import type {
  BudgetingRouteName,
  RouteChangedEventDetail,
  RouteParams,
} from "../../router/types";
import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type {
  SegmentedControl,
  SegmentedControlSelectionEvent,
} from "../../components/segmented-control/segmented-control";
import { CustomButton } from "../../components/button/button";
import {
  BUDGETING_CONTENT_ROUTES,
  getBudgetingRouteDefinition,
  type HeaderAction,
} from "./route-definitions";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

const OVERLAY_PARAMS = new Set([
  "drawer",
  "transactionId",
  "entityKind",
  "entityId",
  "investmentAccountId",
  "investmentMonth",
  "investmentReviewId",
]);

function availableYears(): number[] {
  const currentYear = new Date().getFullYear();
  const overview = appState.get("budgetOverview");
  const years = Object.entries(overview.monthlyTransactionSummaries)
    .filter(([year, rows]) => {
      const numericYear = Number(year);
      const deductionMonths =
        overview.annualSummaryCards[numericYear]?.metrics.paycheckDeductions
          .months ?? [];
      return (
        Number.isInteger(numericYear) &&
        numericYear <= currentYear &&
        (rows.some((row) => row.hasData) ||
          deductionMonths.some((month) => month.hasData))
      );
    })
    .map(([year]) => Number(year));
  if (years.length === 0) years.push(currentYear);
  return years.sort((left, right) => right - left);
}

function validYear(value: unknown, choices: number[]): number | null {
  const year = Number(value);
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > new Date().getFullYear()
  ) {
    return null;
  }
  return choices.length <= 1 || choices.includes(year) ? year : null;
}

function withoutOverlayParams(params: RouteParams): RouteParams {
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => !OVERLAY_PARAMS.has(key)),
  ) as RouteParams;
}

/** Owns shared Budgeting scope, route navigation, and screen actions. */
export class BudgetingHeader
  extends HTMLElement
  implements EventListenerObject
{
  #sectionSelector!: SegmentedControl;
  #yearSelector!: DropdownMenu;
  #scope!: HTMLElement;
  #previousYearButton!: CustomButton;
  #nextYearButton!: CustomButton;
  #actions!: HTMLElement;
  #route: RouteChangedEventDetail | null = null;
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    if (!this.#listening) {
      this.#listening = true;
      this.#sectionSelector.addListener(this);
      this.#yearSelector.addListener(this);
      this.#scope.addEventListener("click", this);
      this.#actions.addEventListener("click", this);
      window.addEventListener("app:route-changed", this);
      window.addEventListener("budget:reference-data-changed", this);
      window.addEventListener("budget:transactions-loaded", this);
      window.addEventListener("budget:people-changed", this);
      window.addEventListener("budget:categories-changed", this);
      window.addEventListener("budget:vendors-changed", this);
    }
    this.#applyRoute({
      name: router.currentRoute(),
      route: router.currentRoute(),
      params: router.currentParams(),
    });
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#sectionSelector.removeListener(this);
    this.#yearSelector.removeListener(this);
    this.#scope.removeEventListener("click", this);
    this.#actions.removeEventListener("click", this);
    window.removeEventListener("app:route-changed", this);
    window.removeEventListener("budget:reference-data-changed", this);
    window.removeEventListener("budget:transactions-loaded", this);
    window.removeEventListener("budget:people-changed", this);
    window.removeEventListener("budget:categories-changed", this);
    window.removeEventListener("budget:vendors-changed", this);
  }

  handleEvent(event: Event): void {
    if (event.type === "segmented-control-selection") {
      this.#handleSectionSelection(event as SegmentedControlSelectionEvent);
      return;
    }
    if (event.type === "dropdown-selection") {
      this.#handleSelection(event as DropdownSelectionEvent);
      return;
    }
    if (event.type === "click") {
      if (this.#handleYearStep(event)) return;
      this.#handleAction(event);
      return;
    }
    if (event.type === "app:route-changed") {
      const detail = (event as CustomEvent<RouteChangedEventDetail>).detail;
      if (router.isBudgetingRoute(detail.name)) this.#applyRoute(detail);
      else {
        this.#route = null;
        this.hidden = true;
      }
      return;
    }
    this.#applyRoute({
      name: router.currentRoute(),
      route: router.currentRoute(),
      params: router.currentParams(),
    });
  }

  #captureElements(): void {
    this.#sectionSelector = this.querySelector("#budgeting-section-selector")!;
    this.#yearSelector = this.querySelector("#budgeting-year-selector")!;
    this.#scope = this.querySelector(".budgeting-header__scope")!;
    this.#previousYearButton = this.querySelector("#budgeting-year-previous")!;
    this.#nextYearButton = this.querySelector("#budgeting-year-next")!;
    this.#actions = this.querySelector("#budgeting-header-actions")!;
  }

  #applyRoute(detail: RouteChangedEventDetail): void {
    if (!router.isBudgetingRoute(detail.name)) {
      this.hidden = true;
      return;
    }
    this.hidden = false;
    const choices = availableYears();
    const stored = appState.get("budgetingContext");
    const requestedYear = validYear(detail.params.year, choices);
    const storedYear = validYear(stored.year, choices);
    const year = requestedYear ?? storedYear ?? choices[0];

    const { assignment: _legacyAssignment, ...routeParams } = detail.params;
    const canonicalParams: RouteParams = {
      ...routeParams,
      year: String(year),
    };
    if (
      detail.params.year !== canonicalParams.year ||
      detail.params.assignment !== undefined
    ) {
      // The header can connect before #route-outlet has been parsed. Let the
      // router's DOM-ready announcement perform this normalization instead.
      if (!document.getElementById("route-outlet")) return;
      router.replace(detail.name, canonicalParams);
      return;
    }

    const lastParams = withoutOverlayParams(canonicalParams);
    const nextContext: BudgetingContext = {
      year,
      lastRoute: detail.name,
      lastParams,
    };
    if (JSON.stringify(stored) !== JSON.stringify(nextContext)) {
      appState.set("budgetingContext", nextContext);
    }
    this.#route = { ...detail, params: canonicalParams };
    this.#renderHeader(nextContext, detail.name, canonicalParams);
  }

  #renderHeader(
    context: BudgetingContext,
    route: BudgetingRouteName,
    params: RouteParams,
  ): void {
    const definition = getBudgetingRouteDefinition(route, params);
    const config = definition.getHeaderConfig(context, params);
    this.#sectionSelector.items = BUDGETING_CONTENT_ROUTES.map((item) => ({
      key: item.route,
      title: item.title,
      isDefaultValue: item.contentKey === definition.contentKey,
    }));
    this.#sectionSelector.selection =
      BUDGETING_CONTENT_ROUTES.find(
        (item) => item.contentKey === definition.contentKey,
      )?.route ?? null;
    const years = availableYears();
    this.#yearSelector.items = years.map((year) => ({
      key: String(year),
      title: String(year),
      isDefaultValue: year === context.year,
    }));
    const ascendingYears = [...years].sort((left, right) => left - right);
    const yearIndex = ascendingYears.indexOf(context.year);
    const previousYear = yearIndex > 0 ? ascendingYears[yearIndex - 1] : null;
    const nextYear =
      yearIndex >= 0 && yearIndex < ascendingYears.length - 1
        ? ascendingYears[yearIndex + 1]
        : null;
    this.#setYearStepState(
      this.#previousYearButton,
      previousYear,
      "Previous",
    );
    this.#setYearStepState(this.#nextYearButton, nextYear, "Next");
    this.#actions.replaceChildren(
      ...config.actions.map((action) => this.#createAction(action)),
    );
  }

  #createAction(action: HeaderAction): CustomButton {
    const button = document.createElement("custom-button") as CustomButton;
    button.classList.add(
      action.kind === "primary" ? "primary-button" : "tertiary",
    );
    button.dataset.headerAction = action.id;

    if (action.label) {
      button.label = action.label;
      button.setAttribute("aria-label", action.label);
    } else {
      button.classList.add("square");
    }

    if (action.id === "new-transaction") {
      button.classList.add("budgeting-header__compact-action", "square");
    }

    if (action.icon) button.leadingIcon = action.icon;
    return button;
  }

  #scopeParams(): RouteParams {
    const context = appState.get("budgetingContext");
    return {
      year: String(context.year),
    };
  }

  #handleSectionSelection(event: SegmentedControlSelectionEvent): void {
    router.navigate(
      event.detail.value as BudgetingRouteName,
      this.#scopeParams(),
    );
  }

  #handleSelection(event: DropdownSelectionEvent): void {
    if (event.target === this.#yearSelector) {
      router.replaceParams({ year: event.detail.value });
      return;
    }
  }

  #setYearStepState(
    button: CustomButton,
    year: number | null,
    direction: "Previous" | "Next",
  ): void {
    if (year === null) delete button.dataset.year;
    else button.dataset.year = String(year);
    button.toggleAttribute("disabled", year === null);
    button.setAttribute("aria-disabled", String(year === null));
    button.setAttribute(
      "aria-label",
      year === null ? `No ${direction.toLowerCase()} year available` : `${direction} year, ${year}`,
    );
  }

  #handleYearStep(event: Event): boolean {
    const button = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-year-step]",
    );
    if (!button) return false;
    const year = Number(button.dataset.year);
    if (!Number.isInteger(year) || button.hasAttribute("disabled")) return true;
    router.replaceParams({ year: String(year) });
    return true;
  }

  #handleAction(event: Event): void {
    const anchor = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-header-action]",
    );
    const action = anchor?.dataset.headerAction;
    if (!action) return;
    if (action === "open-import") {
      router.navigate("import");
      return;
    }
    if (action === "new-transaction") {
      router.updateParams({ drawer: "new", transactionId: null });
      return;
    }
    const entityKind = {
      "new-category": "category",
      "new-vendor": "vendor",
      "new-person": "assignment",
    }[action] as "category" | "vendor" | "assignment" | undefined;
    if (entityKind) {
      router.updateParams({
        drawer: "entity-new",
        entityKind,
        entityId: null,
      });
      return;
    }
    const screen = Array.from(
      document.getElementById("route-outlet")?.children ?? [],
    ).find((element) => element !== this);
    screen?.dispatchEvent(
      new CustomEvent("budgeting:header-action", {
        detail: { action, anchor },
      }),
    );
  }
}

if (!customElements.get("budgeting-header")) {
  customElements.define("budgeting-header", BudgetingHeader);
}
