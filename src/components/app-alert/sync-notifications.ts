import { APIs } from "../../api/api";
import { router } from "../../router/router";
import type { ToastStack } from "../toast-stack/toast-stack";

export class SyncNotifications extends HTMLElement implements EventListenerObject {
  #toasts: ToastStack | null = null; #outage: HTMLElement | null = null;
  connectedCallback(): void { this.#toasts = this.parentElement?.querySelector("toast-stack") ?? null; ["budget:sync-succeeded","budget:sync-failed","budget:sync-retry-scheduled"].forEach(name => window.addEventListener(name, this)); }
  disconnectedCallback(): void { ["budget:sync-succeeded","budget:sync-failed","budget:sync-retry-scheduled"].forEach(name => window.removeEventListener(name, this)); }
  handleEvent(event: Event): void {
    const count = Number((event as CustomEvent).detail?.count) || 1;
    if (event.type === "budget:sync-succeeded") { if (!APIs.getSyncItems().some(x => x.retrying || x.waitingForOnline)) { this.#outage?.remove(); this.#outage = null; } this.#toasts?.show(`${count} ${count === 1 ? "change" : "changes"} saved to the Sheet.`); }
    else if (event.type === "budget:sync-failed") this.#toasts?.show(`${count} ${count === 1 ? "change needs" : "changes need"} attention.`, { type: "error", sticky: true, action: "View Sync", onAction: () => router.navigate("sync") });
    else if (!this.#outage?.isConnected) this.#outage = this.#toasts?.show("Couldn’t reach Google. Changes are saved locally and will retry automatically.", { type: "error", sticky: true, action: "View Sync", onAction: () => router.navigate("sync") }) ?? null;
  }
}
if (!customElements.get("sync-notifications")) customElements.define("sync-notifications", SyncNotifications);
