import "./api/api.ts";

import "./utilities/date-utilities.ts";
import "./utilities/event-utilities.ts";

import "./screens/budget/budget.ts";

import "./components/page-title/page-title.ts";
import "./components/button/button.ts";
import "./components/navigation-button/navigation-button.ts";
import "./components/tooltip/tooltip.ts";
import "./components/refresh-indicator/refresh-indicator.ts";
import "./components/splash-indicator/splash-indicator.ts";
import "./components/refresh-button/refresh-button.ts";
import "./components/checkbox/checkbox.ts";
import "./components/date-range-picker/date-range-picker.ts";
import "./components/dropdown-menu/dropdown-menu.ts";
import "./components/data-table/data-table.ts";
import "./components/data-chart/data-chart.ts";
import "./components/segmented-control/segmented-control.ts";
import "./components/filter-bar/filter-bar.ts";
import "./components/close-button/close-button.ts";
import "./components/drawer-header/drawer-header.ts";
import "./components/drawer-overlay/drawer-overlay.ts";
import "./components/date-picker/date-picker.ts";
import "./components/currency-input/currency-input.ts";
import "./components/month-picker/month-picker.js";
import "./components/select-create-controller/select-create-controller.ts";
import "./components/dropdowns/category-select.ts";
import "./components/dropdowns/vendor-select.ts";
import "./components/dropdowns/payee-select.ts";
import "./components/dropdowns/people-select.ts";
import "./components/dropdowns/mapping-select.ts";
import "./components/dropdowns/source-select.ts";
import "./components/dropdowns/account-select.ts";
import "./components/dropdowns/payment-type-select.ts";
import "./components/table-title/table-title.ts";
import "./components/user-form/user-form.ts";
import "./components/url-form/url-form.ts";
import "./components/toast-stack/toast-stack.ts";
import "./components/app-alert/app-alert.ts";
import "./components/app-alert/sync-notifications.ts";
import "./components/search-bar/search-bar.ts";
import "./components/page-control/page-control.ts";
import { OnboardingUI } from "./components/onboarding/onboarding";
import "./components/date-range-picker/date-range-picker-2";
import "./components/table/table.ts";
import "./components/icon/icon.ts";
import "./components/info-hover/info-hover.ts";

import "./elements/top-nav/top-nav.ts";
import "./elements/navigation-bar/navigation-bar.ts";
import "./elements/overlay-manager/overlay-manager.ts";

import "./screens/budgeting/budgeting-shell";
import "./screens/investments/investments-header";
import "./screens/budget-overview-screen/budget-overview-screen.ts";
import "./screens/category-screen/category-screen.ts";
import "./screens/dashboard-screen/dashboard-screen.ts";
import "./screens/entity-archive-screen/entity-archive-screen.ts";
import "./screens/entity-detail-screen/entity-detail-screen.ts";
import "./screens/investment-account-detail-screen/investment-account-detail-screen.ts";
import "./screens/investment-debt-detail-screen/investment-debt-detail-screen.ts";
import "./screens/investment-accounts-screen/investment-accounts-screen.ts";
import "./screens/investment-overview-screen/investment-overview-screen.ts";
import "./screens/investment-debts-screen/investment-debts-screen.ts";
import "./screens/investment-ledger-screen/investment-ledger-screen.ts";
import "./screens/investment-ledger-drawer-screen/investment-ledger-drawer-screen.ts";
import "./screens/import-screen/import-screen.ts";
import "./screens/people-screen/people-screen.ts";
import "./screens/settings-screen/settings-screen.ts";
import "./screens/sync-screen/sync-screen.ts";
import "./screens/transaction-list-screen/transactions.ts";
import "./screens/new-transaction-screen/new-transaction-screen.ts";
import "./screens/vendors-screen/vendors-screen.ts";
import "./screens/transaction-drawer-screen/transaction-drawer-screen.ts";
import "./screens/entity-drawer-screen/entity-drawer-screen.ts";
import "./screens/investment-account-drawer-screen/investment-account-drawer-screen.ts";
import "./screens/investment-month-drawer-screen/investment-month-drawer-screen.ts";
import { appController } from "./state/app-controller";
import { router } from "./router/router";
import type { RouteChangedEventDetail } from "./router/types";

const OVERLAY_PARAMS = new Set([
  "drawer",
  "transactionId",
  "entityKind",
  "entityId",
  "investmentAccountId",
  "investmentMonth",
  "investmentReviewId",
  "investmentLedgerId",
  "investmentLedgerSource",
  "accountDraftName",
  "accountCreateRequestId",
]);
let mountedContentKey = "";
let pendingRoute: {
  name: RouteChangedEventDetail["name"];
  params: RouteChangedEventDetail["params"];
} | null = null;

function renderRoute({
  name,
  params,
}: {
  name: RouteChangedEventDetail["name"];
  params: RouteChangedEventDetail["params"];
}): void {
  const outlet = document.getElementById("route-outlet");
  // Custom-element headers can normalize a route while the parser is still in
  // the document head/body transition. Defer that render until the outlet is
  // mounted instead of aborting application startup.
  if (!outlet) {
    pendingRoute = { name, params };
    return;
  }

  const contentParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => !OVERLAY_PARAMS.has(key)),
  );
  const contentKey = `${name}?${new URLSearchParams(contentParams)}`;
  if (contentKey === mountedContentKey) return;
  mountedContentKey = contentKey;
  const template = document.getElementById(
    `route-${name}`,
  ) as HTMLTemplateElement | null;
  if (!outlet || !template)
    throw new Error(`Missing template for route: ${name}`);
  outlet.replaceChildren(template.content.cloneNode(true));
  const activeTab =
    name === "new-transaction"
      ? "budgeting"
      : router.isBudgetingRoute(name)
        ? "budgeting"
        : name.startsWith("investment-")
          ? "investment-overview"
          : name;
  updateActiveTab(activeTab);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateActiveTab(activeTab: string): void {
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((item) => {
    const active = item.dataset.tab === activeTab;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

window.addEventListener("app:route-changed", (event: Event) =>
  renderRoute((event as CustomEvent<RouteChangedEventDetail>).detail),
);
window.addEventListener(
  "budget:onboarding-complete",
  () => void appController.initializeData(),
);
document.addEventListener("DOMContentLoaded", () => {
  if (pendingRoute) {
    const route = pendingRoute;
    pendingRoute = null;
    renderRoute(route);
  }
  if (!OnboardingUI?.isBlocking())
    void appController.initializeData({ startup: true }).catch(() => {});
  router.start();
});
