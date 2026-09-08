import type { BudgetEntity } from "../api/budget-api";
import type { StagedImportRow } from "./import-runtime";

export interface VendorReviewGroup {
  key: string;
  sourceDescription: string;
  rows: StagedImportRow[];
}

export interface GroupSelectionState {
  value: string;
  mixed: boolean;
}

export interface BudgetImportSummary {
  readyCount: number;
  excludedCount: number;
  groupCount: number;
  netBalance: number;
}

const BLANK_VENDOR_KEY = "__BLANK_VENDOR_DESCRIPTION__";

/** Groups budget rows by normalized source vendor while preserving CSV order. */
export function groupBudgetRows(rows: StagedImportRow[]): VendorReviewGroup[] {
  const groups = new Map<string, VendorReviewGroup>();

  rows.forEach((row) => {
    const key = row.normalizedVendorDescription || BLANK_VENDOR_KEY;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      return;
    }
    groups.set(key, {
      key,
      sourceDescription:
        String(row.vendorDescription || "").trim() || "No vendor description",
      rows: [row],
    });
  });

  return [...groups.values()];
}

/** Returns the common value for a group, or a mixed-state marker. */
export function groupSelectionState(
  rows: StagedImportRow[],
  field: "categoryId" | "personId",
): GroupSelectionState {
  const values = new Set(rows.map((row) => String(row[field] || "")));
  return values.size === 1
    ? { value: [...values][0] || "", mixed: false }
    : { value: "", mixed: true };
}

/** Finds the reusable vendor name currently applied to a group. */
export function groupVendorName(
  group: VendorReviewGroup,
  vendors: BudgetEntity[],
): string {
  const ids = [
    ...new Set(
      group.rows.map((row) => String(row.vendorId || "")).filter(Boolean),
    ),
  ];
  if (ids.length !== 1) return "";
  return vendors.find((vendor) => String(vendor.id) === ids[0])?.name || "";
}

/** Resolves a typed group name against current vendors before staging a draft. */
export function resolveGroupVendor(
  name: string,
  vendors: BudgetEntity[],
  normalize: (value: unknown) => string,
  createVendor: (name: string) => BudgetEntity,
): BudgetEntity | undefined {
  const cleanName = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  const normalized = normalize(cleanName);
  if (!normalized) return undefined;
  return (
    vendors.find((vendor) => normalize(vendor.name) === normalized) ||
    createVendor(cleanName)
  );
}

/** Returns whether included, unqueued rows block forward group navigation. */
export function groupHasBlockingErrors(group: VendorReviewGroup): boolean {
  return group.rows.some(
    (row) => row.include && !row.queued && row.errors.length > 0,
  );
}

/** Applies one selection to every row in a vendor group. */
export function applyGroupSelection(
  group: VendorReviewGroup,
  field: "categoryId" | "personId",
  value: string,
): void {
  group.rows.forEach((row) => {
    row[field] = value;
  });
}

/** Calculates the balance effect used by the transaction ledger. */
export function transactionBalanceEffect(row: StagedImportRow): number {
  const amount = Number(row.amount);
  if (!Number.isFinite(amount)) return 0;
  if (row.accountId) {
    if (row.accountType === "investment")
      return row.source === "deduction" ? amount : 0;
    if (amount < 0) return 0;
    return row.source === "deduction" ? 0 : -amount;
  }
  return row.type === "income" ? amount : -amount;
}

/** Builds the final import totals from validated staged rows. */
export function summarizeBudgetImport(
  rows: StagedImportRow[],
  groupCount: number,
): BudgetImportSummary {
  const ready = rows.filter(
    (row) => row.include && !row.queued && row.errors.length === 0,
  );
  return {
    readyCount: ready.length,
    excludedCount: rows.filter((row) => !row.include).length,
    groupCount,
    netBalance: ready.reduce(
      (total, row) => total + transactionBalanceEffect(row),
      0,
    ),
  };
}

/** Returns each group's proportional share of all staged transactions. */
export function vendorGroupProgress(groups: VendorReviewGroup[]): number[] {
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return groups.map((group) => (total ? (group.rows.length / total) * 100 : 0));
}
