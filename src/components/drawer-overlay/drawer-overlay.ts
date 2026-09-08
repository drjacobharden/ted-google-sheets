import DrawerOverlayTemplateString from "./template.html" with { type: "text" };
import type { SegmentedControlItem } from "../segmented-control/segmented-control";

const DrawerOverlayTemplate = document.createElement("template");
DrawerOverlayTemplate.innerHTML = DrawerOverlayTemplateString;

export class DrawerOverlay extends HTMLElement {
  #initialized = false;
  #header: HTMLElement | null = null;
  #tabs: SegmentedControlItem[] = [];
  #tabControl: HTMLElement | null = null;
  #title = "";

  set tabs(value: SegmentedControlItem[]) {
    this.#tabs = value.map(({ key, title, isDefaultValue }) => ({
      key,
      title,
      isDefaultValue,
    }));

    this.#renderTabs();
  }

  get tabs(): SegmentedControlItem[] {
    return this.#tabs.map(({ key, title, isDefaultValue }) => ({
      key,
      title,
      isDefaultValue,
    }));
  }

  set title(value: string) {
    this.#title = String(value || "");

    if (this.#header) {
      (this.#header as HTMLElement & { title: string }).title = this.#title;
    }
  }

  connectedCallback(): void {
    if (this.#initialized) return;
    this.#initialized = true;

    this.classList.add("drawer-overlay");

    const contentNodes = Array.from(this.childNodes);
    const drawer = DrawerOverlayTemplate.content.cloneNode(
      true,
    ) as DocumentFragment;
    const panel = drawer.querySelector(".side-drawer") as HTMLElement;
    const tabsContainer = drawer.querySelector(".drawer-tabs") as HTMLElement;
    const content = drawer.querySelector(".drawer-content") as HTMLElement;
    const header = drawer.querySelector("drawer-header") as HTMLElement;
    const tabNode = contentNodes.find(
      (node) => node instanceof Element && node.getAttribute("slot") === "tabs",
    ) as HTMLElement | undefined;

    const baseId = this.id || "drawer";
    const headerId = `${baseId}-header`;
    panel.id = `${baseId}-panel`;
    panel.setAttribute("aria-labelledby", headerId);
    header.id = headerId;
    this.#header = header;

    const title = this.getAttribute("title") || this.#title;
    this.removeAttribute("title");
    if (title) {
      this.title = title;
    }

    const tabsAttribute = this.getAttribute("tabs");
    if (tabsAttribute) {
      try {
        const tabs = JSON.parse(tabsAttribute) as SegmentedControlItem[];
        this.tabs = tabs;
      } catch {
        this.#tabs = [];
      }
    }

    this.replaceChildren(drawer);

    if (tabNode) {
      tabNode.removeAttribute("slot");
      tabsContainer.appendChild(tabNode);
      this.#tabControl = tabNode;
    } else if (this.#tabs.length) {
      this.#tabControl = document.createElement("segmented-control");
      this.#tabControl.setAttribute("variant", "section-tabs");
      tabsContainer.appendChild(this.#tabControl);
    }

    if (this.#tabs.length) {
      this.#renderTabs();
    }

    for (const node of contentNodes) {
      if (node === tabNode) continue;

      if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
        continue;
      }

      const slot = node instanceof Element ? node.getAttribute("slot") : null;
      if (slot === "tabs") continue;

      if (node instanceof Element) {
        node.removeAttribute("slot");
      }

      content.appendChild(node);
    }
  }

  #renderTabs(): void {
    if (!this.#initialized) return;

    if (!this.#tabs.length) {
      this.#tabControl?.remove();
      this.#tabControl = null;
      return;
    }

    if (!this.#tabControl) {
      const tabsContainer = this.querySelector(".drawer-tabs");
      if (!tabsContainer) return;
      this.#tabControl = document.createElement("segmented-control");
      this.#tabControl.setAttribute("variant", "section-tabs");
      tabsContainer.appendChild(this.#tabControl);
    }

    (
      this.#tabControl as HTMLElement & {
        items: SegmentedControlItem[];
      }
    ).items = this.tabs;
  }
}

if (!customElements.get("drawer-overlay")) {
  customElements.define("drawer-overlay", DrawerOverlay);
}
