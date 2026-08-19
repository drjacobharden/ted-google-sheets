import { describe, expect, test } from "bun:test";
import {
  StateStore,
  type StateStorage,
} from "../src/state/app-state";

interface TestState {
  transient: string;
  preference: number;
}

class MemoryStorage implements StateStorage {
  values = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }
}

const numberPreference = {
  storage: "local" as const,
  key: "test.preference",
  validate: (value: unknown): value is number => typeof value === "number",
};

describe("StateStore", () => {
  test("notifies subscribers only when a value changes and supports cleanup", () => {
    const store = new StateStore<TestState>({ transient: "a", preference: 1 });
    const changes: [string, string][] = [];
    const unsubscribe = store.subscribe("transient", (value, previous) => {
      changes.push([value, previous]);
    });

    store.set("transient", "a");
    store.set("transient", "b");
    unsubscribe();
    store.set("transient", "c");

    expect(store.get("transient")).toBe("c");
    expect(changes).toEqual([["b", "a"]]);
  });

  test("hydrates and writes only explicitly persisted keys", () => {
    const storage = new MemoryStorage();
    storage.values.set("test.preference", "4");
    const store = new StateStore<TestState>(
      { transient: "default", preference: 1 },
      { preference: numberPreference },
      () => storage,
    );

    expect(store.get("preference")).toBe(4);
    store.set("transient", "changed");
    expect(storage.writes).toBe(0);

    store.set("preference", 5);
    expect(storage.values.get("test.preference")).toBe("5");
    expect(storage.writes).toBe(1);
  });

  test("rejects persisted values that fail runtime validation", () => {
    const storage = new MemoryStorage();
    storage.values.set("test.preference", JSON.stringify("not a number"));
    const store = new StateStore<TestState>(
      { transient: "default", preference: 1 },
      { preference: numberPreference },
      () => storage,
    );

    expect(store.get("preference")).toBe(1);
  });

  test("keeps in-memory state working when storage throws", () => {
    const unavailable: StateStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };
    const store = new StateStore<TestState>(
      { transient: "default", preference: 1 },
      { preference: numberPreference },
      () => unavailable,
    );

    store.set("preference", 2);
    expect(store.get("preference")).toBe(2);
  });
});
