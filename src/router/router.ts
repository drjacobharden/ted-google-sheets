import { Breadcrumbs } from "../components/breadcrumbs/breadcrumbs";
import { RouteChangedEvent, RouterConfig } from "./types";

const ROUTER_CONFIG: RouterConfig = {
  dashboard: {
    section: "Budget",
    template: "route-dashboard",
    script: "js/routes/dashboard.js",
    module: () => window.DashboardRoute,
  },

  categories: {
    section: "Budget",
    template: "route-categories",
    script: "js/routes/categories.js",
    module: () => window.CategoryRoute,
  },

  vendors: {
    section: "Budget",
    template: "route-vendors",
    script: "js/routes/vendors.js",
    module: () => window.VendorRoute,
  },

  people: {
    section: "Budget",
    template: "route-people",
    script: "js/routes/people.js",
    module: () => window.PeopleRoute,
  },

  import: {
    section: "Utilities",
    template: "route-import",
    script: "js/routes/import.js",
    module: () => window.ImportRoute,
  },

  transactions: {
    section: "Budget",
    template: "route-transactions",
    script: "js/routes/transactions.js",
    module: () => window.TransactionsRoute,
  },

  "entity-detail": {
    section: "Budget",
    template: "route-entity-detail",
    script: "js/routes/entity-detail.js",
    module: () => window.EntityRoute,
  },

  "entity-archive": {
    section: "Budget",
    template: "route-entity-archive",
    script: "js/routes/entity-archive.js",
    module: () => window.EntityArchiveRoute,
  },

  settings: {
    section: "Utilities",
    template: "route-settings",
    script: "js/routes/settings.js",
    module: () => window.SettingsRoute,
  },

  "investment-overview": {
    section: "Investments",
    template: "route-investment-overview",
    script: "js/routes/investment-overview.js",
    module: () => window.InvestmentOverviewRoute,
  },

  "investment-accounts": {
    section: "Investments",
    template: "route-investment-accounts",
    script: "js/routes/investment-accounts.js",
    module: () => window.InvestmentAccountsRoute,
  },

  "investment-account-detail": {
    section: "Investments",
    template: "route-investment-account-detail",
    script: "js/routes/investment-account-detail.js",
    module: () => window.InvestmentAccountDetailRoute,
  },

  sync: {
    section: "Utilities",
    template: "route-sync",
    script: "js/routes/sync.js",
    module: () => window.SyncRoute,
  },
};
