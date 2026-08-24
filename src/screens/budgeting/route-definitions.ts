import type { IconKeys } from "../../icons";
import type { BudgetingContext } from "../../state/app-state";
import type { BudgetingRouteName, RouteParams } from "../../router/types";

export interface HeaderAction {
  id: string;
  label?: string;
  icon: IconKeys;
  kind: "primary" | "secondary";
}

export interface BudgetingHeaderConfig {
  actions: HeaderAction[];
}

export interface BudgetingRouteDefinition {
  route: BudgetingRouteName;
  contentKey: "overview" | "transactions" | "categories" | "vendors" | "people";
  title: string;
  icon: IconKeys;
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
    "entity-detail" | "entity-archive"
  >,
  BudgetingRouteDefinition
> = {
  "budget-overview": {
    route: "budget-overview",
    contentKey: "overview",
    title: "Overview",
    icon: "dashboard",
    getHeaderConfig: () => ({
      actions: [IMPORT_TRANSACTIONS, NEW_TRANSACTION],
    }),
  },
  transactions: {
    route: "transactions",
    contentKey: "transactions",
    title: "Transactions",
    icon: "transactions",
    getHeaderConfig: () => ({
      actions: [IMPORT_TRANSACTIONS, NEW_TRANSACTION],
    }),
  },
  categories: {
    route: "categories",
    contentKey: "categories",
    title: "Categories",
    icon: "label",
    getHeaderConfig: () => ({
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
  vendors: {
    route: "vendors",
    contentKey: "vendors",
    title: "Vendors",
    icon: "cart",
    getHeaderConfig: () => ({
      actions: [
        {
          id: "new-vendor",
          label: "Add vendor",
          icon: "plus",
          kind: "primary",
        },
      ],
    }),
  },
  people: {
    route: "people",
    contentKey: "people",
    title: "People",
    icon: "people",
    getHeaderConfig: () => ({
      actions: [
        {
          id: "new-person",
          label: "Add person",
          icon: "plus",
          kind: "primary",
        },
      ],
    }),
  },
};

function entityCollection(kind: string | undefined): {
  route: "categories" | "vendors" | "people";
  contentKey: "categories" | "vendors" | "people";
  title: string;
  icon: IconKeys;
} {
  if (kind === "vendor") {
    return {
      route: "vendors",
      contentKey: "vendors",
      title: "Vendors",
      icon: "cart",
    };
  }
  if (kind === "assignment") {
    return {
      route: "people",
      contentKey: "people",
      title: "People",
      icon: "people",
    };
  }
  return {
    route: "categories",
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
  if (route === "entity-archive") {
    return {
      ...collection,
      route,
      getHeaderConfig: () => ({
        actions: [],
      }),
    };
  }

  return {
    ...collection,
    route,
    getHeaderConfig: () => {
      const kind =
        params.kind === "vendor" || params.kind === "assignment"
          ? params.kind
          : "category";
      const label =
        kind === "assignment"
          ? "person"
          : kind === "vendor"
            ? "vendor"
            : "category";
      return {
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
