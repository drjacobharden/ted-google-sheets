/**
 *
 * This file translates between route names and URLs.
 *
 * It does not manipulate or load data in any way. Its sole responsibility is to set the
 * next hash name and dispatch an event with the route.
 *
 * Events:
 *  -   app:route-changed
 *
 * Listenters:
 *  -   hashchange
 */

(function () {
  const DEFAULT_ROUTE = "transactions";
  const loadedScripts = new Map();
  let unmountCurrentRoute = null;

  //   All available routes
  const routes = new Set([
    "dashboard",
    "transactions",
    "categories",
    "vendors",
    "people",
    "import",
    "entity-detail",
    "entity-archive",
    "sync",
    "settings",
    "investment-overview",
    "investment-accounts",
    "investment-account-detail",
  ]);

  // The names of the routes and their associated scripts and modules
  const routeConfig = {
    dashboard: {
      template: "route-dashboard",
    },

    categories: {
      template: "route-categories",
    },

    vendors: {
      template: "route-vendors",
    },

    people: {
      template: "route-people",
    },

    import: {
      template: "route-import",
    },

    transactions: {
      template: "route-transactions",
      script: "js/routes/transactions.js",
      module: () => window.TransactionsRoute,
    },

    "entity-detail": {
      template: "route-entity-detail",
    },

    "entity-archive": {
      template: "route-entity-archive",
    },

    settings: {
      template: "route-settings",
    },

    "investment-overview": {
      template: "route-investment-overview",
    },

    "investment-accounts": {
      template: "route-investment-accounts",
    },

    "investment-account-detail": {
      template: "route-investment-account-detail",
    },

    sync: {
      template: "route-sync",
    },
  };

  function loadScript(path) {
    if (loadedScripts.has(path)) {
      return loadedScripts.get(path);
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src = path;
      script.onload = resolve;
      script.onerror = () => {
        loadedScripts.delete(path);
        reject(new Error(`Could not load ${path}`));
      };

      document.head.append(script);
    });

    loadedScripts.set(path, promise);
    return promise;
  }

  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [requestedName, query = ""] = raw.split("?", 2);
    const name = routes.has(requestedName) ? requestedName : DEFAULT_ROUTE;
    const params = Object.fromEntries(new URLSearchParams(query));

    return { name, params };
  }

  // Return only the route name for callers that do not need parameters.
  let navigationGuard = null;

  function currentRoute() {
    return parseRoute().name;
  }

  function currentParams() {
    return { ...parseRoute().params };
  }

  function routeHash(name, params = {}) {
    const destination = routes.has(name) ? name : DEFAULT_ROUTE;
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.set(key, String(value));
    });

    const suffix = query.toString();
    return `#/${destination}${suffix ? `?${suffix}` : ""}`;
  }

  //   validates the route and dispatches an event saying the route has changed
  function navigate(name, params = {}) {
    const nextHash = routeHash(name, params);
    if (navigationGuard && navigationGuard({ name, params, hash: nextHash }) === false) return false;

    if (location.hash === nextHash) {
      announceRoute();
      return true;
    }

    location.hash = nextHash.slice(1);
    return true;
  }

  function setNavigationGuard(guard) {
    navigationGuard = typeof guard === "function" ? guard : null;
  }

  function updateParams(changes = {}) {
    const params = currentParams();

    Object.entries(changes).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        delete params[key];
      } else {
        params[key] = String(value);
      }
    });

    navigate(currentRoute(), params);
  }

  //   Announces that a new route has been loaded
  function announceRoute() {
    const { name, params } = parseRoute();
    window.dispatchEvent(
      new CustomEvent("app:route-changed", {
        detail: { route: name, params },
      }),
    );
  }

  //    Adds a listenter to the page waiting for a hashChange event
  function start() {
    window.addEventListener("hashchange", announceRoute);

    if (!location.hash) {
      navigate(DEFAULT_ROUTE);
    } else {
      announceRoute();
    }
  }

  window.AppRouter = {
    navigate,
    updateParams,
    currentRoute,
    currentParams,
    parseRoute,
    setNavigationGuard,
    start,
  };
})();
