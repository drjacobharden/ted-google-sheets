import { SplashIndicator } from "../../components/splash-indicator/splash-indicator";
import { RefreshIndicator } from "../../components/refresh-indicator/refresh-indicator";
import { Tooltip } from "../../components/tooltip/tooltip";
import {
  NewEntityOptions,
  NewEntityPopover,
} from "../new-entity-popover/new-entity-popover";
import { PopoverOptions } from "../../components/popover-menu/popover-menu";
import {
  SelectorMenu,
  SelectorMenuProps,
} from "../../components/selector-menu/selector-menu";

export class OverlayManager extends HTMLElement {
  #tooltip!: Tooltip;
  #refreshIndicator: RefreshIndicator | null = null;
  #splash: SplashIndicator | null = null;
  #newEntityPopover!: NewEntityPopover;
  #selectorMenu!: SelectorMenu;

  static get observedAttributes(): string[] {
    return [];
  }

  connectedCallback(): void {
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

    const selectorMenu = document.createElement(
      "selector-menu",
    ) as SelectorMenu;
    manager.append(selectorMenu);
    this.#selectorMenu = selectorMenu;

    this.append(manager);

    window.addEventListener("budget:data-refresh-started", this);
    window.addEventListener("budget:data-refresh-complete", this);
    window.addEventListener("budget:data-refresh-failed", this);
  }

  handleEvent(event: CustomEvent) {
    switch (event.type) {
      case "budget:data-refresh-started":
        this.#handleRefreshStarted(event);
        break;

      case "budget:data-refresh-complete":
        this.#handleRefreshCompleted(event);
        break;

      case "budget:data-refresh-failed":
        this.#handleRefreshFailed(event);
        break;

      default:
        break;
    }
  }

  showTooltip(anchor: HTMLElement, text: string, options: PopoverOptions) {
    this.#tooltip.showTooltip(anchor, text, options);
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

  selectorMenu = {
    show: (props: SelectorMenuProps) => this.#selectorMenu.showMenu(props),
    hide: () => this.#selectorMenu.hideMenu(),
  };

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
    window.removeEventListener("budget:data-refresh-started", this);
    window.removeEventListener("budget:data-refresh-complete", this);
    window.removeEventListener("budget:data-refresh-failed", this);
  }
}

customElements.define("overlay-manager", OverlayManager);
