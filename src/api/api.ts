import { BudgetAPI, configureBudgetIntegrations, type BudgetAPIContract, type SyncItem } from "./budget-api";
import { ImportAPI, type ImportAPIContract } from "./import-api";
import { AccountAPI, type AccountAPIContract } from "./account-api";

export interface AppAPIs {
  budget: BudgetAPIContract;
  accounts: AccountAPIContract;
  imports: ImportAPIContract;
  getSyncItems(): SyncItem[];
}

const budget = BudgetAPI();
const accounts = AccountAPI(budget);
const imports = ImportAPI(budget);
configureBudgetIntegrations({ accounts, imports });

export const APIs: AppAPIs = {
  budget, accounts, imports,
  getSyncItems: () => [...budget.getSyncItems(), ...accounts.getSyncItems()],
};
