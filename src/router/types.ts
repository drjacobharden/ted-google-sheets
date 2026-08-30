import type { EntityKind } from "../api/budget-api";

export type BudgetingRouteName =
  | "budget-overview"
  | "transactions"
  | "categories"
  | "vendors"
  | "people"
  | "entity-detail"
  | "entity-archive";

export type RouteName =
  | BudgetingRouteName
  | "dashboard"
  | "new-transaction"
  | "import"
  | "sync"
  | "settings"
  | "investment-overview"
  | "investment-accounts"
  | "investment-debts"
  | "investment-ledger"
  | "investment-account-detail"
  | "investment-debt-detail";

export type DrawerName =
  | "edit"
  | "review"
  | "entity-new"
  | "entity-edit"
  | "investment-account"
  | "investment-month"
  | "investment-ledger-entry";

export interface KnownRouteParams {
  year?: string;
  assignment?: string;
  kind?: EntityKind;
  id?: string;
  accountId?: string;
  drawer?: DrawerName;
  transactionId?: string;
  entityKind?: EntityKind;
  entityId?: string;
  investmentAccountId?: string;
  investmentMonth?: string;
  investmentReviewId?: string;
  investmentLedgerId?: string;
  investmentLedgerSource?: string;
  accountDraftName?: string;
  accountCreateRequestId?: string;
}

export type RouteParams = Record<string, string> & Partial<KnownRouteParams>;
export interface ParsedRoute {
  name: RouteName;
  params: RouteParams;
}
export interface NavigationTarget extends ParsedRoute {
  hash: string;
}
export type NavigationGuard = (target: NavigationTarget) => boolean;
export interface RouteChangedEventDetail extends ParsedRoute {
  route: RouteName;
}
