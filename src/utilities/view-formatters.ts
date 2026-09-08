const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const currencyNoCentsFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Escapes a value before it is interpolated into HTML markup. */
export function escapeHTML(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

/** Formats an unknown numeric value as US currency. */
export function money(value: unknown, showCents = true): string {
  const amount = Number(value);

  if (!showCents) {
    return currencyNoCentsFormatter.format(
      Number.isFinite(amount) ? amount : 0,
    );
  }

  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

/** Formats summary currency as whole dollars, retaining cents only below $1. */
export function summaryMoney(value: unknown): string {
  const amount = Number(value);
  return money(amount, Number.isFinite(amount) && Math.abs(amount) < 1);
}

/** Sums the amount fields in a collection of cash-flow records. */
export function netFlows(items: ReadonlyArray<{ amount?: number }>): number {
  return items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}

/** Returns a readable message for an unknown thrown value. */
export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
