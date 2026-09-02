import type { IconKeys } from "../../icons";
import {
  createEventHandler,
  dispatchCustomEvent,
} from "../../utilities/event-utilities";

export type DataTableSortDirection = "ascending" | "descending";
export type DataTableCellClasses =
  | "col-header"
  | "date"
  | "primary"
  | "numeric"
  | "align-right"
  | "comparison"
  | "strong"
  | "tag"
  | "detail"
  | "is-negative"
  | "is-positive"
  | "is-muted"
  | "";

export interface DataTableColumn<T extends object = Record<string, unknown>> {
  key: keyof T & string;
  title: string;
  formatter?: (value: unknown, row: T) => string;
  subline?: (row: T) => string;
  sorter?: (row: T) => number | string;
  cellClass?:
    | string
    | DataTableCellClasses
    | (DataTableCellClasses | ((row: T) => DataTableCellClasses))[];
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
  #header!: HTMLElement;

  connectedCallback(): void {
    if (this.#initialized) return;
    this.#initialized = true;

    const table = document.createElement("table");
    this.append(table);
    this.#table = this.querySelector("table")!;
    this.#render();

    if (this.sortable) {
      this.#header.addEventListener("click", this);
    }

    if (this.interactive) {
      this.#body.addEventListener("click", this);
      this.#body.addEventListener("keydown", this);
    }
  }

  disconnectedCallback(): void {
    if (this.sortable) {
      this.#header.removeEventListener("click", this);
    }

    if (this.interactive) {
      this.#body.removeEventListener("click", this);
      this.#table.removeEventListener("keydown", this);
    }
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "click":
      case "keydown":
        this.#handleSelection(event);
        break;

      default:
        break;
    }
  }

  #handleSelection(event: Event) {
    if (
      event instanceof KeyboardEvent &&
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }

    const target = event.target as HTMLElement;
    const button = target.closest("[data-sort]") as HTMLElement;
    if (button) {
      this.#cycleSort(button.dataset.sort as string);
      return;
    }

    const row = target.closest("[data-row-key]") as HTMLElement;
    if (row) {
      this.rowSelection.dispatch({ id: row.dataset.rowKey as string });
      return;
    }
  }

  get interactive(): boolean {
    return this.hasAttribute("interactive");
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
    this.#header ??= document.createElement("thead");
    const colGroup = document.createElement("colgroup");

    let colGroupCols = [];
    let headerCols = [];

    for (let i = 0; i < this.#data.columns.length; i++) {
      const col = this.#data.columns[i];
      const headerCellClasses = Array.isArray(col.cellClass)
        ? col.cellClass.filter((item) => typeof item === "string")
        : col.cellClass
          ? [col.cellClass]
          : [];
      const align = headerCellClasses.includes("align-right")
        ? "align-right"
        : "";
      const activeDirection =
        this.#sortKey === col.key ? this.#sortDirection : null;
      const headerClass = col.headerClass ?? "";

      const iconName: IconKeys =
        activeDirection === "ascending"
          ? "chevronUp"
          : activeDirection === "descending"
            ? "chevronDown"
            : "chevronSelect";

      const aria = this.#sortLabel(col.title, activeDirection);
      const pressed = String(Boolean(activeDirection));

      if (typeof col.sizing === "number") {
        colGroupCols.push(`<col style="width: ${col.sizing}%"></col>`);
      } else if (col.sizing === "narrow") {
        colGroupCols.push(`<col class="shrink"></col>`);
      } else {
        colGroupCols.push(`<col></col>`);
      }

      if (this.sortable) {
        const cell = `
          <th class="col-header ${headerClass}" scope="col" data-sort="${col.key}">
            <button class="table-sort-button ${align}" aria-label="${aria}" aria-pressed="${pressed}" aria-sort="${activeDirection ?? "none"}">
              <span class="col-header">${col.title}</span>
              <custom-icon aria-hidden="true" icon="${iconName}"></custom-icon>
            </button>
          </th>
        `;
        headerCols.push(cell);
      } else {
        const cell = `<th class="col-header ${headerClass} ${align}" scope="col">${col.title}</th>`;
        headerCols.push(cell);
      }
    }

    colGroup.innerHTML = colGroupCols.join("");
    this.#header.innerHTML = `<tr>${headerCols.join("")}</tr>`;
    this.#table.replaceChildren(colGroup, this.#header, this.#body);
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
              Array.isArray(col.cellClass)
                ? col.cellClass.map((v) => (typeof v === "string" ? v : v(row)))
                : col.cellClass
                  ? [col.cellClass]
                  : []
            ).join(" ");

            if (classes.includes("tag")) {
              const cellClasses = classes
                .split(/\s+/)
                .filter((className) => className && className !== "tag")
                .join(" ");
              return `
                <td class="${cellClasses}">
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
                    ${icon ? `<custom-icon aria-hidden="true" icon="${icon}"></custom-icon>` : ""}
                  </span>
                </td>`;
            }

            return `<td class="${classes}">${text}</td>`;
          })
          .join("");

        const rowAttributes = [
          this.#data.interactiveRows
            ? 'class="is-interactive" tabindex="0"'
            : "",
          this.#data.rowKey ? `data-row-key="${this.#data.rowKey(row)}"` : "",
        ]
          .filter(Boolean)
          .join(" ");
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
          Array.isArray(col.cellClass)
            ? col.cellClass.map((v) => (typeof v === "string" ? v : ""))
            : col.cellClass
              ? [col.cellClass]
              : []
        ).join(" ");
        const footerClasses = classes
          .split(/\s+/)
          .filter((className) => className && className !== "tag")
          .join(" ");

        return `<td class="${footerClasses} ${i === 0 ? "strong" : ""}">${text}</td>`;
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

  rowSelection = createEventHandler("table-row-selected", this);
}

if (!customElements.get("data-table"))
  customElements.define("data-table", DataTable);
