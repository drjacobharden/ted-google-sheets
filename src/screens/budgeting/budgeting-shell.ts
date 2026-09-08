import { appState, type BudgetingContext } from "../../state/app-state";
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import type {
  BudgetingRouteName,
  RouteChangedEventDetail,
  RouteParams,
} from "../../router/types";
import type {
  SegmentedControl,
  SegmentedControlSelectionEvent,
} from "../../components/segmented-control/segmented-control";
import type { YearSelector } from "../../components/year-selector/year-selector";
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import {
  BUDGETING_CONTENT_ROUTES,
  getBudgetingRouteDefinition,
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
  "accountDraftName",
  "accountCreateRequestId",
]);

function availableYears(): number[] {
  const currentYear = new Date().getFullYear();
  const overview = appState.get("budgetOverview");
  const budgetingYears = Object.entries(overview.monthlyTransactionSummaries)
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
  const accountYears = [
    ...APIs.accounts.activity().map((item) => Number(String(item.date).slice(0, 4))),
    ...APIs.accounts.balances().map((item) => Number(String(item.month).slice(0, 4))),
  ].filter((year) => Number.isInteger(year) && year <= currentYear);
  const years = [...new Set([...budgetingYears, ...accountYears])];
  if (years.length === 0) years.push(currentYear);
  const firstYear = Math.min(...years);
  return Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => currentYear - index,
  );
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
  #yearSelector!: YearSelector;
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
      this.#sectionSelector.addEventListener("click", this);
      addListener("year-selection-changed", this.#yearSelector, this);
      window.addEventListener("click", this);
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
    this.#sectionSelector.removeEventListener("click", this);
    removeListener("year-selection-changed", this.#yearSelector, this);
    window.removeEventListener("click", this);
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
    if (event.type === "year-selection-changed") {
      handleCustomEvent("year-selection-changed", event, ({ year }) => {
        router.replaceParams({ year });
      });
      return;
    }
    if (event.type === "click") {
      if (
        event.currentTarget === window &&
        !(event.target as Element | null)?.closest("[data-header-action]")
      ) {
        return;
      }
      const section = (event.target as Element | null)?.closest<HTMLElement>(
        ".segmented-control__item",
      );
      const currentRoute = router.currentRoute();
      if (section && (currentRoute === "entity-detail" || currentRoute === "entity-archive")) {
        const kind = router.currentParams().kind;
        const collection = kind === "vendor"
          ? "vendors"
          : kind === "assignment"
            ? "people"
            : "categories";
        if (section.dataset.segmentKey === collection) {
          router.navigate(collection, this.#scopeParams());
          return;
        }
      }
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
    this.#yearSelector.years = years;
    this.#yearSelector.selectedYear = String(context.year);
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
      router.navigate("new-transaction");
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
