import { getIcon, IconKeys } from "../../icons";
import { router } from "../../router/router";
import { APIs } from "../../api/api";
import { OverlayManager } from "../overlay-manager/overlay-manager";
import TopNavBarTempString from "./template.html" with { type: "text" };
import { CustomButton } from "../../components/button/button";
import { appState } from "../../state/app-state";

const TopNavBarTemp = document.createElement("template");
TopNavBarTemp.innerHTML = TopNavBarTempString;

// Add new navigation items here
const NAVIGATION_BUTTONS = [
  { title: "Budgeting", icon: "transactions", tab: "budgeting" },
  { title: "Investments", icon: "chart", tab: "investment-overview" },
  { title: "Goals", icon: "target", tab: "dashboard" },
];

class TopNavBar extends HTMLElement {
  #overlayManager!: OverlayManager;
  #wrapper: HTMLElement | null = null;
  #header: HTMLElement | null = null;
  #panelOpenButton: HTMLElement | null = null;
  #panelCloseButton: HTMLElement | null = null;
  #nav: HTMLElement | null = null;
  #tooltipButtons: NodeListOf<HTMLElement> | null = null;
  #routeOutlet: HTMLElement | null = null;

  async connectedCallback() {
    const clone = TopNavBarTemp.content.cloneNode(true) as DocumentFragment;

    this.append(clone);
    this.classList.add("pad-screen");

    const buttonWrapper = this.querySelector("#top-navigation-wrapper");
    const buttons = NAVIGATION_BUTTONS.map((item) => {
      const b = document.createElement("custom-button") as CustomButton;
      b.classList.add("secondary-button");
      b.label = item.title;
      b.leadingIcon = item.icon as IconKeys;
      b.dataset.tab = item.tab;

      return b;
    });

    buttonWrapper?.replaceChildren(...buttons);

    this.addEventListener("click", this);
    window.addEventListener("app:route-changed", this);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", this, { once: true });
    } else {
      this.#attachRouteOutlet();
    }

    // this.#wrapper = container;
    // this.#header = container.querySelector("header");
    // this.#panelCloseButton = container.querySelector("#close-sidebar");
    // this.#panelOpenButton = container.querySelector("#open-sidebar");
    // this.#nav = container.querySelector("nav");
    // this.#overlayManager =
    //   document.querySelector<OverlayManager>("overlay-manager")!;

    // if (!this.#overlayManager) {
    //   throw new Error("overlay-manager was not found in the document.");
    // }

    // if (this.#panelCloseButton) {
    //   this.#panelCloseButton.append(getIcon("sidebar"));
    // }

    // if (this.#panelOpenButton) {
    //   this.#panelOpenButton.append(getIcon("sidebar"));
    //   this.#panelOpenButton.dataset.tooltip = "Open sidebar";
    // }

    // if (this.#nav) {
    //   for (let i = 0, l = NAVIGATION_BUTTONS.length; i < l; i++) {
    //     const section = NAVIGATION_BUTTONS[i];

    //     if (section.title) {
    //       const header = document.createElement("div");
    //       header.setAttribute("class", "sidebar-section-row");
    //       const span = document.createElement("span");
    //       span.textContent = section.title;
    //       header.append(span);
    //       const divider = document.createElement("hr");
    //       divider.setAttribute("class", "sidebar-section-divider");
    //       header.append(divider);

    //       if (section.action) {
    //         const action = document.createElement("button");
    //         action.dataset.action = section.action;
    //         action.append(getIcon("plus"));
    //         header.append(action);
    //       }
    //       this.#nav.append(header);
    //     }

    //     for (let i = 0, l = section.data.length; i < l; i++) {
    //       const data = section.data[i];

    //       const button = document.createElement("navigation-button");
    //       button.setAttribute("label", data.label);
    //       button.setAttribute("icon", data.icon);
    //       button.setAttribute("label", data.label);
    //       button.dataset.tab = data.tab;
    //       button.dataset.tooltip = data.label;

    //       if (data.tab === "sync") {
    //         const badge = document.createElement("span");
    //         badge.setAttribute("class", "nav-sync-badge");
    //         badge.setAttribute("id", "sync-nav-badge");
    //         badge.classList.add("hidden");
    //         button.append(badge);
    //       }

    //       this.#nav.append(button);
    //     }
    //   }
    // }

    // this.append(container);

    // this.#tooltipButtons = this.querySelectorAll<HTMLElement>("[data-tooltip]");

    // this.#wrapper.addEventListener("click", this);
    // window.addEventListener("budget:sync-changed", this);
    // window.addEventListener("online", this);
    // window.addEventListener("offline", this);
    // this.#updateSyncBadge();

    // for (let i = 0, l = this.#tooltipButtons.length; i < l; i++) {
    //   const button = this.#tooltipButtons[i];
    //   button.addEventListener("pointerenter", this);
    //   button.addEventListener("pointerleave", this);
    // }
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.handleClick(event);
        break;

      case "pointerenter":
        this.handlePointerEnter(event);
        break;

      case "pointerleave":
        this.handlePointerLeave();
        break;

      case "budget:sync-changed":
      case "online":
      case "offline":
        this.#updateSyncBadge();
        break;

      case "scroll":
        this.#handleScroll(event);
        break;

      case "app:route-changed":
        this.classList.remove("is-scrolled");
        break;

      case "DOMContentLoaded":
        this.#attachRouteOutlet();
        break;

      default:
        break;
    }
  }

  private handlePointerEnter = (event: Event) => {
    if (!this.#wrapper?.hasAttribute("collapsed")) return;

    const button = event.currentTarget as HTMLElement;
    const text = button.dataset.tooltip;

    if (!text) return;

    this.#overlayManager.showTooltip(button, text, {
      side: "right",
      align: "center",
      gap: 8,
    });
  };

  private handlePointerLeave = () => {
    this.#overlayManager.hideTooltip();
  };

  private handleClick(event: Event) {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    event.preventDefault();
    this.handleNavigationClick(target);
  }

  private handleNavigationClick(target: HTMLElement) {
    const item = target.closest("[data-tab]");
    if (!item) return;
    const route = (item as HTMLElement).dataset.tab;
    if (route === "budgeting") {
      const context = appState.get("budgetingContext");
      router.navigate(context.lastRoute, context.lastParams);
    } else if (route) {
      router.navigate(route as import("../../router/types").RouteName);
    }
  }

  #handleScroll(event: Event): void {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      !target.matches(".screen") ||
      !this.#routeOutlet?.contains(target)
    ) {
      return;
    }
    this.classList.toggle("is-scrolled", target.scrollTop > 0);
  }

  #attachRouteOutlet(): void {
    this.#routeOutlet?.removeEventListener("scroll", this, true);
    this.#routeOutlet = document.getElementById("route-outlet");
    this.#routeOutlet?.addEventListener("scroll", this, true);
  }

  #updateSyncBadge(): void {
    const badge = this.querySelector<HTMLElement>("#sync-nav-badge");
    if (!badge) return;
    const items = APIs.getSyncItems();
    badge.hidden = items.length === 0;
    badge.textContent = String(items.length);
    badge.classList.toggle(
      "failed",
      items.some((item) => item.status === "failed"),
    );
  }

  disconnectedCallback() {
    this.removeEventListener("click", this);
    document.removeEventListener("DOMContentLoaded", this);
    this.#routeOutlet?.removeEventListener("scroll", this, true);
    window.removeEventListener("app:route-changed", this);
    this.#wrapper?.removeEventListener("click", this);
    window.removeEventListener("budget:sync-changed", this);
    window.removeEventListener("online", this);
    window.removeEventListener("offline", this);

    for (let i = 0, l = this.#tooltipButtons?.length ?? 0; i < l; i++) {
      const button = this.#tooltipButtons![i];
      button.removeEventListener("pointerenter", this);
      button.removeEventListener("pointerleave", this);
    }
  }
}

customElements.define("top-nav", TopNavBar);
