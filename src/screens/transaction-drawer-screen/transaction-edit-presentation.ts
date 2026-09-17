import type { AccountType } from "../../api/account-api";
import {
  amountForPaymentType,
  paymentTypeKeyForAmount,
  paymentTypeOptions,
  type PaymentTypeKey,
} from "../../components/dropdowns/payment-type";

export type TransactionEditKind = "expense" | "income" | "account";
export { amountForPaymentType };
export type { PaymentTypeKey };

export interface TransactionEditPresentation {
  title: "Edit Expense" | "Edit Income" | "Edit Account Activity";
  paymentType: string;
  paymentTypeKey: PaymentTypeKey;
  paymentTypeOptions: readonly string[];
}

/** Derives the fixed edit context and signed activity label shown in the drawer. */
export function transactionEditPresentation(
  kind: TransactionEditKind,
  amount: number | string,
  accountType: AccountType | null = null,
): TransactionEditPresentation {
  const paymentTypeKey = paymentTypeKeyForAmount(amount);
  const negative = paymentTypeKey === "negative";

  if (kind === "income") {
    return {
      title: "Edit Income",
      paymentType: negative ? "Reversal" : "Deposit",
      paymentTypeKey,
      paymentTypeOptions: paymentTypeOptions("income"),
    };
  }

  if (kind === "account") {
    const options = paymentTypeOptions(kind, accountType);
    return {
      title: "Edit Account Activity",
      paymentType: options[negative ? 1 : 0],
      paymentTypeKey,
      paymentTypeOptions: options,
    };
  }

  return {
    title: "Edit Expense",
    paymentType: negative ? "Refund" : "Payment",
    paymentTypeKey,
    paymentTypeOptions: ["Payment", "Refund"],
  };
}
