import type { AccountType } from "../../api/account-api";

export type PaymentKind = "expense" | "income" | "account";
export type PaymentTypeKey = "positive" | "negative" | "balance";

export function paymentTypeOptions(
  kind: PaymentKind,
  accountType: AccountType | null = null,
): readonly string[] {
  if (kind === "income") return ["Deposit", "Reversal"];
  if (kind === "account") {
    if (accountType === "investment") return ["Contribution", "Withdrawal", "Balance"];
    if (accountType === "debt") return ["Payment", "New Borrowing", "Balance"];
    return ["Account Activity", "Reversal", "Balance"];
  }
  return ["Payment", "Refund"];
}

export function paymentTypeKeyForAmount(
  amount: number | string,
): PaymentTypeKey {
  return Number(amount) < 0 ? "negative" : "positive";
}

/** Applies the selected semantic direction to a positive displayed magnitude. */
export function amountForPaymentType(
  amount: number | string,
  paymentType: PaymentTypeKey,
): number {
  const magnitude = Math.abs(Number(amount));
  return paymentType === "negative" ? -magnitude : magnitude;
}
