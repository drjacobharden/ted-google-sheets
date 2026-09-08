export type PayeeKind = "vendor" | "account";

export interface PayeeOption {
  id: string;
  name: string;
  kind: PayeeKind;
  group: "Vendors" | "Investments" | "Debts";
  record: any;
}

export function payeeKey(kind: PayeeKind, id: string): string {
  return id ? `${kind}:${id}` : "";
}

export function parsePayeeKey(value: unknown): { kind: PayeeKind; id: string } | null {
  const match = String(value || "").match(/^(vendor|account):(.+)$/);
  return match ? { kind: match[1] as PayeeKind, id: match[2] } : null;
}

export function payeeOptions(vendors: readonly any[], accounts: readonly any[]): PayeeOption[] {
  const byName = (left: PayeeOption, right: PayeeOption) =>
    left.name.localeCompare(right.name, "en-US", { numeric: true, sensitivity: "base" });
  const vendorOptions = vendors
    .filter((item) => item.active !== false)
    .map((record) => ({ id: String(record.id), name: String(record.name), kind: "vendor", group: "Vendors", record }) as PayeeOption)
    .sort(byName);
  const investmentOptions = accounts
    .filter((item) => item.active !== false && item.type === "investment")
    .map((record) => ({ id: String(record.id), name: String(record.name), kind: "account", group: "Investments", record }) as PayeeOption)
    .sort(byName);
  const debtOptions = accounts
    .filter((item) => item.active !== false && item.type === "debt")
    .map((record) => ({ id: String(record.id), name: String(record.name), kind: "account", group: "Debts", record }) as PayeeOption)
    .sort(byName);
  return [...vendorOptions, ...investmentOptions, ...debtOptions];
}
