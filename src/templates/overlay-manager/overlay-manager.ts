import { RefreshIndicator } from "../../components/refresh-indicator/reshresh-indicator";
import { Tooltip, TooltipOptions } from "../../components/tooltip/tooltip";

export class OverlayManager extends HTMLElement {
  #tooltip!: Tooltip;
  #refreshIndicator: RefreshIndicator | null = null;

  static get observedAttributes(): string[] {
    return [];
  }

  connectedCallback(): void {
    const manager = document.createElement("div");
    manager.id = "overlay-manager";

    // Add the tooltip to the manager layer
    const tooltip = document.createElement("tooltip-overlay") as Tooltip;
    manager.append(tooltip);
    this.#tooltip = tooltip;

    const refresh = document.createElement("reshresh-indicator");
    manager.append(refresh);
    this.#refreshIndicator = refresh as RefreshIndicator;

    this.append(manager);

    window.addEventListener("budget:data-refresh-started", this);
    window.addEventListener("budget:data-refresh-complete", this);
    window.addEventListener("budget:data-refresh-failed", this);
  }

  handleEvent(event: CustomEvent) {
    console.log(event.type);

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

  showTooltip(anchor: HTMLElement, text: string, options: TooltipOptions) {
    this.#tooltip.show(anchor, text, options);
  }

  hideTooltip() {
    this.#tooltip.hide();
  }

  #handleRefreshStarted(event: CustomEvent) {
    if (!event.detail.connected) return;
    if (this.#refreshIndicator) {
      this.#refreshIndicator.state = "inProgress";
    }
  }
  #handleRefreshCompleted(event: CustomEvent) {
    if (this.#refreshIndicator) {
      this.#refreshIndicator.state = "idle";
    }
  }
  #handleRefreshFailed(event: CustomEvent) {
    if (!event.detail.connected) return;
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
