import type {
  SegmentedControl,
  SegmentedControlSelectionEvent,
} from "../../components/segmented-control/segmented-control";
import { CustomButton } from "../../components/button/button";
import type { YearSelector } from "../../components/year-selector/year-selector";
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import { appState, type InvestmentContentRoute } from "../../state/app-state";
import type { RouteChangedEventDetail, RouteName } from "../../router/types";
import {
  addListener,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

const CONTENT_ROUTES = [
  { route: "investment-overview", title: "Overview" },
  { route: "investment-accounts", title: "Portfolio" },
  { route: "investment-debts", title: "Debts" },
  { route: "investment-ledger", title: "Activity" },
] as const;

function isInvestmentRoute(name: RouteName): boolean {
  return name.startsWith("investment-");
}

function contentRoute(name: RouteName): string {
  if (name === "investment-account-detail") return "investment-accounts";
  if (name === "investment-debt-detail") return "investment-debts";
  return name;
}

function availableYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>([currentYear]);
  const overview = appState.get("budgetOverview");
  Object.entries(overview.monthlyTransactionSummaries).forEach(([year, rows]) => {
    const numericYear = Number(year);
    const deductionMonths =
      overview.annualSummaryCards[numericYear]?.metrics.paycheckDeductions.months ?? [];
    if (
      Number.isInteger(numericYear) &&
      numericYear >= 1900 &&
      numericYear <= currentYear &&
      (rows.some((row) => row.hasData) || deductionMonths.some((month) => month.hasData))
    ) {
      years.add(numericYear);
    }
  });
  APIs.accounts.balances().forEach((item) => {
    const year = Number(String(item.month).slice(0, 4));
    if (Number.isInteger(year) && year >= 1900 && year <= currentYear) {
      years.add(year);
    }
  });
  APIs.accounts.activity().forEach((item) => {
    const year = Number(String(item.date).slice(0, 4));
    if (Number.isInteger(year) && year >= 1900 && year <= currentYear) {
      years.add(year);
    }
  });
  const firstYear = Math.min(...years);
  return Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => currentYear - index,
  );
}

/** Owns the shared year, navigation, and entry action for Investments. */
export class InvestmentsHeader
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
      this.#sectionSelector = this.querySelector(
        "#investments-section-selector",
      )!;
      this.#yearSelector = this.querySelector("#investments-year-selector")!;
    }
    if (!this.#listening) {
      this.#listening = true;
      this.#sectionSelector.addListener(this);
      addListener("year-selection-changed", this.#yearSelector, this);
      this.addEventListener("click", this);
      window.addEventListener("click", this);
      window.addEventListener("app:route-changed", this);
      window.addEventListener("budget:accounts-changed", this);
      window.addEventListener("budget:accounts-loaded", this);
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
    removeListener("year-selection-changed", this.#yearSelector, this);
    this.removeEventListener("click", this);
    window.removeEventListener("click", this);
    window.removeEventListener("app:route-changed", this);
    window.removeEventListener("budget:accounts-changed", this);
    window.removeEventListener("budget:accounts-loaded", this);
  }

  handleEvent(event: Event): void {
    if (event.type === "segmented-control-selection") {
      const value = (event as SegmentedControlSelectionEvent).detail.value;
      this.#rememberTab(value as InvestmentContentRoute);
      router.navigate(value as RouteName, { year: this.#selectedYear() });
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
        !(event.target as Element | null)?.closest(
          "[data-edit-investment-account], [data-ledger-entry], [data-debt-account-new], [data-account-new]",
        )
      ) {
        return;
      }
      const section = (event.target as Element | null)?.closest<HTMLElement>(
        ".segmented-control__item",
      );
      if (section && this.#route) {
        const activeCollection = contentRoute(this.#route.name);
        if (
          (this.#route.name === "investment-account-detail" ||
            this.#route.name === "investment-debt-detail") &&
          section.dataset.segmentKey === activeCollection
        ) {
          router.navigate(activeCollection as RouteName, {
            year: this.#selectedYear(),
          });
          return;
        }
      }
      const editAccount = (
        event.target as Element | null
      )?.closest<HTMLElement>("[data-edit-investment-account]");
      if (
        editAccount &&
        (this.#route?.name === "investment-account-detail" ||
          this.#route?.name === "investment-debt-detail")
      ) {
        router.updateParams({
          drawer: "investment-account",
          investmentAccountId: this.#route.params.accountId ?? null,
          investmentLedgerSource:
            this.#route.name === "investment-debt-detail"
              ? "debt-account"
              : "investment",
        });
        return;
      }
      const ledgerEntry = (
        event.target as Element | null
      )?.closest<HTMLElement>("[data-ledger-entry]");
      if (ledgerEntry) {
        router.navigate("new-transaction", { transactionKind: "account" });
        return;
      }
      const addDebt = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-debt-account-new]",
      );
      if (addDebt) {
        router.updateParams({
          drawer: "investment-account",
          investmentAccountId: null,
          investmentLedgerSource: "debt-account",
        });
        return;
      }
      const addAccount = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-account-new]",
      );
      if (addAccount) {
        router.updateParams({
          drawer: "investment-account",
          investmentAccountId: null,
        });
        return;
      }
      return;
    }
    if (event.type === "app:route-changed") {
      this.#applyRoute((event as CustomEvent<RouteChangedEventDetail>).detail);
      return;
    }
    this.#applyRoute({
      name: router.currentRoute(),
      route: router.currentRoute(),
      params: router.currentParams(),
    });
  }

  #selectedYear(): string {
    return this.#route?.params.year ?? String(new Date().getFullYear());
  }

  #applyRoute(detail: RouteChangedEventDetail): void {
    if (!isInvestmentRoute(detail.name)) {
      this.#route = null;
      this.hidden = true;
      return;
    }
    this.hidden = false;
    const years = availableYears();
    const requested = Number(detail.params.year);
    const sharedYear = appState.get("budgetingContext").year;
    const year = years.includes(requested)
      ? requested
      : years.includes(sharedYear)
        ? sharedYear
        : years[0];
    if (detail.params.year !== String(year)) {
      if (!document.getElementById("route-outlet")) return;
      router.replace(detail.name, { ...detail.params, year: String(year) });
      return;
    }
    this.#syncBudgetingYear(year);
    if (
      detail.name === "investment-overview" &&
      appState.get("investmentContext").lastRoute !== "investment-overview"
    ) {
      const context = appState.get("investmentContext");
      router.replace(context.lastRoute, {
        ...context.lastParams,
        year: String(year),
      });
      return;
    }
    this.#route = detail;
    this.#rememberTab(contentRoute(detail.name) as InvestmentContentRoute, String(year));
    this.#sectionSelector.items = CONTENT_ROUTES.map((item) => ({
      key: item.route,
      title: item.title,
      isDefaultValue: item.route === contentRoute(detail.name),
    }));
    this.#sectionSelector.selection = contentRoute(detail.name);
    this.#yearSelector.years = years;
    this.#yearSelector.selectedYear = String(year);
  }

  #rememberTab(route: InvestmentContentRoute, year = this.#selectedYear()): void {
    appState.set("investmentContext", {
      lastRoute: route,
      lastParams: { year },
    });
  }

  #syncBudgetingYear(year: number): void {
    const context = appState.get("budgetingContext");
    const yearString = String(year);
    if (context.year === year && context.lastParams.year === yearString) return;
    appState.set("budgetingContext", {
      ...context,
      year,
      lastParams: { ...context.lastParams, year: yearString },
    });
  }

}

if (!customElements.get("investments-header")) {
  customElements.define("investments-header", InvestmentsHeader);
}
