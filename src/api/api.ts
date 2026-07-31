import {
  BudgetAPI,
  type BudgetAPIContract,
} from "./budget-api";
import {
  ImportAPI,
  type ImportAPIContract,
} from "./import-api";
import {
  InvestmentAPI,
  type InvestmentAPIContract,
} from "./investment-api";

export interface AppAPIs {
  budget: BudgetAPIContract;
  investment: InvestmentAPIContract;
  imports: ImportAPIContract;
}

export const APIs: AppAPIs = (() => {
  const budget = BudgetAPI();
  window.BudgetAPI = budget;

  const investment = InvestmentAPI();
  window.InvestmentAPI = investment;

  const imports = ImportAPI();
  window.ImportAPI = imports;

  return { budget, investment, imports };
})();
