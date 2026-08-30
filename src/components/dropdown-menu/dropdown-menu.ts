import { getIcon, IconKeys } from "../../icons";
import { appState } from "../../state/app-state";
import { uuid } from "../../utilities/data-utilities";
import { createEventHandler } from "../../utilities/event-utilities";
import { CustomButton } from "../button/button";
import { Popover } from "../popover-menu/popover-menu";
import DropdownMenuTempString from "./template.html" with { type: "text" };

const DropdownMenuTemp = document.createElement("template");
DropdownMenuTemp.innerHTML = DropdownMenuTempString;

export interface DropdownMenuItem {
  key: string;
  title: string;
  group?: string;
  icon?: IconKeys;
  isDefaultValue?: boolean;
  destructive?: boolean;
  selectionIcon?: IconKeys | "none";
}

export interface DropdownSelectionEvent extends CustomEvent {
  detail: {
    value: string;
    title: string;
  };
}

export class DropdownMenu extends HTMLElement {
  #trigger!: CustomButton;
  #menu!: Popover;
  #menuKey = "";
  #listening = false;
  #unsubscribeFromState: (() => void) | null = null;
  #value: string | null = null;
  #selection: HTMLElement | null = null;
  #hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
  #hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  #defaultLabel = "";

  /**
   *
   * Connections
   *
   */

  connectedCallback(): void {
    if (!this.dataset.initialized) {
      this.dataset.initialized = "true";
      const clone = DropdownMenuTemp.content.cloneNode(
        true,
      ) as DocumentFragment;
      this.append(clone);
      this.#trigger = this.querySelector(".dropdown-trigger")!;
      this.#menu = this.querySelector("pop-over")!;
      this.#menuKey = this.id || uuid();

      this.#renderTrigger();
      this.#renderItems();
      this.#trigger.tabIndex = 0;
      this.#trigger.setAttribute("aria-haspopup", "menu");
      this.#trigger.setAttribute("aria-expanded", "false");
      this.#menu.setAttribute("role", "menu");
      this.#defaultLabel = this.getAttribute("label") ?? "";
    }

    if (this.#listening) return;
    this.#listening = true;

    this.#trigger.addEventListener("click", this);
    this.#trigger.addEventListener("keydown", this);
    this.#menu.addEventListener("click", this);
    this.#menu.addEventListener("input", this);
    this.#menu.addEventListener("keydown", this);
    this.#menu.addEventListener("popover-dismiss", this);
    if (this.hasAttribute("open-on-hover")) {
      this.addEventListener("pointerenter", this);
      this.addEventListener("pointerleave", this);
    }
    this.#unsubscribeFromState = appState.subscribe(
      "activeDropdownKey",
      (activeKey) => {
        if (activeKey !== this.#menuKey) this.#hideMenu();
      },
    );
  }

  disconnectedCallback() {
    if (!this.#listening) return;
    this.#listening = false;
    this.#trigger.removeEventListener("click", this);
    this.#trigger.removeEventListener("keydown", this);
    this.#menu.removeEventListener("click", this);
    this.#menu.removeEventListener("input", this);
    this.#menu.removeEventListener("keydown", this);
    this.#menu.removeEventListener("popover-dismiss", this);
    this.removeEventListener("pointerenter", this);
    this.removeEventListener("pointerleave", this);
    this.#clearHoverTimers();
    this.#unsubscribeFromState?.();
    this.#unsubscribeFromState = null;
    if (appState.get("activeDropdownKey") === this.#menuKey) {
      appState.set("activeDropdownKey", null);
    }
  }

  /**
   *
   * Rendering
   *
   */

  #renderTrigger() {
    const label = this.getAttribute("label")!;
    const icon = this.getAttribute("icon")! as IconKeys;

    const hideTrailingChevron =
      this.hasAttribute("hide-trailing-chevron") ?? false;

    if (label) {
      this.#trigger.label = label;
    }

    if (!hideTrailingChevron) {
      this.#trigger.trailingIcon = "chevronDown";
    }

    if (icon) {
      this.#trigger.leadingIcon = icon;
    }
  }

  #renderItems() {
    const items = JSON.parse(
      this.getAttribute("items") ?? "[]",
    ) as DropdownMenuItem[];

    const groups = new Map<string, HTMLElement>();
    const children: HTMLElement[] = [];

    items.forEach((item) => {
      const {
        key,
        title,
        group,
        icon,
        isDefaultValue,
        destructive,
        selectionIcon,
      } = item;

      const option = document.createElement("div");
      option.classList.add("dropdown-menu-item");
      option.dataset.value = key;
      option.dataset.title = title;

      if (icon) {
        option.append(getIcon(icon));
      }

      option.setAttribute("role", "menuitem");
      option.tabIndex = -1;

      const label = document.createElement("span");
      label.textContent = title;
      option.append(label);

      if (selectionIcon !== "none") {
        const icon = getIcon(selectionIcon ?? "checkmark");
        icon.classList.add("selection-indicator");
        option.append(icon);
      }

      if (isDefaultValue) {
        this.#selection?.classList.remove("is-selected");
        this.#selection = option;
        this.#selection.classList.add("is-selected");
        this.#value = key;
        if (!this.hasAttribute("preserve-label")) this.#trigger.label = title;
      }

      if (destructive) {
        option.toggleAttribute("destructive", true);
      }

      if (!group) {
        children.push(option);
        return;
      }

      let section = groups.get(group);
      if (!section) {
        section = document.createElement("div");
        section.className = "dropdown-menu-group";
        section.setAttribute("role", "group");

        const heading = document.createElement("span");
        const headingId = `${this.#menuKey}-group-${groups.size + 1}`;
        heading.id = headingId;
        heading.className = "dropdown-menu-group-title type-meta";
        heading.textContent = group;
        section.setAttribute("aria-labelledby", headingId);
        section.append(heading);

        groups.set(group, section);
        children.push(section);
      }
      section.append(option);
    });

    if (this.hasAttribute("searchable")) {
      const search = document.createElement("input");
      search.className = "dropdown-menu-search";
      search.type = "search";
      search.autocomplete = "off";
      search.placeholder = this.getAttribute("search-placeholder") ?? "Search";
      search.setAttribute("aria-label", search.placeholder);
      const searchRow = document.createElement("div");
      searchRow.className = "dropdown-menu-search-row";
      searchRow.append(search);

      if (this.hasAttribute("search-action")) {
        const action = document.createElement("button");
        action.className = "dropdown-menu-search-action";
        action.type = "button";
        action.textContent = this.getAttribute("search-action-label") ?? "Add";
        action.setAttribute("aria-label", action.textContent);
        searchRow.append(action);
      }

      const options = document.createElement("div");
      options.className = "dropdown-menu-options";
      options.replaceChildren(...children);
      this.#menu.replaceChildren(searchRow, options);
    } else {
      this.#menu.replaceChildren(...children);
    }
  }

  /**
   *
   * Event handling
   *
   */

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;

      case "input":
        this.#filterItems((event.target as HTMLInputElement).value);
        break;

      case "keydown":
        this.#handleKeydown(event as KeyboardEvent);
        break;

      case "pointerenter":
        this.#scheduleHoverOpen();
        break;

      case "pointerleave":
        this.#scheduleHoverClose();
        break;

      case "popover-dismiss":
        this.close();
        break;

      default:
        break;
    }
  }

  #handleClick(event: Event) {
    const target = event.target as HTMLElement;

    const searchAction = target.closest(
      ".dropdown-menu-search-action",
    ) as HTMLButtonElement | null;
    if (searchAction) {
      const input = this.#menu.querySelector<HTMLInputElement>(
        ".dropdown-menu-search",
      );
      this.#searchActionEvents.dispatch(
        { input: input?.value ?? "" },
        { bubbles: true },
      );
      return;
    }

    // Clicked the trigger
    const trigger = target.closest('[data-action="toggle-dropdown"]');
    if (trigger) {
      const visible = this.#menu.classList.contains("is-visible");
      if (visible) {
        this.close();
      } else {
        this.open();
      }
    }

    // Clicked an item
    const item = target.closest(".dropdown-menu-item") as HTMLElement;
    if (item) {
      this.#handleSelection(item);
    }
  }

  //   Emit an event to alert an item was selected and pass along its data
  #handleSelection(item: HTMLElement) {
    const bubbles = this.hasAttribute("bubbles") ?? false;

    this.#selection?.classList.remove("is-selected");
    this.#selection = item;
    this.#selection?.classList.add("is-selected");
    this.#value = item.dataset.value ?? null;
    if (!this.hasAttribute("preserve-label")) {
      this.#trigger.label = item.dataset.title!;
    }
    this.#events.dispatch(
      {
        id: this.#menuKey,
        value: item.dataset.value!,
        title: item.dataset.title!,
      },
      { bubbles },
    );
    this.close();
  }

  #filterItems(query: string) {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
    for (const item of this.#menu.querySelectorAll<HTMLElement>(
      ".dropdown-menu-item",
    )) {
      const title = item.dataset.title?.toLocaleLowerCase("en-US") ?? "";
      item.hidden =
        normalizedQuery.length > 0 && !title.includes(normalizedQuery);
    }
    for (const group of this.#menu.querySelectorAll<HTMLElement>(
      ".dropdown-menu-group",
    )) {
      group.hidden = !group.querySelector(".dropdown-menu-item:not([hidden])");
    }
  }

  /**
   *
   * Setters
   *
   */

  set items(array: DropdownMenuItem[]) {
    this.setAttribute("items", JSON.stringify(array));

    if (this.#menu) {
      this.#renderItems();
    }
  }

  set label(text: string) {
    this.setAttribute("label", text);

    if (this.#trigger) {
      this.#trigger.label = text;
    }
  }

  set icon(icon: IconKeys) {
    this.setAttribute("icon", icon);

    if (this.#trigger) {
      this.#trigger.leadingIcon = icon;
    }
  }

  get selection(): string | null {
    return this.#value;
  }

  set selection(value: string | null) {
    const item =
      value === null
        ? null
        : (this.#menu?.querySelector<HTMLElement>(
            `.dropdown-menu-item[data-value="${CSS.escape(value)}"]`,
          ) ?? null);
    this.#selection?.classList.remove("is-selected");
    this.#selection = item;
    this.#value = item?.dataset.value ?? null;
    this.#selection?.classList.add("is-selected");

    if (item === null) {
      this.#trigger.label = this.#defaultLabel;
    } else if (item && !this.hasAttribute("preserve-label") && this.#trigger) {
      this.#trigger.label = item.dataset.title ?? "";
    }
  }

  open(options: { focusFirst?: boolean } = {}) {
    this.#clearHoverTimers();
    appState.set("activeDropdownKey", this.#menuKey);
    this.#menu.show(this.#trigger, {
      side: "bottom",
      align: this.hasAttribute("align-start")
        ? "start"
        : this.hasAttribute("align-center")
          ? "center"
          : "end",
      gap: 4,
    });
    this.toggleAttribute("is-open", true);
    this.#trigger.setAttribute("aria-expanded", "true");
    const search = this.#menu.querySelector<HTMLInputElement>(
      ".dropdown-menu-search",
    );
    if (search) {
      search.value = "";
      this.#filterItems("");
      search.focus();
    } else if (options.focusFirst) {
      this.#menu.querySelector<HTMLElement>(".dropdown-menu-item")?.focus();
    }
  }

  close() {
    if (appState.get("activeDropdownKey") === this.#menuKey) {
      appState.set("activeDropdownKey", null);
    } else {
      this.#hideMenu();
    }
  }

  #hideMenu() {
    this.#menu.hide();
    this.#trigger.setAttribute("aria-expanded", "false");
    this.toggleAttribute("is-open", false);
  }

  #handleKeydown(event: KeyboardEvent) {
    const items = [
      ...this.#menu.querySelectorAll<HTMLElement>(
        ".dropdown-menu-item:not([hidden])",
      ),
    ];
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.currentTarget === this.#trigger) {
      if (!["Enter", " ", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      this.open({ focusFirst: true });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      this.#trigger.focus();
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && currentIndex >= 0) {
      event.preventDefault();
      this.#handleSelection(items[currentIndex]);
      return;
    }
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (currentIndex + 1) % items.length
            : event.key === "ArrowUp"
              ? (currentIndex - 1 + items.length) % items.length
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  #scheduleHoverOpen() {
    if (this.#hoverCloseTimer) clearTimeout(this.#hoverCloseTimer);
    this.#hoverCloseTimer = null;
    if (this.hasAttribute("is-open")) return;
    this.#hoverOpenTimer = setTimeout(() => this.open(), 120);
  }

  #scheduleHoverClose() {
    if (this.#hoverOpenTimer) clearTimeout(this.#hoverOpenTimer);
    this.#hoverOpenTimer = null;
    this.#hoverCloseTimer = setTimeout(() => this.close(), 180);
  }

  #clearHoverTimers() {
    if (this.#hoverOpenTimer) clearTimeout(this.#hoverOpenTimer);
    if (this.#hoverCloseTimer) clearTimeout(this.#hoverCloseTimer);
    this.#hoverOpenTimer = null;
    this.#hoverCloseTimer = null;
  }

  #events = createEventHandler("dropdown-selection", this);
  #searchActionEvents = createEventHandler("search-action-pressed", this);

  addListener = this.#events.addListener;
  removeListener = this.#events.removeListener;
  handleSelection = this.#events.handleEvent;
  addSearchActionListener = this.#searchActionEvents.addListener;
  removeSearchActionListener = this.#searchActionEvents.removeListener;
  handleSearchActionPressed = this.#searchActionEvents.handleEvent;
}

customElements.define("dropdown-menu", DropdownMenu);
