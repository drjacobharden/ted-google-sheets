import { APIs } from "../api/api";
import { buildInvestmentLedgerRows } from "./investment-ledger-core";
import type { InvestmentLedgerRow } from "./investment-ledger-core";

export type {
  InvestmentLedgerRow,
  InvestmentLedgerType,
} from "./investment-ledger-core";

export function investmentLedgerRows(): InvestmentLedgerRow[] {
  const accounts = APIs.accounts.accounts();
  return buildInvestmentLedgerRows(accounts, APIs.accounts.activity());
}
