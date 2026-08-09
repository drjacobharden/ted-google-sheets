import { DateRange, DateUtils } from "../../utilities/date-utilities";
import { getIcon, IconKeys } from "../../icons";
import {
  addListener,
  createEventHandler,
  handleCustomEvent,
  removeListener,
} from "../../utilities/event-utilities";
import { Checkbox } from "../checkbox/checkbox";
import { DatePicker } from "../date-range-picker/date-range-picker-2";
import { DropdownMenu, DropdownMenuItem } from "../dropdown-menu/dropdown-menu";
import {
  AppliedFilter,
  AvailableFilter,
  FilterBar,
} from "../filter-bar/filter-bar";
import { SearchBar } from "../search-bar/search-bar";

interface Column<T> {
  key: keyof T;
  title: string;
  dataType: "string" | "number" | string[];
  formatter?: (v: any, row: T) => string;
  textAlign?: "right" | "left" | "center";
  prominence?: "bold" | "background" | "none";
  sizing?: "narrow" | number;
  color?: (row: T) => string;
  sorter?: (row: T) => number;
}

interface TableData<T> {
  columns: (Column<T> | "checkbox" | "options")[];
  rows: T[];
  footer?: {};
  filters?: AvailableFilter<T>[];
  rowActions?: (DropdownMenuItem & { selectionIcon: "none" })[];
  sort?: { key: keyof T; direction: SortDirection } | null;
}

type TableControlsArray = (
  | "search"
  | "date"
  | "sort"
  | "filter"
  | "divider"
  | "dateTitle"
)[];
type SortDirection = "ascending" | "descending";

export class Table<T extends object> extends HTMLElement {
  #initialized = false;
  #listening = false;
  #dateRange = DateUtils.defaultRange;

  #data: TableData<T> = { columns: [], rows: [] }; //  all the data available to use
  #dateData: TableData<T>["rows"] | null = null; //  data available for the current date range
  #visibleData: TableData<T>["rows"] = []; //  data visible in the table

  #sortKey: keyof T | null = null;
  #sortDirection: SortDirection | null = null;
  #filters: AppliedFilter<T>[] = [];

  #controller: TableController<T> | null = null;
  #list!: TableList<T>;
  #footer: HTMLElement | null = null;

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#initialize();
    }

    if (!this.#listening) {
      this.#listening = true;
      addListener("date-range-changed", this, this);
      addListener("checkbox-selection", this, this);
      addListener("filters-changed", this, this);
      addListener("table-sort-request", this, this);
    }
  }

  // Capture elements and set initial states
  #initialize() {
    this.#controller = this.querySelector("table-controller");
    this.#list = this.querySelector("table-list")!;
    this.#footer = this.querySelector("table-footer");

    if (!this.#list) throw new Error("Table list is not defined");

    this.#initialized = true;
  }

  handleEvent(event: Event) {
    switch (event.type) {
      case "date-range-changed":
        this.#handleDateChange(event);
        break;

      case "checkbox-selection":
        this.#handleCheckboxSelection(event);
        break;

      case "table-sort-request":
        this.#handleHeaderSort(event as CustomEvent<{ key: keyof T }>);
        break;

      case "filters-changed":
        this.#handleFiltersChanged(event);
        break;

      default:
        break;
    }
  }

  set data(values: TableData<T>) {
    this.#data = values;

    const sortColumnExists = values.columns.some(
      (item) => typeof item === "object" && item.key === this.#sortKey,
    );
    if (!sortColumnExists) {
      this.#sortKey = null;
      this.#sortDirection = null;
    }

    this.#filterByDate();
    this.#filterData();
    this.#sortData();
    this.#setTableData();

    if (this.#controller) {
      this.#controller.sort = values.columns;
      this.#controller.filters = values.filters;
    }
  }

  set controls(values: TableControlsArray) {
    if (this.#controller) {
      this.#controller.controls = values;
    } else {
      throw new Error("Table controller is not attached");
    }
  }

  #handleDateChange(event: Event) {
    handleCustomEvent("date-range-changed", event, ({ range, step }) => {
      if (this.#controller) {
        this.#controller.dateTitle = DateUtils.formatDateRange(
          range.start,
          range.end,
          {
            showDays: step === "week",
            showMonth: step !== "year",
            monthFormat: "long",
          },
        );
      }

      this.#dateRange = range;
      this.#filterByDate();
      this.#filterData();
      this.#sortData();
      this.#setTableData();
    });
  }

  #handleCheckboxSelection(event: Event) {
    handleCustomEvent("checkbox-selection", event, ({ isOn }) => {
      console.log({ isOn });
    });
  }

  #handleHeaderSort(event: CustomEvent<{ key: keyof T }>) {
    handleCustomEvent("table-sort-request", event, ({ key }) => {
      if (this.#sortKey !== key || this.#sortDirection === null) {
        this.#sortKey = key as keyof T;
        this.#sortDirection = "descending";
      } else if (this.#sortDirection === "descending") {
        this.#sortDirection = "ascending";
      } else {
        this.#sortKey = null;
        this.#sortDirection = null;
      }

      this.#filterData();
      this.#sortData();
      this.#setTableData();
    });
  }

  #handleFiltersChanged(event: Event) {
    handleCustomEvent("filters-changed", event, ({ filters }) => {
      this.#filters = filters;
      this.#filterData();
      this.#sortData();
      this.#setTableData();
    });
  }

  #sortData() {
    const key = this.#sortKey;
    const direction = this.#sortDirection;

    if (key === null || direction === null) return this.#visibleData;

    const colIndex = this.#data.columns.findIndex(
      (v) => typeof v === "object" && v.key === key,
    );
    const col = this.#data.columns[colIndex];

    if (!col || typeof col === "string") return this.#visibleData;

    const multiplier = direction === "ascending" ? 1 : -1;

    this.#visibleData.sort((a, b) => {
      const prev = a[key] as string | number;
      const next = b[key] as string | number;

      if (typeof prev === "number" && typeof next === "number") {
        const normalizedPrev = col.sorter?.(a) ?? prev;
        const normalizedNext = col.sorter?.(b) ?? next;

        return (normalizedPrev - normalizedNext) * multiplier;
      }

      if (typeof prev === "string" && typeof next === "string") {
        return prev.localeCompare(next) * multiplier;
      }

      return 0;
    });
  }

  #filterData() {
    const data = this.#data.rows;
    const filteredByDate = this.#dateData ?? data;

    const filtered = filteredByDate.filter((item) => {
      const row = item;

      return this.#filters.every((filter) => {
        const filterKey = filter.key as keyof T;

        const filterValue =
          typeof filter.value === "string"
            ? filter.value.toLowerCase()
            : filter.value;

        const value =
          typeof row[filterKey] === "string"
            ? row[filterKey].toLowerCase()
            : (row[filterKey] as number);

        if (filter.operator === "Equals") {
          return value === filterValue;
        }

        if (filter.operator === "Does not equal") {
          return value !== filterValue;
        }

        if (filter.operator === "Greater than") {
          return value > filter.value;
        }

        if (filter.operator === "Less than") {
          return value < filter.value;
        }

        if (filter.operator === "Contains") {
          const val = value as string;
          return val.includes(filterValue as string);
        }

        if (filter.operator === "Starts with") {
          const val = value as string;
          return val.startsWith(filterValue as string);
        }
      });
    });

    this.#visibleData = filtered;
  }

  #filterByDate() {
    const data = this.#data.rows;
    if (data.length === 0) return data;
    if (!("date" in data[0])) return data;

    const filtered = data.filter((row) => {
      if ("date" in row) {
        const date = row.date as string;
        return DateUtils.isInRange(date, this.#dateRange);
      }

      return false;
    });

    this.#dateData = filtered;
  }

  #setTableData() {
    this.#list.data = {
      columns: this.#data.columns,
      rows: this.#visibleData,
      rowActions: this.#data.rowActions,
      sort:
        this.#sortKey !== null && this.#sortDirection !== null
          ? { key: this.#sortKey, direction: this.#sortDirection }
          : null,
    };
  }

  disconnectedCallback() {
    this.#listening = false;
    removeListener("date-range-changed", this, this);
    removeListener("checkbox-selection", this, this);
    removeListener("filters-changed", this, this);
    removeListener("table-sort-request", this, this);
  }
}

class TableController<T extends object> extends HTMLElement {
  #columnHeaders: TableData<T>["columns"] = [];
  #initialized = false;
  #filterBar: FilterBar<T> | null = null;
  #sort: DropdownMenu | null = null;
  #searchBar: SearchBar | null = null;
  #datePicker: DatePicker | null = null;
  #dateTitle: HTMLElement | null = null;

  connectedCallback() {
    if (!this.#initialized) {
      this.classList.add("table-controller");
    }
  }

  set controls(values: TableControlsArray) {
    const children = values.map((item) => {
      switch (item) {
        case "dateTitle":
          const span = document.createElement("span");
          span.classList.add("date-title");
          this.#dateTitle = span;
          return span;

        case "search":
          const searchbar = document.createElement("search-bar") as SearchBar;
          this.#searchBar = searchbar;
          return searchbar;

        case "date":
          const datePicker = document.createElement(
            "date-range-picker-2",
          ) as DatePicker;
          this.#datePicker = datePicker;
          return datePicker;

        case "filter":
          const filterButton = document.createElement(
            "filter-bar",
          ) as FilterBar<T>;
          filterButton.dataset.action = "filter";
          this.#filterBar = filterButton;
          return filterButton;

        case "sort":
          const sortButton = document.createElement(
            "dropdown-menu",
          ) as DropdownMenu;
          sortButton.label = "Sort";
          sortButton.icon = "sort";
          sortButton.dataset.action = "sort";
          sortButton.toggleAttribute("hide-trailing-chevron", true);
          sortButton.toggleAttribute("bubbles", true);
          this.#sort = sortButton;
          return sortButton;

        case "divider":
          const div = document.createElement("div");
          div.classList.add("vertical-divider");
          return div;
      }
    });

    this.replaceChildren(...children);
  }

  set filters(values: TableData<T>["filters"]) {
    if (this.#filterBar) {
      this.#filterBar.availableFilters = values ?? [];
    }
  }

  set sort(values: TableData<T>["columns"]) {
    if (this.#sort) {
      this.#sort.items = values.filter(
        (item) => typeof item !== "string",
      ) as DropdownMenuItem[];
    }
  }

  set dateTitle(value: string) {
    if (this.#dateTitle) {
      this.#dateTitle.textContent = value;
    }
  }

  disconnectedCallback() {}
}

class TableFooter extends HTMLElement {
  #initialized = false;

  connectedCallback() {
    if (!this.#initialized) {
      this.classList.add("table-footer");

      while (this.firstChild) {
        this.append(this.firstChild);
      }
    }
  }

  disconnectedCallback() {}
}

class TableList<T extends object> extends HTMLElement {
  #initialized = false;
  #columnHeaders: TableData<T>["columns"] = [];
  #header: HTMLElement | null = null;

  #table!: HTMLTableElement;
  #tableBody!: HTMLElement;

  connectedCallback() {
    if (!this.#initialized) {
      this.classList.add("table-list");
      const table = document.createElement("table");
      this.append(table);
      this.#table = table;
    }
  }

  #renderHeader(data: TableData<T>) {
    const colGroup = document.createElement("colgroup");
    const tHead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const tbody = document.createElement("tbody");

    for (let i = 0, l = this.#columnHeaders.length; i < l; i++) {
      const column = this.#columnHeaders[i];

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
        button.classList.add("table-sort-button");
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
          this.#events.dispatch(
            { key: column.key as string },
            { bubbles: true },
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

    this.#header = tHead;
    this.#tableBody = tbody;
    this.#header.append(headerRow);
    this.#table.replaceChildren(colGroup, this.#header, this.#tableBody);
  }

  // Renders the data row for the table
  #renderRows(data: TableData<T>) {
    const rows = data.rows;
    const frag = document.createDocumentFragment();

    for (let i = 0, l = rows.length; i < l; i++) {
      const row = rows[i];
      const tr = document.createElement("tr");

      const children = this.#columnHeaders.map((col) => {
        const td = document.createElement("td");

        if (col === "checkbox") {
          const checkbox = document.createElement("check-box") as Checkbox;
          td.append(checkbox);
          td.classList.add("shrink");
        }
        //
        else if (col === "options") {
          const button = document.createElement(
            "dropdown-menu",
          ) as DropdownMenu;
          button.icon = "dotsHorizontal";
          button.toggleAttribute("hide-trailing-chevron");
          button.classList.add("options");
          button.items = data.rowActions ?? [];
          td.append(button);
          td.classList.add("shrink");
        }
        //
        else {
          const value = row[col.key];

          if (col.prominence === "background") {
            const text = document.createElement("span");
            text.textContent = col.formatter?.(value, row) ?? String(value);
            text.style.backgroundColor =
              col.color?.(row) ?? "var(--syncing-dark)";
            text.style.color = "var(--inverse-text)";
            td.append(text);
          } else {
            td.textContent = col.formatter?.(value, row) ?? String(value);
            td.style.textAlign = col.textAlign ?? "left";
            td.style.fontWeight = col.prominence === "bold" ? "500" : "400";
            td.style.color = col.color?.(row) ?? "var(--text)";
          }
        }

        return td;
      });

      tr.replaceChildren(...children);
      frag.append(tr);
    }

    this.#tableBody.replaceChildren(frag);
  }

  disconnectedCallback() {}

  set data(data: TableData<T>) {
    this.#columnHeaders = data.columns;

    this.#renderHeader(data);
    this.#renderRows(data);
  }

  #events = createEventHandler("table-sort-request", this);
}

customElements.define("table-root", Table);
customElements.define("table-controller", TableController);
customElements.define("table-footer", TableFooter);
customElements.define("table-list", TableList);
