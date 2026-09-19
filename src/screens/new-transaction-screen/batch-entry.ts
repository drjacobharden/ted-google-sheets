export function amountForNewBatchDate(
  selectedDates: readonly string[],
  amounts: ReadonlyMap<string, string>,
  fallback: string,
): string {
  return amounts.get(selectedDates.at(-1) || "") || fallback;
}

export function latestDatePerMonth(dates: readonly string[]): {
  kept: string[];
  dropped: string[];
} {
  const latest = new Map<string, string>();
  for (const date of dates) {
    const month = date.slice(0, 7);
    if (!latest.has(month) || date > latest.get(month)!) latest.set(month, date);
  }
  const kept = dates.filter((date) => latest.get(date.slice(0, 7)) === date);
  const keptDates = new Set(kept);
  return { kept, dropped: dates.filter((date) => !keptDates.has(date)) };
}
