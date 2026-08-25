import { BudgetAPI, configureBudgetIntegrations, type BudgetAPIContract, type SyncItem } from "./budget-api";
import { ImportAPI, type ImportAPIContract } from "./import-api";
import { InvestmentAPI, type InvestmentAPIContract } from "./investment-api";
import { DebtAPI, type DebtAPIContract } from "./debt-api";
import { AccountAPI, type AccountAPIContract } from "./account-api";

export interface AppAPIs {
  budget: BudgetAPIContract;
  investment: InvestmentAPIContract;
  debt: DebtAPIContract;
  accounts: AccountAPIContract;
  imports: ImportAPIContract;
  getSyncItems(): SyncItem[];
}

const budget = BudgetAPI();
const investment = InvestmentAPI(budget);
const debt = DebtAPI(budget);
const accounts = AccountAPI(investment, debt, budget);
const imports = ImportAPI(budget);
configureBudgetIntegrations({ investment, debt, imports });

export const APIs: AppAPIs = {
  budget, accounts, investment, debt, imports,
  getSyncItems: () => [...budget.getSyncItems(), ...accounts.getSyncItems()],
};
