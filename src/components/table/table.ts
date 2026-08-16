import { getIcon, type IconKeys } from "../../icons";
import { Checkbox } from "../checkbox/checkbox";
import { DropdownMenu, type DropdownMenuItem } from "../dropdown-menu/dropdown-menu";

export interface TableColumn<T> {
  key: keyof T;
  title: string;
  dataType: "string" | "number" | string[];
  formatter?: (value: any, row: T) => string;
  textAlign?: "right" | "left" | "center";
  prominence?: "bold" | "background" | "none";
  sizing?: "narrow" | number;
  color?: (row: T) => string;
  sorter?: (row: T) => number;
}

export type SortDirection = "ascending" | "descending";

export interface TableData<T> {
  columns: (TableColumn<T> | "checkbox" | "options")[];
  rows: readonly T[];
  rowActions?: (DropdownMenuItem & { selectionIcon: "none" })[];
  sort?: { key: keyof T; direction: SortDirection } | null;
}

/**
 * A presentation-only table. Filtering, sorting, and pagination belong to the
 * owning screen; assigning `data` repaints exactly the supplied rows.
 */
export class Table<T extends object> extends HTMLElement {
  #initialized = false;
  #table!: HTMLTableElement;
  #tableBody!: HTMLTableSectionElement;
  #columns: TableData<T>["columns"] = [];

  connectedCallback(): void {
    if (this.#initialized) return;
    this.#initialized = true;
    this.classList.add("table-list");
    this.#table = document.createElement("table");
    this.append(this.#table);
  }

  set data(data: TableData<T>) {
    if (!this.#initialized) this.connectedCallback();
    this.#columns = data.columns;
    this.#renderHeader(data);
    this.#renderRows(data);
  }

  /** Number of body rows that fit in the current list without vertical scroll. */
  get visibleRowCapacity(): number {
    const availableHeight = this.clientHeight;
    if (availableHeight <= 0) return 0;

    const headerHeight = this.#table.tHead?.getBoundingClientRect().height ?? 0;
    const sampleRow = this.#tableBody?.rows.item(0);
    const configuredRowHeight = Number.parseFloat(
      getComputedStyle(this).getPropertyValue("--table-row-height"),
    );
    const rowHeight =
      sampleRow?.getBoundingClientRect().height || configuredRowHeight || 57;

    return Math.max(1, Math.floor((availableHeight - headerHeight) / rowHeight));
  }

  #renderHeader(data: TableData<T>): void {
    const colGroup = document.createElement("colgroup");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.#tableBody = document.createElement("tbody");

    for (const column of this.#columns) {
      const col = document.createElement("col");
      const th = document.createElement("th");

      if (typeof column === "object") {
        const activeDirection =
          data.sort?.key === column.key ? data.sort.direction : null;
        const iconName: IconKeys =
          activeDirection === "descending"
            ? "chevronDown"
            : activeDirection === "ascending"
              ? "chevronUp"
              : "chevronSelect";
        const button = document.createElement("button");
        const icon = getIcon(iconName);

        button.type = "button";
        button.className = "table-sort-button";
        button.append(document.createTextNode(column.title));
        button.setAttribute(
          "aria-label",
          activeDirection === "descending"
            ? `${column.title}: sorted descending. Activate to sort ascending.`
            : activeDirection === "ascending"
              ? `${column.title}: sorted ascending. Activate to clear sorting.`
              : `${column.title}: not sorted. Activate to sort descending.`,
        );
        button.addEventListener("click", () => {
          this.dispatchEvent(
            new CustomEvent("table-sort-request", {
              bubbles: true,
              detail: { key: column.key },
            }),
          );
        });
        if (icon) {
          icon.setAttribute("aria-hidden", "true");
          button.append(icon);
        }

        th.append(button);
        th.setAttribute("aria-sort", activeDirection ?? "none");
        th.style.textAlign = column.textAlign ?? "left";
        button.style.justifyContent =
          column.textAlign === "right"
            ? "flex-end"
            : column.textAlign === "center"
              ? "center"
              : "flex-start";
      }

      if (typeof column === "string" || column.sizing === "narrow") {
        col.classList.add("shrink");
      } else if (typeof column.sizing === "number") {
        col.style.width = `${column.sizing}%`;
      }

      colGroup.append(col);
      headerRow.append(th);
    }

    head.append(headerRow);
    this.#table.replaceChildren(colGroup, head, this.#tableBody);
  }

  #renderRows(data: TableData<T>): void {
    const fragment = document.createDocumentFragment();

    for (const row of data.rows) {
      const tr = document.createElement("tr");
      const cells = this.#columns.map((column) => {
        const td = document.createElement("td");

        if (column === "checkbox") {
          td.append(document.createElement("check-box") as Checkbox);
          td.classList.add("shrink");
        } else if (column === "options") {
          const menu = document.createElement("dropdown-menu") as DropdownMenu;
          menu.icon = "dotsHorizontal";
          menu.toggleAttribute("hide-trailing-chevron");
          menu.classList.add("options");
          menu.items = data.rowActions ?? [];
          td.append(menu);
          td.classList.add("shrink");
        } else {
          const value = row[column.key];
          const text = column.formatter?.(value, row) ?? String(value);

          if (column.prominence === "background") {
            const badge = document.createElement("span");
            badge.textContent = text;
            badge.style.backgroundColor =
              column.color?.(row) ?? "var(--syncing-dark)";
            badge.style.color = "var(--inverse-text)";
            td.append(badge);
          } else {
            td.textContent = text;
            td.style.textAlign = column.textAlign ?? "left";
            td.style.fontWeight = column.prominence === "bold" ? "500" : "400";
            td.style.color = column.color?.(row) ?? "var(--text)";
          }
        }

        return td;
      });

      tr.replaceChildren(...cells);
      fragment.append(tr);
    }

    this.#tableBody.replaceChildren(fragment);
  }
}

if (!customElements.get("table-list")) customElements.define("table-list", Table);
