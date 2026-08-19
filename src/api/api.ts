import { BudgetAPI, configureBudgetIntegrations, type BudgetAPIContract, type SyncItem } from "./budget-api";
import { ImportAPI, type ImportAPIContract } from "./import-api";
import { InvestmentAPI, type InvestmentAPIContract } from "./investment-api";

export interface AppAPIs {
  budget: BudgetAPIContract;
  investment: InvestmentAPIContract;
  imports: ImportAPIContract;
  getSyncItems(): SyncItem[];
}

const budget = BudgetAPI();
const investment = InvestmentAPI(budget);
const imports = ImportAPI(budget);
configureBudgetIntegrations({ investment, imports });

export const APIs: AppAPIs = {
  budget, investment, imports,
  getSyncItems: () => [...budget.getSyncItems(), ...investment.getSyncItems()],
};
