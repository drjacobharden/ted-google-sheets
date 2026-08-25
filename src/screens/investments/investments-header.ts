import type {
  DropdownMenu,
  DropdownSelectionEvent,
} from "../../components/dropdown-menu/dropdown-menu";
import type {
  SegmentedControl,
  SegmentedControlSelectionEvent,
} from "../../components/segmented-control/segmented-control";
import { CustomButton } from "../../components/button/button";
import { APIs } from "../../api/api";
import { router } from "../../router/router";
import type { RouteChangedEventDetail, RouteName } from "../../router/types";
import templateString from "./template.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = templateString;

const CONTENT_ROUTES = [
  { route: "investment-overview", title: "Overview" },
  { route: "investment-accounts", title: "Accounts" },
  { route: "investment-debts", title: "Debts" },
  { route: "investment-ledger", title: "Ledger" },
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
  [...APIs.accounts.balances(), ...APIs.accounts.activity()].forEach(
    (item) => {
      const year = Number(String(item.month).slice(0, 4));
      if (Number.isInteger(year) && year >= 1900 && year <= currentYear) {
        years.add(year);
      }
    },
  );
  return [...years].sort((left, right) => right - left);
}

/** Owns the shared year, navigation, and entry action for Investments. */
export class InvestmentsHeader
  extends HTMLElement
  implements EventListenerObject
{
  #sectionSelector!: SegmentedControl;
  #yearSelector!: DropdownMenu;
  #previousYearButton!: CustomButton;
  #nextYearButton!: CustomButton;
  #primaryAction!: CustomButton;
  #route: RouteChangedEventDetail | null = null;
  #listening = false;

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      this.append(template.content.cloneNode(true));
      this.#sectionSelector = this.querySelector("#investments-section-selector")!;
      this.#yearSelector = this.querySelector("#investments-year-selector")!;
      this.#previousYearButton = this.querySelector("#investments-year-previous")!;
      this.#nextYearButton = this.querySelector("#investments-year-next")!;
      this.#primaryAction = this.querySelector("#investments-primary-action")!;
    }
    if (!this.#listening) {
      this.#listening = true;
      this.#sectionSelector.addListener(this);
      this.#yearSelector.addListener(this);
      this.addEventListener("click", this);
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
    this.#yearSelector.removeListener(this);
    this.removeEventListener("click", this);
    window.removeEventListener("app:route-changed", this);
    window.removeEventListener("budget:accounts-changed", this);
    window.removeEventListener("budget:accounts-loaded", this);
  }

  handleEvent(event: Event): void {
    if (event.type === "segmented-control-selection") {
      const value = (event as SegmentedControlSelectionEvent).detail.value;
      router.navigate(value as RouteName, { year: this.#selectedYear() });
      return;
    }
    if (event.type === "dropdown-selection") {
      if (event.target === this.#yearSelector) {
        router.replaceParams({
          year: (event as DropdownSelectionEvent).detail.value,
        });
      }
      return;
    }
    if (event.type === "click") {
      const ledgerEntry = (event.target as Element | null)?.closest<HTMLElement>("[data-ledger-entry]");
      if (ledgerEntry) {
        const year = Number(this.#selectedYear());
        const today = new Date();
        const month = year === today.getFullYear() ? String(today.getMonth() + 1).padStart(2, "0") : "12";
        router.updateParams({ drawer: "investment-month", investmentAccountId: null, investmentMonth: `${year}-${month}`, investmentLedgerSource: "investment" });
        return;
      }
      const addDebt = (event.target as Element | null)?.closest<HTMLElement>("[data-debt-account-new]");
      if (addDebt) {
        router.updateParams({ drawer: "investment-account", investmentAccountId: null, investmentLedgerSource: "debt-account" });
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
      const entry = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-balance]",
      );
      if (entry) {
        event.stopPropagation();
        const year = Number(this.#selectedYear());
        const today = new Date();
        const month = year === today.getFullYear()
          ? String(today.getMonth() + 1).padStart(2, "0")
          : "12";
        router.updateParams({
          drawer: "investment-month",
          investmentAccountId: null,
          investmentMonth: `${year}-${month}`,
          investmentReviewId: null,
          investmentLedgerSource: "investment",
        });
        return;
      }
      const step = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-year-step]",
      );
      if (step?.dataset.year) {
        router.replaceParams({ year: step.dataset.year });
      }
      return;
    }
    if (event.type === "app:route-changed") {
      this.#applyRoute(
        (event as CustomEvent<RouteChangedEventDetail>).detail,
      );
      return;
    }
    this.#applyRoute({ name: router.currentRoute(), route: router.currentRoute(), params: router.currentParams() });
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
    const year = years.includes(requested) ? requested : years[0];
    if (detail.params.year !== String(year)) {
      if (!document.getElementById("route-outlet")) return;
      router.replace(detail.name, { ...detail.params, year: String(year) });
      return;
    }
    this.#route = detail;
    this.#sectionSelector.items = CONTENT_ROUTES.map((item) => ({
      key: item.route,
      title: item.title,
      isDefaultValue: item.route === contentRoute(detail.name),
    }));
    this.#sectionSelector.selection = contentRoute(detail.name);
    const onAccounts = contentRoute(detail.name) === "investment-accounts";
    const onDebts = contentRoute(detail.name) === "investment-debts";
    const onLedger = contentRoute(detail.name) === "investment-ledger";
    this.#primaryAction.label = onLedger ? "Add ledger entry" : onDebts ? "Add debt account" : onAccounts ? "Add account" : "Add investment entry";
    this.#primaryAction.toggleAttribute("data-account-new", onAccounts);
    this.#primaryAction.toggleAttribute("data-debt-account-new", onDebts);
    this.#primaryAction.toggleAttribute("data-ledger-entry", onLedger);
    this.#primaryAction.toggleAttribute("data-balance", !onAccounts && !onDebts && !onLedger);
    this.#yearSelector.items = years.map((item) => ({
      key: String(item),
      title: String(item),
      isDefaultValue: item === year,
    }));
    const ascending = [...years].sort((left, right) => left - right);
    const index = ascending.indexOf(year);
    this.#setYearButton(
      this.#previousYearButton,
      index > 0 ? ascending[index - 1] : null,
      "Previous",
    );
    this.#setYearButton(
      this.#nextYearButton,
      index < ascending.length - 1 ? ascending[index + 1] : null,
      "Next",
    );
  }

  #setYearButton(
    button: CustomButton,
    year: number | null,
    direction: string,
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
}

if (!customElements.get("investments-header")) {
  customElements.define("investments-header", InvestmentsHeader);
}
