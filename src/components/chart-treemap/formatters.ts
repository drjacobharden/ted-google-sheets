const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const percentage = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

/** Formats a treemap amount as a readable whole-dollar currency value. */
export function formatTreemapCurrency(value: number): string {
  return currency.format(Number.isFinite(value) ? value : 0);
}

/** Formats a treemap amount using a lowercase compact unit when useful. */
export function formatTreemapCompactCurrency(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(amount);
  const units: Array<[number, string]> = [
    [1_000_000_000_000, "t"],
    [1_000_000_000, "b"],
    [1_000_000, "m"],
    [1_000, "k"],
  ];
  const unit = units.find(([threshold]) => absolute >= threshold);
  if (!unit) return formatTreemapCurrency(amount);

  const sign = amount < 0 ? "−" : "";
  return `${sign}$${compactNumber.format(absolute / unit[0])}${unit[1]}`;
}

/** Formats a percentage already expressed on a 0–100 scale. */
export function formatTreemapPercentage(value: number): string {
  return `${percentage.format(Number.isFinite(value) ? value : 0)}%`;
}
