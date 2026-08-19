// @ts-nocheck
import {
  now,
  readStorageRecords,
  uuid,
  writeStorageArray,
} from "../utilities/data-utilities";

export type EntityKind = "category" | "vendor" | "assignment";
export type TransactionType = "income" | "expense";
export type SyncState = "pending" | "syncing" | "failed";

export interface BudgetConfig {
  endpoint: string;
}

export interface BudgetUser {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetEntity {
  id: string;
  name: string;
  type?: TransactionType;
  active: boolean;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
  provisional?: boolean;
  _reactivate?: boolean;
}

export interface BudgetTransaction {
  id: string;
  createdAt: string;
  createdBy: string;
  type: TransactionType;
  amount: number;
  date: string;
  categoryId: string;
  vendorId: string;
  assignmentId: string;
  notes: string;
  category?: string;
  vendor?: string;
  assignment?: string;
  createdByName?: string;
  syncStatus?: SyncState;
  syncError?: string;
  syncOperation?: "create" | "update";
}

export interface BudgetTransactionInput extends Partial<
  Omit<BudgetTransaction, "type" | "amount">
> {
  type: TransactionType;
  amount: number | string;
  date: string;
  categoryId: string;
  vendorId: string;
  assignmentId: string;
}

export interface SyncSummary {
  pending: number;
  failed: number;
  syncing: number;
  retrying: number;
  waitingForOnline: number;
  offline: boolean;
  nextRetryAt: number;
  total: number;
}

export interface SyncItem {
  key: string;
  source: "transaction" | "entity" | "investmentAccount" | "investmentMonth" | "investmentSnapshot";
  operation?: "create" | "update" | "archive" | "reactivate";
  kind?: EntityKind;
  id: string;
  status: SyncState;
  error: string;
  failureCode?: string;
  attempts: number;
  nextRetryAt: number;
  retrying: boolean;
  waitingForOnline: boolean;
  record: BudgetTransaction | BudgetEntity | Record<string, unknown>;
  currentRecord?: BudgetTransaction | null;
}

export interface BudgetBootstrapData {
  users: BudgetUser[];
  categories: BudgetEntity[];
  vendors: BudgetEntity[];
  assignments: BudgetEntity[];
  transactions: BudgetTransaction[];
  importProfiles?: unknown[];
  investmentAccounts?: unknown[];
  investmentBalances?: unknown[];
  investmentContributions?: unknown[];
}

export interface ImportedEntityResolution {
  kind: EntityKind;
  requestedId: string;
  record: BudgetEntity;
}

export interface BudgetAPIContract {
  INCOME_CATEGORY_ID: string;
  SHARED_ASSIGNMENT_ID: string;
  getConfig(): BudgetConfig;
  saveConfig(config: BudgetConfig): void;
  loadReferenceData(): Promise<Omit<BudgetBootstrapData, "transactions">>;
  loadAppData(options?: { refresh?: boolean }): Promise<BudgetBootstrapData>;
  getCachedTransactions(): BudgetTransaction[] | null;
  listTransactions(): Promise<BudgetTransaction[]>;
  addTransaction(input: BudgetTransactionInput): Promise<BudgetTransaction>;
  queueTransaction(input: BudgetTransactionInput): BudgetTransaction;
  queueImportedTransactions(
    inputs: BudgetTransactionInput[],
  ): BudgetTransaction[];
  queueTransactionUpdate(
    input: BudgetTransactionInput,
    openedRecord: BudgetTransaction,
  ): BudgetTransaction;
  syncOutbox(): Promise<void> | null;
  getOutboxTransactions(): BudgetTransaction[];
  getOutboxStatus(): SyncSummary;
  getTransactionOutboxItem(id: string): Record<string, unknown> | null;
  getSyncItems(): SyncItem[];
  retryFailedTransactions(): void;
  retryTransaction(id: string): void;
  discardTransactionChange(id: string): void;
  removeFailedTransactions(): void;
  getEntitySyncStatus(
    kind: EntityKind,
    id: string,
  ):
    | (Omit<SyncSummary, "pending" | "failed" | "syncing" | "total"> & {
        status: SyncState;
        error: string;
      })
    | null;
  getEntityOutboxStatus(): SyncSummary;
  syncEntityOutbox(): Promise<void> | null;
  retryEntity(kind: EntityKind, id: string): void;
  discardEntityChange(kind: EntityKind, id: string): void;
  removeFailedEntity(kind: EntityKind, id: string): void;
  createImportedEntityDraft(
    kind: EntityKind,
    input: Partial<BudgetEntity> & { name: string },
  ): BudgetEntity;
  commitImportedEntities(
    entities: Array<{ kind: EntityKind; record: BudgetEntity }>,
    onProgress?: (progress: { completed: number; total: number }) => void,
  ): Promise<ImportedEntityResolution[]>;
  awaitImportedTransactions(
    ids: string[],
    onProgress?: (progress: { completed: number; total: number }) => void,
  ): Promise<string[]>;
  listArchivedEntities(options?: {
    refresh?: boolean;
  }): Promise<Record<"categories" | "vendors" | "assignments", BudgetEntity[]>>;
  getEntity(kind: EntityKind, id: string): BudgetEntity | null;
  listAllCategories(): BudgetEntity[];
  listCategories(options?: { type?: TransactionType }): BudgetEntity[];
  addCategory(input: Partial<BudgetEntity> & { name: string }): BudgetEntity;
  updateCategory(
    input: Partial<BudgetEntity> & { id: string },
  ): Promise<BudgetEntity>;
  reactivateCategory(
    input: Partial<BudgetEntity> & { id: string },
  ): Promise<BudgetEntity>;
  archiveCategory(id: string): Promise<BudgetEntity>;
  listAllVendors(): BudgetEntity[];
  listVendors(): BudgetEntity[];
  addVendor(input: Partial<BudgetEntity> & { name: string }): BudgetEntity;
  updateVendor(
    input: Partial<BudgetEntity> & { id: string },
  ): Promise<BudgetEntity>;
  reactivateVendor(
    input: Partial<BudgetEntity> & { id: string },
  ): Promise<BudgetEntity>;
  archiveVendor(id: string): Promise<BudgetEntity>;
  listAllPeople(): BudgetEntity[];
  listPeople(): BudgetEntity[];
  addPerson(input: Partial<BudgetEntity> & { name: string }): BudgetEntity;
  updatePerson(
    input: Partial<BudgetEntity> & { id: string },
  ): Promise<BudgetEntity>;
  reactivatePerson(
    input: Partial<BudgetEntity> & { id: string },
  ): Promise<BudgetEntity>;
  archivePerson(id: string): Promise<BudgetEntity>;
  listUsers(): BudgetUser[];
  addUser(
    input: Pick<BudgetUser, "firstName" | "lastName">,
  ): Promise<BudgetUser>;
  updateUser(input: Partial<BudgetUser> & { id: string }): Promise<BudgetUser>;
  getActiveUser(): BudgetUser | null;
  setActiveUser(userId: string): BudgetUser;
  testConnection(endpointOverride?: string): Promise<unknown>;
}

interface BudgetIntegrations {
  investment?: { hasUnsynced(): boolean; load(options?: { refresh?: boolean }): Promise<unknown>; applyBootstrapData(data: unknown): unknown };
  imports?: { listProfiles(options?: { refresh?: boolean }): Promise<unknown[]>; applyBootstrapData(data: unknown): unknown };
}
let integrations: BudgetIntegrations = {};
export function configureBudgetIntegrations(value: BudgetIntegrations): void { integrations = value; }

// The UI talks only to this data layer. Local mode mirrors the normalized
// Google Sheets model so switching storage backends does not change contracts.
/** Builds the budget API and initializes its local persistence and sync state. */
export function BudgetAPI(): BudgetAPIContract {
  const KEYS = Object.freeze({
    config: "myFinance.config.v1",
    transactions: "myFinance.transactions.v1",
    categories: "myFinance.categories.v1",
    vendors: "myFinance.vendors.v1",
    assignments: "myFinance.people.v1",
    users: "myFinance.users.v1",
    activeUser: "myFinance.activeUser.v1",
    confirmedTransactions: "myFinance.confirmedTransactions.v1",
    transactionOutbox: "myFinance.transactionOutbox.v2",
    legacyTransactionOutbox: "myFinance.transactionOutbox.v1",
    entityOutbox: "myFinance.entityOutbox.v1",
    schema: "myFinance.schemaVersion",
  });
  const SCHEMA_VERSION = "2";
  const INCOME_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";
  const SHARED_ASSIGNMENT_ID = "00000000-0000-4000-8000-000000000101";
  const DEFAULT_CATEGORIES = Object.freeze([
    { id: INCOME_CATEGORY_ID, name: "Income", type: "income" },
  ]);
  const OUTBOX_BATCH_SIZE = 50;
  const CONFIRMED_TRANSACTION_CACHE_VERSION = 1;
  const TRANSACTION_FIELDS = Object.freeze([
    "id",
    "createdAt",
    "createdBy",
    "type",
    "amount",
    "date",
    "categoryId",
    "vendorId",
    "assignmentId",
    "notes",
    "category",
    "vendor",
    "assignment",
    "createdByName",
  ]);
  const RETRY_DELAYS = Object.freeze([2000, 5000, 15000, 30000, 60000]);
  const BOOTSTRAP_TIMEOUT_MS = 15000;
  const RETRYABLE_BOOTSTRAP_STATUSES = new Set([
    404, 408, 425, 429, 500, 502, 503, 504,
  ]);
  let syncPromise = null;
  let retryTimer = null;
  let batchTransactionsSupported = null;
  let batchTransactionUpdatesSupported = null;
  let entitySyncPromise = null;
  let entityRetryTimer = null;
  let batchEntitiesSupported = null;
  let appDataPromise = null;

  /** Handles the browserIsOffline operation for the budget data layer. */
  function browserIsOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }
  /** Handles the readArray operation for the budget data layer. */
  function readArray(key) {
    return readStorageRecords(key);
  }
  /** Handles the writeArray operation for the budget data layer. */
  function writeArray(key, value) {
    writeStorageArray(key, value);
  }
  /** Handles the active operation for the budget data layer. */
  function active(records) {
    return records.filter((record) => record.active !== false);
  }
  /** Handles the byName operation for the budget data layer. */
  function byName(records, name, type) {
    const key = String(name || "")
      .trim()
      .toLowerCase();
    return records.find(
      (record) =>
        record.name.toLowerCase() === key && (!type || record.type === type),
    );
  }
  /** Handles the canonicalRecord operation for the budget data layer. */
  function canonicalRecord(input, defaults = {}) {
    const timestamp = now();
    return {
      id: input.id || uuid(),
      name: String(input.name || "").trim(),
      active: input.active !== false,
      createdAt: input.createdAt || timestamp,
      updatedAt: input.updatedAt || timestamp,
      ...defaults,
      ...input,
    };
  }

  /** Handles the getConfig operation for the budget data layer. */
  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.config)) || { endpoint: "" };
    } catch {
      return { endpoint: "" };
    }
  }
  /** Handles the saveConfig operation for the budget data layer. */
  function saveConfig(config) {
    const endpoint = String(config.endpoint || "").trim();
    if (
      endpoint !== getConfig().endpoint &&
      (getOutbox().length ||
        getEntityOutbox().length ||
        integrations.investment?.hasUnsynced())
    ) {
      throw new Error(
        "Sync or remove pending changes before changing the connection URL.",
      );
    }
    localStorage.setItem(KEYS.config, JSON.stringify({ endpoint }));
    batchTransactionsSupported = null;
    batchTransactionUpdatesSupported = null;
    batchEntitiesSupported = null;
    appDataPromise = null;
  }

  /** Handles the migrateLocalData operation for the budget data layer. */
  function migrateLocalData() {
    const timestamp = now();
    const legacyCategories = readArray(KEYS.categories);
    const categories = DEFAULT_CATEGORIES.map((item) => ({
      ...item,
      isDefault: true,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    legacyCategories.forEach((item) => {
      const type = item.type === "income" ? "income" : "expense";
      const seeded = byName(categories, item.name, type);
      if (seeded) return;
      categories.push(
        canonicalRecord({
          ...item,
          id: isUuid(item.id) ? item.id : uuid(),
          type,
          isDefault: false,
        }),
      );
    });

    const vendors = readArray(KEYS.vendors).map((item) =>
      canonicalRecord({
        ...item,
        id: isUuid(item.id) ? item.id : uuid(),
      }),
    );
    const assignments = [
      {
        id: SHARED_ASSIGNMENT_ID,
        name: "Shared",
        isDefault: true,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    readArray(KEYS.assignments)
      .filter((item) => !item.isDefault && item.name !== "Shared")
      .forEach((item) => {
        assignments.push(
          canonicalRecord({
            ...item,
            id: isUuid(item.id) ? item.id : uuid(),
            isDefault: false,
          }),
        );
      });

    const users = readArray(KEYS.users).map((user) => ({
      ...user,
      id: isUuid(user.id) ? user.id : uuid(),
      active: user.active !== false,
      createdAt: user.createdAt || timestamp,
      updatedAt: user.updatedAt || timestamp,
    }));
    const activeUserId = localStorage.getItem(KEYS.activeUser) || "";
    const transactions = readArray(KEYS.transactions).map((transaction) => {
      const type = transaction.type === "income" ? "income" : "expense";
      let category = categories.find(
        (item) => item.id === transaction.categoryId,
      );
      if (!category)
        category =
          type === "income"
            ? categories.find((item) => item.id === INCOME_CATEGORY_ID)
            : byName(categories, transaction.category || "Other", "expense");
      if (!category) {
        category = canonicalRecord({
          name: transaction.category || "Other",
          type: "expense",
          isDefault: false,
        });
        categories.push(category);
      }

      let vendor = vendors.find((item) => item.id === transaction.vendorId);
      if (type === "expense" && !vendor && transaction.vendor) {
        vendor = byName(vendors, transaction.vendor);
        if (!vendor) {
          vendor = canonicalRecord({ name: transaction.vendor });
          vendors.push(vendor);
        }
      }

      let assignment = assignments.find(
        (item) => item.id === transaction.assignmentId,
      );
      if (!assignment) {
        assignment = byName(assignments, transaction.assignment || "Shared");
        if (!assignment) {
          assignment = canonicalRecord({
            name: transaction.assignment || "Shared",
            isDefault: false,
          });
          assignments.push(assignment);
        }
      }
      return {
        id: isUuid(transaction.id) ? transaction.id : uuid(),
        createdAt: transaction.createdAt || timestamp,
        createdBy: transaction.createdBy || activeUserId,
        type,
        amount: Number(transaction.amount) || 0,
        date: transaction.date,
        categoryId: category.id,
        vendorId: type === "income" ? "" : vendor?.id || "",
        assignmentId: assignment.id,
        notes: String(transaction.notes || ""),
      };
    });

    writeArray(KEYS.categories, categories);
    writeArray(KEYS.vendors, vendors);
    writeArray(KEYS.assignments, assignments);
    writeArray(KEYS.users, users);
    writeArray(KEYS.transactions, transactions);
    localStorage.setItem(KEYS.schema, SCHEMA_VERSION);
  }

  /** Handles the ensureLocalData operation for the budget data layer. */
  function ensureLocalData() {
    // Re-running is intentionally safe and also repairs legacy rows added after an upgrade.
    if (localStorage.getItem(KEYS.schema) !== SCHEMA_VERSION)
      migrateLocalData();
  }
  /** Handles the isUuid operation for the budget data layer. */
  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || ""),
    );
  }

  /** Handles the getActiveUser operation for the budget data layer. */
  function getActiveUser() {
    ensureLocalData();
    const id = localStorage.getItem(KEYS.activeUser);
    return (
      readArray(KEYS.users).find(
        (user) => user.id === id && user.active !== false,
      ) || null
    );
  }
  /** Handles the setActiveUser operation for the budget data layer. */
  function setActiveUser(userId) {
    const user = active(readArray(KEYS.users)).find(
      (item) => item.id === userId,
    );
    if (!user) throw new Error("Choose a valid user.");
    localStorage.setItem(KEYS.activeUser, user.id);
    window.dispatchEvent(
      new CustomEvent("budget:active-user-changed", { detail: user }),
    );
    return user;
  }
  /** Handles the normalizeUser operation for the budget data layer. */
  function normalizeUser(input, existing = {}) {
    const firstName = String(input.firstName || "").trim();
    const lastName = String(input.lastName || "").trim();
    if (!firstName || !lastName)
      throw new Error("Enter a first and last name.");
    if (firstName.length > 80 || lastName.length > 80)
      throw new Error("Names must be 80 characters or fewer.");
    return { ...existing, firstName, lastName, active: input.active !== false };
  }

  /** Handles the cacheUsers operation for the budget data layer. */
  function cacheUsers(users) {
    writeArray(KEYS.users, users);
  }
  /** Handles the listUsers operation for the budget data layer. */
  function listUsers() {
    ensureLocalData();
    return active(readArray(KEYS.users));
  }
  /** Handles the replaceCachedUsers operation for the budget data layer. */
  function replaceCachedUsers(users) {
    if (!Array.isArray(users))
      throw new Error("The sheet response did not include a user list.");
    cacheUsers(users);
    const activeId = localStorage.getItem(KEYS.activeUser);
    if (
      activeId &&
      !users.some((user) => user.id === activeId && user.active !== false)
    ) {
      localStorage.removeItem(KEYS.activeUser);
      window.dispatchEvent(
        new CustomEvent("budget:active-user-changed", { detail: null }),
      );
    }
  }
  /** Handles the addUser operation for the budget data layer. */
  async function addUser(input) {
    const timestamp = now();
    const user = normalizeUser(input, {
      id: uuid(),
      createdAt: timestamp,
      updatedAt: timestamp,
      active: true,
    });
    const saved = getConfig().endpoint
      ? await request("addUser", { body: { user } })
      : user;
    const users = readArray(KEYS.users);
    users.push(saved);
    cacheUsers(users);
    setActiveUser(saved.id);
    window.dispatchEvent(
      new CustomEvent("budget:users-changed", { detail: saved }),
    );
    return saved;
  }
  /** Handles the updateUser operation for the budget data layer. */
  async function updateUser(input) {
    const users = readArray(KEYS.users);
    const index = users.findIndex((item) => item.id === input.id);
    if (index < 0) throw new Error("That user could not be found.");
    const user = normalizeUser(input, { ...users[index], updatedAt: now() });
    const saved = getConfig().endpoint
      ? await request("updateUser", { body: { user } })
      : user;
    users[index] = saved;
    cacheUsers(users);
    window.dispatchEvent(
      new CustomEvent("budget:users-changed", { detail: saved }),
    );
    if (getActiveUser()?.id === saved.id)
      window.dispatchEvent(
        new CustomEvent("budget:active-user-changed", { detail: saved }),
      );
    return saved;
  }

  /** A quick category operation that shows all categories without any filtering */
  function listAllCategories() {
    ensureLocalData();
    return readArray(KEYS.categories).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /** Handles the listCategories operation for the budget data layer. */
  function listCategories(options = {}) {
    ensureLocalData();
    return active(readArray(KEYS.categories))
      .filter((item) => !options.type || item.type === options.type)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  /** Returns every cached vendor, including archived records. */
  function listAllVendors() {
    ensureLocalData();
    return readArray(KEYS.vendors).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
  /** Handles the listVendors operation for the budget data layer. */
  function listVendors() {
    return active(listAllVendors());
  }
  /** Returns every cached assignment, including archived records. */
  function listAllPeople() {
    ensureLocalData();
    return readArray(KEYS.assignments).sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        a.name.localeCompare(b.name),
    );
  }
  /** Handles the listPeople operation for the budget data layer. */
  function listPeople() {
    return active(listAllPeople());
  }

  /** Handles the archivedEntityCollections operation for the budget data layer. */
  function archivedEntityCollections() {
    ensureLocalData();
    /** Handles the archived operation for the budget data layer. */
    const archived = (key) =>
      readArray(key)
        .filter((item) => item.active === false && !item.isDefault)
        .sort((a, b) => a.name.localeCompare(b.name));
    return {
      categories: archived(KEYS.categories),
      vendors: archived(KEYS.vendors),
      assignments: archived(KEYS.assignments),
    };
  }

  /** Returns archived entities from the complete collections cached by bootstrap. */
  async function listArchivedEntities(_options = {}) {
    ensureLocalData();
    return archivedEntityCollections();
  }

  /** Handles the entityStorageKey operation for the budget data layer. */
  function entityStorageKey(kind) {
    return {
      category: KEYS.categories,
      vendor: KEYS.vendors,
      assignment: KEYS.assignments,
    }[kind];
  }
  /** Handles the entityAction operation for the budget data layer. */
  function entityAction(kind) {
    return {
      category: "addCategory",
      vendor: "addVendor",
      assignment: "addAssignment",
    }[kind];
  }
  /** Handles the entityListAction operation for the budget data layer. */
  function entityListAction(kind) {
    return {
      category: "listCategories",
      vendor: "listVendors",
      assignment: "listAssignments",
    }[kind];
  }
  /** Returns the legacy archive action for an entity kind. */
  function entityArchiveAction(kind) {
    return {
      category: "archiveCategory",
      vendor: "archiveVendor",
      assignment: "archiveAssignment",
    }[kind];
  }
  /** Handles the entityBodyKey operation for the budget data layer. */
  function entityBodyKey(kind) {
    return kind;
  }
  /** Handles the entityNameKey operation for the budget data layer. */
  function entityNameKey(kind, record) {
    return `${kind === "category" ? `${record.type || "expense"}|` : ""}${String(
      record.name || "",
    )
      .trim()
      .toLowerCase()}`;
  }

  /** Handles the addEntity operation for the budget data layer. */
  function addEntity(kind, input) {
    const name = String(input.name || "").trim();
    if (!name)
      throw new Error(
        `Enter a ${kind === "assignment" ? "person’s" : kind} name.`,
      );
    const key = entityStorageKey(kind);
    const type = kind === "category" ? input.type || "expense" : "";
    const all = readArray(key);
    const matching = all.find(
      (item) =>
        entityNameKey(kind, item) === entityNameKey(kind, { name, type }),
    );
    if (matching && matching.active !== false)
      throw new Error(`That ${kind} already exists.`);
    const record = matching
      ? { ...matching, name, active: true, updatedAt: now() }
      : canonicalRecord({
          id: uuid(),
          name,
          active: true,
          isDefault: false,
          ...(kind === "category" ? { type } : {}),
        });
    if (matching) {
      all[all.findIndex((item) => item.id === matching.id)] = record;
    } else {
      all.push(record);
    }
    writeArray(key, all);
    if (getConfig().endpoint) {
      const outbox = getEntityOutbox();
      outbox.push({
        kind,
        operation: matching ? "reactivate" : "create",
        record,
        baseRecord: matching ? { ...matching } : null,
        status: "pending",
        attempts: 0,
        nextRetryAt: 0,
        error: "",
      });
      writeEntityOutbox(outbox);
      emitEntitySyncStatus();
      scheduleEntitySync(0);
    }
    window.dispatchEvent(
      new CustomEvent(entityEvent(kind), { detail: record }),
    );
    return record;
  }
  /** Handles the createImportedEntityDraft operation for the budget data layer. */
  function createImportedEntityDraft(kind, input) {
    if (!entityStorageKey(kind))
      throw new Error("Choose a supported import entity type.");
    const name = String(input?.name || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!name)
      throw new Error(
        `Enter a ${kind === "assignment" ? "person’s" : kind} name.`,
      );
    const type =
      kind === "category" && input?.type === "income" ? "income" : "expense";
    const existing = readArray(entityStorageKey(kind));
    const match = existing.find(
      (item) =>
        entityNameKey(kind, item) === entityNameKey(kind, { name, type }),
    );
    if (match && match.active !== false)
      return { ...match, provisional: false };
    if (match) {
      return {
        ...match,
        name,
        active: true,
        updatedAt: now(),
        provisional: false,
        _reactivate: true,
      };
    }
    return canonicalRecord({
      id: input?.id || uuid(),
      name,
      active: true,
      isDefault: false,
      ...(kind === "category" ? { type } : {}),
    });
  }
  /** Handles the addCategory operation for the budget data layer. */
  const addCategory = (input) =>
    addEntity("category", { ...input, type: input.type || "expense" });
  /** Handles the addVendor operation for the budget data layer. */
  const addVendor = (input) => addEntity("vendor", input);
  /** Handles the addPerson operation for the budget data layer. */
  const addPerson = (input) => addEntity("assignment", input);

  /** Handles the updateEntity operation for the budget data layer. */
  async function updateEntity(kind, input) {
    const key = {
      category: KEYS.categories,
      vendor: KEYS.vendors,
      assignment: KEYS.assignments,
    }[kind];
    const records = readArray(key);
    const index = records.findIndex((item) => item.id === input.id);
    if (index < 0) throw new Error(`That ${kind} could not be found.`);
    const record = {
      ...records[index],
      ...input,
      name: String(input.name || records[index].name).trim(),
      updatedAt: now(),
    };
    if (
      records.some(
        (item) =>
          item.id !== record.id &&
          item.active !== false &&
          entityNameKey(kind, item) === entityNameKey(kind, record),
      )
    ) {
      throw new Error(`That ${kind} already exists.`);
    }
    const action = {
      category: "updateCategory",
      vendor: "updateVendor",
      assignment: "updateAssignment",
    }[kind];
    const saved = getConfig().endpoint
      ? await request(action, { body: { [kind]: record } })
      : record;
    records[index] = saved;
    writeArray(key, records);
    window.dispatchEvent(new CustomEvent(entityEvent(kind), { detail: saved }));
    return saved;
  }
  /** Handles the getEntity operation for the budget data layer. */
  function getEntity(kind, id) {
    const key = entityStorageKey(kind);
    return key ? readArray(key).find((item) => item.id === id) || null : null;
  }
  /** Optimistically changes an entity's active state and queues synchronization. */
  async function changeEntityActiveState(kind, input, active) {
    const id = input.id;
    const key = {
      category: KEYS.categories,
      vendor: KEYS.vendors,
      assignment: KEYS.assignments,
    }[kind];
    const records = readArray(key);
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`That ${kind} could not be found.`);
    if (!active && records[index].isDefault)
      throw new Error("Default records cannot be archived.");

    const pending = getEntityOutbox().find(
      (item) => item.kind === kind && item.record.id === id,
    );
    const baseRecord = pending?.baseRecord ?? { ...records[index] };

    if (
      pending?.status !== "syncing" &&
      pending?.baseRecord &&
      pending.baseRecord.active === active &&
      String(input.name || pending.baseRecord.name).trim() ===
        pending.baseRecord.name
    ) {
      records[index] = pending.baseRecord;
      writeArray(key, records);
      writeEntityOutbox(
        getEntityOutbox().filter(
          (item) => !(item.kind === kind && item.record.id === id),
        ),
      );
      emitEntitySyncStatus();
      window.dispatchEvent(
        new CustomEvent(entityEvent(kind), { detail: pending.baseRecord }),
      );
      return pending.baseRecord;
    }

    const record = {
      ...records[index],
      ...input,
      name: String(input.name || records[index].name).trim(),
      active,
      updatedAt: now(),
    };
    records[index] = record;
    writeArray(key, records);

    if (getConfig().endpoint) {
      const replacement = {
        kind,
        operation: active ? "reactivate" : "archive",
        record,
        baseRecord,
        status: "pending",
        attempts: 0,
        nextRetryAt: 0,
        error: "",
      };
      writeEntityOutbox([
        ...getEntityOutbox().filter(
          (item) => !(item.kind === kind && item.record.id === id),
        ),
        replacement,
      ]);
      emitEntitySyncStatus();
      scheduleEntitySync(0);
    }

    window.dispatchEvent(
      new CustomEvent(entityEvent(kind), { detail: record }),
    );
    return record;
  }
  /** Handles the reactivateEntity operation for the budget data layer. */
  const reactivateEntity = (kind, input) =>
    changeEntityActiveState(kind, input, true);
  /** Handles the archiveEntity operation for the budget data layer. */
  const archiveEntity = (kind, id) =>
    changeEntityActiveState(kind, { id }, false);
  /** Handles the entityEvent operation for the budget data layer. */
  function entityEvent(kind) {
    return `budget:${{ category: "categories", vendor: "vendors", assignment: "people" }[kind]}-changed`;
  }

  /** Handles the getEntityOutbox operation for the budget data layer. */
  function getEntityOutbox() {
    return readArray(KEYS.entityOutbox)
      .map((item) => ({
        ...item,
        operation: item.operation || "create",
        baseRecord: item.baseRecord || null,
        status: item.status || "pending",
        attempts: Number(item.attempts) || 0,
        nextRetryAt: Number(item.nextRetryAt) || 0,
        error: String(item.error || ""),
      }))
      .filter((item) => entityStorageKey(item.kind) && item.record?.id);
  }
  /** Handles the writeEntityOutbox operation for the budget data layer. */
  function writeEntityOutbox(items) {
    writeArray(KEYS.entityOutbox, items);
  }
  /** Handles the getEntitySyncStatus operation for the budget data layer. */
  function getEntitySyncStatus(kind, id) {
    const item = getEntityOutbox().find(
      (entry) => entry.kind === kind && entry.record.id === id,
    );
    const offline = browserIsOffline();
    return item
      ? {
          status: item.status,
          error: item.error,
          attempts: item.attempts,
          nextRetryAt: item.nextRetryAt,
          retrying: !offline && item.status === "pending" && item.attempts > 0,
          waitingForOnline: offline && item.status === "pending",
        }
      : null;
  }
  /** Handles the getEntityOutboxStatus operation for the budget data layer. */
  function getEntityOutboxStatus() {
    const items = getEntityOutbox();
    const offline = browserIsOffline();
    const retryingItems = items.filter(
      (item) => !offline && item.status === "pending" && item.attempts > 0,
    );
    const waitingForOnline = items.filter(
      (item) => offline && item.status === "pending",
    ).length;
    return {
      pending: items.filter((item) => item.status !== "failed").length,
      failed: items.filter((item) => item.status === "failed").length,
      syncing: items.filter((item) => item.status === "syncing").length,
      retrying: retryingItems.length,
      waitingForOnline,
      offline,
      nextRetryAt: retryingItems.length
        ? Math.min(...retryingItems.map((item) => item.nextRetryAt))
        : 0,
      total: items.length,
    };
  }
  /** Handles the emitEntitySyncStatus operation for the budget data layer. */
  function emitEntitySyncStatus() {
    window.dispatchEvent(
      new CustomEvent("budget:entity-sync-changed", {
        detail: { ...getEntityOutboxStatus(), items: getEntityOutbox() },
      }),
    );
    window.dispatchEvent(new CustomEvent("budget:sync-changed"));
  }
  /** Handles the restoreQueuedEntities operation for the budget data layer. */
  function restoreQueuedEntities() {
    getEntityOutbox().forEach((item) => {
      const key = entityStorageKey(item.kind);
      const records = readArray(key).filter(
        (record) => record.id !== item.record.id,
      );
      records.push(item.record);
      writeArray(key, records);
    });
  }

  /** Handles the replaceCachedEntity operation for the budget data layer. */
  function replaceCachedEntity(kind, oldId, canonical) {
    const key = entityStorageKey(kind);
    const records = readArray(key).filter(
      (record) => record.id !== oldId && record.id !== canonical.id,
    );
    records.push(canonical);
    writeArray(key, records);
  }
  /** Handles the remapQueuedTransactions operation for the budget data layer. */
  function remapQueuedTransactions(kind, oldId, newId) {
    const field = {
      category: "categoryId",
      vendor: "vendorId",
      assignment: "assignmentId",
    }[kind];
    let changed = false;
    const items = getOutbox().map((item) => {
      if (item.record[field] !== oldId) return item;
      changed = true;
      return { ...item, record: { ...item.record, [field]: newId } };
    });
    if (changed) {
      writeOutbox(items);
      emitSyncStatus();
    }
  }
  /** Handles the reconcileEntity operation for the budget data layer. */
  function reconcileEntity(kind, oldId, canonical) {
    replaceCachedEntity(kind, oldId, canonical);
    remapQueuedTransactions(kind, oldId, canonical.id);
    window.dispatchEvent(
      new CustomEvent(entityEvent(kind), {
        detail: { ...canonical, oldId, reconciled: true },
      }),
    );
  }

  /** Handles the sendEntityBatch operation for the budget data layer. */
  async function sendEntityCreateBatch(items) {
    if (batchEntitiesSupported !== false) {
      try {
        const result = await request("addEntities", {
          body: {
            entities: items.map((item) => ({
              kind: item.kind,
              record: item.record,
            })),
          },
        });
        batchEntitiesSupported = true;
        if (
          !result ||
          !Array.isArray(result.saved) ||
          !Array.isArray(result.reconciled) ||
          !Array.isArray(result.failed)
        ) {
          throw new Error(
            "The sheet returned an invalid entity batch response.",
          );
        }
        const unresolved = [];
        for (const failure of result.failed) {
          const item = items.find(
            (entry) =>
              entry.kind === failure.kind && entry.record.id === failure.id,
          );
          if (
            item?.operation !== "reactivate" ||
            !/already used by different data|already exists/i.test(
              failure.error,
            )
          ) {
            unresolved.push(failure);
            continue;
          }

          const records = await request(entityListAction(item.kind));
          const canonical = records.find(
            (record) =>
              record.id === item.record.id &&
              entityNameKey(item.kind, record) ===
                entityNameKey(item.kind, item.record),
          );
          if (canonical) {
            result.saved.push({ kind: item.kind, record: canonical });
          } else {
            unresolved.push(failure);
          }
        }
        result.failed = unresolved;
        return result;
      } catch (error) {
        if (!/Unknown action/i.test(error.message)) throw error;
        batchEntitiesSupported = false;
      }
    }
    const saved = [],
      reconciled = [],
      failed = [];
    for (const item of items) {
      try {
        const bodyKey = entityBodyKey(item.kind);
        const record = await request(entityAction(item.kind), {
          body: { [bodyKey]: item.record },
        });
        if (record.id !== item.record.id) {
          reconciled.push({
            kind: item.kind,
            requestedId: item.record.id,
            record,
          });
        } else {
          saved.push({ kind: item.kind, record });
        }
      } catch (error) {
        if (!error.isApiError) throw error;
        if (/already exists|already used by different data/i.test(error.message)) {
          const records = await request(entityListAction(item.kind));
          const canonical = records.find(
            (record) =>
              (record.id === item.record.id ||
                entityNameKey(item.kind, record) ===
                  entityNameKey(item.kind, item.record)) &&
              entityNameKey(item.kind, record) ===
              entityNameKey(item.kind, item.record),
          );
          if (canonical) {
            reconciled.push({
              kind: item.kind,
              requestedId: item.record.id,
              record: canonical,
            });
            continue;
          }
        }
        failed.push({
          kind: item.kind,
          id: item.record.id,
          error: error.message,
        });
      }
    }
    return { saved, reconciled, failed };
  }

  /** Sends queued entity creates/reactivations in batches and archives individually. */
  async function sendEntityBatch(items) {
    const creates = items.filter((item) => item.operation !== "archive");
    const archives = items.filter((item) => item.operation === "archive");
    const result = creates.length
      ? await sendEntityCreateBatch(creates)
      : { saved: [], reconciled: [], failed: [] };

    for (const item of archives) {
      try {
        const record = await request(entityArchiveAction(item.kind), {
          body: { id: item.record.id },
        });
        result.saved.push({ kind: item.kind, record });
      } catch (error) {
        if (!error.isApiError) throw error;
        result.failed.push({
          kind: item.kind,
          id: item.record.id,
          error: error.message,
        });
      }
    }

    return result;
  }

  /** Handles the commitImportedEntities operation for the budget data layer. */
  async function commitImportedEntities(entities, onProgress) {
    if (!getConfig().endpoint)
      throw new Error("Connect a Google Sheet before committing this import.");
    if (browserIsOffline())
      throw new Error(
        "Reconnect to the internet before committing this import.",
      );
    const prepared = (entities || []).map((item) => {
      const requested = item.record || item;
      return {
        kind: item.kind,
        requestedId: requested.id,
        record: createImportedEntityDraft(item.kind, requested),
      };
    });
    const resolved = prepared
      .filter(
        (item) =>
          item.record.id !== item.requestedId && !item.record._reactivate,
      )
      .map((item) => ({
        kind: item.kind,
        requestedId: item.requestedId,
        record: item.record,
      }));
    const items = prepared.filter(
      (item) => item.record.id === item.requestedId || item.record._reactivate,
    );
    for (let offset = 0; offset < items.length; offset += OUTBOX_BATCH_SIZE) {
      const batch = items.slice(offset, offset + OUTBOX_BATCH_SIZE);
      const result = await sendEntityBatch(batch);
      result.saved.forEach((item) => {
        replaceCachedEntity(item.kind, item.record.id, item.record);
        window.dispatchEvent(
          new CustomEvent(entityEvent(item.kind), { detail: item.record }),
        );
        resolved.push({
          kind: item.kind,
          requestedId:
            batch.find((entry) => entry.record.id === item.record.id)
              ?.requestedId || item.record.id,
          record: item.record,
        });
      });
      result.reconciled.forEach((item) => {
        reconcileEntity(item.kind, item.requestedId, item.record);
        resolved.push(item);
      });
      onProgress?.({
        completed: Math.min(offset + batch.length, items.length),
        total: items.length,
      });
      if (result.failed.length) {
        const error = new Error(
          result.failed.map((failure) => failure.error).join(" ") ||
            "One or more imported items could not be created.",
        );
        error.partialResults = resolved.slice();
        error.failures = result.failed;
        throw error;
      }
    }
    return resolved;
  }

  /** Handles the scheduleEntitySync operation for the budget data layer. */
  function scheduleEntitySync(delay = 0) {
    if (typeof setTimeout !== "function") return;
    if (browserIsOffline()) {
      if (entityRetryTimer) clearTimeout(entityRetryTimer);
      entityRetryTimer = null;
      return;
    }
    if (entityRetryTimer) clearTimeout(entityRetryTimer);
    entityRetryTimer = setTimeout(
      () => {
        entityRetryTimer = null;
        syncEntityOutbox();
      },
      Math.max(0, delay),
    );
  }

  /** Handles the syncEntityOutbox operation for the budget data layer. */
  async function syncEntityOutbox() {
    if (entitySyncPromise || !getConfig().endpoint || browserIsOffline())
      return entitySyncPromise;
    const due = getEntityOutbox()
      .filter(
        (item) => item.status === "pending" && item.nextRetryAt <= Date.now(),
      )
      .slice(0, OUTBOX_BATCH_SIZE);
    if (!due.length) {
      const future = getEntityOutbox()
        .filter(
          (item) => item.status === "pending" && item.nextRetryAt > Date.now(),
        )
        .sort((a, b) => a.nextRetryAt - b.nextRetryAt)[0];
      if (future) scheduleEntitySync(future.nextRetryAt - Date.now());
      return null;
    }
    entitySyncPromise = (async () => {
      const dueIds = new Set(due.map((item) => item.record.id));
      const dueById = new Map(due.map((item) => [item.record.id, item]));
      writeEntityOutbox(
        getEntityOutbox().map((item) =>
          dueIds.has(item.record.id)
            ? { ...item, status: "syncing", error: "" }
            : item,
        ),
      );
      emitEntitySyncStatus();
      try {
        const result = await sendEntityBatch(due);
        const savedIds = new Set(result.saved.map((item) => item.record.id));
        const reconciledIds = new Set(
          result.reconciled.map((item) => item.requestedId),
        );
        const failures = new Map(
          result.failed.map((item) => [item.id, item.error]),
        );
        result.saved.forEach((item) =>
          replaceCachedEntity(item.kind, item.record.id, item.record),
        );
        result.reconciled.forEach((item) =>
          reconcileEntity(item.kind, item.requestedId, item.record),
        );
        const remaining = getEntityOutbox()
          .filter(
            (item) =>
              !savedIds.has(item.record.id) &&
              !reconciledIds.has(item.record.id),
          )
          .map((item) =>
            failures.has(item.record.id)
              ? {
                  ...item,
                  status: "failed",
                  error: failures.get(item.record.id),
                  nextRetryAt: 0,
                }
              : item,
          );
        writeEntityOutbox(remaining);
        result.saved.forEach((item) =>
          window.dispatchEvent(
            new CustomEvent(entityEvent(item.kind), { detail: item.record }),
          ),
        );
        if (result.failed.length) {
          window.dispatchEvent(
            new CustomEvent("budget:api-warning", {
              detail: `${result.failed.length} new ${result.failed.length === 1 ? "item needs" : "items need"} attention before dependent transactions can sync.`,
            }),
          );
          window.dispatchEvent(
            new CustomEvent("budget:sync-failed", {
              detail: { count: result.failed.length, kind: "entity" },
            }),
          );
        }
        if (result.saved.length || result.reconciled.length)
          window.dispatchEvent(
            new CustomEvent("budget:sync-succeeded", {
              detail: {
                count: result.saved.length + result.reconciled.length,
                kind: "entity",
              },
            }),
          );
        emitEntitySyncStatus();
      } catch (error) {
        const offline = browserIsOffline();
        const nowValue = Date.now();
        const firstFailure = due.some((item) => item.attempts === 0);
        writeEntityOutbox(
          getEntityOutbox().map((item) => {
            if (!dueIds.has(item.record.id)) return item;
            if (offline) {
              const previous = dueById.get(item.record.id);
              return {
                ...item,
                status: "pending",
                attempts: previous.attempts,
                nextRetryAt: previous.nextRetryAt,
                error: previous.error,
              };
            }
            const attempts = item.attempts + 1;
            const delay =
              RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
            return {
              ...item,
              status: "pending",
              attempts,
              nextRetryAt: nowValue + delay,
              error: error.message,
            };
          }),
        );
        emitEntitySyncStatus();
        if (!offline && firstFailure)
          window.dispatchEvent(
            new CustomEvent("budget:sync-retry-scheduled", {
              detail: {
                kind: "entity",
                count: due.length,
                error: error.message,
              },
            }),
          );
      } finally {
        entitySyncPromise = null;
        const next = getEntityOutbox()
          .filter((item) => item.status === "pending")
          .sort((a, b) => a.nextRetryAt - b.nextRetryAt)[0];
        if (next)
          scheduleEntitySync(Math.max(0, next.nextRetryAt - Date.now()));
        scheduleSync(0);
      }
    })();
    return entitySyncPromise;
  }

  /** Handles the retryEntity operation for the budget data layer. */
  function retryEntity(kind, id) {
    if (browserIsOffline())
      throw new Error("Retry is available when you are back online.");
    const items = getEntityOutbox();
    const target = items.find(
      (item) => item.kind === kind && item.record.id === id,
    );
    if (!target) throw new Error("That item could not be found.");
    if (target.status === "syncing")
      throw new Error("That item is already syncing.");
    const preserveAttempts = target.status === "pending" && target.attempts > 0;
    writeEntityOutbox(
      items.map((item) =>
        item === target
          ? {
              ...item,
              status: "pending",
              attempts: preserveAttempts ? item.attempts : 0,
              nextRetryAt: 0,
              error: "",
            }
          : item,
      ),
    );
    emitEntitySyncStatus();
    scheduleEntitySync(0);
  }
  /** Handles the discardEntityChange operation for the budget data layer. */
  function discardEntityChange(kind, id) {
    const item = getEntityOutbox().find(
      (entry) => entry.kind === kind && entry.record.id === id,
    );
    if (!item) throw new Error("That item could not be found.");
    if (item.status === "syncing")
      throw new Error("That item is already syncing.");
    if (item.operation !== "create" && item.baseRecord) {
      replaceCachedEntity(kind, id, item.baseRecord);
      writeEntityOutbox(
        getEntityOutbox().filter(
          (entry) => !(entry.kind === kind && entry.record.id === id),
        ),
      );
      window.dispatchEvent(
        new CustomEvent(entityEvent(kind), { detail: item.baseRecord }),
      );
      emitEntitySyncStatus();
      return item;
    }
    const field = {
      category: "categoryId",
      vendor: "vendorId",
      assignment: "assignmentId",
    }[kind];
    if (getOutbox().some((transaction) => transaction.record[field] === id)) {
      throw new Error(
        "Remove or resolve dependent transactions before removing this item.",
      );
    }
    writeEntityOutbox(
      getEntityOutbox().filter(
        (entry) => !(entry.kind === kind && entry.record.id === id),
      ),
    );
    writeArray(
      entityStorageKey(kind),
      readArray(entityStorageKey(kind)).filter((record) => record.id !== id),
    );
    window.dispatchEvent(
      new CustomEvent(entityEvent(kind), { detail: { id, removed: true } }),
    );
    emitEntitySyncStatus();
  }
  /** Handles the removeFailedEntity operation for the budget data layer. */
  function removeFailedEntity(kind, id) {
    const item = getEntityOutbox().find(
      (entry) =>
        entry.kind === kind &&
        entry.record.id === id &&
        entry.status === "failed",
    );
    if (!item) throw new Error("That failed item could not be found.");
    return discardEntityChange(kind, id);
  }

  /** Handles the normalizeResponse operation for the budget data layer. */
  function normalizeResponse(payload) {
    if (payload && payload.ok === false) {
      const error = new Error(
        payload.error || payload.message || "The sheet returned an error.",
      );
      error.isApiError = true;
      throw error;
    }
    if (payload?.warning)
      window.dispatchEvent(
        new CustomEvent("budget:api-warning", { detail: payload.warning }),
      );
    return payload?.data ?? payload?.transactions ?? payload;
  }
  /** Performs one Apps Script request, optionally bounded by a timeout. */
  async function requestOnce(action, options = {}, timeoutMs = 0) {
    const { endpoint } = getConfig();
    if (!endpoint) throw new Error("No Apps Script URL is configured.");
    const controller = timeoutMs ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    let response;
    try {
      if (options.body) {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action, ...options.body }),
          redirect: "follow",
          signal: controller?.signal,
        });
      } else {
        const url = new URL(endpoint);
        url.searchParams.set("action", action);
        url.searchParams.set("_", Date.now().toString());
        response = await fetch(url, {
          redirect: "follow",
          signal: controller?.signal,
        });
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (!response.ok) {
      const error = new Error(`Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return normalizeResponse(await response.json());
  }

  /** Returns whether a failed bootstrap is safe and useful to retry once. */
  function isRetryableBootstrapError(error) {
    return (
      error?.name === "AbortError" ||
      error?.name === "TypeError" ||
      RETRYABLE_BOOTSTRAP_STATUSES.has(error?.status)
    );
  }

  /** Requests data, retrying one interrupted bootstrap without retrying writes. */
  async function request(action, options = {}) {
    const isBootstrap = action === "bootstrap" && !options.body;
    try {
      return await requestOnce(
        action,
        options,
        isBootstrap ? BOOTSTRAP_TIMEOUT_MS : 0,
      );
    } catch (error) {
      if (!isBootstrap || !isRetryableBootstrapError(error)) throw error;
      window.dispatchEvent(
        new CustomEvent("budget:data-refresh-retrying", {
          detail: { error, attempt: 2, maxAttempts: 2 },
        }),
      );
      return requestOnce(action, options, BOOTSTRAP_TIMEOUT_MS);
    }
  }

  /** Handles the applyReferenceData operation for the budget data layer. */
  function applyReferenceData(data, queuedAtStart = new Set()) {
    const collections = {
      categories: [data.categories, KEYS.categories],
      vendors: [data.vendors, KEYS.vendors],
      assignments: [data.assignments, KEYS.assignments],
    };
    Object.entries(collections).forEach(([name, [serverRecords, key]]) => {
      if (!Array.isArray(serverRecords))
        throw new Error(`The sheet response did not include a ${name} list.`);
      const merged = serverRecords.slice();
      const known = new Set(merged.map((record) => record.id));
      readArray(key)
        .filter(
          (record) => queuedAtStart.has(record.id) && !known.has(record.id),
        )
        .forEach((record) => merged.push(record));
      writeArray(key, merged);
    });
    replaceCachedUsers(data.users);
    restoreQueuedEntities();
  }

  /** Handles the loadReferenceData operation for the budget data layer. */
  async function loadReferenceData() {
    ensureLocalData();
    if (getConfig().endpoint) {
      const queuedAtStart = new Set(
        getEntityOutbox().map((item) => item.record.id),
      );
      const [categories, vendors, assignments, users] = await Promise.all([
        request("listCategories"),
        request("listVendors"),
        request("listAssignments"),
        request("listUsers"),
      ]);
      applyReferenceData(
        { categories, vendors, assignments, users },
        queuedAtStart,
      );
    }
    window.dispatchEvent(new CustomEvent("budget:reference-data-changed"));
    return {
      categories: listCategories(),
      vendors: listVendors(),
      assignments: listPeople(),
      users: listUsers(),
    };
  }

  /** Handles the hydrateTransaction operation for the budget data layer. */
  function hydrateTransaction(transaction) {
    const categories = readArray(KEYS.categories),
      vendors = readArray(KEYS.vendors),
      assignments = readArray(KEYS.assignments),
      users = readArray(KEYS.users);
    const category = categories.find(
      (item) => item.id === transaction.categoryId,
    );
    const vendor = vendors.find((item) => item.id === transaction.vendorId);
    const assignment = assignments.find(
      (item) => item.id === transaction.assignmentId,
    );
    const creator = users.find((item) => item.id === transaction.createdBy);
    return {
      ...transaction,
      category: category?.name || transaction.category || "Unknown",
      vendor: vendor?.name || transaction.vendor || "",
      assignment: assignment?.name || transaction.assignment || "Unknown",
      createdByName: creator
        ? `${creator.firstName} ${creator.lastName}`
        : transaction.createdByName || "Unknown",
    };
  }
  /** Handles the confirmedTransactionRecord operation for the budget data layer. */
  function confirmedTransactionRecord(transaction) {
    return Object.fromEntries(
      TRANSACTION_FIELDS.map((field) => [field, transaction[field] ?? ""]),
    );
  }
  /** Handles the readConfirmedTransactionCache operation for the budget data layer. */
  function readConfirmedTransactionCache() {
    try {
      const cached = JSON.parse(
        localStorage.getItem(KEYS.confirmedTransactions),
      );
      if (!cached || cached.version !== CONFIRMED_TRANSACTION_CACHE_VERSION)
        return null;
      if (!getConfig().endpoint || cached.endpoint !== getConfig().endpoint)
        return null;
      if (!Array.isArray(cached.transactions)) return null;
      return cached;
    } catch {
      return null;
    }
  }
  /** Handles the writeConfirmedTransactionCache operation for the budget data layer. */
  function writeConfirmedTransactionCache(transactions) {
    const endpoint = getConfig().endpoint;
    if (!endpoint || !Array.isArray(transactions)) return;
    localStorage.setItem(
      KEYS.confirmedTransactions,
      JSON.stringify({
        version: CONFIRMED_TRANSACTION_CACHE_VERSION,
        endpoint,
        cachedAt: new Date().toISOString(),
        transactions: transactions.map(confirmedTransactionRecord),
      }),
    );
  }
  /** Handles the updateConfirmedTransactionCache operation for the budget data layer. */
  function updateConfirmedTransactionCache(transactions) {
    const cached = readConfirmedTransactionCache();
    if (!cached || !Array.isArray(transactions) || !transactions.length) return;
    const byId = new Map(
      cached.transactions.map((transaction) => [transaction.id, transaction]),
    );
    transactions.forEach((transaction) =>
      byId.set(transaction.id, confirmedTransactionRecord(transaction)),
    );
    writeConfirmedTransactionCache([...byId.values()]);
  }
  /** Handles the mergeServerTransactions operation for the budget data layer. */
  function mergeServerTransactions(data) {
    if (!Array.isArray(data))
      throw new Error("The sheet response did not include a transaction list.");
    const hydrated = data.map(hydrateTransaction);
    const serverIds = new Set(hydrated.map((transaction) => transaction.id));
    const outbox = getOutbox();
    const remaining = outbox.filter(
      (item) => item.operation === "update" || !serverIds.has(item.record.id),
    );
    if (remaining.length !== outbox.length) {
      writeOutbox(remaining);
      emitSyncStatus();
    }
    const optimisticIds = new Set(remaining.map((item) => item.record.id));
    return [
      ...hydrated.filter((transaction) => !optimisticIds.has(transaction.id)),
      ...remaining.map(outboxTransaction),
    ];
  }

  /** Handles the listTransactions operation for the budget data layer. */
  async function listTransactions() {
    ensureLocalData();
    const data = getConfig().endpoint
      ? await request("listTransactions")
      : readArray(KEYS.transactions).map(hydrateTransaction);
    if (getConfig().endpoint) writeConfirmedTransactionCache(data);
    return mergeServerTransactions(data);
  }

  /** Handles the getCachedTransactions operation for the budget data layer. */
  function getCachedTransactions() {
    ensureLocalData();
    restoreQueuedEntities();
    const cached = readConfirmedTransactionCache();
    if (!cached) return null;
    return mergeServerTransactions(cached.transactions);
  }

  /** Handles the fetchAppData operation for the budget data layer. */
  async function fetchAppData() {
    ensureLocalData();
    if (!getConfig().endpoint) {
      const referenceData = await loadReferenceData();
      const transactions = await listTransactions();
      const investments = await integrations.investment?.load();
      const importProfiles = await integrations.imports?.listProfiles();
      return {
        ...referenceData,
        transactions,
        importProfiles: importProfiles || [],
        ...(investments || {}),
      };
    }

    const queuedAtStart = new Set(
      getEntityOutbox().map((item) => item.record.id),
    );
    try {
      const data = await request("bootstrap");
      if (!data || typeof data !== "object")
        throw new Error("The sheet response did not include bootstrap data.");
      applyReferenceData(data, queuedAtStart);
      writeConfirmedTransactionCache(data.transactions);
      const transactions = mergeServerTransactions(data.transactions);
      integrations.investment?.applyBootstrapData(data);
      integrations.imports?.applyBootstrapData(data);
      window.dispatchEvent(new CustomEvent("budget:reference-data-changed"));
      return { ...data, transactions };
    } catch (error) {
      if (!(error.isApiError && /unknown action/i.test(error.message)))
        throw error;
      const [referenceData, transactions, investments, importProfiles] =
        await Promise.all([
          loadReferenceData(),
          listTransactions(),
          integrations.investment?.load({ refresh: true }),
          integrations.imports?.listProfiles({ refresh: true }),
        ]);
      return {
        ...referenceData,
        transactions,
        importProfiles: importProfiles || [],
        ...(investments || {}),
      };
    }
  }

  /** Handles the loadAppData operation for the budget data layer. */
  function loadAppData(options = {}) {
    if (options.refresh) appDataPromise = null;
    if (!appDataPromise) {
      appDataPromise = fetchAppData().catch((error) => {
        appDataPromise = null;
        throw error;
      });
    }
    return appDataPromise;
  }

  /** Handles the createTransactionRecord operation for the budget data layer. */
  function createTransactionRecord(transaction) {
    ensureLocalData();
    const activeUser = getActiveUser();
    if (!activeUser) throw new Error("Choose or add a user in Settings first.");
    const type = transaction.type === "income" ? "income" : "expense";
    const category = listCategories({ type }).find(
      (item) => item.id === transaction.categoryId,
    );
    const assignment = listPeople().find(
      (item) => item.id === transaction.assignmentId,
    );
    const vendor =
      type === "income"
        ? null
        : listVendors().find((item) => item.id === transaction.vendorId);
    if (!category)
      throw new Error("Choose a valid category for this transaction type.");
    if (!assignment) throw new Error("Choose a valid assignment.");
    if (type !== "income" && !vendor) throw new Error("Choose a valid vendor.");
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount === 0)
      throw new Error("Amount must be a non-zero value.");
    return {
      ...transaction,
      type,
      amount: Math.round(amount * 100) / 100,
      vendorId: type === "income" ? "" : transaction.vendorId,
      id: transaction.id || uuid(),
      createdAt: transaction.createdAt || now(),
      createdBy: transaction.createdBy || activeUser.id,
    };
  }

  /** Handles the addTransaction operation for the budget data layer. */
  async function addTransaction(transaction) {
    const record = createTransactionRecord(transaction);
    if (getConfig().endpoint)
      return request("addTransaction", { body: { transaction: record } });
    const all = readArray(KEYS.transactions);
    all.push(record);
    writeArray(KEYS.transactions, all);
    return hydrateTransaction(record);
  }

  /** Handles the migrateTransactionOutbox operation for the budget data layer. */
  function migrateTransactionOutbox() {
    if (localStorage.getItem(KEYS.transactionOutbox) !== null) return;
    const legacy = readArray(KEYS.legacyTransactionOutbox);
    if (!legacy.length) return;
    writeArray(
      KEYS.transactionOutbox,
      legacy.map((item) => ({
        ...item,
        operation: "create",
        baseRecord: null,
        revision: 1,
        status:
          item.status === "syncing" ? "pending" : item.status || "pending",
      })),
    );
    localStorage.removeItem(KEYS.legacyTransactionOutbox);
  }
  /** Handles the getOutbox operation for the budget data layer. */
  function getOutbox() {
    migrateTransactionOutbox();
    return readArray(KEYS.transactionOutbox)
      .map((item) => ({
        ...item,
        operation: item.operation === "update" ? "update" : "create",
        baseRecord: item.baseRecord || null,
        revision: Math.max(1, Number(item.revision) || 1),
        status: item.status || "pending",
        attempts: Number(item.attempts) || 0,
        nextRetryAt: Number(item.nextRetryAt) || 0,
        error: String(item.error || ""),
        failureCode: String(item.failureCode || ""),
        currentRecord: item.currentRecord || null,
      }))
      .filter((item) => item.record?.id);
  }
  /** Handles the writeOutbox operation for the budget data layer. */
  function writeOutbox(items) {
    writeArray(KEYS.transactionOutbox, items);
  }
  /** Handles the outboxTransaction operation for the budget data layer. */
  function outboxTransaction(item) {
    return {
      ...hydrateTransaction(item.record),
      syncStatus: item.status,
      syncError: item.error,
      syncOperation: item.operation,
    };
  }
  /** Handles the getOutboxTransactions operation for the budget data layer. */
  function getOutboxTransactions() {
    return getOutbox().map(outboxTransaction);
  }
  /** Handles the getOutboxStatus operation for the budget data layer. */
  function getOutboxStatus() {
    const items = getOutbox();
    const offline = browserIsOffline();
    const retryingItems = items.filter(
      (item) => !offline && item.status === "pending" && item.attempts > 0,
    );
    const waitingForOnline = items.filter(
      (item) => offline && item.status === "pending",
    ).length;
    return {
      pending: items.filter((item) => item.status !== "failed").length,
      failed: items.filter((item) => item.status === "failed").length,
      syncing: items.filter((item) => item.status === "syncing").length,
      retrying: retryingItems.length,
      waitingForOnline,
      offline,
      nextRetryAt: retryingItems.length
        ? Math.min(...retryingItems.map((item) => item.nextRetryAt))
        : 0,
      total: items.length,
    };
  }
  /** Handles the emitSyncStatus operation for the budget data layer. */
  function emitSyncStatus(saved = [], completedOperation = "") {
    window.dispatchEvent(
      new CustomEvent("budget:transaction-sync-changed", {
        detail: {
          ...getOutboxStatus(),
          transactions: getOutboxTransactions(),
          saved,
          completedOperation,
        },
      }),
    );
    window.dispatchEvent(new CustomEvent("budget:sync-changed"));
  }

  /** Handles the queueTransaction operation for the budget data layer. */
  function queueTransaction(transaction) {
    const record = createTransactionRecord(transaction);
    if (!getConfig().endpoint) {
      const all = readArray(KEYS.transactions);
      all.push(record);
      writeArray(KEYS.transactions, all);
      const saved = hydrateTransaction(record);
      window.dispatchEvent(
        new CustomEvent("budget:transaction-saved", {
          detail: { saved: [saved] },
        }),
      );
      return saved;
    }
    const items = getOutbox();
    if (items.some((item) => item.record.id === record.id))
      throw new Error("That transaction is already queued.");
    const item = {
      operation: "create",
      record,
      baseRecord: null,
      revision: 1,
      status: "pending",
      attempts: 0,
      nextRetryAt: 0,
      error: "",
    };
    items.push(item);
    writeOutbox(items);
    const queued = outboxTransaction(item);
    window.dispatchEvent(
      new CustomEvent("budget:transaction-queued", {
        detail: { transaction: queued },
      }),
    );
    emitSyncStatus();
    scheduleSync(0);
    return queued;
  }

  /** Handles the queueImportedTransactions operation for the budget data layer. */
  function queueImportedTransactions(transactions) {
    if (!Array.isArray(transactions) || !transactions.length)
      throw new Error("Choose at least one ready transaction.");
    const records = transactions.map(createTransactionRecord);
    const ids = new Set();
    records.forEach((record) => {
      if (ids.has(record.id))
        throw new Error("An imported transaction can only be queued once.");
      ids.add(record.id);
    });
    const existingItems = getOutbox();
    if (existingItems.some((item) => ids.has(item.record.id)))
      throw new Error("An imported transaction is already queued.");
    if (!getConfig().endpoint) {
      const all = readArray(KEYS.transactions);
      all.push(...records);
      writeArray(KEYS.transactions, all);
      const saved = records.map(hydrateTransaction);
      window.dispatchEvent(
        new CustomEvent("budget:transaction-saved", {
          detail: { saved, operation: "create" },
        }),
      );
      return saved;
    }
    const additions = records.map((record) => ({
      operation: "create",
      record,
      baseRecord: null,
      revision: 1,
      status: "pending",
      attempts: 0,
      nextRetryAt: 0,
      error: "",
    }));
    writeOutbox(existingItems.concat(additions));
    const queued = additions.map(outboxTransaction);
    window.dispatchEvent(
      new CustomEvent("budget:transactions-queued", {
        detail: { transactions: queued },
      }),
    );
    emitSyncStatus();
    scheduleSync(0);
    return queued;
  }

  /** Handles the createUpdatedTransactionRecord operation for the budget data layer. */
  function createUpdatedTransactionRecord(transaction, base) {
    if (!base?.id || transaction.id !== base.id)
      throw new Error("That transaction could not be edited.");
    const type = transaction.type === "income" ? "income" : "expense";
    const category = listCategories({ type }).find(
      (item) => item.id === transaction.categoryId,
    );
    const assignment = listPeople().find(
      (item) => item.id === transaction.assignmentId,
    );
    const vendor =
      type === "income"
        ? null
        : listVendors().find((item) => item.id === transaction.vendorId);
    if (!category && transaction.categoryId !== base.categoryId)
      throw new Error("Choose a valid category for this transaction type.");
    if (!assignment && transaction.assignmentId !== base.assignmentId)
      throw new Error("Choose a valid assignment.");
    if (type !== "income" && !vendor && transaction.vendorId !== base.vendorId)
      throw new Error("Choose a valid vendor.");
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount === 0)
      throw new Error("Amount must be a non-zero value.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(transaction.date || "")))
      throw new Error("Choose a valid transaction date.");
    return {
      id: base.id,
      createdAt: base.createdAt,
      createdBy: base.createdBy,
      type,
      amount: Math.round(amount * 100) / 100,
      date: transaction.date,
      categoryId: transaction.categoryId,
      vendorId: type === "income" ? "" : transaction.vendorId,
      assignmentId: transaction.assignmentId,
      notes: String(transaction.notes || "").trim(),
    };
  }

  /** Handles the queueTransactionUpdate operation for the budget data layer. */
  function queueTransactionUpdate(transaction, openedRecord) {
    const items = getOutbox();
    const index = items.findIndex((item) => item.record.id === transaction.id);
    const existing = index >= 0 ? items[index] : null;
    const validationBase = existing?.record || openedRecord;
    const record = createUpdatedTransactionRecord(transaction, validationBase);
    if (!getConfig().endpoint) {
      const all = readArray(KEYS.transactions);
      const localIndex = all.findIndex((item) => item.id === record.id);
      if (localIndex < 0)
        throw new Error("That transaction could not be found.");
      all[localIndex] = record;
      writeArray(KEYS.transactions, all);
      const saved = hydrateTransaction(record);
      window.dispatchEvent(
        new CustomEvent("budget:transaction-saved", {
          detail: { saved: [saved], operation: "update" },
        }),
      );
      return saved;
    }

    let item;
    if (existing) {
      const reviewingConflict =
        existing.status === "failed" &&
        existing.failureCode === "conflict" &&
        existing.currentRecord;
      item = {
        ...existing,
        operation: existing.operation,
        record,
        baseRecord:
          existing.operation === "create"
            ? null
            : reviewingConflict
              ? openedRecord
              : existing.baseRecord,
        revision: existing.revision + 1,
        status: "pending",
        attempts: 0,
        nextRetryAt: 0,
        error: "",
        failureCode: "",
        currentRecord: null,
      };
      items[index] = item;
    } else {
      item = {
        operation: "update",
        record,
        baseRecord: openedRecord,
        revision: 1,
        status: "pending",
        attempts: 0,
        nextRetryAt: 0,
        error: "",
        failureCode: "",
        currentRecord: null,
      };
      items.push(item);
    }
    writeOutbox(items);
    const queued = outboxTransaction(item);
    window.dispatchEvent(
      new CustomEvent("budget:transaction-queued", {
        detail: { transaction: queued, operation: "update" },
      }),
    );
    emitSyncStatus();
    scheduleSync(0);
    return queued;
  }

  /** Handles the sendTransactionBatch operation for the budget data layer. */
  async function sendTransactionBatch(records) {
    if (batchTransactionsSupported !== false) {
      try {
        const result = await request("addTransactions", {
          body: { transactions: records },
        });
        batchTransactionsSupported = true;
        if (
          !result ||
          !Array.isArray(result.saved) ||
          !Array.isArray(result.failed)
        )
          throw new Error("The sheet returned an invalid batch response.");
        return result;
      } catch (error) {
        if (!/Unknown action/i.test(error.message)) throw error;
        batchTransactionsSupported = false;
      }
    }
    const saved = [],
      failed = [];
    for (const record of records) {
      try {
        saved.push(
          await request("addTransaction", { body: { transaction: record } }),
        );
      } catch (error) {
        if (!error.isApiError) throw error;
        failed.push({ id: record.id, error: error.message });
      }
    }
    return { saved, failed };
  }

  /** Handles the sendTransactionUpdateBatch operation for the budget data layer. */
  async function sendTransactionUpdateBatch(items) {
    const updates = items.map((item) => ({
      transaction: item.record,
      base: item.baseRecord,
    }));
    if (batchTransactionUpdatesSupported !== false) {
      try {
        const result = await request("updateTransactions", {
          body: { updates },
        });
        batchTransactionUpdatesSupported = true;
        if (
          !result ||
          !Array.isArray(result.saved) ||
          !Array.isArray(result.failed)
        )
          throw new Error(
            "The sheet returned an invalid transaction update response.",
          );
        return result;
      } catch (error) {
        if (!/Unknown action/i.test(error.message)) throw error;
        batchTransactionUpdatesSupported = false;
      }
    }
    const saved = [],
      failed = [];
    for (const update of updates) {
      try {
        saved.push(await request("updateTransaction", { body: { update } }));
      } catch (error) {
        if (!error.isApiError) throw error;
        failed.push({
          id: update.transaction.id,
          error: /Unknown action/i.test(error.message)
            ? "This deployment does not support transaction editing. Publish the latest Apps Script version."
            : error.message,
        });
      }
    }
    return { saved, failed };
  }

  /** Handles the scheduleSync operation for the budget data layer. */
  function scheduleSync(delay = 0) {
    if (typeof setTimeout !== "function") return;
    if (browserIsOffline()) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      return;
    }
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(
      () => {
        retryTimer = null;
        syncOutbox();
      },
      Math.max(0, delay),
    );
  }

  /** Handles the syncOutbox operation for the budget data layer. */
  async function syncOutbox() {
    if (syncPromise || !getConfig().endpoint || browserIsOffline())
      return syncPromise;
    const pendingEntities = new Set(
      getEntityOutbox().map((entity) => entity.record.id),
    );
    const eligible = getOutbox().filter(
      (item) =>
        item.status === "pending" &&
        !pendingEntities.has(item.record.categoryId) &&
        !pendingEntities.has(item.record.vendorId) &&
        !pendingEntities.has(item.record.assignmentId),
    );
    const due = eligible
      .filter((item) => item.nextRetryAt <= Date.now())
      .slice(0, OUTBOX_BATCH_SIZE);
    if (!due.length) {
      const future = eligible
        .filter((item) => item.nextRetryAt > Date.now())
        .sort((a, b) => a.nextRetryAt - b.nextRetryAt)[0];
      if (future) scheduleSync(future.nextRetryAt - Date.now());
      return null;
    }
    syncPromise = (async () => {
      const snapshots = new Map(
        due.map((item) => [
          item.record.id,
          {
            revision: item.revision,
            operation: item.operation,
            attempts: item.attempts,
            nextRetryAt: item.nextRetryAt,
            error: item.error,
          },
        ]),
      );
      let items = getOutbox().map((item) =>
        snapshots.has(item.record.id)
          ? { ...item, status: "syncing", error: "" }
          : item,
      );
      writeOutbox(items);
      emitSyncStatus();

      /** Handles the processBatch operation for the budget data layer. */
      async function processBatch(batch, operation) {
        if (!batch.length) return;
        try {
          const result =
            operation === "create"
              ? await sendTransactionBatch(batch.map((item) => item.record))
              : await sendTransactionUpdateBatch(batch);
          const savedById = new Map(
            result.saved.map((transaction) => [transaction.id, transaction]),
          );
          const failures = new Map(
            result.failed.map((failure) => [failure.id, failure]),
          );
          items = getOutbox().flatMap((item) => {
            const snapshot = snapshots.get(item.record.id);
            if (!snapshot || snapshot.operation !== operation) return [item];
            const saved = savedById.get(item.record.id);
            const failure = failures.get(item.record.id);
            if (item.revision !== snapshot.revision) {
              if (saved)
                return [
                  {
                    ...item,
                    operation: "update",
                    baseRecord: saved,
                    status: "pending",
                    attempts: 0,
                    nextRetryAt: 0,
                    error: "",
                  },
                ];
              return [{ ...item, status: "pending" }];
            }
            if (saved) return [];
            if (failure)
              return [
                {
                  ...item,
                  status: "failed",
                  error: failure.error,
                  failureCode: failure.code || "",
                  currentRecord: failure.current || null,
                  nextRetryAt: 0,
                },
              ];
            return [
              {
                ...item,
                status: "failed",
                error:
                  "The Sheet did not return a result for this transaction.",
                nextRetryAt: 0,
              },
            ];
          });
          writeOutbox(items);
          updateConfirmedTransactionCache(result.saved);
          if (result.saved.length)
            window.dispatchEvent(
              new CustomEvent("budget:transaction-saved", {
                detail: { saved: result.saved, operation },
              }),
            );
          emitSyncStatus(result.saved, operation);
          if (result.saved.length)
            window.dispatchEvent(
              new CustomEvent("budget:sync-succeeded", {
                detail: {
                  count: result.saved.length,
                  kind: "transaction",
                  operation,
                },
              }),
            );
          if (result.failed.length)
            window.dispatchEvent(
              new CustomEvent("budget:sync-failed", {
                detail: { count: result.failed.length, kind: "transaction" },
              }),
            );
        } catch (error) {
          const offline = browserIsOffline();
          const nowValue = Date.now();
          const firstFailure = batch.some((item) => item.attempts === 0);
          items = getOutbox().map((item) => {
            const snapshot = snapshots.get(item.record.id);
            if (
              !snapshot ||
              snapshot.operation !== operation ||
              item.revision !== snapshot.revision
            )
              return item;
            if (offline)
              return {
                ...item,
                status: "pending",
                attempts: snapshot.attempts,
                nextRetryAt: snapshot.nextRetryAt,
                error: snapshot.error,
              };
            const attempts = item.attempts + 1;
            const delay =
              RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
            return {
              ...item,
              status: "pending",
              attempts,
              nextRetryAt: nowValue + delay,
              error: error.message,
            };
          });
          writeOutbox(items);
          emitSyncStatus();
          if (!offline && firstFailure)
            window.dispatchEvent(
              new CustomEvent("budget:sync-retry-scheduled", {
                detail: {
                  kind: "transaction",
                  operation,
                  count: batch.length,
                  error: error.message,
                },
              }),
            );
        }
      }

      try {
        await processBatch(
          due.filter((item) => item.operation === "create"),
          "create",
        );
        await processBatch(
          due.filter((item) => item.operation === "update"),
          "update",
        );
      } finally {
        syncPromise = null;
        const next = getOutbox()
          .filter((item) => item.status === "pending")
          .sort((a, b) => a.nextRetryAt - b.nextRetryAt)[0];
        if (next) scheduleSync(Math.max(0, next.nextRetryAt - Date.now()));
      }
    })();
    return syncPromise;
  }

  /** Handles the awaitImportedTransactions operation for the budget data layer. */
  async function awaitImportedTransactions(ids, onProgress) {
    const targets = new Set((ids || []).map(String));
    if (!targets.size) return [];
    while (targets.size) {
      if (browserIsOffline())
        throw new Error("The import paused because the browser went offline.");
      const items = [...targets]
        .map((id) => getTransactionOutboxItem(id))
        .filter(Boolean);
      const failed = items.find((item) => item.status === "failed");
      if (failed)
        throw new Error(failed.error || "A transaction could not be saved.");
      [...targets].forEach((id) => {
        if (!getTransactionOutboxItem(id)) targets.delete(id);
      });
      onProgress?.({ completed: ids.length - targets.size, total: ids.length });
      if (!targets.size) break;
      const retrying = items.find(
        (item) =>
          item.status === "pending" &&
          item.attempts > 0 &&
          item.nextRetryAt > Date.now(),
      );
      if (retrying)
        throw new Error(
          retrying.error ||
            "The transaction sync paused and is ready to retry.",
        );
      await syncOutbox();
      await Promise.resolve();
    }
    return ids;
  }

  /** Handles the retryFailedTransactions operation for the budget data layer. */
  function retryFailedTransactions() {
    if (browserIsOffline())
      throw new Error("Retry is available when you are back online.");
    writeOutbox(
      getOutbox().map((item) =>
        item.status === "failed"
          ? {
              ...item,
              status: "pending",
              attempts: 0,
              nextRetryAt: 0,
              error: "",
            }
          : item,
      ),
    );
    emitSyncStatus();
    scheduleSync(0);
  }
  /** Handles the retryTransaction operation for the budget data layer. */
  function retryTransaction(id) {
    if (browserIsOffline())
      throw new Error("Retry is available when you are back online.");
    const items = getOutbox();
    const target = items.find((item) => item.record.id === id);
    if (!target) throw new Error("That transaction change could not be found.");
    if (target.status === "syncing")
      throw new Error("That transaction is already syncing.");
    if (target.failureCode === "conflict")
      throw new Error("Review this conflict before retrying it.");
    const preserveAttempts = target.status === "pending" && target.attempts > 0;
    writeOutbox(
      items.map((item) =>
        item === target
          ? {
              ...item,
              status: "pending",
              attempts: preserveAttempts ? item.attempts : 0,
              nextRetryAt: 0,
              error: "",
              failureCode: "",
            }
          : item,
      ),
    );
    emitSyncStatus();
    scheduleSync(0);
  }
  /** Handles the discardTransactionChange operation for the budget data layer. */
  function discardTransactionChange(id) {
    const items = getOutbox();
    const item = items.find((entry) => entry.record.id === id);
    if (!item) return null;
    if (item.status === "syncing")
      throw new Error("That transaction is already syncing.");
    writeOutbox(items.filter((entry) => entry.record.id !== id));
    if (item.operation === "update" && item.baseRecord) {
      const restored = hydrateTransaction(
        item.currentRecord || item.baseRecord,
      );
      window.dispatchEvent(
        new CustomEvent("budget:transaction-restored", {
          detail: { transaction: restored },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("budget:transaction-removed", { detail: { id } }),
      );
    }
    emitSyncStatus();
    return item;
  }
  /** Handles the removeFailedTransactions operation for the budget data layer. */
  function removeFailedTransactions() {
    getOutbox()
      .filter((item) => item.status === "failed")
      .forEach((item) => discardTransactionChange(item.record.id));
  }
  /** Handles the getTransactionOutboxItem operation for the budget data layer. */
  function getTransactionOutboxItem(id) {
    const item = getOutbox().find((entry) => entry.record.id === id);
    return item
      ? {
          ...item,
          record: { ...item.record },
          baseRecord: item.baseRecord ? { ...item.baseRecord } : null,
        }
      : null;
  }
  /** Handles the getSyncItems operation for the budget data layer. */
  function getSyncItems() {
    const offline = browserIsOffline();
    const transactions = getOutbox().map((item) => ({
      key: `transaction:${item.record.id}`,
      source: "transaction",
      operation: item.operation,
      id: item.record.id,
      status: item.status,
      error: item.error,
      failureCode: item.failureCode,
      attempts: item.attempts,
      nextRetryAt: item.nextRetryAt,
      retrying: !offline && item.status === "pending" && item.attempts > 0,
      waitingForOnline: offline && item.status === "pending",
      record: hydrateTransaction(item.record),
      currentRecord: item.currentRecord
        ? hydrateTransaction(item.currentRecord)
        : null,
    }));
    const entities = getEntityOutbox().map((item) => ({
      key: `entity:${item.kind}:${item.record.id}`,
      source: "entity",
      operation: item.operation,
      kind: item.kind,
      id: item.record.id,
      status: item.status,
      error: item.error,
      attempts: item.attempts,
      nextRetryAt: item.nextRetryAt,
      retrying: !offline && item.status === "pending" && item.attempts > 0,
      waitingForOnline: offline && item.status === "pending",
      record: { ...item.record },
    }));
    return [...entities, ...transactions];
  }
  /** Handles the recoverInterruptedSync operation for the budget data layer. */
  function recoverInterruptedSync() {
    writeOutbox(
      getOutbox().map((item) =>
        item.status === "syncing"
          ? { ...item, status: "pending", nextRetryAt: 0 }
          : item,
      ),
    );
    writeEntityOutbox(
      getEntityOutbox().map((item) =>
        item.status === "syncing"
          ? { ...item, status: "pending", nextRetryAt: 0 }
          : item,
      ),
    );
  }
  /** Handles the retryTransportFailuresNow operation for the budget data layer. */
  function retryTransportFailuresNow() {
    const transactions = getOutbox();
    const entities = getEntityOutbox();
    const transactionChanged = transactions.some(
      (item) =>
        item.status === "pending" && item.attempts > 0 && item.nextRetryAt > 0,
    );
    const entityChanged = entities.some(
      (item) =>
        item.status === "pending" && item.attempts > 0 && item.nextRetryAt > 0,
    );
    if (transactionChanged) {
      writeOutbox(
        transactions.map((item) =>
          item.status === "pending" && item.attempts > 0
            ? { ...item, nextRetryAt: 0 }
            : item,
        ),
      );
      emitSyncStatus();
    }
    if (entityChanged) {
      writeEntityOutbox(
        entities.map((item) =>
          item.status === "pending" && item.attempts > 0
            ? { ...item, nextRetryAt: 0 }
            : item,
        ),
      );
      emitEntitySyncStatus();
    }
  }
  /** Handles the pauseSyncWhileOffline operation for the budget data layer. */
  function pauseSyncWhileOffline() {
    if (retryTimer) clearTimeout(retryTimer);
    if (entityRetryTimer) clearTimeout(entityRetryTimer);
    retryTimer = null;
    entityRetryTimer = null;
    emitEntitySyncStatus();
    emitSyncStatus();
  }
  /** Handles the testConnection operation for the budget data layer. */
  async function testConnection(endpointOverride) {
    const current = getConfig();
    if (endpointOverride !== undefined)
      saveConfig({ endpoint: endpointOverride });
    try {
      return await request("health");
    } finally {
      if (endpointOverride !== undefined) saveConfig(current);
    }
  }

  ensureLocalData();
  recoverInterruptedSync();
  const api = {
    INCOME_CATEGORY_ID,
    SHARED_ASSIGNMENT_ID,
    getConfig,
    saveConfig,
    loadReferenceData,
    loadAppData,
    getCachedTransactions,
    listTransactions,
    addTransaction,
    queueTransaction,
    queueImportedTransactions,
    queueTransactionUpdate,
    syncOutbox,
    getOutboxTransactions,
    getOutboxStatus,
    getTransactionOutboxItem,
    getSyncItems,
    retryFailedTransactions,
    retryTransaction,
    discardTransactionChange,
    removeFailedTransactions,
    getEntitySyncStatus,
    getEntityOutboxStatus,
    syncEntityOutbox,
    retryEntity,
    discardEntityChange,
    removeFailedEntity,
    createImportedEntityDraft,
    commitImportedEntities,
    awaitImportedTransactions,
    listArchivedEntities,
    getEntity,
    listAllCategories,
    listCategories,
    addCategory,
    updateCategory: (input) => updateEntity("category", input),
    reactivateCategory: (input) => reactivateEntity("category", input),
    archiveCategory: (id) => archiveEntity("category", id),
    listAllVendors,
    listVendors,
    addVendor,
    updateVendor: (input) => updateEntity("vendor", input),
    reactivateVendor: (input) => reactivateEntity("vendor", input),
    archiveVendor: (id) => archiveEntity("vendor", id),
    listAllPeople,
    listPeople,
    addPerson,
    updatePerson: (input) => updateEntity("assignment", input),
    reactivatePerson: (input) => reactivateEntity("assignment", input),
    archivePerson: (id) => archiveEntity("assignment", id),
    listUsers,
    addUser,
    updateUser,
    getActiveUser,
    setActiveUser,
    testConnection,
  };
  if (typeof window.addEventListener === "function") {
    window.addEventListener("offline", pauseSyncWhileOffline);
    window.addEventListener("online", () => {
      retryTransportFailuresNow();
      syncEntityOutbox();
      syncOutbox();
    });
  }
  restoreQueuedEntities();
  scheduleEntitySync(0);
  scheduleSync(0);
  return api;
}
