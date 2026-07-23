(function () {
  const KEYS = Object.freeze({
    profiles: "myFinance.importProfiles.v1",
    vendorMappings: "myFinance.importVendorMappings.v1",
    personMappings: "myFinance.importPersonMappings.v1",
  });

  const read = (key) => {
    try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  const now = () => new Date().toISOString();
  const endpoint = () => window.BudgetAPI.getConfig().endpoint;

  async function request(action, body = {}) {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...body }),
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    const payload = await response.json();
    if (payload?.ok === false) throw new Error(payload.error || "The Sheet returned an error.");
    return payload?.data ?? payload;
  }

  function normalizeProfile(input, existing = {}) {
    const timestamp = now();
    const target = input.target === "investment" ? "investment" : "budget";
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Enter a profile name.");
    if (target === "investment" && !input.investmentAccountId) throw new Error("Choose an investment account.");
    return {
      ...existing,
      id: existing.id || input.id || uuid(), name, target,
      investmentAccountId: target === "investment" ? String(input.investmentAccountId || "") : "",
      headerSignature: String(input.headerSignature || "[]"),
      columnMapping: input.columnMapping && typeof input.columnMapping === "object" ? input.columnMapping : {},
      dateFormat: String(input.dateFormat || (target === "investment" ? "YYYY-MM" : "YYYY-MM-DD")),
      amountMode: target === "budget" && input.amountMode === "debitCredit" ? "debitCredit" : target === "budget" ? "unified" : "monthly",
      amountMultiplier: Number(input.amountMultiplier) === -1 ? -1 : 1,
      active: input.active !== false,
      createdAt: existing.createdAt || input.createdAt || timestamp,
      updatedAt: timestamp,
    };
  }

  function createProfileDraft(input) {
    const all = read(KEYS.profiles);
    const existing = all.find((item) => item.id === input.id) || {};
    return normalizeProfile(input, existing);
  }

  async function listProfiles(options = {}) {
    if (options.refresh && endpoint()) {
      const profiles = await request("listImportProfiles");
      write(KEYS.profiles, profiles);
    }
    return read(KEYS.profiles).filter((item) => item.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function saveProfile(input) {
    const all = read(KEYS.profiles);
    const index = all.findIndex((item) => item.id === input.id);
    const profile = normalizeProfile(input, index >= 0 ? all[index] : {});
    const saved = endpoint()
      ? await request(index >= 0 ? "updateImportProfile" : "createImportProfile", { profile })
      : profile;
    if (index >= 0) all[index] = saved; else all.push(saved);
    write(KEYS.profiles, all);
    window.dispatchEvent(new CustomEvent("budget:import-profiles-changed", { detail: saved }));
    return saved;
  }

  async function archiveProfile(id) {
    const all = read(KEYS.profiles);
    const index = all.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("That import profile could not be found.");
    const saved = endpoint() ? await request("archiveImportProfile", { id }) : { ...all[index], active: false, updatedAt: now() };
    all[index] = saved;
    write(KEYS.profiles, all);
    window.dispatchEvent(new CustomEvent("budget:import-profiles-changed", { detail: saved }));
    return saved;
  }

  async function loadProfileBundle(profileId, options = {}) {
    let profile = read(KEYS.profiles).find((item) => item.id === profileId) || null;
    let vendorMappings = read(KEYS.vendorMappings).filter((item) => item.importProfileId === profileId);
    let personMappings = read(KEYS.personMappings).filter((item) => item.importProfileId === profileId);
    if ((options.refresh || !profile) && endpoint()) {
      const bundle = await request("getImportProfileBundle", { id: profileId });
      profile = bundle.profile;
      const profiles = read(KEYS.profiles).filter((item) => item.id !== profile.id).concat(profile);
      write(KEYS.profiles, profiles);
      const merge = (key, items) => write(key, read(key).filter((item) => item.importProfileId !== profileId).concat(items));
      vendorMappings = bundle.vendorMappings || [];
      personMappings = bundle.personMappings || [];
      merge(KEYS.vendorMappings, vendorMappings);
      merge(KEYS.personMappings, personMappings);
    }
    if (!profile) throw new Error("That import profile could not be found.");
    return { profile, vendorMappings, personMappings };
  }

  function dedupeMappings(items, idField) {
    const unique = new Map();
    items.forEach((item) => {
      const sourceDescription = String(item.sourceDescription || "");
      const normalizedSourceDescription = window.ImportUtils.normalizeDescription(sourceDescription);
      if (!normalizedSourceDescription || !item[idField]) return;
      unique.set(normalizedSourceDescription, {
        ...item, sourceDescription, normalizedSourceDescription,
      });
    });
    return [...unique.values()];
  }

  async function saveMappings(profileId, changes) {
    const vendors = dedupeMappings(changes.vendorMappings || [], "vendorId");
    const people = dedupeMappings(changes.personMappings || [], "assignmentId");
    const result = endpoint()
      ? await request("upsertImportMappings", { importProfileId: profileId, vendorMappings: vendors, personMappings: people })
      : {
          vendorMappings: localUpsert(KEYS.vendorMappings, profileId, vendors, "vendorId"),
          personMappings: localUpsert(KEYS.personMappings, profileId, people, "assignmentId"),
        };
    replaceProfileMappings(KEYS.vendorMappings, profileId, result.vendorMappings || []);
    replaceProfileMappings(KEYS.personMappings, profileId, result.personMappings || []);
    window.dispatchEvent(new CustomEvent("budget:import-mappings-changed", { detail: { profileId } }));
    return result;
  }

  function localUpsert(key, profileId, changes, idField) {
    const all = read(key);
    const timestamp = now();
    changes.forEach((change) => {
      const index = all.findIndex((item) => item.importProfileId === profileId && item.normalizedSourceDescription === change.normalizedSourceDescription);
      const record = {
        ...(index >= 0 ? all[index] : {}), ...change,
        id: index >= 0 ? all[index].id : uuid(), importProfileId: profileId,
        [idField]: change[idField], active: true,
        createdAt: index >= 0 ? all[index].createdAt : timestamp, updatedAt: timestamp,
      };
      if (index >= 0) all[index] = record; else all.push(record);
    });
    write(key, all);
    return all.filter((item) => item.importProfileId === profileId);
  }

  function replaceProfileMappings(key, profileId, items) {
    write(key, read(key).filter((item) => item.importProfileId !== profileId).concat(items));
  }

  window.ImportAPI = { listProfiles, createProfileDraft, saveProfile, archiveProfile, loadProfileBundle, saveMappings };
})();
