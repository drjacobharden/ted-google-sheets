import { getIcon } from "../../icons";
import { OverlayManager } from "../overlay-manager/overlay-manager";
import NavBarTempString from "./template.html" with { type: "text" };

const NavBarTemp = document.createElement("template");
NavBarTemp.innerHTML = NavBarTempString;

// Add new navigation items here
const NAVIGATION_BUTTONS = [
  {
    title: null,
    data: [{ label: "Dashboard", icon: "dashboard", tab: "dashboard" }],
  },

  {
    title: "Budgeting",
    action: "new-transaction",
    data: [
      { label: "Transactions", icon: "transactions", tab: "transactions" },
      { label: "Categories", icon: "label", tab: "categories" },
      { label: "Vendors", icon: "cart", tab: "vendors" },
      { label: "People", icon: "people", tab: "people" },
    ],
  },

  {
    title: "Investments",
    action: "balance",
    data: [
      { label: "Overview", icon: "chart", tab: "investment-overview" },
      { label: "Accounts", icon: "box", tab: "investment-accounts" },
    ],
  },
  {
    title: "Utilities",
    data: [
      { label: "Import", icon: "import", tab: "import" },
      { label: "Sync", icon: "sync", tab: "sync" },
      { label: "Settings", icon: "settings", tab: "settings" },
    ],
  },
];

class NavBar extends HTMLElement {
  #overlayManager!: OverlayManager;
  #wrapper: HTMLElement | null = null;
  #header: HTMLElement | null = null;
  #panelOpenButton: HTMLElement | null = null;
  #panelCloseButton: HTMLElement | null = null;
  #nav: HTMLElement | null = null;
  #tooltipButtons: NodeListOf<HTMLElement> | null = null;

  async connectedCallback() {
    const clone = NavBarTemp.content.cloneNode(true) as DocumentFragment;
    const container = clone.querySelector("aside") as HTMLElement;

    this.#wrapper = container;
    this.#header = container.querySelector("header");
    this.#panelCloseButton = container.querySelector("#close-sidebar");
    this.#panelOpenButton = container.querySelector("#open-sidebar");
    this.#nav = container.querySelector("nav");
    this.#overlayManager =
      document.querySelector<OverlayManager>("overlay-manager")!;

    if (!this.#overlayManager) {
      throw new Error("overlay-manager was not found in the document.");
    }

    if (this.#panelCloseButton) {
      this.#panelCloseButton.append(getIcon("sidebar"));
    }

    if (this.#panelOpenButton) {
      this.#panelOpenButton.append(getIcon("sidebar"));
      this.#panelOpenButton.dataset.tooltip = "Open sidebar";
    }

    if (this.#nav) {
      for (let i = 0, l = NAVIGATION_BUTTONS.length; i < l; i++) {
        const section = NAVIGATION_BUTTONS[i];

        if (section.title) {
          const header = document.createElement("div");
          header.setAttribute("class", "sidebar-section-row");
          const span = document.createElement("span");
          span.textContent = section.title;
          header.append(span);
          const divider = document.createElement("hr");
          divider.setAttribute("class", "sidebar-section-divider");
          header.append(divider);

          if (section.action) {
            const action = document.createElement("button");
            action.dataset.action = section.action;
            action.append(getIcon("plus"));
            header.append(action);
          }
          this.#nav.append(header);
        }

        for (let i = 0, l = section.data.length; i < l; i++) {
          const data = section.data[i];

          const button = document.createElement("navigation-button");
          button.setAttribute("label", data.label);
          button.setAttribute("icon", data.icon);
          button.setAttribute("label", data.label);
          button.dataset.tab = data.tab;
          button.dataset.tooltip = data.label;

          if (data.tab === "sync") {
            const badge = document.createElement("span");
            badge.setAttribute("class", "nav-sync-badge");
            badge.setAttribute("id", "sync-nav-badge");
            badge.classList.add("hidden");
            button.append(badge);
          }

          this.#nav.append(button);
        }
      }
    }

    this.append(container);

    this.#tooltipButtons = this.querySelectorAll<HTMLElement>("[data-tooltip]");

    this.#wrapper.addEventListener("click", this);

    for (let i = 0, l = this.#tooltipButtons.length; i < l; i++) {
      const button = this.#tooltipButtons[i];
      button.addEventListener("pointerenter", this);
      button.addEventListener("pointerleave", this);
    }
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

    const panelButton = target.closest("[data-toggle-sidebar]");
    if (panelButton) {
      this.handlePanelToggleClick();
    } else {
      this.handleNavigationClick(target);
    }
  }

  private handlePanelToggleClick() {
    if (!this.#wrapper) return;
    this.#wrapper.toggleAttribute("collapsed");
  }

  private handleNavigationClick(target: HTMLElement) {
    const item = target.closest("[data-tab]");
    if (!item) return;
    window.AppRouter.navigate(item.dataset.tab);
  }

  disconnectedCallback() {
    this.#wrapper?.removeEventListener("click", this);

    for (let i = 0, l = this.#tooltipButtons?.length ?? 0; i < l; i++) {
      const button = this.#tooltipButtons![i];
      button.removeEventListener("pointerenter", this);
      button.removeEventListener("pointerleave", this);
    }
  }
}

customElements.define("navigation-bar", NavBar);
