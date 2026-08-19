import type { EntityKind } from "../api/budget-api";

export type BudgetingRouteName =
  | "budgeting/overview"
  | "budgeting/transactions"
  | "budgeting/categories"
  | "budgeting/vendors"
  | "budgeting/people"
  | "budgeting/entity-detail"
  | "budgeting/entity-archive";

export type RouteName =
  | BudgetingRouteName
  | "dashboard"
  | "import"
  | "sync"
  | "settings"
  | "investment-overview"
  | "investment-accounts"
  | "investment-account-detail";

export type DrawerName =
  | "new"
  | "edit"
  | "review"
  | "entity-edit"
  | "investment-account"
  | "investment-month";

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
