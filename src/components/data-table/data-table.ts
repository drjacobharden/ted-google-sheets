import { getIcon, type IconKeys } from "../../icons";
import { dispatchCustomEvent } from "../../utilities/event-utilities";

export type DataTableSortDirection = "ascending" | "descending";
export type DataTableCellClasses =
  | "col-header"
  | "primary"
  | "numeric"
  | "align-right"
  | "comparison"
  | "strong"
  | "tag"
  | "detail"
  | "is-negative"
  | "is-positive"
  | "";

export interface DataTableColumn<T extends object = Record<string, unknown>> {
  key: keyof T & string;
  title: string;
  formatter?: (value: unknown, row: T) => string;
  subline?: (row: T) => string;
  sorter?: (row: T) => number | string;
  cellClass?: (DataTableCellClasses | ((row: T) => DataTableCellClasses))[];
  textAlign?: "left" | "center" | "right";
  sizing?: "narrow" | number;
  trailingIcon?: (row: T) => IconKeys | null;
  headerClass?: string;
}

export interface DataTableData<T extends object = Record<string, unknown>> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  interactiveRows?: boolean;
  rowKey?: (row: T) => string;
  footer?: {
    cells: readonly (string | null)[];
    ariaLabel?: string;
  };
}

export interface DataTableSort<T extends object = Record<string, unknown>> {
  key: keyof T & string;
  direction: DataTableSortDirection;
}

export class DataTable<
  T extends object = Record<string, unknown>,
> extends HTMLElement {
  #initialized = false;
  #table!: HTMLTableElement;
  #body!: HTMLTableSectionElement;
  #data: DataTableData<T> = { columns: [], rows: [] };
  #sortKey: string | null = null;
  #sortDirection: DataTableSortDirection | null = null;

  connectedCallback(): void {
    if (this.#initialized) return;
    this.#initialized = true;

    const table = document.createElement("table");
    this.append(table);
    this.#table = this.querySelector("table")!;
    this.#render();
  }

  get sortable(): boolean {
    return this.hasAttribute("sortable");
  }

  set sortable(value: boolean) {
    this.toggleAttribute("sortable", value);
    this.#renderHeader();
  }

  get sort(): DataTableSort<T> | null {
    if (!this.#sortKey || !this.#sortDirection) return null;
    return {
      key: this.#sortKey as keyof T & string,
      direction: this.#sortDirection,
    };
  }

  set sort(value: DataTableSort<T> | null) {
    this.#sortKey = value?.key ?? null;
    this.#sortDirection = value?.direction ?? null;
    this.#clearMissingSort();
    this.#render();
  }

  set data(data: DataTableData<T>) {
    if (!this.#initialized) this.connectedCallback();
    this.#data = data;
    this.#clearMissingSort();
    this.#render();
  }

  get data(): DataTableData<T> {
    return this.#data;
  }

  #clearMissingSort(): void {
    if (!this.#sortKey) return;
    const hasSortColumn = this.#data.columns.some(
      (column) => column.key === this.#sortKey,
    );
    if (!hasSortColumn) {
      this.#sortKey = null;
      this.#sortDirection = null;
    }
  }

  #render(): void {
    if (!this.#table) return;
    this.#renderHeader();
    this.#renderRows();
    this.#renderFooter();
  }

  #renderHeader(): void {
    if (!this.#table) return;
    this.#body ??= document.createElement("tbody");
    const colGroup = document.createElement("colgroup");
    const head = document.createElement("thead");
    const row = document.createElement("tr");

    for (const column of this.#data.columns) {
      const col = document.createElement("col");
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.classList.add("col-header");

      cell.classList.add(
        ...(column.cellClass?.filter((item) => typeof item === "string") ?? []),
      );

      if (column.headerClass) {
        cell.classList.add(...column.headerClass.split(/\s+/).filter(Boolean));
      }
      if (column.sizing === "narrow") col.classList.add("shrink");
      else if (typeof column.sizing === "number")
        col.style.width = `${column.sizing}%`;

      const activeDirection =
        this.#sortKey === column.key ? this.#sortDirection : null;
      if (this.sortable) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table-sort-button";
        button.append(document.createTextNode(column.title));
        button.setAttribute(
          "aria-label",
          this.#sortLabel(column.title, activeDirection),
        );
        button.setAttribute("aria-pressed", String(Boolean(activeDirection)));
        button.addEventListener("click", () => this.#cycleSort(column.key));
        const iconName: IconKeys =
          activeDirection === "ascending"
            ? "chevronUp"
            : activeDirection === "descending"
              ? "chevronDown"
              : "chevronSelect";
        const icon = getIcon(iconName);
        if (icon) {
          icon.setAttribute("aria-hidden", "true");
          button.append(icon);
        }
        button.style.justifyContent =
          column.textAlign === "right"
            ? "flex-end"
            : column.textAlign === "center"
              ? "center"
              : "flex-start";
        cell.append(button);
        cell.setAttribute("aria-sort", activeDirection ?? "none");
      } else {
        cell.textContent = column.title;
      }
      if (column.textAlign) cell.style.textAlign = column.textAlign;
      colGroup.append(col);
      row.append(cell);
    }

    head.append(row);
    this.#table.replaceChildren(colGroup, head, this.#body);
  }

  #renderRows(): void {
    this.#body ??= document.createElement("tbody");
    const rows = this.#sortedRows();

    const rowChildren = rows
      .map((row) => {
        const cols = this.#data.columns
          .map((col) => {
            const value = row[col.key];
            const text = col.formatter?.(value, row) ?? String(value ?? "");
            const classes = (
              col.cellClass?.map((v) => (typeof v === "string" ? v : v(row))) ??
              []
            ).join(" ");

            if (classes.includes("tag")) {
              return `
                <td class="${classes}">
                  <span class="tag">${text}</span>
                </td>`;
            }

            if (col.subline) {
              return `
                <td class="${classes}">
                  <div class="cell-stack">
                    <div class="cell-primary">${text}</div>
                    <small class="cell-subline">${col.subline(row)}</small>
                  </div>
                </td>`;
            }

            if (col.trailingIcon) {
              const icon = col.trailingIcon(row);
              return `
                <td class="${classes}">
                  <span class="cell-inline">
                    <span>${text}</span>
                    ${icon && `<custom-icon icon="${getIcon(icon)}"></custom-icon>`}
                  </span>
                </td>`;
            }

            return `<td class="${classes}">${text}</td>`;
          })
          .join("");

        const rowAttributes = [
          this.#data.interactiveRows ? 'class="is-interactive" tabindex="0"' : "",
          this.#data.rowKey ? `data-row-key="${this.#data.rowKey(row)}"` : "",
        ].filter(Boolean).join(" ");
        return `<tr ${rowAttributes}>${cols}</tr>`;
      })
      .join("");

    this.#body.innerHTML = rowChildren;
    this.#table.append(this.#body);
  }

  #renderFooter(): void {
    this.#table.querySelector("tfoot")?.remove();
    if (!this.#data.footer) return;

    const footer = document.createElement("tfoot");
    const row = document.createElement("tr");

    if (this.#data.footer.ariaLabel) {
      row.setAttribute("aria-label", this.#data.footer.ariaLabel);
    }

    const cols = this.#data.columns
      .map((col, i) => {
        const text = this.#data.footer?.cells[i] ?? "";
        const classes = (
          col.cellClass?.map((v) => (typeof v === "string" ? v : "")) ?? []
        ).join(" ");

        return `<td class="${classes} ${i === 0 ? "strong" : ""}">${text}</td>`;
      })
      .join("");

    row.innerHTML = cols;
    footer.append(row);
    this.#table.append(footer);
  }

  #sortedRows(): T[] {
    if (!this.#sortKey || !this.#sortDirection) return [...this.#data.rows];
    const column = this.#data.columns.find(
      (item) => item.key === this.#sortKey,
    );
    if (!column) return [...this.#data.rows];
    const multiplier = this.#sortDirection === "ascending" ? 1 : -1;
    return [...this.#data.rows].sort((left, right) => {
      const leftValue = column.sorter?.(left) ?? left[column.key];
      const rightValue = column.sorter?.(right) ?? right[column.key];
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * multiplier;
      }
      return (
        String(leftValue ?? "").localeCompare(String(rightValue ?? "")) *
        multiplier
      );
    });
  }

  #sortLabel(title: string, direction: DataTableSortDirection | null): string {
    if (direction === "ascending")
      return `${title}: sorted ascending. Activate to clear sorting.`;
    if (direction === "descending")
      return `${title}: sorted descending. Activate to sort ascending.`;
    return `${title}: not sorted. Activate to sort descending.`;
  }

  #cycleSort(key: string): void {
    if (this.#sortKey !== key || this.#sortDirection === null) {
      this.#sortKey = key;
      this.#sortDirection = "descending";
    } else if (this.#sortDirection === "descending") {
      this.#sortDirection = "ascending";
    } else {
      this.#sortKey = null;
      this.#sortDirection = null;
    }
    dispatchCustomEvent("table-sort-request", this, { key });
    this.#render();
  }
}

if (!customElements.get("data-table"))
  customElements.define("data-table", DataTable);
