// src/router/router-types.ts

export type RouteName =
  | "dashboard"
  | "transactions"
  | "categories"
  | "vendors"
  | "people"
  | "import"
  | "entity-detail"
  | "entity-archive"
  | "sync"
  | "settings"
  | "investment-overview"
  | "investment-accounts"
  | "investment-account-detail";

export type RouteParams = Record<string, string>;

export interface RouteContext {
  route: RouteName;
  params: RouteParams;
}

export interface RouteModule {
  mount(screen: HTMLElement, context: RouteContext): void | Promise<void>;
  unmount(): void;
}

export interface ParsedRoute {
  name: RouteName;
  params: RouteParams;
}

export interface NavigationTarget {
  name: RouteName;
  params: RouteParams;
  hash: string;
}

export type NavigationGuard = (target: NavigationTarget) => boolean;

export interface RouteChangedEvent extends Event {
  detail: RouteContext;
}

export type RouterConfig = Record<
  RouteName,
  {
    section: string;
    template: string;
    script: string;
    module: () => RouteModule;
  }
>;
