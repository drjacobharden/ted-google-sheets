import { appController } from "../../state/app-controller";
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
  const summaries = appState.get("budgetOverview").monthlyTransactionSummaries;
  const years = Object.keys(summaries)
    .map(Number)
    .filter((year) => Number.isInteger(year) && year <= currentYear);
  if (!years.includes(currentYear)) years.push(currentYear);
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

function availableAssignments(): { id: string; name: string }[] {
  return appController.getBudgetOverviewAssignments();
}

function withoutOverlayParams(params: RouteParams): RouteParams {
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => !OVERLAY_PARAMS.has(key)),
  ) as RouteParams;
}

/** Owns the persistent budgeting header and swaps routed budgeting views. */
export class BudgetingShell extends HTMLElement implements EventListenerObject {
  #contentSelector!: DropdownMenu;
  #yearSelector!: DropdownMenu;
  #assignmentSelector!: DropdownMenu;
  #breadcrumbTail!: HTMLElement;
  #actions!: HTMLElement;
  #outlet!: HTMLElement;
  #route: RouteChangedEventDetail | null = null;
  #viewKey = "";
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.classList.add("screen");
      this.dataset.screen = "budgeting";
      this.append(template.content.cloneNode(true));
      this.#captureElements();
    }
    if (!this.#listening) {
      this.#listening = true;
      this.#contentSelector.addListener(this);
      this.#yearSelector.addListener(this);
      this.#assignmentSelector.addListener(this);
      this.#actions.addEventListener("click", this);
      window.addEventListener("app:route-changed", this);
      window.addEventListener("budget:reference-data-changed", this);
      window.addEventListener("budget:transactions-loaded", this);
      window.addEventListener("budget:people-changed", this);
      window.addEventListener("budget:categories-changed", this);
      window.addEventListener("budget:vendors-changed", this);
    }
    if (this.#route) this.#applyRoute(this.#route);
  }

  disconnectedCallback(): void {
    if (!this.#listening) return;
    this.#listening = false;
    this.#contentSelector.removeListener(this);
    this.#yearSelector.removeListener(this);
    this.#assignmentSelector.removeListener(this);
    this.#actions.removeEventListener("click", this);
    window.removeEventListener("app:route-changed", this);
    window.removeEventListener("budget:reference-data-changed", this);
    window.removeEventListener("budget:transactions-loaded", this);
    window.removeEventListener("budget:people-changed", this);
    window.removeEventListener("budget:categories-changed", this);
    window.removeEventListener("budget:vendors-changed", this);
  }

  set route(detail: RouteChangedEventDetail) {
    this.#route = detail;
    if (this.isConnected) this.#applyRoute(detail);
  }

  handleEvent(event: Event): void {
    if (event.type === "dropdown-selection") {
      this.#handleSelection(event as DropdownSelectionEvent);
      return;
    }
    if (event.type === "click") {
      this.#handleAction(event);
      return;
    }
    if (event.type === "app:route-changed") {
      const detail = (event as CustomEvent<RouteChangedEventDetail>).detail;
      if (router.isBudgetingRoute(detail.name)) this.route = detail;
      return;
    }
    if (this.#route) this.#applyRoute(this.#route, true);
  }

  #captureElements(): void {
    this.#contentSelector = this.querySelector("#budgeting-content-selector")!;
    this.#yearSelector = this.querySelector("#budgeting-year-selector")!;
    this.#assignmentSelector = this.querySelector(
      "#budgeting-assignment-selector",
    )!;
    this.#breadcrumbTail = this.querySelector("#budgeting-breadcrumb-tail")!;
    this.#actions = this.querySelector("#budgeting-header-actions")!;
    this.#outlet = this.querySelector("#budgeting-view-outlet")!;
  }

  #applyRoute(detail: RouteChangedEventDetail, validateLoaded = false): void {
    if (!router.isBudgetingRoute(detail.name)) return;
    const choices = availableYears();
    const stored = appState.get("budgetingContext");
    const requestedYear = validYear(detail.params.year, choices);
    const storedYear = validYear(stored.year, choices);
    const year = requestedYear ?? storedYear ?? choices[0];

    const assignments = availableAssignments();
    const requestedAssignment = detail.params.assignment;
    let assignmentId =
      requestedAssignment === undefined
        ? stored.assignmentId
        : requestedAssignment === "all"
          ? null
          : requestedAssignment;
    if (
      assignmentId &&
      (validateLoaded || appController.isReferenceDataLoaded()) &&
      !assignments.some((assignment) => assignment.id === assignmentId)
    ) {
      assignmentId = null;
    }

    const canonicalParams: RouteParams = {
      ...detail.params,
      year: String(year),
      assignment: assignmentId ?? "all",
    };
    if (
      detail.params.year !== canonicalParams.year ||
      detail.params.assignment !== canonicalParams.assignment
    ) {
      router.replace(detail.name, canonicalParams);
      return;
    }

    const lastParams = withoutOverlayParams(canonicalParams);
    const nextContext: BudgetingContext = {
      year,
      assignmentId,
      lastRoute: detail.name,
      lastParams,
    };
    if (JSON.stringify(stored) !== JSON.stringify(nextContext)) {
      appState.set("budgetingContext", nextContext);
    }
    appController.setBudgetOverviewAssignment(assignmentId);
    this.#route = { ...detail, params: canonicalParams };
    this.#renderHeader(nextContext, detail.name, canonicalParams);
    this.#renderView(detail.name, canonicalParams);
  }

  #renderHeader(
    context: BudgetingContext,
    route: BudgetingRouteName,
    params: RouteParams,
  ): void {
    const definition = getBudgetingRouteDefinition(route, params);
    const config = definition.getHeaderConfig(context, params);
    this.#contentSelector.items = BUDGETING_CONTENT_ROUTES.map((item) => ({
      key: item.route,
      title: item.title,
      icon: item.icon,
      isDefaultValue: item.contentKey === definition.contentKey,
    }));
    this.#contentSelector.icon = definition.icon;
    this.#yearSelector.items = availableYears().map((year) => ({
      key: String(year),
      title: String(year),
      isDefaultValue: year === context.year,
    }));
    this.#assignmentSelector.items = [
      {
        key: "all",
        title: "All assignments",
        isDefaultValue: context.assignmentId === null,
      },
      ...availableAssignments().map((assignment) => ({
        key: assignment.id,
        title: assignment.name,
        isDefaultValue: assignment.id === context.assignmentId,
      })),
    ];

    const crumbs = config.breadcrumbs.flatMap((crumb) => {
      const separator = document.createElement("custom-icon");
      separator.setAttribute("icon", "chevronRight");
      separator.classList.add("muted");
      const label = document.createElement("span");
      label.className = "budgeting-shell__breadcrumb";
      label.textContent = crumb.title;
      return [separator, label];
    });
    this.#breadcrumbTail.replaceChildren(...crumbs);
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
    } else {
      button.classList.add("square");
    }

    if (action.icon) button.leadingIcon = action.icon;
    return button;
  }

  #renderView(route: BudgetingRouteName, params: RouteParams): void {
    const definition = getBudgetingRouteDefinition(route, params);
    const viewKey = `${route}:${params.kind ?? ""}:${params.id ?? ""}`;
    if (viewKey === this.#viewKey) return;
    this.#viewKey = viewKey;
    this.#outlet.replaceChildren(
      document.createElement(definition.componentTag),
    );
  }

  #scopeParams(): RouteParams {
    const context = appState.get("budgetingContext");
    return {
      year: String(context.year),
      assignment: context.assignmentId ?? "all",
    };
  }

  #handleSelection(event: DropdownSelectionEvent): void {
    if (event.target === this.#contentSelector) {
      router.navigate(
        event.detail.value as BudgetingRouteName,
        this.#scopeParams(),
      );
      return;
    }
    if (event.target === this.#yearSelector) {
      router.replaceParams({ year: event.detail.value });
      return;
    }
    if (event.target === this.#assignmentSelector) {
      router.replaceParams({ assignment: event.detail.value });
    }
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
    this.#outlet.firstElementChild?.dispatchEvent(
      new CustomEvent("budgeting:header-action", {
        detail: { action, anchor },
      }),
    );
  }
}

if (!customElements.get("budgeting-shell")) {
  customElements.define("budgeting-shell", BudgetingShell);
}
