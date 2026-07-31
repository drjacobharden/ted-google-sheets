export interface LegacyRouteAdapter {
  mount(root: HTMLElement, context?: unknown): void;
  unmount(): void;
}

/** Registers a no-op route module while the legacy host still expects one. */
export function registerLegacyRouteAdapter(globalName: string): void {
  const compatibilityWindow = window as unknown as Window &
    Record<string, unknown>;
  const adapter: LegacyRouteAdapter = {
    /** Leaves setup to the routed web component's connected callback. */
    mount(): void {},
    /** Leaves cleanup to the routed web component's disconnected callback. */
    unmount(): void {},
  };
  compatibilityWindow[globalName] = adapter;
}
