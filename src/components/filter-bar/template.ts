export const filterBarTemplate = `
  <custom-button
    class="secondary-button filter-bar__trigger"
    data-filter-action="toggle"
    label="Filters"
    leading-icon="filter"
    aria-haspopup="dialog"
    aria-expanded="false"
  ></custom-button>
  <pop-over
    class="filter-bar__popover"
    role="dialog"
    aria-label="Filters"
  ></pop-over>
`;
