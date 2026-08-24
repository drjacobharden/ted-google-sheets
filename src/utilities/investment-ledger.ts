import { APIs } from "../api/api";
import { buildInvestmentLedgerRows } from "./investment-ledger-core";
import type { InvestmentLedgerRow } from "./investment-ledger-core";
export type { InvestmentLedgerRow, InvestmentLedgerType } from "./investment-ledger-core";
export function investmentLedgerRows():InvestmentLedgerRow[]{return buildInvestmentLedgerRows(APIs.investment.accounts(),APIs.investment.contributions(),APIs.debt.accounts(),APIs.debt.payments());}
