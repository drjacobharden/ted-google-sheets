const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadOnboarding(options = {}) {
  const values = new Map(Object.entries(options.storage || {}).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
  let config = { endpoint: options.endpoint || "" };
  let activeUser = options.activeUser || null;
  const calls = [];
  const users = options.users || [];
  const api = {
    getConfig: () => ({ ...config }),
    saveConfig: (next) => { calls.push(["saveConfig", next.endpoint]); config = { endpoint: next.endpoint || "" }; },
    getActiveUser: () => activeUser,
    testConnection: async (endpoint) => {
      calls.push(["testConnection", endpoint]);
      if (options.healthError) throw new Error(options.healthError);
      return { status: "ok" };
    },
    loadReferenceData: async () => {
      calls.push(["loadReferenceData"]);
      if (options.referenceError) throw new Error(options.referenceError);
      return {};
    },
    listUsers: async () => {
      calls.push(["listUsers"]);
      if (options.userError) throw new Error(options.userError);
      return users;
    },
    addUser: async (input) => { activeUser = { id: "user-id", ...input }; return activeUser; },
    setActiveUser: (id) => { activeUser = users.find((user) => user.id === id); return activeUser; },
  };
  const callbacks = {};
  const events = [];
  const context = {
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
    window: { BudgetAPI: api, dispatchEvent: (event) => events.push(event) },
    document: { addEventListener: (type, callback) => { callbacks[type] = callback; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Option: class {},
    setTimeout,
    console,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/onboarding.js", "utf8"), context);
  return { onboarding: context.window.OnboardingUI, api, calls, values, events, getConfig: () => config, callbacks };
}

test("requires onboarding only for a pristine or unfinished installation", () => {
  assert.equal(loadOnboarding().onboarding.isBlocking(), true);
  assert.equal(loadOnboarding({ endpoint: "https://script.google.com/macros/s/id/exec" }).onboarding.isBlocking(), false);
  assert.equal(loadOnboarding({ activeUser: { id: "one" } }).onboarding.isBlocking(), false);
  assert.equal(loadOnboarding({
    endpoint: "https://script.google.com/macros/s/id/exec",
    activeUser: { id: "one" },
    storage: { "myFinance.onboarding.v1": { active: true, flow: "join", step: 2, confirmations: {} } },
  }).onboarding.isBlocking(), true);
});

test("defines six new-budget steps and a join flow that skips Sheet deployment", () => {
  const { onboarding } = loadOnboarding();
  assert.deepEqual(Array.from(onboarding.flowSteps("new"), (step) => step.key), ["sheet", "initialize", "deploy", "connect", "profile", "verify"]);
  assert.deepEqual(Array.from(onboarding.flowSteps("join"), (step) => step.key), ["connect", "profile", "verify"]);
  assert.equal(onboarding.TEMPLATE_URL, "https://docs.google.com/spreadsheets/d/1bmbGwKNEgo7i4zhEFFaC3jE4Vyik692orS-mM8-EyD8/copy");
});

test("connects and retains an endpoint only after all startup data loads", async () => {
  const endpoint = "https://script.google.com/macros/s/AKfycb-household/exec";
  const user = { id: "one", firstName: "Ada", lastName: "Byron" };
  const success = loadOnboarding({ users: [user] });
  assert.deepEqual(await success.onboarding.connectEndpoint(endpoint), [user]);
  assert.equal(success.getConfig().endpoint, endpoint);
  assert.deepEqual(success.calls.map((call) => call[0]), ["testConnection", "saveConfig", "loadReferenceData", "listUsers"]);

  const failed = loadOnboarding({ endpoint: "", userError: "Users unavailable" });
  await assert.rejects(() => failed.onboarding.connectEndpoint(endpoint), /budget data could not be loaded/);
  assert.equal(failed.getConfig().endpoint, "");
  assert.deepEqual(failed.calls.filter((call) => call[0] === "saveConfig").map((call) => call[1]), [endpoint, ""]);

  const invalid = loadOnboarding();
  await assert.rejects(() => invalid.onboarding.connectEndpoint("https://example.com/not-an-app"), /production Web app URL/);
  assert.equal(invalid.calls.length, 0);
});

test("markup and controller keep onboarding modal, verification, and endpoint sharing guarded", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const source = fs.readFileSync("js/onboarding.js", "utf8");
  const main = fs.readFileSync("js/main.js", "utf8");
  assert.match(html, /id="onboarding-dialog"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
  assert.doesNotMatch(html, /onboarding-close/);
  assert.match(html, /js\/api\.js[\s\S]*js\/onboarding\.js[\s\S]*js\/users\.js/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /appShell\.inert = true/);
  assert.match(source, /id="onboarding-verified"/);
  assert.match(source, /budget:onboarding-complete/);
  assert.match(main, /navigator\.clipboard\.writeText\(endpoint\)/);
  assert.match(main, /Share it only with trusted household members/);
});
