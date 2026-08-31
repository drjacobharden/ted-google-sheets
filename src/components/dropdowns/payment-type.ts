import type { AccountType } from "../../api/account-api";

export type PaymentKind = "expense" | "income" | "account";
export type PaymentTypeKey = "positive" | "negative";

export function paymentTypeOptions(
  kind: PaymentKind,
  accountType: AccountType | null = null,
): readonly [string, string] {
  if (kind === "income") return ["Deposit", "Refund"];
  if (kind === "account") {
    if (accountType === "investment") return ["Contribution", "Withdrawal"];
    if (accountType === "debt") return ["Payment", "New Borrowing"];
    return ["Account Activity", "Reversal"];
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
