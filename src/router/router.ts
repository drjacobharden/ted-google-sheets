import type {
  BudgetingRouteName,
  NavigationGuard,
  ParsedRoute,
  RouteChangedEventDetail,
  RouteName,
  RouteParams,
} from "./types";

export const DEFAULT_ROUTE: RouteName = "budget-overview";

const BUDGETING_ROUTES = new Set<BudgetingRouteName>([
  "budget-overview", "money-flow", "transactions", "categories", "vendors", "people",
  "entity-detail", "entity-archive",
]);

const ROUTES = new Set<RouteName>([
  ...BUDGETING_ROUTES,
  "dashboard",
  "new-transaction",
  "import",
  "sync",
  "settings",
  "investment-overview",
  "investment-accounts",
  "investment-debts",
  "investment-ledger",
  "investment-account-detail",
  "investment-debt-detail",
]);

const NESTED_BUDGET_ROUTES: Record<string, BudgetingRouteName> = {
  "budgeting/overview": "budget-overview",
  "budgeting/flow": "money-flow",
  "budgeting/transactions": "transactions",
  "budgeting/categories": "categories",
  "budgeting/vendors": "vendors",
  "budgeting/people": "people",
  "budgeting/entity-detail": "entity-detail",
  "budgeting/entity-archive": "entity-archive",
};

let navigationGuard: NavigationGuard | null = null;
let started = false;

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseNestedBudgetingPath(
  path: string,
  params: RouteParams,
): ParsedRoute | null {
  const match = path.match(
    /^budgeting\/(categories|vendors|people)(?:\/(archive|.+))?$/,
  );
  if (!match) return null;

  const [, collection, tail] = match;
  const kind =
    collection === "categories"
      ? "category"
      : collection === "vendors"
        ? "vendor"
        : "assignment";

  if (!tail) {
    return {
      name: collection as BudgetingRouteName,
      params,
    };
  }
  if (tail === "archive") {
    return {
      name: "entity-archive",
      params: { ...params, kind },
    };
  }
  return {
    name: "entity-detail",
    params: { ...params, kind, id: decodePathPart(tail) },
  };
}

export function parseRoute(hash = location.hash): ParsedRoute {
  const raw = hash.replace(/^#\/?/, "");
  const [requestedPath, query = ""] = raw.split("?", 2);
  const params = Object.fromEntries(
    new URLSearchParams(query),
  ) as RouteParams;
  const nested = NESTED_BUDGET_ROUTES[requestedPath];
  if (nested) return { name: nested, params };

  const budgeting = parseNestedBudgetingPath(requestedPath, params);
  if (budgeting) return budgeting;

  const name = ROUTES.has(requestedPath as RouteName)
    ? (requestedPath as RouteName)
    : DEFAULT_ROUTE;
  return { name, params };
}

export function isBudgetingRoute(
  name: RouteName,
): name is BudgetingRouteName {
  return BUDGETING_ROUTES.has(name as BudgetingRouteName);
}

export function currentRoute(): RouteName {
  return parseRoute().name;
}

export function currentParams(): RouteParams {
  return { ...parseRoute().params };
}

export function routeHash(
  name: RouteName,
  params: Partial<Record<string, unknown>> = {},
): string {
  const destination = ROUTES.has(name) ? name : DEFAULT_ROUTE;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return `#/${destination}${suffix ? `?${suffix}` : ""}`;
}

function dispatchRoute(parsed = parseRoute()): void {
  const detail: RouteChangedEventDetail = {
    ...parsed,
    route: parsed.name,
  };
  window.dispatchEvent(
    new CustomEvent<RouteChangedEventDetail>("app:route-changed", { detail }),
  );
}

function announceRoute(): void {
  const parsed = parseRoute();
  const canonicalHash = routeHash(parsed.name, parsed.params);
  if (location.hash !== canonicalHash) {
    history.replaceState(null, "", canonicalHash);
  }
  dispatchRoute(parsed);
}

export function navigate(name: RouteName, params: RouteParams = {}): boolean {
  const hash = routeHash(name, params);
  if (navigationGuard?.({ name, params, hash }) === false) return false;
  if (location.hash === hash) dispatchRoute({ name, params });
  else location.hash = hash.slice(1);
  return true;
}

export function replace(name: RouteName, params: RouteParams = {}): boolean {
  const hash = routeHash(name, params);
  if (navigationGuard?.({ name, params, hash }) === false) return false;
  history.replaceState(null, "", hash);
  dispatchRoute({ name, params });
  return true;
}

function changedParams(
  changes: Record<string, string | null | undefined>,
): RouteParams {
  const params = currentParams();
  Object.entries(changes).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      delete params[key];
    } else {
      params[key] = value;
    }
  });
  return params;
}

export function updateParams(
  changes: Record<string, string | null | undefined> = {},
): boolean {
  return navigate(currentRoute(), changedParams(changes));
}

export function replaceParams(
  changes: Record<string, string | null | undefined> = {},
): boolean {
  return replace(currentRoute(), changedParams(changes));
}

export function setNavigationGuard(guard: NavigationGuard | null): void {
  navigationGuard = guard;
}

export function start(): void {
  if (!started) {
    started = true;
    window.addEventListener("hashchange", announceRoute);
  }
  if (!location.hash) replace(DEFAULT_ROUTE);
  else announceRoute();
}

export const router = {
  start,
  navigate,
  replace,
  updateParams,
  replaceParams,
  currentRoute,
  currentParams,
  parseRoute,
  routeHash,
  isBudgetingRoute,
  setNavigationGuard,
};
