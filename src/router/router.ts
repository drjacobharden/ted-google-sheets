import { Breadcrumbs } from "../components/breadcrumbs/breadcrumbs";
import { RouteChangedEvent, RouterConfig } from "./types";

const ROUTER_CONFIG: RouterConfig = {
  dashboard: {
    section: "Budget",
    template: "route-dashboard",
  },

  categories: {
    section: "Budget",
    template: "route-categories",
  },

  vendors: {
    section: "Budget",
    template: "route-vendors",
  },

  people: {
    section: "Budget",
    template: "route-people",
  },

  import: {
    section: "Utilities",
    template: "route-import",
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
  },

  "entity-archive": {
    section: "Budget",
    template: "route-entity-archive",
  },

  settings: {
    section: "Utilities",
    template: "route-settings",
  },

  "investment-overview": {
    section: "Investments",
    template: "route-investment-overview",
  },

  "investment-accounts": {
    section: "Investments",
    template: "route-investment-accounts",
  },

  "investment-account-detail": {
    section: "Investments",
    template: "route-investment-account-detail",
  },

  sync: {
    section: "Utilities",
    template: "route-sync",
  },
};
