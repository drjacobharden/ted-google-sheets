import { getIcon, type IconKeys } from "../../icons";
import { dispatchCustomEvent } from "../../utilities/event-utilities";

export type DataTableSortDirection = "ascending" | "descending";

export interface DataTableColumn<T extends object = Record<string, unknown>> {
  key: keyof T & string;
  title: string;
  formatter?: (value: unknown, row: T) => string;
  subline?: (row: T) => string;
  sorter?: (row: T) => number | string;
  cellClass?: string;
  textAlign?: "left" | "center" | "right";
  sizing?: "narrow" | number;
  trailingIcon?: (row: T) => IconKeys | null;
}

export interface DataTableData<T extends object = Record<string, unknown>> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
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
      if (column.cellClass) {
        cell.classList.add(...column.cellClass.split(/\s+/).filter(Boolean));
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
    const bodyFragment = document.createDocumentFragment();
    for (const rowData of rows) {
      const row = document.createElement("tr");
      this.#data.columns.forEach((column) =>
        row.append(this.#renderCell(column, rowData)),
      );
      bodyFragment.append(row);
    }
    this.#body.replaceChildren(bodyFragment);
    this.#table.append(this.#body);
  }

  #renderCell(column: DataTableColumn<T>, rowData: T): HTMLTableCellElement {
    const cell = document.createElement("td");
    if (column.cellClass) {
      cell.classList.add(
        ...column.cellClass
          .split(/\s+/)
          .filter((className) => className && className !== "tag"),
      );
    }
    const value = rowData[column.key];
    const text = column.formatter?.(value, rowData) ?? String(value ?? "");
    const classes = new Set((column.cellClass ?? "").split(/\s+/));
    if (classes.has("tag")) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = text;
      cell.append(tag);
    } else if (column.subline) {
      const stack = document.createElement("div");
      stack.className = "cell-stack";
      const primary = document.createElement("div");
      primary.className = "cell-primary";
      primary.textContent = text;
      const subline = document.createElement("small");
      subline.className = "cell-subline";
      subline.textContent = column.subline(rowData);
      stack.append(primary, subline);
      cell.append(stack);
    } else if (column.trailingIcon) {
      const inline = document.createElement("span");
      inline.className = "cell-inline";
      const inlineText = document.createElement("span");
      inlineText.textContent = text;
      inline.append(inlineText);
      const iconName = column.trailingIcon(rowData);
      const icon = iconName ? getIcon(iconName) : null;
      if (icon) inline.append(icon);
      cell.append(inline);
    } else cell.textContent = text;
    if (column.textAlign) cell.style.textAlign = column.textAlign;
    return cell;
  }

  #renderFooter(): void {
    this.#table.querySelector("tfoot")?.remove();
    if (!this.#data.footer) return;
    const footer = document.createElement("tfoot");
    const row = document.createElement("tr");
    if (this.#data.footer.ariaLabel)
      row.setAttribute("aria-label", this.#data.footer.ariaLabel);
    this.#data.columns.forEach((column, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      cell.textContent = this.#data.footer?.cells[index] ?? "";
      if (cell instanceof HTMLTableCellElement && index === 0)
        cell.scope = "row";
      if (column.cellClass)
        cell.classList.add(...column.cellClass.split(/\s+/).filter(Boolean));
      if (column.textAlign) cell.style.textAlign = column.textAlign;
      row.append(cell);
    });
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
