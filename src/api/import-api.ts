import {
  isRecord,
  now,
  readStorageArray,
  requestJson,
  uuid,
  writeStorageArray,
} from "../utilities/data-utilities";

export type ImportTarget = "budget" | "investment";
export type AmountMode = "unified" | "debitCredit" | "monthly";
export type ImportColumnMappingValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | number[]
  | { index: number };
export type ImportColumnMapping = Record<string, ImportColumnMappingValue>;

export interface ImportProfile {
  id: string;
  name: string;
  target: ImportTarget;
  investmentAccountId: string;
  headerSignature: string;
  columnMapping: ImportColumnMapping;
  dateFormat: string;
  amountMode: AmountMode;
  amountMultiplier: 1 | -1;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportProfileInput extends Partial<ImportProfile> {
  name: string;
}

export interface ImportMapping {
  id?: string;
  importProfileId?: string;
  sourceDescription: string;
  normalizedSourceDescription?: string;
  vendorId?: string;
  assignmentId?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImportProfileBundle {
  profile: ImportProfile;
  vendorMappings: ImportMapping[];
  personMappings: ImportMapping[];
}

export interface ImportMappingChanges {
  vendorMappings?: ImportMapping[];
  personMappings?: ImportMapping[];
}

export interface ImportMappingResult {
  vendorMappings: ImportMapping[];
  personMappings: ImportMapping[];
}

export interface ImportBootstrapData {
  importProfiles: ImportProfile[];
}

export interface ImportAPIContract {
  listProfiles(options?: { refresh?: boolean }): Promise<ImportProfile[]>;
  applyBootstrapData(data: unknown): ImportProfile[];
  createProfileDraft(input: ImportProfileInput): ImportProfile;
  saveProfile(input: ImportProfileInput): Promise<ImportProfile>;
  archiveProfile(id: string): Promise<ImportProfile>;
  loadProfileBundle(
    profileId: string,
    options?: { refresh?: boolean },
  ): Promise<ImportProfileBundle>;
  saveMappings(
    profileId: string,
    changes: ImportMappingChanges,
  ): Promise<ImportMappingResult>;
}

const KEYS = Object.freeze({
  profiles: "myFinance.importProfiles.v1",
  vendorMappings: "myFinance.importVendorMappings.v1",
  personMappings: "myFinance.importPersonMappings.v1",
});

/** Parses an import profile from untrusted storage or API data. */
function parseProfile(value: unknown): ImportProfile | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return normalizeProfile(
    {
      id: value.id,
      name: typeof value.name === "string" ? value.name : "",
      target: value.target === "investment" ? "investment" : "budget",
      investmentAccountId:
        typeof value.investmentAccountId === "string"
          ? value.investmentAccountId
          : "",
      headerSignature:
        typeof value.headerSignature === "string"
          ? value.headerSignature
          : "[]",
      columnMapping: parseColumnMapping(value.columnMapping),
      dateFormat:
        typeof value.dateFormat === "string" ? value.dateFormat : undefined,
      amountMode:
        value.amountMode === "debitCredit" ||
        value.amountMode === "unified" ||
        value.amountMode === "monthly"
          ? value.amountMode
          : undefined,
      amountMultiplier: value.amountMultiplier === -1 ? -1 : 1,
      active: value.active !== false,
      createdAt:
        typeof value.createdAt === "string" ? value.createdAt : undefined,
      updatedAt:
        typeof value.updatedAt === "string" ? value.updatedAt : undefined,
    },
    {},
  );
}

/** Parses supported column-mapping values from external data. */
function parseColumnMapping(value: unknown): ImportColumnMapping {
  if (!isRecord(value)) return {};
  const result: ImportColumnMapping = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      result[key] = item;
    } else if (Array.isArray(item) && item.every((entry) => typeof entry === "number")) {
      result[key] = item;
    } else if (isRecord(item) && typeof item.index === "number") {
      result[key] = { index: item.index };
    }
  }
  return result;
}

/** Parses an import mapping from untrusted storage or API data. */
function parseMapping(value: unknown): ImportMapping | null {
  if (!isRecord(value) || typeof value.sourceDescription !== "string") {
    return null;
  }
  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.importProfileId === "string"
      ? { importProfileId: value.importProfileId }
      : {}),
    sourceDescription: value.sourceDescription,
    ...(typeof value.normalizedSourceDescription === "string"
      ? { normalizedSourceDescription: value.normalizedSourceDescription }
      : {}),
    ...(typeof value.vendorId === "string" ? { vendorId: value.vendorId } : {}),
    ...(typeof value.assignmentId === "string"
      ? { assignmentId: value.assignmentId }
      : {}),
    active: value.active !== false,
    ...(typeof value.createdAt === "string"
      ? { createdAt: value.createdAt }
      : {}),
    ...(typeof value.updatedAt === "string"
      ? { updatedAt: value.updatedAt }
      : {}),
  };
}

/** Reads cached import profiles. */
function readProfiles(): ImportProfile[] {
  return readStorageArray(KEYS.profiles, parseProfile);
}

/** Reads cached mappings from the requested storage key. */
function readMappings(key: string): ImportMapping[] {
  return readStorageArray(key, parseMapping);
}

/** Validates a profile returned by the remote API. */
function requireProfile(value: unknown): ImportProfile {
  const profile = parseProfile(value);
  if (!profile) throw new Error("The Sheet returned an invalid import profile.");
  return profile;
}

/** Validates a list of profiles returned by the remote API. */
function requireProfiles(value: unknown): ImportProfile[] {
  if (!Array.isArray(value)) {
    throw new Error("The sheet response did not include an import profile list.");
  }
  const profiles = value.map(parseProfile);
  if (profiles.some((profile) => profile === null)) {
    throw new Error("The Sheet returned an invalid import profile.");
  }
  return profiles as ImportProfile[];
}

/** Validates a list of mappings returned by the remote API. */
function requireMappings(value: unknown): ImportMapping[] {
  if (!Array.isArray(value)) return [];
  const mappings = value.map(parseMapping);
  if (mappings.some((mapping) => mapping === null)) {
    throw new Error("The Sheet returned an invalid import mapping.");
  }
  return mappings as ImportMapping[];
}

/** Builds the import API and its private state. */
export function ImportAPI(): ImportAPIContract {
  /** Returns the currently configured Apps Script endpoint. */
  function endpoint(): string {
    return window.BudgetAPI.getConfig().endpoint;
  }

  /** Sends an import action to the configured endpoint. */
  async function request(
    action: string,
    body: Record<string, unknown> = {},
  ): Promise<unknown> {
    return requestJson(endpoint(), action, body);
  }

  /** Normalizes and validates an import profile draft. */
  function normalizeProfileDraft(
    input: ImportProfileInput,
    existing: Partial<ImportProfile> = {},
  ): ImportProfile {
    return normalizeProfile(input, existing);
  }

  /** Creates a normalized profile without persisting it. */
  function createProfileDraft(input: ImportProfileInput): ImportProfile {
    const existing =
      readProfiles().find((item) => item.id === input.id) ?? {};
    return normalizeProfileDraft(input, existing);
  }

  /** Applies import profiles supplied by bootstrap data to the local cache. */
  function applyBootstrapData(data: unknown): ImportProfile[] {
    if (!isRecord(data)) {
      throw new Error(
        "The sheet response did not include an import profile list.",
      );
    }
    const profiles = requireProfiles(data.importProfiles);
    writeStorageArray(KEYS.profiles, profiles);
    window.dispatchEvent(new CustomEvent("budget:import-profiles-changed"));
    return profiles;
  }

  /** Lists active import profiles, optionally refreshing from the Sheet. */
  async function listProfiles(
    options: { refresh?: boolean } = {},
  ): Promise<ImportProfile[]> {
    if (options.refresh && endpoint()) {
      writeStorageArray(
        KEYS.profiles,
        requireProfiles(await request("listImportProfiles")),
      );
    }
    return readProfiles()
      .filter((item) => item.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Creates or updates an import profile and caches the saved record. */
  async function saveProfile(
    input: ImportProfileInput,
  ): Promise<ImportProfile> {
    const all = readProfiles();
    const index = all.findIndex((item) => item.id === input.id);
    const profile = normalizeProfileDraft(
      input,
      index >= 0 ? all[index] : {},
    );
    const saved = endpoint()
      ? requireProfile(
          await request(
            index >= 0 ? "updateImportProfile" : "createImportProfile",
            { profile },
          ),
        )
      : profile;
    if (index >= 0) all[index] = saved;
    else all.push(saved);
    writeStorageArray(KEYS.profiles, all);
    window.dispatchEvent(
      new CustomEvent("budget:import-profiles-changed", { detail: saved }),
    );
    return saved;
  }

  /** Archives an import profile and caches the archived record. */
  async function archiveProfile(id: string): Promise<ImportProfile> {
    const all = readProfiles();
    const index = all.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("That import profile could not be found.");
    const saved = endpoint()
      ? requireProfile(await request("archiveImportProfile", { id }))
      : { ...all[index], active: false, updatedAt: now() };
    all[index] = saved;
    writeStorageArray(KEYS.profiles, all);
    window.dispatchEvent(
      new CustomEvent("budget:import-profiles-changed", { detail: saved }),
    );
    return saved;
  }

  /** Loads a profile and its vendor and person mappings. */
  async function loadProfileBundle(
    profileId: string,
    options: { refresh?: boolean } = {},
  ): Promise<ImportProfileBundle> {
    let profile =
      readProfiles().find((item) => item.id === profileId) ?? null;
    let vendorMappings = readMappings(KEYS.vendorMappings).filter(
      (item) => item.importProfileId === profileId,
    );
    let personMappings = readMappings(KEYS.personMappings).filter(
      (item) => item.importProfileId === profileId,
    );
    if ((options.refresh || !profile) && endpoint()) {
      const rawBundle = await request("getImportProfileBundle", {
        id: profileId,
      });
      if (!isRecord(rawBundle)) {
        throw new Error("The Sheet returned an invalid import profile bundle.");
      }
      profile = requireProfile(rawBundle.profile);
      writeStorageArray(
        KEYS.profiles,
        readProfiles()
          .filter((item) => item.id !== profile?.id)
          .concat(profile),
      );
      vendorMappings = requireMappings(rawBundle.vendorMappings);
      personMappings = requireMappings(rawBundle.personMappings);
      replaceProfileMappings(KEYS.vendorMappings, profileId, vendorMappings);
      replaceProfileMappings(KEYS.personMappings, profileId, personMappings);
    }
    if (!profile) throw new Error("That import profile could not be found.");
    return { profile, vendorMappings, personMappings };
  }

  /** Deduplicates mappings by their normalized source description. */
  function dedupeMappings(
    items: ImportMapping[],
    idField: "vendorId" | "assignmentId",
  ): ImportMapping[] {
    const unique = new Map<string, ImportMapping>();
    items.forEach((item) => {
      const sourceDescription = String(item.sourceDescription || "");
      const normalizedSourceDescription =
        window.ImportUtils.normalizeDescription(sourceDescription);
      if (!normalizedSourceDescription || !item[idField]) return;
      unique.set(normalizedSourceDescription, {
        ...item,
        sourceDescription,
        normalizedSourceDescription,
      });
    });
    return [...unique.values()];
  }

  /** Saves vendor and person mapping changes for a profile. */
  async function saveMappings(
    profileId: string,
    changes: ImportMappingChanges,
  ): Promise<ImportMappingResult> {
    const vendors = dedupeMappings(changes.vendorMappings ?? [], "vendorId");
    const people = dedupeMappings(
      changes.personMappings ?? [],
      "assignmentId",
    );
    let result: ImportMappingResult;
    if (endpoint()) {
      const rawResult = await request("upsertImportMappings", {
        importProfileId: profileId,
        vendorMappings: vendors,
        personMappings: people,
      });
      if (!isRecord(rawResult)) {
        throw new Error("The Sheet returned an invalid mapping response.");
      }
      result = {
        vendorMappings: requireMappings(rawResult.vendorMappings),
        personMappings: requireMappings(rawResult.personMappings),
      };
    } else {
      result = {
        vendorMappings: localUpsert(
          KEYS.vendorMappings,
          profileId,
          vendors,
          "vendorId",
        ),
        personMappings: localUpsert(
          KEYS.personMappings,
          profileId,
          people,
          "assignmentId",
        ),
      };
    }
    replaceProfileMappings(
      KEYS.vendorMappings,
      profileId,
      result.vendorMappings,
    );
    replaceProfileMappings(
      KEYS.personMappings,
      profileId,
      result.personMappings,
    );
    window.dispatchEvent(
      new CustomEvent("budget:import-mappings-changed", {
        detail: { profileId },
      }),
    );
    return result;
  }

  /** Upserts mappings in local storage when no remote endpoint is configured. */
  function localUpsert(
    key: string,
    profileId: string,
    changes: ImportMapping[],
    idField: "vendorId" | "assignmentId",
  ): ImportMapping[] {
    const all = readMappings(key);
    const timestamp = now();
    changes.forEach((change) => {
      const index = all.findIndex(
        (item) =>
          item.importProfileId === profileId &&
          item.normalizedSourceDescription ===
            change.normalizedSourceDescription,
      );
      const previous = index >= 0 ? all[index] : undefined;
      const idValue = change[idField];
      if (!idValue) return;
      const record: ImportMapping = {
        ...previous,
        ...change,
        id: previous?.id ?? uuid(),
        importProfileId: profileId,
        [idField]: idValue,
        active: true,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      if (index >= 0) all[index] = record;
      else all.push(record);
    });
    writeStorageArray(key, all);
    return all.filter((item) => item.importProfileId === profileId);
  }

  /** Replaces all locally cached mappings for one profile. */
  function replaceProfileMappings(
    key: string,
    profileId: string,
    items: ImportMapping[],
  ): void {
    writeStorageArray(
      key,
      readMappings(key)
        .filter((item) => item.importProfileId !== profileId)
        .concat(items),
    );
  }

  return {
    listProfiles,
    applyBootstrapData,
    createProfileDraft,
    saveProfile,
    archiveProfile,
    loadProfileBundle,
    saveMappings,
  };
}

/** Normalizes and validates a profile using existing persisted fields. */
function normalizeProfile(
  input: ImportProfileInput,
  existing: Partial<ImportProfile> = {},
): ImportProfile {
  const timestamp = now();
  const target: ImportTarget =
    input.target === "investment" ? "investment" : "budget";
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Enter a profile name.");
  if (target === "investment" && !input.investmentAccountId) {
    throw new Error("Choose an investment account.");
  }
  return {
    id: existing.id ?? input.id ?? uuid(),
    name,
    target,
    investmentAccountId:
      target === "investment" ? String(input.investmentAccountId || "") : "",
    headerSignature: String(input.headerSignature || "[]"),
    columnMapping: input.columnMapping ?? {},
    dateFormat: String(
      input.dateFormat || (target === "investment" ? "YYYY-MM" : "YYYY-MM-DD"),
    ),
    amountMode:
      target === "budget" && input.amountMode === "debitCredit"
        ? "debitCredit"
        : target === "budget"
          ? "unified"
          : "monthly",
    amountMultiplier: Number(input.amountMultiplier) === -1 ? -1 : 1,
    active: input.active !== false,
    createdAt: existing.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}
