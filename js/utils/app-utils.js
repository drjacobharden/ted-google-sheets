/**
 * The app utils script exposes functions that get used repeatedly across the app so that refactoring is cleaner.
 *
 * It can be accessed via using window.AppUtils.[key]
 */

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromISODate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[char],
  );
}

const money = (value) => currency.format(Number(value) || 0);

const monthOffset = (month, offset) => {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const netFlows = (items) => {
  if (items[0] && "amount" in items[0]) {
    return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  } else {
    return 0;
  }
};

window.AppUtils = {
  // Converts special characters in markup to HTML safe versions that will show as plain text on screen.
  escapeHTML,
  // Formats plain numbers to currency
  money,
  // Shifts a date range by x number of months
  monthOffset,
  // Sums up the amounts from a list of either transactions or investments
  netFlows,
  // Handle conversions to and from ISO dates
  toISODate,
  fromISODate,
};
