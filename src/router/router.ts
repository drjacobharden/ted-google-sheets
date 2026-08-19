import type {
  BudgetingRouteName,
  NavigationGuard,
  ParsedRoute,
  RouteChangedEventDetail,
  RouteName,
  RouteParams,
} from "./types";

export const DEFAULT_ROUTE: RouteName = "budgeting/overview";

const ROUTES = new Set<RouteName>([
  "budgeting/overview",
  "budgeting/transactions",
  "budgeting/categories",
  "budgeting/vendors",
  "budgeting/people",
  "budgeting/entity-detail",
  "budgeting/entity-archive",
  "dashboard",
  "import",
  "sync",
  "settings",
  "investment-overview",
  "investment-accounts",
  "investment-account-detail",
]);

const LEGACY_BUDGET_ROUTES: Record<string, BudgetingRouteName> = {
  "budget-overview": "budgeting/overview",
  transactions: "budgeting/transactions",
  categories: "budgeting/categories",
  vendors: "budgeting/vendors",
  people: "budgeting/people",
  "entity-detail": "budgeting/entity-detail",
  "entity-archive": "budgeting/entity-archive",
};

const ENTITY_PATHS = {
  category: "categories",
  vendor: "vendors",
  assignment: "people",
} as const;

function entityPath(kind: string | undefined): string {
  return kind === "vendor"
    ? ENTITY_PATHS.vendor
    : kind === "assignment"
      ? ENTITY_PATHS.assignment
      : ENTITY_PATHS.category;
}

let navigationGuard: NavigationGuard | null = null;
let started = false;

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseBudgetingPath(
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
      name: `budgeting/${collection}` as BudgetingRouteName,
      params,
    };
  }
  if (tail === "archive") {
    return {
      name: "budgeting/entity-archive",
      params: { ...params, kind },
    };
  }
  return {
    name: "budgeting/entity-detail",
    params: { ...params, kind, id: decodePathPart(tail) },
  };
}

export function parseRoute(hash = location.hash): ParsedRoute {
  const raw = hash.replace(/^#\/?/, "");
  const [requestedPath, query = ""] = raw.split("?", 2);
  const params = Object.fromEntries(
    new URLSearchParams(query),
  ) as RouteParams;
  const legacy = LEGACY_BUDGET_ROUTES[requestedPath];
  if (legacy) return { name: legacy, params };

  const budgeting = parseBudgetingPath(requestedPath, params);
  if (budgeting) return budgeting;

  const name = ROUTES.has(requestedPath as RouteName)
    ? (requestedPath as RouteName)
    : DEFAULT_ROUTE;
  return { name, params };
}

export function isBudgetingRoute(
  name: RouteName,
): name is BudgetingRouteName {
  return name.startsWith("budgeting/");
}

export function currentRoute(): RouteName {
  return parseRoute().name;
}

export function currentParams(): RouteParams {
  return { ...parseRoute().params };
}

function budgetingPath(name: BudgetingRouteName, params: RouteParams): string {
  if (name === "budgeting/entity-detail") {
    const collection = entityPath(params.kind);
    return params.id
      ? `budgeting/${collection}/${encodeURIComponent(params.id)}`
      : `budgeting/${collection}`;
  }
  if (name === "budgeting/entity-archive") {
    const collection = entityPath(params.kind);
    return `budgeting/${collection}/archive`;
  }
  return name;
}

export function routeHash(
  name: RouteName,
  params: Partial<Record<string, unknown>> = {},
): string {
  const destination = ROUTES.has(name) ? name : DEFAULT_ROUTE;
  const routeParams = { ...params } as RouteParams;
  const path = isBudgetingRoute(destination)
    ? budgetingPath(destination, routeParams)
    : destination;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const pathParam =
      isBudgetingRoute(destination) &&
      (destination === "budgeting/entity-detail" ||
        destination === "budgeting/entity-archive") &&
      (key === "kind" || key === "id");
    if (value !== undefined && value !== null && value !== "" && !pathParam) {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString();
  return `#/${path}${suffix ? `?${suffix}` : ""}`;
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
