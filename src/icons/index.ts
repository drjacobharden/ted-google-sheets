import dashboardIcon from "./dashboard.html" with { type: "text" };
import transcationsIcon from "./transactions.html" with { type: "text" };
import categoryIcon from "./category.html" with { type: "text" };
import vendorIcon from "./vendors.html" with { type: "text" };
import peopleIcon from "./people.html" with { type: "text" };
import investmentIcon from "./investments.html" with { type: "text" };
import accountsIcon from "./accounts.html" with { type: "text" };
import plusIcon from "./plus.html" with { type: "text" };
import importIcon from "./import.html" with { type: "text" };
import syncIcon from "./sync.html" with { type: "text" };
import settingsIcon from "./settings.html" with { type: "text" };

export const Icons: Record<string, string> = {
  dashboard: dashboardIcon,
  transactions: transcationsIcon,
  category: categoryIcon,
  vendors: vendorIcon,
  people: peopleIcon,
  investments: investmentIcon,
  accounts: accountsIcon,
  plus: plusIcon,
  import: importIcon,
  sync: syncIcon,
  settings: settingsIcon,
};
