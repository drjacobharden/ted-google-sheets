import type { IconKeys } from "../../icons";
import { APIs } from "../../api/api";
import type { BudgetingContext } from "../../state/app-state";
import type { BudgetingRouteName, RouteParams } from "../../router/types";

export interface BreadcrumbItem {
  title: string;
  route?: BudgetingRouteName;
  params?: RouteParams;
}

export interface HeaderAction {
  id: string;
  label?: string;
  icon: IconKeys;
  kind: "primary" | "secondary";
}

export interface BudgetingHeaderConfig {
  breadcrumbs: BreadcrumbItem[];
  actions: HeaderAction[];
}

export interface BudgetingRouteDefinition {
  route: BudgetingRouteName;
  contentKey: "overview" | "transactions" | "categories" | "vendors" | "people";
  title: string;
  icon: IconKeys;
  componentTag: string;
  getHeaderConfig(
    context: BudgetingContext,
    params: RouteParams,
  ): BudgetingHeaderConfig;
}

const NEW_TRANSACTION: HeaderAction = {
  id: "new-transaction",
  label: "Add transaction",
  icon: "plus",
  kind: "primary",
};

const IMPORT_TRANSACTIONS: HeaderAction = {
  id: "open-import",
  icon: "import",
  kind: "secondary",
};

const BASE_DEFINITIONS: Record<
  Exclude<
    BudgetingRouteName,
    "budgeting/entity-detail" | "budgeting/entity-archive"
  >,
  BudgetingRouteDefinition
> = {
  "budgeting/overview": {
    route: "budgeting/overview",
    contentKey: "overview",
    title: "Overview",
    icon: "dashboard",
    componentTag: "budget-overview-screen",
    getHeaderConfig: () => ({
      breadcrumbs: [],
      actions: [IMPORT_TRANSACTIONS, NEW_TRANSACTION],
    }),
  },
  "budgeting/transactions": {
    route: "budgeting/transactions",
    contentKey: "transactions",
    title: "Transactions",
    icon: "transactions",
    componentTag: "transaction-list-screen",
    getHeaderConfig: () => ({
      breadcrumbs: [],
      actions: [IMPORT_TRANSACTIONS, NEW_TRANSACTION],
    }),
  },
  "budgeting/categories": {
    route: "budgeting/categories",
    contentKey: "categories",
    title: "Categories",
    icon: "label",
    componentTag: "category-screen",
    getHeaderConfig: () => ({
      breadcrumbs: [],
      actions: [
        {
          id: "new-category",
          label: "Add category",
          icon: "plus",
          kind: "primary",
        },
      ],
    }),
  },
  "budgeting/vendors": {
    route: "budgeting/vendors",
    contentKey: "vendors",
    title: "Vendors",
    icon: "cart",
    componentTag: "vendors-screen",
    getHeaderConfig: () => ({
      breadcrumbs: [],
      actions: [
        {
          id: "focus-vendor-form",
          label: "Add vendor",
          icon: "plus",
          kind: "primary",
        },
      ],
    }),
  },
  "budgeting/people": {
    route: "budgeting/people",
    contentKey: "people",
    title: "People",
    icon: "people",
    componentTag: "people-screen",
    getHeaderConfig: () => ({
      breadcrumbs: [],
      actions: [
        {
          id: "focus-person-form",
          label: "Add person",
          icon: "plus",
          kind: "primary",
        },
      ],
    }),
  },
};

function entityCollection(kind: string | undefined): {
  route: "budgeting/categories" | "budgeting/vendors" | "budgeting/people";
  contentKey: "categories" | "vendors" | "people";
  title: string;
  icon: IconKeys;
} {
  if (kind === "vendor") {
    return {
      route: "budgeting/vendors",
      contentKey: "vendors",
      title: "Vendors",
      icon: "cart",
    };
  }
  if (kind === "assignment") {
    return {
      route: "budgeting/people",
      contentKey: "people",
      title: "People",
      icon: "people",
    };
  }
  return {
    route: "budgeting/categories",
    contentKey: "categories",
    title: "Categories",
    icon: "label",
  };
}

export function getBudgetingRouteDefinition(
  route: BudgetingRouteName,
  params: RouteParams,
): BudgetingRouteDefinition {
  if (route in BASE_DEFINITIONS) {
    return BASE_DEFINITIONS[route as keyof typeof BASE_DEFINITIONS];
  }

  const collection = entityCollection(params.kind);
  if (route === "budgeting/entity-archive") {
    return {
      ...collection,
      route,
      componentTag: "entity-archive-screen",
      getHeaderConfig: () => ({
        breadcrumbs: [{ title: "Archived" }],
        actions: [],
      }),
    };
  }

  return {
    ...collection,
    route,
    componentTag: "entity-detail-screen",
    getHeaderConfig: () => {
      const kind =
        params.kind === "vendor" || params.kind === "assignment"
          ? params.kind
          : "category";
      const entity = params.id ? APIs.budget.getEntity(kind, params.id) : null;
      const label =
        kind === "assignment"
          ? "person"
          : kind === "vendor"
            ? "vendor"
            : "category";
      return {
        breadcrumbs: [{ title: entity?.name ?? "Loading…" }],
        actions: [
          {
            id: "edit-entity",
            label: `Edit ${label}`,
            icon: "pencil",
            kind: "primary",
          },
        ],
      };
    },
  };
}

export const BUDGETING_CONTENT_ROUTES = Object.values(BASE_DEFINITIONS);
