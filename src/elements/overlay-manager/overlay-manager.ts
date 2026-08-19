import { SplashIndicator } from "../../components/splash-indicator/splash-indicator";
import { RefreshIndicator } from "../../components/refresh-indicator/refresh-indicator";
import { Tooltip } from "../../components/tooltip/tooltip";
import { DropdownMenu } from "../../components/dropdown-menu/dropdown-menu";
import {
  NewEntityOptions,
  NewEntityPopover,
} from "../new-entity-popover/new-entity-popover";
import { PopoverOptions } from "../../components/popover-menu/popover-menu";
import { appState } from "../../state/app-state";
import type { ToastStack } from "../../components/toast-stack/toast-stack";
import { registerToastStack } from "../../components/toast-stack/toast-service";
import { router } from "../../router/router";

export class OverlayManager extends HTMLElement {
  #listening = false;
  #tooltip!: Tooltip;
  #refreshIndicator: RefreshIndicator | null = null;
  #splash: SplashIndicator | null = null;
  #newEntityPopover!: NewEntityPopover;

  static get observedAttributes(): string[] {
    return [];
  }

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      const manager = document.createElement("div");
      manager.id = "overlay-manager";

      // Add the tooltip to the manager layer
      const tooltip = document.createElement("tool-tip") as Tooltip;
      manager.append(tooltip);
      this.#tooltip = tooltip;

      const refresh = document.createElement("reshresh-indicator");
      manager.append(refresh);
      this.#refreshIndicator = refresh as RefreshIndicator;

      const splash = document.createElement("splash-indicator");
      manager.append(splash);
      this.#splash = splash as SplashIndicator;

      const newEntity = document.createElement(
        "new-entity-popover",
      ) as NewEntityPopover;
      manager.append(newEntity);
      this.#newEntityPopover = newEntity;

      const alert = document.createElement("app-alert");
      const toasts = document.createElement("toast-stack") as ToastStack;
      const syncNotifications = document.createElement("sync-notifications");
      const transactionDrawer = document.createElement("transaction-drawer-screen");
      const entityDrawer = document.createElement("entity-drawer-screen");
      const investmentAccountDrawer = document.createElement("investment-account-drawer-screen");
      const investmentMonthDrawer = document.createElement("investment-month-drawer-screen");
      const onboarding = document.createElement("onboarding-overlay");
      manager.append(alert, toasts, syncNotifications, transactionDrawer, entityDrawer, investmentAccountDrawer, investmentMonthDrawer, onboarding);
      registerToastStack(toasts);

      this.append(manager);
    }

    if (this.#listening) return;
    this.#listening = true;

    window.addEventListener("budget:data-refresh-started", this);
    window.addEventListener("budget:data-refresh-retrying", this);
    window.addEventListener("budget:data-refresh-complete", this);
    window.addEventListener("budget:data-refresh-failed", this);
    window.addEventListener("app:route-changed", this);
    document.addEventListener("pointerdown", this, true);
    document.addEventListener("drawer:close-requested", this);
    document.addEventListener("keydown", this, true);
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "budget:data-refresh-started":
        this.#handleRefreshStarted(event as CustomEvent);
        break;

      case "budget:data-refresh-retrying":
        this.#handleRefreshRetrying();
        break;

      case "budget:data-refresh-complete":
        this.#handleRefreshCompleted(event as CustomEvent);
        break;

      case "budget:data-refresh-failed":
        this.#handleRefreshFailed(event as CustomEvent);
        break;

      case "app:route-changed":
        appState.set("activeDropdownKey", null);
        break;

      case "pointerdown":
        if (!event.composedPath().some((item) => item instanceof DropdownMenu)) {
          appState.set("activeDropdownKey", null);
        }

        if (!this.#newEntityPopover.containsFormInteraction(event)) {
          this.hideEntityForm();
        }
        break;

      case "drawer:close-requested":
        this.#clearDrawerRoute();
        break;

      case "keydown":
        if ((event as KeyboardEvent).key === "Escape") {
          appState.set("activeDropdownKey", null);
        }
        break;

      default:
        break;
    }
  }

  showTooltip(anchor: HTMLElement, content: string | Node, options: PopoverOptions) {
    this.#tooltip.showTooltip(anchor, content, options);
  }

  hideTooltip() {
    this.#tooltip.hide();
  }

  showEntityForm(
    anchor: HTMLElement,
    entity: NewEntityOptions,
    options: PopoverOptions,
  ) {
    this.#newEntityPopover.showForm(anchor, entity, options);
  }

  hideEntityForm() {
    this.#newEntityPopover.hideForm();
  }

  #clearDrawerRoute(): void {
    router.updateParams({ drawer: null, transactionId: null, entityKind: null, entityId: null, investmentAccountId: null, investmentMonth: null, investmentReviewId: null });
  }

  #handleRefreshStarted(event: CustomEvent) {
    if (!event.detail.connected) return;

    if (this.#splash && event.detail.coldStart) {
      this.#splash.state = "inProgress";
    } else if (this.#refreshIndicator) {
      this.#refreshIndicator.state = "inProgress";
    }
  }
  #handleRefreshCompleted(event: CustomEvent) {
    if (this.#splash) {
      this.#splash.state = "idle";
    }

    if (this.#refreshIndicator) {
      this.#refreshIndicator.state = "idle";
    }
  }
  #handleRefreshRetrying() {
    if (this.#splash && !this.#splash.hidden) {
      this.#splash.state = "retrying";
    } else if (this.#refreshIndicator) {
      this.#refreshIndicator.state = "retrying";
    }
  }
  #handleRefreshFailed(event: CustomEvent) {
    if (!event.detail.connected) return;

    if (this.#splash && !this.#splash.hidden) {
      if (!event.detail.showingCachedData) {
        this.#splash.state = "failed";
      } else {
        this.#splash.state = "idle";
      }
    }

    if (this.#refreshIndicator) {
      this.#refreshIndicator.state = "failed";
    }
  }

  disconnectedCallback() {
    if (!this.#listening) return;
    this.#listening = false;
    window.removeEventListener("budget:data-refresh-started", this);
    window.removeEventListener("budget:data-refresh-retrying", this);
    window.removeEventListener("budget:data-refresh-complete", this);
    window.removeEventListener("budget:data-refresh-failed", this);
    window.removeEventListener("app:route-changed", this);
    document.removeEventListener("pointerdown", this, true);
    document.removeEventListener("drawer:close-requested", this);
    document.removeEventListener("keydown", this, true);
  }
}

customElements.define("overlay-manager", OverlayManager);
