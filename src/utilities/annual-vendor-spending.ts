import type { Account } from "../api/account-api";
import type { BudgetEntity, BudgetTransaction } from "../api/budget-api";
import { ledgerVendorLabel, reportingTransactions } from "./activity-effects";

export interface VendorSpendingDatum {
  id: string;
  label: string;
  amount: number;
  previousAmount?: number | null;
  chartValue?: number;
  isInterval?: boolean;
  vendorCount?: number;
}

export interface VendorPieDatum {
  id: string;
  label: string;
  amount: number;
  isOther?: boolean;
}

interface VendorAmountInterval {
  id: string;
  label: string;
  maximum: number;
}

const VENDOR_AMOUNT_INTERVALS: VendorAmountInterval[] = [
  { id: "vendor-100-or-less", label: "$100 or less", maximum: 100 },
  { id: "vendor-100-to-500", label: "$100 - $500", maximum: 500 },
  { id: "vendor-500-to-1000", label: "$500 - $1000", maximum: 1_000 },
  { id: "vendor-1000-to-5000", label: "$1000 - $5000", maximum: 5_000 },
  { id: "vendor-5000-to-10000", label: "$5000 - $10,000", maximum: 10_000 },
  {
    id: "vendor-over-10000",
    label: "Over $10,000",
    maximum: Number.POSITIVE_INFINITY,
  },
];

/** Keeps vendors covering the first 75% of spend and groups the remaining tail by amount. */
export function collapseVendorSpending(
  vendors: ReadonlyArray<VendorSpendingDatum>,
): VendorSpendingDatum[] {
  const ranked = vendors
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0)
    .slice()
    .sort(
      (left, right) =>
        right.amount - left.amount || left.label.localeCompare(right.label),
    );
  const total = ranked.reduce((sum, item) => sum + item.amount, 0);
  if (!ranked.length || total <= 0) return ranked;

  let topCount = 0;
  let topTotal = 0;
  while (topCount < ranked.length && topTotal < total * 0.75) {
    topTotal += ranked[topCount]?.amount ?? 0;
    topCount += 1;
  }

  const grouped = new Map<string, VendorSpendingDatum>();
  for (const item of ranked.slice(topCount)) {
    const interval = VENDOR_AMOUNT_INTERVALS.find(
      (candidate) => item.amount <= candidate.maximum,
    );
    if (!interval) continue;
    const current = grouped.get(interval.id);
    if (current) {
      current.amount += item.amount;
      current.previousAmount =
        (current.previousAmount ?? 0) + (item.previousAmount ?? 0);
      current.vendorCount = (current.vendorCount ?? 0) + 1;
    } else {
      grouped.set(interval.id, {
        id: interval.id,
        label: interval.label,
        amount: item.amount,
        chartValue: Number.isFinite(interval.maximum)
          ? interval.maximum
          : item.amount,
        isInterval: true,
        vendorCount: 1,
        previousAmount: item.previousAmount ?? 0,
      });
    }
  }

  return [
    ...ranked.slice(0, topCount),
    ...VENDOR_AMOUNT_INTERVALS.map((interval) => {
      const item = grouped.get(interval.id);
      if (!item) return undefined;
      const countLabel = item.vendorCount === 1 ? "vendor" : "vendors";
      return {
        ...item,
        label: `${item.vendorCount} ${countLabel} w/ ${interval.label}`,
      };
    }).filter((item): item is VendorSpendingDatum => Boolean(item)),
  ];
}

/** Keeps the ranked vendors covering at least three quarters of spend and groups the rest. */
export function splitVendorSpendingForPie(
  vendors: ReadonlyArray<VendorSpendingDatum>,
): VendorPieDatum[] {
  const ranked = vendors
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0)
    .slice()
    .sort((left, right) => right.amount - left.amount);
  const total = ranked.reduce((sum, item) => sum + item.amount, 0);
  if (total <= 0) return [];

  let topCount = 0;
  let topTotal = 0;
  while (topCount < ranked.length && topTotal < total * 0.75) {
    topTotal += ranked[topCount]?.amount ?? 0;
    topCount += 1;
  }

  const topVendors = ranked.slice(0, topCount).map(({ id, label, amount }) => ({
    id,
    label,
    amount,
  }));
  const otherVendors = ranked.slice(topCount);
  if (!otherVendors.length) return topVendors;

  return [
    ...topVendors,
    {
      id: "all-other-vendors",
      label: "All other vendors",
      amount: otherVendors.reduce((sum, item) => sum + item.amount, 0),
      isOther: true,
    },
  ];
}

function transactionYear(value: string): number | null {
  const match = String(value).match(
    /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? year
    : null;
}

/** Builds all selected-year expense totals grouped by vendor. */
export function buildAnnualVendorSpending(
  transactions: ReadonlyArray<BudgetTransaction>,
  accounts: ReadonlyArray<Account>,
  vendors: ReadonlyArray<BudgetEntity>,
  year: number,
): VendorSpendingDatum[] {
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const totals = new Map<string, VendorSpendingDatum>();
  const previousTotals = new Map<string, number>();

  for (const transaction of reportingTransactions(transactions, accounts)) {
    if (transaction.type !== "expense") continue;

    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount)) continue;
    const transactionYearValue = transactionYear(transaction.date);
    if (transactionYearValue !== year && transactionYearValue !== year - 1)
      continue;

    const vendorId = String(transaction.vendorId || "").trim();
    const transactionLabel = ledgerVendorLabel(transaction);
    const label =
      vendorById.get(vendorId)?.name?.trim() ||
      transactionLabel ||
      "Unassigned vendor";
    const id =
      vendorId ||
      (transactionLabel
        ? `vendor:${transactionLabel.trim().toLocaleLowerCase()}`
        : "unassigned-vendor");

    if (transactionYearValue === year - 1) {
      previousTotals.set(id, (previousTotals.get(id) ?? 0) + amount);
      continue;
    }

    const current = totals.get(id);
    if (current) {
      current.amount += amount;
    } else {
      totals.set(id, { id, label, amount });
    }
  }

  return [...totals.values()]
    .map((item) => ({
      ...item,
      previousAmount: previousTotals.get(item.id) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.amount - left.amount ||
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id),
    );
}
