import type { Account, AccountActivity, AccountBalance, AccountMonth } from "./account-api";
export type InvestmentSource = "manual" | "paycheck";
export type InvestmentAccount = Account & { type?: "investment"; source: InvestmentSource };
export type InvestmentBalance = AccountBalance;
export type InvestmentContribution = AccountActivity & { activityType?: "contribution"; flowType: "external" | "transfer" };
export type InvestmentMonth = AccountMonth & { contributions: InvestmentContribution[] };
