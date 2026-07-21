const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

function loadRouter(initialHash = "") {
  const source = fs.readFileSync("js/router.js", "utf8");
  const events = [];
  const listeners = new Map();
  let hash = initialHash;

  const location = {};
  Object.defineProperty(location, "hash", {
    get: () => hash,
    set: (value) => {
      hash = String(value).startsWith("#") ? String(value) : `#${value}`;
    },
  });

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const window = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatchEvent(event) {
      events.push(event);
      listeners.get(event.type)?.(event);
    },
  };

  vm.runInNewContext(source, {
    window,
    location,
    CustomEvent,
    URLSearchParams,
    Map,
    Set,
    Promise,
    document: {},
    Error,
  });

  return { window, location, events };
}

test("router parses entity identifiers from the hash", () => {
  const { window } = loadRouter("#/entity-detail?kind=vendor&id=vendor%201");

  assert.equal(window.AppRouter.currentRoute(), "entity-detail");
  assert.deepEqual(
    { ...window.AppRouter.currentParams() },
    { kind: "vendor", id: "vendor 1" },
  );
});

test("router builds transaction drawer parameters and announces them", () => {
  const { window, location, events } = loadRouter("#/categories");

  window.AppRouter.navigate("transactions", {
    drawer: "edit",
    id: "transaction/1",
  });
  assert.equal(
    location.hash,
    "#/transactions?drawer=edit&id=transaction%2F1",
  );

  window.AppRouter.start();
  events.length = 0;
  window.AppRouter.navigate("transactions", {
    drawer: "edit",
    id: "transaction/1",
  });

  assert.equal(
    JSON.stringify(events.at(-1).detail),
    JSON.stringify({
      route: "transactions",
      params: { drawer: "edit", id: "transaction/1" },
    }),
  );
});
