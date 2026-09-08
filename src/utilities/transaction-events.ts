/** Window events that can change the transaction read model or its sync state. */
export const TRANSACTION_DATA_EVENTS = [
  "budget:transaction-queued",
  "budget:transactions-queued",
  "budget:transaction-saved",
  "budget:transaction-restored",
  "budget:transaction-removed",
  "budget:transaction-sync-changed",
  "budget:transactions-loaded",
] as const;
