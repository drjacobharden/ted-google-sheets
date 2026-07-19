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
    "entity-detail",
    "sync",
    "settings",
    "new-transaction",
    "investment-overview",
    "investment-accounts",
    "investment-balances",
    "investment-update",
  ]);

  // The names of the routes and their associated scripts and modules
  const routeConfig = {
    categories: {
      template: "route-categories",
      script: "js/routes/categories.js",
      module: () => window.CategoryRoute,
    },

    vendors: {
      template: "route-vendors",
      script: "js/routes/vendors.js",
      module: () => window.VendorRoute,
    },

    people: {
      template: "route-people",
      script: "js/routes/people.js",
      module: () => window.PeopleRoute,
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

  //   removes the hash from the current hash route to check that it is a valid route
  function currentRoute() {
    const name = location.hash.replace(/^#\/?/, "").split("?")[0];
    return routes.has(name) ? name : DEFAULT_ROUTE;
  }

  //   validates the route and dispatches an event saying the route has changed
  function navigate(name) {
    const destination = routes.has(name) ? name : DEFAULT_ROUTE;
    const nextHash = `#/${destination}`;

    if (location.hash === nextHash) {
      window.dispatchEvent(
        new CustomEvent("app:route-changed", {
          detail: { route: destination },
        }),
      );
      return;
    }

    location.hash = `/${destination}`;
  }

  //   Announces that a new route has been loaded
  function announceRoute() {
    window.dispatchEvent(
      new CustomEvent("app:route-changed", {
        detail: { route: currentRoute() },
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
    currentRoute,
    start,
  };
})();
