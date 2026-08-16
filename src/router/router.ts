import type { NavigationGuard, ParsedRoute, RouteChangedEventDetail, RouteName, RouteParams } from "./types";

export const DEFAULT_ROUTE: RouteName = "transactions";
export const ROUTES = new Set<RouteName>([
  "dashboard", "budget-overview", "transactions", "categories", "vendors", "people", "import",
  "entity-detail", "entity-archive", "sync", "settings", "investment-overview",
  "investment-accounts", "investment-account-detail",
]);

let navigationGuard: NavigationGuard | null = null;
let started = false;

export function parseRoute(hash = location.hash): ParsedRoute {
  const raw = hash.replace(/^#\/?/, "");
  const [requestedName, query = ""] = raw.split("?", 2);
  const name = ROUTES.has(requestedName as RouteName) ? requestedName as RouteName : DEFAULT_ROUTE;
  return { name, params: Object.fromEntries(new URLSearchParams(query)) };
}

export function currentRoute(): RouteName { return parseRoute().name; }
export function currentParams(): RouteParams { return { ...parseRoute().params }; }

export function routeHash(name: RouteName, params: Partial<Record<string, unknown>> = {}): string {
  const destination = ROUTES.has(name) ? name : DEFAULT_ROUTE;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString();
  return `#/${destination}${suffix ? `?${suffix}` : ""}`;
}

function announceRoute(): void {
  const parsed = parseRoute();
  const detail: RouteChangedEventDetail = { ...parsed, route: parsed.name };
  window.dispatchEvent(new CustomEvent<RouteChangedEventDetail>("app:route-changed", { detail }));
}

export function navigate(name: RouteName, params: RouteParams = {}): boolean {
  const hash = routeHash(name, params);
  if (navigationGuard?.({ name, params, hash }) === false) return false;
  if (location.hash === hash) announceRoute();
  else location.hash = hash.slice(1);
  return true;
}

export function updateParams(changes: Record<string, string | null | undefined> = {}): boolean {
  const params = currentParams();
  Object.entries(changes).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") delete params[key];
    else params[key] = value;
  });
  return navigate(currentRoute(), params);
}

export function setNavigationGuard(guard: NavigationGuard | null): void { navigationGuard = guard; }

export function start(): void {
  if (!started) {
    started = true;
    window.addEventListener("hashchange", announceRoute);
  }
  if (!location.hash) navigate(DEFAULT_ROUTE);
  else announceRoute();
}

export const router = { start, navigate, updateParams, currentRoute, currentParams, parseRoute, routeHash, setNavigationGuard };
