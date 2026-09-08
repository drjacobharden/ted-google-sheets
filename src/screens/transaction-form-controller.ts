import type {
  ActivitySource,
  BudgetTransactionInput,
} from "../api/budget-api";

export type TransactionEntryKind = "expense" | "income" | "account";

export interface TransactionDraftValues {
  id?: string;
  kind: TransactionEntryKind;
  amount: number | string;
  date: string;
  categoryId?: string;
  vendorId?: string;
  assignmentId?: string;
  accountId?: string;
  notes?: string;
  source?: ActivitySource | string;
}

/** Shared state and draft normalization for transaction creation surfaces. */
export class TransactionFormController {
  kind: TransactionEntryKind = "expense";

  setKind(value: string): TransactionEntryKind {
    this.kind = value === "income" || value === "account" ? value : "expense";
    return this.kind;
  }

  reset(): void {
    this.kind = "expense";
  }

  buildDraft(values: TransactionDraftValues): BudgetTransactionInput {
    const kind = this.setKind(values.kind);
    const isAccount = kind === "account";
    const numericAmount = Number(values.amount);

    return {
      ...(values.id ? { id: values.id } : {}),
      type: isAccount ? undefined : kind,
      amount: numericAmount,
      date: values.date,
      categoryId: isAccount ? "" : values.categoryId || "",
      vendorId: isAccount ? "" : values.vendorId || "",
      assignmentId: isAccount ? "" : values.assignmentId || "",
      accountId: isAccount ? values.accountId || "" : "",
      notes: String(values.notes || "").trim(),
      source: values.source === "deduction" ? "deduction" : "manual",
    };
  }

}
