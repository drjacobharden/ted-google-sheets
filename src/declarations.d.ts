declare global {
  module "*.html" {
    const content: string;
    export default content;
  }

  module "*.css";

  interface Window {
    BudgetAPI: import("./api/budget-api.ts").BudgetAPIContract;
    InvestmentAPI: import("./api/investment-api.ts").InvestmentAPIContract;
    ImportAPI: import("./api/import-api.ts").ImportAPIContract;
    ImportUtils: import("./utilities/import-runtime.ts").ImportUtilities;
  }
}

export {};
