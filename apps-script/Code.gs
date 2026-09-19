/** Google Apps Script web API for the normalized budget data model. */

const APP = Object.freeze({
  spreadsheetIdProperty: "SPREADSHEET_ID",
  setupVersionProperty: "SETUP_VERSION",
  setupStateProperty: "SETUP_STATE",
  setupVersion: "16",
  unifiedActivityMigrationProperty: "UNIFIED_ACTIVITY_V12_SPREADSHEET_ID",
  legacyAccountsMigrationProperty: "LEGACY_ACCOUNTS_V11_SPREADSHEET_ID",
  accountCategoryRepairProperty: "ACCOUNT_CATEGORY_V16_SPREADSHEET_ID",
  apiVersion: 16,
  incomeCategoryId: "00000000-0000-4000-8000-000000000001",
  debtPaymentCategoryId: "00000000-0000-4000-8000-000000000002",
  sharedAssignmentId: "00000000-0000-4000-8000-000000000101",
});

// Read-only schemas used exclusively by the v11 migration. Runtime code must
// use TABLES.accounts, TABLES.accountBalances, and TABLES.accountActivity.
const LEGACY_ACCOUNT_TABLES = Object.freeze({
  investmentAccounts: { name: "InvestmentAccounts", headers: ["ID", "Name", "Source", "Assignment ID", "Active", "Created At", "Updated At"], fields: ["id", "name", "source", "assignmentId", "active", "createdAt", "updatedAt"] },
  investmentBalances: { name: "InvestmentBalances", headers: ["ID", "Account ID", "Month", "Ending Balance", "Notes", "Created At", "Created By", "Updated At", "Updated By", "As Of Date"], fields: ["id", "accountId", "month", "balance", "notes", "createdAt", "createdBy", "updatedAt", "updatedBy", "asOfDate"] },
  investmentContributions: { name: "InvestmentContributions", headers: ["ID", "Account ID", "Month", "Amount", "Created At", "Created By", "Updated At", "Updated By", "Date", "Flow Type", "Transfer ID", "Counterparty Account ID"], fields: ["id", "accountId", "month", "amount", "createdAt", "createdBy", "updatedAt", "updatedBy", "date", "flowType", "transferId", "counterpartyAccountId"] },
  debtAccounts: { name: "DebtAccounts", headers: ["ID", "Name", "Assignment ID", "Active", "Created At", "Updated At", "Interest Rate"], fields: ["id", "name", "assignmentId", "active", "createdAt", "updatedAt", "interestRate"] },
  debtBalances: { name: "DebtBalances", headers: ["ID", "Debt Account ID", "Month", "Balance", "Notes", "Created At", "Created By", "Updated At", "Updated By", "As Of Date"], fields: ["id", "debtAccountId", "month", "balance", "notes", "createdAt", "createdBy", "updatedAt", "updatedBy", "asOfDate"] },
  debtPayments: { name: "DebtPayments", headers: ["ID", "Debt Account ID", "Date", "Month", "Amount", "Created At", "Created By", "Updated At", "Updated By", "Kind"], fields: ["id", "debtAccountId", "date", "month", "amount", "createdAt", "createdBy", "updatedAt", "updatedBy", "kind"] },
});

// Production setup v7 / API v10 predates assignments on investment accounts
// and the date/flow metadata added to investment balances and contributions.
const PRODUCTION_V7_INVESTMENT_TABLES = Object.freeze({
  investmentAccounts: { name: "InvestmentAccounts", headers: ["ID", "Name", "Source", "Active", "Created At", "Updated At"], fields: ["id", "name", "source", "active", "createdAt", "updatedAt"] },
  investmentBalances: { name: "InvestmentBalances", headers: ["ID", "Account ID", "Month", "Ending Balance", "Notes", "Created At", "Created By", "Updated At", "Updated By"], fields: ["id", "accountId", "month", "balance", "notes", "createdAt", "createdBy", "updatedAt", "updatedBy"] },
  investmentContributions: { name: "InvestmentContributions", headers: ["ID", "Account ID", "Month", "Amount", "Created At", "Created By", "Updated At", "Updated By"], fields: ["id", "accountId", "month", "amount", "createdAt", "createdBy", "updatedAt", "updatedBy"] },
});

const TABLES = Object.freeze({
  transactions: {
    name: "Transactions",
    headers: [
      "ID",
      "Created At",
      "Created By",
      "Type",
      "Amount",
      "Date",
      "Category ID",
      "Vendor ID",
      "Assignment ID",
      "Notes",
      "Account ID",
      "Source",
      "Legacy Activity ID",
    ],
    fields: [
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
      "accountId",
      "source",
      "legacyActivityId",
    ],
  },
  categories: {
    name: "Categories",
    headers: [
      "ID",
      "Name",
      "Type",
      "Is Default",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: [
      "id",
      "name",
      "type",
      "isDefault",
      "active",
      "createdAt",
      "updatedAt",
    ],
  },
  vendors: {
    name: "Vendors",
    headers: ["ID", "Name", "Active", "Created At", "Updated At"],
    fields: ["id", "name", "active", "createdAt", "updatedAt"],
  },
  assignments: {
    name: "Assignments",
    headers: ["ID", "Name", "Is Default", "Active", "Created At", "Updated At"],
    fields: ["id", "name", "isDefault", "active", "createdAt", "updatedAt"],
  },
  users: {
    name: "Users",
    headers: [
      "ID",
      "First Name",
      "Last Name",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: ["id", "firstName", "lastName", "active", "createdAt", "updatedAt"],
  },
  accounts: {
    name: "Accounts",
    headers: ["ID", "Name", "Type", "Assignment ID", "Active", "Created At", "Updated At", "Source", "Interest Rate", "Category ID"],
    fields: ["id", "name", "type", "assignmentId", "active", "createdAt", "updatedAt", "source", "interestRate", "categoryId"],
  },
  accountBalances: {
    name: "AccountBalances",
    headers: [
      "ID",
      "Account ID",
      "Month",
      "Balance",
      "Notes",
      "Created At",
      "Created By",
      "Updated At",
      "Updated By",
      "As Of Date",
    ],
    fields: [
      "id",
      "accountId",
      "month",
      "balance",
      "notes",
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
      "asOfDate",
    ],
  },
  accountActivity: {
    name: "AccountActivity",
    headers: [
      "ID",
      "Account ID",
      "Date",
      "Month",
      "Amount",
      "Activity Type",
      "Flow Type",
      "Transfer ID",
      "Counterparty Account ID",
      "Created At",
      "Created By",
      "Updated At",
      "Updated By",
    ],
    fields: [
      "id",
      "accountId",
      "date",
      "month",
      "amount",
      "activityType",
      "flowType",
      "transferId",
      "counterpartyAccountId",
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
    ],
  },
  importProfiles: {
    name: "ImportProfiles",
    headers: [
      "ID",
      "Name",
      "Target",
      "Investment Account ID",
      "Header Signature",
      "Column Mapping JSON",
      "Date Format",
      "Amount Mode",
      "Amount Multiplier",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: [
      "id",
      "name",
      "target",
      "investmentAccountId",
      "headerSignature",
      "columnMappingJson",
      "dateFormat",
      "amountMode",
      "amountMultiplier",
      "active",
      "createdAt",
      "updatedAt",
    ],
  },
  importVendorMappings: {
    name: "ImportVendorMappings",
    headers: [
      "ID",
      "Import Profile ID",
      "Source Description",
      "Normalized Source Description",
      "Vendor ID",
      "Account ID",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: [
      "id",
      "importProfileId",
      "sourceDescription",
      "normalizedSourceDescription",
      "vendorId",
      "accountId",
      "active",
      "createdAt",
      "updatedAt",
    ],
  },
  importPersonMappings: {
    name: "ImportPersonMappings",
    headers: [
      "ID",
      "Import Profile ID",
      "Source Description",
      "Normalized Source Description",
      "Assignment ID",
      "Active",
      "Created At",
      "Updated At",
    ],
    fields: [
      "id",
      "importProfileId",
      "sourceDescription",
      "normalizedSourceDescription",
      "assignmentId",
      "active",
      "createdAt",
      "updatedAt",
    ],
  },
});

const LEGACY_TRANSACTION_HEADERS = Object.freeze([
  "ID",
  "Created At",
  "Created By",
  "Type",
  "Amount",
  "Date",
  "Category",
  "Vendor",
  "Assignment",
  "Notes",
]);
const V11_TRANSACTION_HEADERS = Object.freeze(["ID","Created At","Created By","Type","Amount","Date","Category ID","Vendor ID","Assignment ID","Notes"]);

const DEFAULT_CATEGORIES = Object.freeze([
  { id: APP.incomeCategoryId, name: "Income", type: "income" },
  { id: APP.debtPaymentCategoryId, name: "Debt Payment", type: "expense" },
]);

let REQUEST_CONTEXT_ = null;

function doGet(e) {
  const request = e && e.parameter ? e.parameter : {};
  request._method = "GET";
  return handleRequest_(request);
}

function doPost(e) {
  try {
    const request = parsePostBody_(e);
    request._method = "POST";
    return handleRequest_(request);
  } catch (error) {
    REQUEST_CONTEXT_ = {
      requestId: Utilities.getUuid(),
      action: "parsePostBody",
      startedAt: Date.now(),
    };
    return failure_(error);
  }
}

function handleRequest_(request) {
  REQUEST_CONTEXT_ = {
    requestId: cleanText_(request.requestId || Utilities.getUuid(), 100),
    action: cleanText_(request.action, 80),
    startedAt: Date.now(),
  };
  try {
    if (String(request.action || "") === "health")
      return success_({ status: "ok", apiVersion: APP.apiVersion });
    assertInitialized_();
    if (
      request._method === "GET" &&
      [
        "health",
        "readiness",
        "bootstrap",
        "listTransactions",
        "listUsers",
        "listCategories",
        "listArchivedEntities",
        "listVendors",
        "listAssignments",
        "listAccounts",
        "listAccountBalances",
        "listAccountActivity",
        "listInvestmentAccounts",
        "listInvestmentBalances",
        "listInvestmentContributions",
        "listDebtAccounts",
        "listDebtBalances",
        "listDebtPayments",
        "listImportProfiles",
        "getImportProfileBundle",
        "listInvestmentSnapshots",
      ].indexOf(String(request.action || "")) < 0
    )
      throw appError_(
        "method_not_allowed",
        "Mutations must use POST.",
        false,
      );
    switch (String(request.action || "")) {
      case "readiness":
        return success_(readiness_());
      case "bootstrap":
        return success_(bootstrap_());
      case "listTransactions":
        return success_(listTransactions_());
      case "addTransaction":
        return successResult_(addTransaction_(request.transaction));
      case "addTransactions":
        return successResult_(addTransactions_(request.transactions));
      case "updateTransaction":
        return successResult_(
          updateTransaction_(
            request.update || {
              transaction: request.transaction,
              base: request.base,
            },
          ),
        );
      case "updateTransactions":
        return successResult_(updateTransactions_(request.updates));
      case "deleteTransaction":
        return successResult_(deleteTransaction_(request.deletion));
      case "addEntities":
        return success_(addEntities_(request.entities));
      case "listUsers":
        return success_(listUsers_());
      case "addUser":
        return success_(
          withScriptLock_(function () {
            return addUser_(request.user);
          }),
        );
      case "updateUser":
        return successResult_(
          withScriptLock_(function () {
            return updateUser_(request.user, request.base);
          }),
        );
      case "listCategories":
        return success_(listActiveRecords_(TABLES.categories));
      case "listArchivedEntities":
        return success_(listArchivedEntities_());
      case "addCategory":
        return success_(addEntityCompatibility_("category", request.category));
      case "updateCategory":
        return successResult_(
          withScriptLock_(function () {
            return updateCategory_(request.category, request.base);
          }),
        );
      case "archiveCategory":
        return success_(
          withScriptLock_(function () {
            return archiveRecord_(TABLES.categories, request.id);
          }),
        );
      case "listVendors":
        return success_(listActiveRecords_(TABLES.vendors));
      case "addVendor":
        return success_(addEntityCompatibility_("vendor", request.vendor));
      case "updateVendor":
        return successResult_(
          withScriptLock_(function () {
            return updateNamedRecord_(TABLES.vendors, request.vendor, request.base);
          }),
        );
      case "archiveVendor":
        return success_(
          withScriptLock_(function () {
            return archiveRecord_(TABLES.vendors, request.id);
          }),
        );
      case "listAssignments":
        return success_(listActiveRecords_(TABLES.assignments));
      case "addAssignment":
        return success_(
          addEntityCompatibility_("assignment", request.assignment),
        );
      case "updateAssignment":
        return successResult_(
          withScriptLock_(function () {
            return updateNamedRecord_(TABLES.assignments, request.assignment, request.base);
          }),
        );
      case "archiveAssignment":
        return success_(
          withScriptLock_(function () {
            return archiveRecord_(TABLES.assignments, request.id);
          }),
        );
      case "listAccounts":
        return success_(listAccounts_());
      case "saveAccount":
        return success_(withScriptLock_(function () { return saveAccount_(request.account, request.base); }));
      case "archiveAccount":
        return success_(withScriptLock_(function () { return archiveRecord_(TABLES.accounts, request.id); }));
      case "listAccountBalances":
        return success_(listAccountBalances_());
      case "listAccountActivity":
        return success_(listAccountActivity_());
      case "saveAccountMonth":
        return success_(withScriptLock_(function () { return saveAccountMonths_([request.month]); }));
      case "saveAccountMonths":
        return success_(withScriptLock_(function () { return saveAccountMonths_(request.months); }));
      case "deleteAccountActivity":
        return success_(deleteAccountActivity_(request.id, request.accountId, request.accountType));
      case "deleteAccountBalance":
        return success_(withScriptLock_(function () { return deleteAccountBalance_(request); }));
      // Deprecated adapters for the staged UI migration. They all delegate to
      // the unified sheets and never recreate legacy persistence.
      case "listInvestmentAccounts":
        return success_(listAccounts_().filter(function (item) { return item.type === "investment"; }));
      case "listInvestmentBalances":
        return success_(listAccountBalancesByType_("investment"));
      case "listInvestmentContributions":
        return success_(listAccountActivity_().filter(function (item) { return item.activityType === "contribution"; }));
      case "listDebtAccounts":
        return success_(listAccounts_().filter(function (item) { return item.type === "debt"; }));
      case "listDebtBalances":
        return success_(listAccountBalancesByType_("debt").map(legacyDebtBalance_));
      case "listDebtPayments":
        return success_(listAccountActivity_().filter(function (item) { return item.activityType !== "contribution"; }).map(legacyDebtActivity_));
      case "listImportProfiles":
        return success_(listImportProfiles_());
      case "getImportProfileBundle":
        return success_(getImportProfileBundle_(request.id));
      case "createImportProfile":
        return success_(
          withScriptLock_(function () {
            return createImportProfile_(request.profile);
          }),
        );
      case "updateImportProfile":
        return success_(
          withScriptLock_(function () {
            return updateImportProfile_(request.profile, request.base);
          }),
        );
      case "archiveImportProfile":
        return success_(
          withScriptLock_(function () {
            return archiveImportProfile_(request.id);
          }),
        );
      case "upsertImportMappings":
        return success_(
          upsertImportMappings_(
            request.importProfileId,
            request.vendorMappings,
            request.personMappings,
          ),
        );
      case "listInvestmentSnapshots":
        return success_(listLegacyInvestmentSnapshots_());
      case "saveInvestmentSnapshots":
        throw new Error(
          "This app version cannot safely write itemized investment contributions. Update the TED app.",
        );
      default:
        throw new Error("Unknown action.");
    }
  } catch (error) {
    return failure_(error);
  }
}

function readiness_() {
  const spreadsheet = getSpreadsheet_();
  const missing = [];
  const incompatible = [];
  Object.keys(TABLES)
    .filter(function (key) { return key !== "accountActivity"; })
    .forEach(function (key) {
    const spec = TABLES[key];
    const sheet = spreadsheet.getSheetByName(spec.name);
    if (!sheet) {
      missing.push(spec.name);
      return;
    }
    const headers = sheet.getRange(1, 1, 1, spec.headers.length).getValues()[0];
    if (!headersMatch_(headers, spec.headers)) incompatible.push(spec.name);
    });
  const advancedSheetsAvailable = Boolean(
    typeof Sheets !== "undefined" &&
      Sheets.Spreadsheets &&
      Sheets.Spreadsheets.Values,
  );
  return {
    status:
      !missing.length && !incompatible.length && advancedSheetsAvailable
        ? "ready"
        : "not_ready",
    apiVersion: APP.apiVersion,
    spreadsheetAccessible: true,
    advancedSheetsAvailable: advancedSheetsAvailable,
    missingSheets: missing,
    incompatibleSheets: incompatible,
  };
}

function inspectDataIntegrity_(spreadsheet) {
  spreadsheet = spreadsheet || getSpreadsheet_();
  const tables = {};
  Object.keys(TABLES).forEach(function (key) {
    const spec = TABLES[key];
    const sheet = spreadsheet.getSheetByName(spec.name);
    if (!sheet) {
      tables[spec.name] = { present: false, required: key !== "accountActivity" };
      return;
    }
    const lastRow = sheet.getLastRow();
    const values = lastRow
      ? sheet.getRange(1, 1, lastRow, spec.headers.length).getValues()
      : [];
    const headers = values[0] || [];
    const ids = new Map();
    const duplicateIds = [];
    const blankIdRows = [];
    const invalidNumbers = [];
    const invalidDates = [];
    values.slice(1).forEach(function (row, index) {
      const rowNumber = index + 2;
      if (!row[0]) {
        if (row.some(function (value) { return value !== ""; })) blankIdRows.push(rowNumber);
        return;
      }
      const id = String(row[0]);
      if (ids.has(id)) duplicateIds.push({ id: id, rows: [ids.get(id), rowNumber] });
      else ids.set(id, rowNumber);
      spec.fields.forEach(function (field, column) {
        const value = row[column];
        if (["amount", "balance", "contribution", "interestRate", "amountMultiplier"].indexOf(field) >= 0 && value !== "" && !isFinite(Number(value)))
          invalidNumbers.push({ row: rowNumber, field: field, value: String(value) });
        if ((field === "date" || field === "asOfDate") && value !== "") {
          const date = normalizeDateId_(value);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidISODate_(date))
            invalidDates.push({ row: rowNumber, field: field, value: String(value) });
        }
      });
    });
    tables[spec.name] = {
      present: true,
      required: key !== "accountActivity",
      headersValid: headersMatch_(headers, spec.headers),
      rowCount: ids.size,
      blankIdRows: blankIdRows,
      duplicateIds: duplicateIds,
      invalidNumbers: invalidNumbers,
      invalidDates: invalidDates,
    };
  });
  const accountSheet = spreadsheet.getSheetByName(TABLES.accounts.name);
  const categoryColumn = TABLES.accounts.fields.indexOf("categoryId") + 1;
  const suspiciousAccountCategoryRows = [];
  if (accountSheet && accountSheet.getLastRow() > 1) {
    const rows = accountSheet.getRange(2, categoryColumn, accountSheet.getLastRow() - 1, 2).getValues();
    rows.forEach(function (row, index) {
      if (!row[0] && row[1]) suspiciousAccountCategoryRows.push({ row: index + 2, columnK: String(row[1]) });
    });
  }
  const properties = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: spreadsheet.getId(),
    inspectedAt: new Date().toISOString(),
    tables: tables,
    suspiciousAccountCategoryRows: suspiciousAccountCategoryRows,
    migrationState: {
      setup: properties.getProperty(APP.setupStateProperty) || "",
      legacyAccounts: properties.getProperty(APP.legacyAccountsMigrationProperty) || "",
      unifiedActivity: properties.getProperty(APP.unifiedActivityMigrationProperty) || "",
      accountCategoryRepair: properties.getProperty(APP.accountCategoryRepairProperty) || "",
    },
  };
}

function success_(data) {
  return json_({ ok: true, data: data, meta: responseMeta_() });
}
function successResult_(result) {
  const payload = { ok: true, data: result.data, meta: responseMeta_() };
  if (result.warning) payload.warning = result.warning;
  return json_(payload);
}

function responseMeta_() {
  return {
    requestId: REQUEST_CONTEXT_ ? REQUEST_CONTEXT_.requestId : "",
    action: REQUEST_CONTEXT_ ? REQUEST_CONTEXT_.action : "",
    apiVersion: APP.apiVersion,
    durationMs: REQUEST_CONTEXT_ ? Date.now() - REQUEST_CONTEXT_.startedAt : 0,
    lockWaitMs: REQUEST_CONTEXT_ ? REQUEST_CONTEXT_.lockWaitMs || 0 : 0,
    phases: REQUEST_CONTEXT_ ? REQUEST_CONTEXT_.phases || {} : {},
  };
}

function appError_(code, message, retryable, phase) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable === true;
  error.phase = phase || "request";
  return error;
}

function resultFailure_(id, error, extra) {
  const classification = classifyError_(error);
  return {
    ...(extra || {}),
    id: id || "",
    code: classification.code,
    retryable: classification.retryable,
    error: errorMessage_(error),
  };
}

function classifyError_(error) {
  if (error && error.code)
    return {
      code: error.code,
      retryable: error.retryable === true,
      phase: error.phase || "request",
    };
  const message = errorMessage_(error);
  if (/quota|rate limit|too many requests|service invoked too many/i.test(message))
    return { code: "quota", retryable: true, phase: "google_service" };
  if (/timed out|timeout|service unavailable|internal error|try again/i.test(message))
    return { code: "service", retryable: true, phase: "google_service" };
  if (/changed in the Sheet|already exists with different|conflict/i.test(message))
    return { code: "conflict", retryable: false, phase: "validation" };
  if (/not been initialized|headers do not match|sheet is missing/i.test(message))
    return { code: "not_ready", retryable: false, phase: "readiness" };
  return { code: "validation", retryable: false, phase: "validation" };
}

function failure_(error) {
  const classification = classifyError_(error);
  const detail = {
    requestId: REQUEST_CONTEXT_ ? REQUEST_CONTEXT_.requestId : "",
    action: REQUEST_CONTEXT_ ? REQUEST_CONTEXT_.action : "",
    apiVersion: APP.apiVersion,
    code: classification.code,
    retryable: classification.retryable,
    phase: classification.phase,
    durationMs: REQUEST_CONTEXT_ ? Date.now() - REQUEST_CONTEXT_.startedAt : 0,
    lockWaitMs: REQUEST_CONTEXT_ ? REQUEST_CONTEXT_.lockWaitMs || 0 : 0,
    phases: REQUEST_CONTEXT_ ? REQUEST_CONTEXT_.phases || {} : {},
    message: errorMessage_(error),
  };
  console.error(JSON.stringify({ ...detail, stack: error && error.stack ? error.stack : "" }));
  return json_({ ok: false, error: detail });
}
function withScriptLock_(callback) {
  const lock = acquireScriptLock_();
  try {
    const result = callback();
    flushMutation_();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function acquireScriptLock_() {
  const lock = LockService.getScriptLock();
  const startedAt = Date.now();
  lock.waitLock(30000);
  if (REQUEST_CONTEXT_)
    REQUEST_CONTEXT_.lockWaitMs =
      (REQUEST_CONTEXT_.lockWaitMs || 0) + (Date.now() - startedAt);
  return lock;
}

function timedPhase_(name, callback) {
  const startedAt = Date.now();
  try {
    return callback();
  } finally {
    if (REQUEST_CONTEXT_) {
      REQUEST_CONTEXT_.phases = REQUEST_CONTEXT_.phases || {};
      REQUEST_CONTEXT_.phases[name] =
        (REQUEST_CONTEXT_.phases[name] || 0) + (Date.now() - startedAt);
    }
  }
}

function flushMutation_() {
  try {
    SpreadsheetApp.flush();
  } catch (error) {
    throw appError_(
      "ambiguous_commit",
      "The Sheet could not confirm the completed write: " + errorMessage_(error),
      true,
      "commit",
    );
  }
}

function assertInitialized_() {
  const properties = PropertiesService.getScriptProperties();
  if (
    !properties.getProperty(APP.spreadsheetIdProperty) ||
    properties.getProperty(APP.setupVersionProperty) !== APP.setupVersion ||
    properties.getProperty(APP.setupStateProperty) !==
      "completed:" + properties.getProperty(APP.spreadsheetIdProperty)
  ) {
    throw new Error(
      "This budget has not been initialized. Run Track Every Dollar → Set up budget first.",
    );
  }
}

function ensureDataModel_() {
  ensureTableSheet_(TABLES.categories);
  ensureTableSheet_(TABLES.vendors);
  ensureTableSheet_(TABLES.assignments);
  ensureTableSheet_(TABLES.users);
  ensureTableSheet_(TABLES.accounts);
  ensureTableSheet_(TABLES.accountBalances);
  migrateInvestmentModelV6_();
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = getSpreadsheet_().getId();
  if (
    properties.getProperty(APP.legacyAccountsMigrationProperty) !==
    spreadsheetId
  ) {
    migrateLegacyAccountsV11_();
    flushMutation_();
    properties.setProperty(APP.legacyAccountsMigrationProperty, spreadsheetId);
  }
  ensureTableSheet_(TABLES.importProfiles);
  ensureTableSheet_(TABLES.importVendorMappings);
  ensureTableSheet_(TABLES.importPersonMappings);
  seedDefaults_();
  getTransactionSheet_();
  migrateUnifiedActivityV12_();
  repairAccountCategoryColumnV16_();
  verifyDataModel_();
}

function verifyDataModel_() {
  const spreadsheet = getSpreadsheet_();
  Object.keys(TABLES)
    .filter(function (key) { return key !== "accountActivity"; })
    .forEach(function (key) {
      const spec = TABLES[key];
      const sheet = requiredSheet_(spreadsheet, spec);
      const headers = sheet.getRange(1, 1, 1, spec.headers.length).getValues()[0];
      if (!headersMatch_(headers, spec.headers))
        throw new Error("The " + spec.name + " sheet failed schema verification.");
      if (sheet.getLastRow() > 1) {
        const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, spec.headers.length).getValues();
        rows.forEach(function (row, index) {
          if (!row[0] && row.some(function (value) { return value !== ""; }))
            throw new Error("The " + spec.name + " sheet has data in row " + (index + 2) + " without an ID.");
        });
      }
      const seen = new Set();
      readPhysicalRecordsFromSheet_(sheet, spec, true).forEach(function (entry) {
        if (seen.has(entry.record.id))
          throw new Error("The " + spec.name + " sheet contains duplicate ID " + entry.record.id + ".");
        seen.add(entry.record.id);
      });
    });
}

/** Repairs pre-unification activity whose reporting month was present but date was blank. */
function backfillAccountActivityDates_() {
  const sheet = getTableSheet_(TABLES.accountActivity);
  readRecords_(TABLES.accountActivity, true).forEach(function (record) {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(String(record.date || "")) ||
      !validMonth_(record.month)
    )
      return;
    record.date = record.month + "-15";
    const row = findRowById_(sheet, record.id);
    if (row)
      sheet
        .getRange(row, 1, 1, TABLES.accountActivity.headers.length)
        .setValues([recordToRow_(TABLES.accountActivity, record)]);
  });
}

function seedDefaults_() {
  const timestamp = new Date().toISOString();
  const categorySheet = getTableSheet_(TABLES.categories);
  const categories = readRecords_(TABLES.categories, true);
  const knownCategoryIds = new Set(
    categories.map(function (item) {
      return item.id;
    }),
  );
  const missingCategories = DEFAULT_CATEGORIES.filter(function (item) {
    return !knownCategoryIds.has(item.id);
  }).map(function (item) {
    return recordToRow_(TABLES.categories, {
      id: item.id,
      name: item.name,
      type: item.type,
      isDefault: true,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
  appendRows_(categorySheet, missingCategories);

  const assignmentSheet = getTableSheet_(TABLES.assignments);
  const assignments = readRecords_(TABLES.assignments, true);
  if (
    !assignments.some(function (item) {
      return item.id === APP.sharedAssignmentId;
    })
  ) {
    appendRows_(assignmentSheet, [
      recordToRow_(TABLES.assignments, {
        id: APP.sharedAssignmentId,
        name: "Shared",
        isDefault: true,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ]);
  }
}

function listTransactions_() {
  const spreadsheet = getSpreadsheet_();
  const specs = [TABLES.transactions].concat(referenceSpecs_());
  const recordsBySheet = readTablesWithSheetsApi_(spreadsheet.getId(), specs);
  const records = recordsBySheet[TABLES.transactions.name];
  const references = referenceMapsFromRecords_(recordsBySheet);
  return records.map(function (transaction) {
    return hydrateTransaction_(transaction, references);
  });
}

function referenceSpecs_() {
  return [
    TABLES.categories,
    TABLES.vendors,
    TABLES.assignments,
    TABLES.users,
    TABLES.accounts,
  ];
}

function bootstrap_() {
  try {
    const records = timedPhase_("bootstrap_read", readBootstrapWithSheetsApi_);
    return timedPhase_("bootstrap_build", function () {
      return buildBootstrapPayload_(records);
    });
  } catch (error) {
    throw new Error(
      "Bootstrap batch read failed: " + errorMessage_(error),
    );
  }
}

function bootstrapSpecs_() {
  return [
    TABLES.transactions,
    TABLES.categories,
    TABLES.vendors,
    TABLES.assignments,
    TABLES.users,
    TABLES.accounts,
    TABLES.accountBalances,
    TABLES.importProfiles,
    TABLES.importVendorMappings,
    TABLES.importPersonMappings,
  ];
}

function readBootstrapWithSheetsApi_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(
    APP.spreadsheetIdProperty,
  );
  if (!spreadsheetId)
    throw new Error("No spreadsheet is configured for the batch read.");
  return readTablesWithSheetsApi_(spreadsheetId, bootstrapSpecs_());
}

function readTablesWithSheetsApi_(spreadsheetId, specs) {
  if (
    typeof Sheets === "undefined" ||
    !Sheets.Spreadsheets ||
    !Sheets.Spreadsheets.Values
  )
    throw new Error("The Advanced Sheets service is not available.");
  const ranges = specs.map(function (spec) {
    return (
      "'" +
      spec.name.replace(/'/g, "''") +
      "'!A:" +
      columnLabel_(spec.headers.length)
    );
  });
  const response = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges: ranges,
    majorDimension: "ROWS",
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  const valueRanges = response && response.valueRanges;
  if (!Array.isArray(valueRanges) || valueRanges.length !== specs.length) {
    throw new Error("The Sheets API did not return every bootstrap range.");
  }
  const recordsBySheet = {};
  specs.forEach(function (spec, index) {
    const values = valueRanges[index].values || [];
    if (!values.length || !headersMatch_(values[0], spec.headers)) {
      throw new Error(
        "The " + spec.name + " sheet headers do not match the expected schema.",
      );
    }
    recordsBySheet[spec.name] = values
      .slice(1)
      .filter(function (row) {
        return row[0] !== "" && row[0] !== undefined && row[0] !== null;
      })
      .map(function (row) {
        return rowToRecord_(spec, normalizeBatchRow_(spec, row));
      });
  });
  return recordsBySheet;
}

function referenceMapsFromRecords_(recordsBySheet) {
  function map(spec) {
    return new Map(
      recordsBySheet[spec.name].map(function (item) { return [item.id, item]; }),
    );
  }
  return {
    categories: map(TABLES.categories),
    vendors: map(TABLES.vendors),
    assignments: map(TABLES.assignments),
    users: map(TABLES.users),
    accounts: map(TABLES.accounts),
  };
}

function buildBootstrapPayload_(recordsBySheet) {
  const transactions = recordsBySheet[TABLES.transactions.name];
  const categories = recordsBySheet[TABLES.categories.name];
  const vendors = recordsBySheet[TABLES.vendors.name];
  const assignments = recordsBySheet[TABLES.assignments.name];
  const users = recordsBySheet[TABLES.users.name];
  const references = {
    categories: new Map(
      categories.map(function (item) {
        return [item.id, item];
      }),
    ),
    vendors: new Map(
      vendors.map(function (item) {
        return [item.id, item];
      }),
    ),
    assignments: new Map(
      assignments.map(function (item) {
        return [item.id, item];
      }),
    ),
    users: new Map(
      users.map(function (item) {
        return [item.id, item];
      }),
    ),
    accounts: new Map(recordsBySheet[TABLES.accounts.name].map(function(item){return [item.id,item];})),
  };
  function active(records) {
    return records.filter(function (record) {
      return record.active !== false;
    });
  }
  const importProfiles = active(recordsBySheet[TABLES.importProfiles.name]);
  const importProfileIds = new Set(
    importProfiles.map(function (profile) {
      return profile.id;
    }),
  );
  function mappingsForActiveProfiles(records) {
    return records.filter(function (mapping) {
      return importProfileIds.has(mapping.importProfileId);
    });
  }
  return {
    transactions: transactions.map(function (transaction) {
      return hydrateTransaction_(transaction, references);
    }),
    // Cache complete reference collections during bootstrap. Pickers use the
    // active-only list functions, while archive screens use the same cache.
    categories: categories,
    vendors: vendors,
    assignments: assignments,
    users: active(users),
    importProfiles: importProfiles.map(publicImportProfile_),
    importMappings: {
      vendorMappings: mappingsForActiveProfiles(
        recordsBySheet[TABLES.importVendorMappings.name],
      ),
      personMappings: mappingsForActiveProfiles(
        recordsBySheet[TABLES.importPersonMappings.name],
      ),
    },
    accounts: recordsBySheet[TABLES.accounts.name],
    accountBalances: recordsBySheet[TABLES.accountBalances.name],
  };
}

function columnLabel_(count) {
  let value = count,
    label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function normalizeBatchRow_(spec, row) {
  return spec.fields.map(function (field, index) {
    const value =
      row[index] === undefined || row[index] === null ? "" : row[index];
    if (typeof value !== "number") return value;
    if (field !== "date" && field !== "asOfDate" && field !== "month" && !/At$/.test(field))
      return value;
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    if (field === "date" || field === "asOfDate")
      return Utilities.formatDate(date, "UTC", "yyyy-MM-dd");
    if (field === "month") return Utilities.formatDate(date, "UTC", "yyyy-MM");
    return Utilities.formatDate(date, "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");
  });
}

function addTransaction_(input) {
  const result = addTransactions_([input]);
  if (result.data.failed.length) throw new Error(result.data.failed[0].error);
  return { data: result.data.saved[0], warning: result.warning };
}

function addTransactions_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length)
    throw new Error("At least one transaction is required.");
  if (inputs.length > 50)
    throw new Error("A maximum of 50 transactions can be added at once.");
  const lock = acquireScriptLock_();
  try {
    const spreadsheet = getSpreadsheet_();
    const transactionSheet = requiredSheet_(spreadsheet, TABLES.transactions);
    const recordsBySheet = timedPhase_("transaction_read", function () {
      return readTablesWithSheetsApi_(spreadsheet.getId(), [TABLES.transactions].concat(referenceSpecs_()));
    });
    const references = referenceMapsFromRecords_(recordsBySheet);
    const existing = recordsBySheet[TABLES.transactions.name];
    const byId = new Map(
      existing.map(function (transaction) {
        return [transaction.id, transaction];
      }),
    );
    const additions = [];
    const saved = [];
    const failed = [];

    inputs.forEach(function (input) {
      try {
        const transaction = validateTransaction_(input, references);
        const duplicate = byId.get(transaction.id);
        if (duplicate) {
          if (!transactionsMatch_(duplicate, transaction))
            throw new Error(
              "That transaction ID is already used by different data.",
            );
          saved.push(hydrateTransaction_(duplicate, references));
          return;
        }
        additions.push(transaction);
        byId.set(transaction.id, transaction);
        saved.push(hydrateTransaction_(transaction, references));
      } catch (error) {
        failed.push(resultFailure_(input && input.id ? String(input.id) : "", error));
      }
    });

    appendRows_(
      transactionSheet,
      additions.map(function (transaction) {
        return recordToRow_(TABLES.transactions, transaction);
      }),
    );
    flushMutation_();
    return { data: { saved: saved, failed: failed } };
  } finally {
    lock.releaseLock();
  }
}

function updateTransaction_(input) {
  const result = updateTransactions_([input]);
  if (result.data.failed.length) throw new Error(result.data.failed[0].error);
  return { data: result.data.saved[0], warning: result.warning };
}

function updateTransactions_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length)
    throw new Error("At least one transaction update is required.");
  if (inputs.length > 50)
    throw new Error("A maximum of 50 transactions can be updated at once.");
  const lock = acquireScriptLock_();
  try {
    const spreadsheet = getSpreadsheet_();
    const transactionSheet = requiredSheet_(spreadsheet, TABLES.transactions);
    const recordsBySheet = timedPhase_("transaction_read", function () {
      return readTablesWithSheetsApi_(spreadsheet.getId(), [TABLES.transactions].concat(referenceSpecs_()));
    });
    const references = referenceMapsFromRecords_(recordsBySheet);
    const rowById = new Map();
    if (transactionSheet.getLastRow() > 1)
      transactionSheet
        .getRange(2, 1, transactionSheet.getLastRow() - 1, 1)
        .getValues()
        .forEach(function (row, index) {
          if (row[0] !== "") rowById.set(String(row[0]), index + 2);
        });
    const physicalRecords = recordsBySheet[TABLES.transactions.name].map(function (record) {
      return { rowNumber: rowById.get(record.id), record: record };
    });
    const indexes = new Map(
      physicalRecords.map(function (entry) {
        return [entry.record.id, entry];
      }),
    );
    const seen = new Set();
    const saved = [];
    const failed = [];
    const writes = [];

    inputs.forEach(function (input) {
      const requestedId =
        input && input.transaction && input.transaction.id
          ? String(input.transaction.id)
          : "";
      try {
        if (
          !input ||
          typeof input !== "object" ||
          !input.transaction ||
          !input.base
        )
          throw new Error("Each update requires transaction and base records.");
        const id = requireUuid_(input.transaction.id, "Transaction ID");
        if (seen.has(id))
          throw new Error(
            "A transaction can only appear once in an update batch.",
          );
        seen.add(id);
        const entry = indexes.get(id);
        if (!entry)
          throw new Error("That transaction could not be found.");
        const existing = entry.record;
        const draft = validateUpdatedTransaction_(
          input.transaction,
          existing,
          references,
        );
        if (editableTransactionsMatch_(existing, draft)) {
          saved.push(hydrateTransaction_(existing, references));
          return;
        }
        if (!editableTransactionsMatch_(existing, input.base)) {
          failed.push({
            id: id,
            code: "conflict",
            error: "This transaction changed in the Sheet after you opened it.",
            current: hydrateTransaction_(existing, references),
          });
          return;
        }
        entry.record = draft;
        saved.push(hydrateTransaction_(draft, references));
        writes.push({ rowNumber: entry.rowNumber, record: draft });
      } catch (error) {
        failed.push(resultFailure_(requestedId, error));
      }
    });

    writes.forEach(function (write) {
      transactionSheet
        .getRange(write.rowNumber, 1, 1, TABLES.transactions.headers.length)
        .setValues([recordToRow_(TABLES.transactions, write.record)]);
    });
    flushMutation_();
    return { data: { saved: saved, failed: failed } };
  } finally {
    lock.releaseLock();
  }
}

function deleteTransaction_(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("A transaction deletion is required.");
  const id = requireUuid_(input.id, "Transaction ID");
  const lock = acquireScriptLock_();
  try {
    const spreadsheet = getSpreadsheet_();
    const transactionSheet = requiredSheet_(spreadsheet, TABLES.transactions);
    const records = readPhysicalRecordsFromSheet_(
      transactionSheet,
      TABLES.transactions,
      true,
    );
    const entry = records.find(function (item) {
      return item.record.id === id;
    });
    if (!entry) {
      return { data: { id: id, deleted: true, alreadyDeleted: true } };
    }
    const existing = entry.record;
    if (!input.base)
      throw new Error("A confirmed transaction base is required for deletion.");
    if (!editableTransactionsMatch_(existing, input.base))
      throw new Error("This transaction changed in the Sheet after you opened it.");
    transactionSheet.deleteRow(entry.rowNumber);
    flushMutation_();
    return { data: { id: id, deleted: true } };
  } finally {
    lock.releaseLock();
  }
}

function validateUpdatedTransaction_(input, existing, references) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("A transaction object is required.");
  const accountId=cleanText_(input.accountId,36);
  const account=accountId?references.accounts.get(requireUuid_(accountId,"Account ID")):null;
  if(accountId&&(!account||account.active===false))throw new Error("Choose an active account.");
  const type = account ? "" : cleanText_(input.type, 20).toLowerCase();
  if (!account && type !== "income" && type !== "expense")
    throw new Error("Transaction type must be income or expense.");
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!isFinite(amount) || amount === 0)
    throw new Error("Amount must be a non-zero value.");
  const date = cleanText_(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidISODate_(date))
    throw new Error("Date must be a valid YYYY-MM-DD value.");

  const categoryId = account?"":requireUuid_(input.categoryId, "Category ID");
  const assignmentId = account?"":requireUuid_(input.assignmentId, "Assignment ID");
  const category = references.categories.get(categoryId);
  const assignment = references.assignments.get(assignmentId);
  if (
    !account && (!category ||
    category.type !== type ||
    (category.active === false && categoryId !== existing.categoryId))
  ) {
    throw new Error("Choose an active category matching the transaction type.");
  }
  if (
    !account && (!assignment ||
    (assignment.active === false && assignmentId !== existing.assignmentId))
  )
    throw new Error("Choose an active assignment.");

  let vendorId = "";
  if (!account && (type === "expense" || input.vendorId)) {
    vendorId = requireUuid_(input.vendorId, "Vendor ID");
    const vendor = references.vendors.get(vendorId);
    if (!vendor || (vendor.active === false && vendorId !== existing.vendorId))
      throw new Error("Choose an active vendor.");
  }
  return {
    id: existing.id,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
    type: type,
    amount: amount,
    date: date,
    categoryId: categoryId,
    vendorId: vendorId,
    assignmentId: assignmentId,
    notes: cleanText_(input.notes, 1000),
    accountId: accountId,
    source: input.source==="deduction"?"deduction":"manual",
    legacyActivityId: existing.legacyActivityId||"",
  };
}

function editableTransactionsMatch_(left, right) {
  if (!left || !right) return false;
  return [
    "type",
    "amount",
    "date",
    "categoryId",
    "vendorId",
    "assignmentId",
    "notes",
    "accountId",
    "source",
  ].every(function (field) {
    return field === "amount"
      ? Number(left[field]) === Number(right[field])
      : String(left[field] === undefined ? "" : left[field]) ===
          String(right[field] === undefined ? "" : right[field]);
  });
}

function validateTransaction_(input, references) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("A transaction object is required.");
  const accountId=cleanText_(input.accountId,36);
  references = references || referenceMaps_();
  const account=accountId?references.accounts.get(requireUuid_(accountId,"Account ID")):null;
  const type = account ? "" : cleanText_(input.type, 20).toLowerCase();
  if (!account && type !== "income" && type !== "expense")
    throw new Error("Transaction type must be income or expense.");
  if(accountId&&(!account||account.active===false))throw new Error("Choose an active account.");
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!isFinite(amount) || amount === 0)
    throw new Error("Amount must be a non-zero value.");
  const date = cleanText_(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidISODate_(date))
    throw new Error("Date must be a valid YYYY-MM-DD value.");

  const categoryId = account?"":requireUuid_(input.categoryId, "Category ID");
  const assignmentId = account?"":requireUuid_(input.assignmentId, "Assignment ID");
  const createdBy = requireUuid_(input.createdBy, "createdBy");
  const category = references.categories.get(categoryId);
  if (!account&&(!category || category.active === false || category.type !== type))
    throw new Error("Choose an active category matching the transaction type.");
  const assignment = references.assignments.get(assignmentId);
  if (!account&&(!assignment || assignment.active === false))
    throw new Error("Choose an active assignment.");
  const creator = references.users.get(createdBy);
  if (!creator || creator.active === false)
    throw new Error("The transaction creator is not an active user.");

  let vendorId = "";
  if (!account&&(type === "expense" || input.vendorId)) {
    vendorId = requireUuid_(input.vendorId, "Vendor ID");
    const vendor = references.vendors.get(vendorId);
    if (!vendor || vendor.active === false)
      throw new Error("Choose an active vendor.");
  }
  return {
    id: requireUuid_(input.id || Utilities.getUuid(), "Transaction ID"),
    createdAt: normalizeDateTime_(input.createdAt),
    createdBy: createdBy,
    type: type,
    amount: amount,
    date: date,
    categoryId: categoryId,
    vendorId: vendorId,
    assignmentId: assignmentId,
    notes: cleanText_(input.notes, 1000),
    accountId: accountId,
    source: input.source==="deduction"?"deduction":"manual",
    legacyActivityId: cleanText_(input.legacyActivityId,36),
  };
}

function transactionsMatch_(left, right) {
  return TABLES.transactions.fields.every(function (field) {
    return field === "amount"
      ? Number(left[field]) === Number(right[field])
      : String(left[field] === undefined ? "" : left[field]) ===
          String(right[field] === undefined ? "" : right[field]);
  });
}

function referenceMaps_() {
  function map(spec) {
    return new Map(
      readRecords_(spec, true).map(function (item) {
        return [item.id, item];
      }),
    );
  }
  return {
    categories: map(TABLES.categories),
    vendors: map(TABLES.vendors),
    assignments: map(TABLES.assignments),
    users: map(TABLES.users),
    accounts: map(TABLES.accounts),
  };
}

function referenceMapsFromSpreadsheet_(spreadsheet) {
  function map(spec) {
    return new Map(
      readRecordsFromSheet_(requiredSheet_(spreadsheet, spec), spec, true).map(
        function (item) {
          return [item.id, item];
        },
      ),
    );
  }
  return {
    categories: map(TABLES.categories),
    vendors: map(TABLES.vendors),
    assignments: map(TABLES.assignments),
    users: map(TABLES.users),
    accounts: map(TABLES.accounts),
  };
}

function requiredSheet_(spreadsheet, spec) {
  const sheet = spreadsheet.getSheetByName(spec.name);
  if (!sheet)
    throw appError_(
      "not_ready",
      "The " + spec.name + " sheet is missing.",
      false,
      "readiness",
    );
  return sheet;
}

function hydrateTransaction_(transaction, references) {
  const account = references.accounts&&references.accounts.get(transaction.accountId);
  const categoryId=account&&account.type==="debt"?account.categoryId:transaction.categoryId;
  const category = references.categories.get(categoryId);
  const vendor = references.vendors.get(transaction.vendorId);
  const assignment = references.assignments.get(account?account.assignmentId:transaction.assignmentId);
  const user = references.users.get(transaction.createdBy);
  return {
    ...transaction,
    category: category ? category.name : account&&account.type==="investment"?"Investment":"Unknown",
    vendor: vendor ? vendor.name : "",
    assignment: assignment ? assignment.name : "Unknown",
    account: account?account.name:"",
    accountType: account?account.type:"",
    resolvedCategoryId: categoryId||"",
    resolvedAssignmentId: account?account.assignmentId:transaction.assignmentId,
    createdByName: user ? fullUserName_(user) : "Unknown",
  };
}

function listUsers_() {
  return listActiveRecords_(TABLES.users);
}
function addUser_(input) {
  const timestamp = new Date().toISOString();
  const requestedId = input && input.id ? requireUuid_(input.id, "User ID") : "";
  const existing = requestedId ? getRecordById_(TABLES.users, requestedId) : null;
  const user = validateUser_(input, {
    id: requestedId || Utilities.getUuid(),
    active: existing ? existing.active !== false : true,
    createdAt: existing ? existing.createdAt : timestamp,
    updatedAt: timestamp,
  });
  if (existing) {
    if (
      existing.firstName === user.firstName &&
      existing.lastName === user.lastName &&
      existing.active === user.active
    )
      return existing;
    throw new Error("That user ID already exists with different data.");
  }
  ensureUniqueIdAndName_(TABLES.users, user.id, fullUserName_(user), "");
  appendRows_(getTableSheet_(TABLES.users), [recordToRow_(TABLES.users, user)]);
  return user;
}
function updateUser_(input, base) {
  const sheet = getTableSheet_(TABLES.users);
  const row = findRowById_(sheet, input && input.id);
  if (!row) throw new Error("That user could not be found.");
  const existing = rowToRecord_(
    TABLES.users,
    sheet.getRange(row, 1, 1, TABLES.users.headers.length).getValues()[0],
  );
  const user = validateUser_(input, {
    ...existing,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
  const fields = ["firstName", "lastName", "active"];
  if (fields.every(function (field) { return String(existing[field]) === String(user[field]); }))
    return { data: existing };
  if (!base || !fields.every(function (field) { return String(existing[field]) === String(base[field]); }))
    throw appError_("conflict", "This user changed in the Sheet after you opened it.", false, "validation");
  const oldName = fullUserName_(existing),
    newName = fullUserName_(user);
  sheet
    .getRange(row, 1, 1, TABLES.users.headers.length)
    .setValues([recordToRow_(TABLES.users, user)]);
  return { data: user };
}
function validateUser_(input, base) {
  if (!input || typeof input !== "object")
    throw new Error("A user object is required.");
  const firstName = cleanText_(input.firstName, 80),
    lastName = cleanText_(input.lastName, 80);
  if (!firstName || !lastName)
    throw new Error("First and last name are required.");
  return {
    ...base,
    id: requireUuid_(base.id, "User ID"),
    firstName: firstName,
    lastName: lastName,
    active: input.active !== false,
  };
}
function fullUserName_(user) {
  return (user.firstName + " " + user.lastName).trim();
}

const INVESTMENT_SOURCES = Object.freeze(["deduction", "manual"]);

function listInvestmentAccounts_() {
  return listAccounts_().filter(function (item) { return item.type === "investment"; });
}

function normalizeInvestmentAccount_(input, existing) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("An investment account is required.");
  const timestamp = new Date().toISOString();
  const source = cleanText_(input.source, 20).toLowerCase()==="paycheck"?"deduction":cleanText_(input.source,20).toLowerCase();
  if (INVESTMENT_SOURCES.indexOf(source) < 0)
    throw new Error(
      "Choose deduction or manual as the account source.",
    );
  const assignmentId = requireUuid_(
    input.assignmentId || APP.sharedAssignmentId,
    "Investment account assignment ID",
  );
  if (
    !readRecords_(TABLES.assignments, true).some(function (assignment) {
      return assignment.id === assignmentId;
    })
  )
    throw new Error("Choose a valid assignment.");
  return {
    id: requireUuid_(
      (existing && existing.id) || input.id || Utilities.getUuid(),
      "Investment account ID",
    ),
    name: requiredName_(input.name),
    type: "investment",
    source: source,
    assignmentId: assignmentId,
    active: input.active === undefined ? (existing ? existing.active !== false : true) : input.active !== false,
    createdAt: existing
      ? existing.createdAt
      : normalizeDateTime_(input.createdAt || timestamp),
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
    interestRate: "",
    categoryId: "",
  };
}

function investmentAccountKey_(account) {
  return String(account.name).trim().toLowerCase();
}

function investmentAccountsMatch_(left, right) {
  return TABLES.accounts.fields.every(function (field) {
    return (
      String(left[field] === undefined ? "" : left[field]) ===
      String(right[field] === undefined ? "" : right[field])
    );
  });
}

function addInvestmentAccounts_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length)
    throw new Error("At least one investment account is required.");
  if (inputs.length > 50)
    throw new Error(
      "A maximum of 50 investment accounts can be added at once.",
    );
  const sheet = requiredSheet_(getSpreadsheet_(), TABLES.accounts);
    const records = readRecordsFromSheet_(
      sheet,
      TABLES.accounts,
      true,
    );
    const byId = new Map(
      records.map(function (item) {
        return [item.id, item];
      }),
    );
    const byName = new Map(
      records
        .filter(function (item) {
          return item.active !== false && item.type === "investment";
        })
        .map(function (item) {
          return [investmentAccountKey_(item), item];
        }),
    );
    const additions = [],
      saved = [],
      reconciled = [],
      failed = [];
    inputs.forEach(function (input) {
      const requestedId = input && input.id ? String(input.id) : "";
      try {
        const record = normalizeInvestmentAccount_(input);
        const sameId = byId.get(record.id);
        if (sameId) {
          if (!investmentAccountsMatch_(sameId, record))
            throw new Error(
              "That investment account ID is already used by different data.",
            );
          saved.push(sameId);
          return;
        }
        const sameName = byName.get(investmentAccountKey_(record));
        if (sameName) {
          reconciled.push({ requestedId: record.id, record: sameName });
          return;
        }
        additions.push(record);
        saved.push(record);
        byId.set(record.id, record);
        byName.set(investmentAccountKey_(record), record);
      } catch (error) {
        failed.push(resultFailure_(requestedId, error));
      }
    });
    appendRows_(
      sheet,
      additions.map(function (item) {
        return recordToRow_(TABLES.accounts, item);
      }),
    );
    flushMutation_();
  return { saved: saved, reconciled: reconciled, failed: failed };
}

function updateInvestmentAccount_(input) {
  const sheet = getTableSheet_(TABLES.accounts);
  const row = findRowById_(sheet, input && input.id);
  if (!row) throw new Error("That investment account could not be found.");
  const existing = rowToRecord_(
    TABLES.accounts,
    sheet
      .getRange(row, 1, 1, TABLES.accounts.headers.length)
      .getValues()[0],
  );
  const account = normalizeInvestmentAccount_(input, existing);
  const duplicate = readRecords_(TABLES.accounts, true).find(
    function (item) {
      return (
        item.id !== account.id &&
        item.type === "investment" &&
        item.active !== false &&
        investmentAccountKey_(item) === investmentAccountKey_(account)
      );
    },
  );
  if (duplicate)
    throw new Error("An investment account with that name already exists.");
  sheet
    .getRange(row, 1, 1, TABLES.accounts.headers.length)
    .setValues([recordToRow_(TABLES.accounts, account)]);
  return account;
}

function validMonth_(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

function saveDebtAccount_(input) {
  if (!input || typeof input !== "object") throw new Error("A debt account is required.");
  const sheet = getTableSheet_(TABLES.accounts);
  const row = findRowById_(sheet, input.id);
  const existing = row ? rowToRecord_(TABLES.accounts, sheet.getRange(row, 1, 1, TABLES.accounts.headers.length).getValues()[0]) : null;
  if (existing && existing.type !== "debt")
    throw new Error("An account type cannot be changed after creation.");
  const timestamp = new Date().toISOString();
  const assignmentId = requireUuid_(input.assignmentId || APP.sharedAssignmentId, "Assignment ID");
  if (!readRecords_(TABLES.assignments, true).some(function (assignment) { return assignment.id === assignmentId; }))
    throw new Error("Choose a valid assignment.");
  const interestRate = Number(input.interestRate || 0);
  if (!isFinite(interestRate) || interestRate < 0)
    throw new Error("Interest rate must be nonnegative.");
  const categoryId=input.categoryId?requireUuid_(input.categoryId,"Debt category ID"):existing&&existing.categoryId||"";
  if(categoryId&&!readRecords_(TABLES.categories,true).some(function(item){return item.id===categoryId&&item.type==="expense"&&item.active!==false;}))throw new Error("Choose an active expense category.");
  const record = {
    id: requireUuid_((existing && existing.id) || input.id || Utilities.getUuid(), "Debt account ID"),
    name: requiredName_(input.name),
    type: "debt",
    assignmentId: assignmentId,
    active: input.active !== false,
    createdAt: existing ? existing.createdAt : normalizeDateTime_(input.createdAt || timestamp),
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
    interestRate: interestRate,
    source: input.source==="deduction"?"deduction":"manual",
    categoryId: categoryId,
  };
  if (row) sheet.getRange(row, 1, 1, TABLES.accounts.headers.length).setValues([recordToRow_(TABLES.accounts, record)]);
  else appendRows_(sheet, [recordToRow_(TABLES.accounts, record)]);
  return record;
}

function saveDebtBalance_(input) {
  if (!input || typeof input !== "object") throw new Error("A debt balance is required.");
  const accountId = requireUuid_(input.accountId || input.debtAccountId, "Debt account ID");
  if (!readRecords_(TABLES.accounts, true).some(function (item) { return item.id === accountId && item.active !== false && item.type === "debt"; })) throw new Error("Choose an active debt account.");
  const asOfDate = cleanText_(input.asOfDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !isValidISODate_(asOfDate)) throw new Error("Choose a valid debt balance date.");
  const value = Number(input.balance); if (!isFinite(value) || value < 0) throw new Error("Debt balances cannot be negative.");
  const sheet = getTableSheet_(TABLES.accountBalances);
  const records = readRecords_(TABLES.accountBalances, true);
  const existing = records.find(function (item) { return item.accountId === accountId && item.month === asOfDate.slice(0, 7); });
  const row = existing ? findRowById_(sheet, existing.id) : 0;
  const timestamp = new Date().toISOString();
  const record = {
    id: requireUuid_((existing && existing.id) || input.id || Utilities.getUuid(), "Debt balance ID"), accountId: accountId,
    month: asOfDate.slice(0, 7), balance: Math.round(value * 100) / 100, notes: cleanText_(input.notes, 1000),
    createdAt: existing ? existing.createdAt : normalizeDateTime_(input.createdAt || timestamp), createdBy: requireUuid_((existing && existing.createdBy) || input.createdBy, "createdBy"),
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp), updatedBy: requireUuid_(input.updatedBy || input.createdBy, "updatedBy"), asOfDate: asOfDate,
  };
  const users = new Map(readRecords_(TABLES.users, true).map(function (item) { return [item.id, item]; }));
  if (!users.has(record.createdBy) || !users.has(record.updatedBy))
    throw new Error("Choose a valid app user.");
  if (row) sheet.getRange(row, 1, 1, TABLES.accountBalances.headers.length).setValues([recordToRow_(TABLES.accountBalances, record)]);
  else appendRows_(sheet, [recordToRow_(TABLES.accountBalances, record)]);
  return record;
}

function investmentMonthEnd_(month) {
  const parts = String(month).split("-").map(Number);
  return Utilities.formatDate(
    new Date(Date.UTC(parts[0], parts[1], 0)),
    "UTC",
    "yyyy-MM-dd",
  );
}

function listAccounts_() { return readRecords_(TABLES.accounts, true); }
function listAccountBalances_() { return readRecords_(TABLES.accountBalances, true); }
function listAccountBalancesByType_(type) {
  const accounts = new Map(listAccounts_().map(function (item) { return [item.id, item]; }));
  return listAccountBalances_().filter(function (item) {
    const account = accounts.get(item.accountId);
    return account && account.type === type;
  });
}
function listAccountActivity_() { const accounts=new Map(listAccounts_().map(function(item){return[item.id,item];}));return readRecords_(TABLES.transactions,true).filter(function(item){return item.accountId&&accounts.has(item.accountId);}).map(function(item){const account=accounts.get(item.accountId);return {...item,month:String(item.date).slice(0,7),activityType:account.type==="investment"?"contribution":Number(item.amount)<0?"borrowing":"payment"};}); }
function legacyDebtBalance_(record) { return { ...record, debtAccountId: record.accountId }; }
function legacyDebtActivity_(record) { return { ...record, debtAccountId: record.accountId, kind: record.activityType }; }
function deleteAccountActivity_(id, expectedAccountId, expectedAccountType) {
  const existing = getRecordById_(TABLES.transactions, id);
  if (!existing) return { id: id, deleted: true, alreadyDeleted: true };
  const account = getRecordById_(TABLES.accounts, existing.accountId);
  if (!account) throw new Error("That activity references a missing account.");
  if (expectedAccountId && existing.accountId !== expectedAccountId)
    throw new Error("That activity belongs to another account.");
  if (expectedAccountType && account.type !== expectedAccountType)
    throw new Error("That activity belongs to another account type.");
  return deleteTransaction_({ id: id, base: existing }).data;
}
function deleteAccountBalance_(input) {
  const id = requireUuid_(input && input.id, "Account balance ID");
  const sheet = getTableSheet_(TABLES.accountBalances);
  const entry = readPhysicalRecordsFromSheet_(sheet, TABLES.accountBalances, true).find(function (item) { return item.record.id === id; });
  if (!entry) return { id: id, deleted: true, alreadyDeleted: true };
  const existing = entry.record;
  if (!input.base)
    throw new Error("A confirmed account balance base is required for deletion.");
  if (!investmentRecordMatches_(existing, input.base, ["accountId", "month", "balance", "notes", "asOfDate"], ["balance"]))
    throw new Error("This account balance changed in the Sheet after you opened it.");
  sheet.deleteRow(entry.rowNumber);
  return { id: id, deleted: true };
}
function accountEditableMatches_(existing, input) {
  if (!existing || !input) return false;
  return ["name", "type", "assignmentId", "active", "source", "interestRate", "categoryId"].every(function (field) {
    const desired = field === "active" ? input.active !== false : input[field];
    return String(existing[field] === undefined ? "" : existing[field]) === String(desired === undefined ? "" : desired);
  });
}
function saveAccount_(input, base) {
  const existing = input && input.id ? getRecordById_(TABLES.accounts, input.id) : null;
  if (existing) {
    if (accountEditableMatches_(existing, input)) return existing;
    if (!base || !accountEditableMatches_(existing, base))
      throw appError_("conflict", "This account changed in the Sheet after you opened it.", false, "validation");
  }
  return input && input.type === "debt" ? saveDebtAccount_(input) : saveInvestmentAccount_(input);
}
function saveInvestmentAccount_(input) {
  const sheet = getTableSheet_(TABLES.accounts);
  const row = findRowById_(sheet, input && input.id);
  if (row) {
    const existing = rowToRecord_(TABLES.accounts, sheet.getRange(row, 1, 1, TABLES.accounts.headers.length).getValues()[0]);
    if (existing.type !== "investment")
      throw new Error("An account type cannot be changed after creation.");
    return updateInvestmentAccount_(input);
  }
  const result = addInvestmentAccounts_([input]);
  if (result.failed.length) throw new Error(result.failed[0].error);
  if (result.saved.length) return result.saved[0];
  if (result.reconciled.length) return result.reconciled[0].record;
  throw new Error("The investment account was not saved.");
}

function listInvestmentBalances_() {
  return readRecords_(TABLES.accountBalances, true);
}
function listInvestmentContributions_() {
  return listAccountActivity_().filter(function(item){return item.activityType==="contribution";});
}

function investmentRecordMatches_(left, right, fields, numericFields) {
  if (!left || !right) return false;
  return fields.every(function (field) {
    return numericFields.indexOf(field) >= 0
      ? Number(left[field]) === Number(right[field])
      : String(left[field] === undefined ? "" : left[field]) ===
          String(right[field] === undefined ? "" : right[field]);
  });
}

function normalizeInvestmentBalance_(input, existing, accounts, users) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("An investment balance is required.");
  const month = cleanText_(input.month, 7);
  if (!validMonth_(month))
    throw new Error("Month must be a valid YYYY-MM value.");
  const accountId = requireUuid_(input.accountId, "Investment account ID");
  const account = accounts.get(accountId);
  if (
    !account ||
    (account.active === false &&
      (!existing || existing.accountId !== accountId))
  )
    throw new Error("Choose an active investment account.");
  const balance = Number(input.balance || 0);
  if (!isFinite(balance) || balance < 0)
    throw new Error("Investment balances cannot be negative.");
  const timestamp = new Date().toISOString();
  const asOfDate = cleanText_(input.asOfDate || investmentMonthEnd_(month), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !isValidISODate_(asOfDate) || asOfDate.slice(0, 7) !== month)
    throw new Error("Balance date must be within the reporting month.");
  const createdBy = existing
    ? existing.createdBy
    : requireUuid_(input.createdBy, "createdBy");
  const updatedBy = requireUuid_(input.updatedBy || createdBy, "updatedBy");
  if (!users.has(createdBy) || !users.has(updatedBy))
    throw new Error("Choose an active app user.");
  return {
    id: requireUuid_(
      (existing && existing.id) || input.id || Utilities.getUuid(),
      "Investment balance ID",
    ),
    accountId: accountId,
    month: month,
    balance: Math.round(balance * 100) / 100,
    notes: cleanText_(input.notes, 1000),
    createdAt: existing
      ? existing.createdAt
      : normalizeDateTime_(input.createdAt || timestamp),
    createdBy: createdBy,
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
    updatedBy: updatedBy,
    asOfDate: asOfDate,
  };
}

function normalizeInvestmentContribution_(input, existing, accounts, users) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("An investment contribution is required.");
  const month = cleanText_(input.month, 7);
  if (!validMonth_(month))
    throw new Error("Month must be a valid YYYY-MM value.");
  const accountId = requireUuid_(input.accountId, "Investment account ID");
  const account = accounts.get(accountId);
  if (
    !account ||
    (account.active === false &&
      (!existing || existing.accountId !== accountId))
  )
    throw new Error("Choose an active investment account.");
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!isFinite(amount) || amount === 0)
    throw new Error("Investment contribution amounts must be nonzero.");
  const timestamp = new Date().toISOString();
  const date = cleanText_(input.date || month + "-15", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidISODate_(date) || date.slice(0, 7) !== month)
    throw new Error("Flow date must be within the reporting month.");
  const flowType = input.flowType === "transfer" ? "transfer" : "external";
  const createdBy = existing
    ? existing.createdBy
    : requireUuid_(input.createdBy, "createdBy");
  const updatedBy = requireUuid_(input.updatedBy || createdBy, "updatedBy");
  if (!users.has(createdBy) || !users.has(updatedBy))
    throw new Error("Choose an active app user.");
  return {
    id: requireUuid_(
      (existing && existing.id) || input.id || Utilities.getUuid(),
      "Investment contribution ID",
    ),
    accountId: accountId,
    activityType: "contribution",
    month: month,
    amount: amount,
    createdAt: existing
      ? existing.createdAt
      : normalizeDateTime_(input.createdAt || timestamp),
    createdBy: createdBy,
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
    updatedBy: updatedBy,
    date: date,
    flowType: flowType,
    transferId: flowType === "transfer" ? cleanText_(input.transferId, 64) : "",
    counterpartyAccountId:
      flowType === "transfer" ? cleanText_(input.counterpartyAccountId, 64) : "",
    source: input.source==="deduction"?"deduction":input.source==="manual"?"manual":account.source,
  };
}

function currentInvestmentMonth_(accountId, month, balances, contributions) {
  return {
    accountId: accountId,
    month: month,
    balance:
      [...balances.values()].find(function (item) {
        return item.accountId === accountId && item.month === month;
      }) || null,
    contributions: [...contributions.values()].filter(function (item) {
      return item.accountId === accountId && item.month === month;
    }),
  };
}

function writeInvestmentRecords_(sheet, spec, records, previousCount) {
  const count = Math.max(previousCount || 0, records.length);
  if (!count) return;
  const blank = Array(spec.headers.length).fill("");
  const values = records.map(function (item) {
    return recordToRow_(spec, item);
  });
  while (values.length < count) values.push(blank.slice());
  sheet.getRange(2, 1, count, spec.headers.length).setValues(values);
}

function saveAccountMonths_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length)
    throw new Error("At least one account month is required.");
  if (inputs.length > 50)
    throw new Error("A maximum of 50 account months can be saved at once.");
  const spreadsheet = getSpreadsheet_();
  const balanceSheet = requiredSheet_(spreadsheet, TABLES.accountBalances);
  const transactionSheet = requiredSheet_(spreadsheet, TABLES.transactions);
  const balancePhysicalCount = Math.max(0, balanceSheet.getLastRow() - 1);
  const transactionPhysicalCount = Math.max(0, transactionSheet.getLastRow() - 1);
  const recordsBySheet = timedPhase_("account_month_read", function () {
    return readTablesWithSheetsApi_(spreadsheet.getId(), [TABLES.accountBalances, TABLES.transactions].concat(referenceSpecs_()));
  });
  const balanceRecords = recordsBySheet[TABLES.accountBalances.name];
  const transactionRecords = recordsBySheet[TABLES.transactions.name];
  const references = referenceMapsFromRecords_(recordsBySheet);
  const accounts = references.accounts;
  const users = new Map(
    [...references.users.entries()].filter(function (entry) {
      return entry[1].active !== false;
    }),
  );
  const balances = new Map(balanceRecords.map(function (item) { return [item.id, item]; }));
  const balanceByMonth = new Map(balanceRecords.map(function (item) { return [item.accountId + "|" + item.month, item]; }));
  const transactions = new Map(transactionRecords.map(function (item) { return [item.id, item]; }));
  const saved = [], failed = [], seenMonths = new Set();

  inputs.forEach(function (operation) {
    const operationId = String((operation && operation.id) || "");
    try {
      if (!operation || typeof operation !== "object" || Array.isArray(operation))
        throw new Error("An account month operation is required.");
      const accountId = requireUuid_(operation.accountId, "Account ID");
      const account = accounts.get(accountId);
      if (!account || account.active === false)
        throw new Error("Choose an active account.");
      const month = cleanText_(operation.month, 7);
      if (!validMonth_(month)) throw new Error("Month must be a valid YYYY-MM value.");
      const monthKey = accountId + "|" + month;
      if (seenMonths.has(monthKey))
        throw new Error("An account can only appear once per month in a batch.");
      seenMonths.add(monthKey);

      const balanceEntry = operation.balance || {};
      if (!balanceEntry.record) throw new Error("An ending balance is required.");
      const existingBalance =
        balances.get(String(balanceEntry.record.id || "")) ||
        balanceByMonth.get(monthKey) ||
        null;
      if (
        existingBalance &&
        balanceEntry.record.id &&
        String(balanceEntry.record.id) !== existingBalance.id
      )
        throw appError_("conflict", "That account already has an ending balance for this month.", false, "validation");
      const balance = normalizeInvestmentBalance_(
        { ...balanceEntry.record, accountId: accountId, month: month },
        existingBalance,
        accounts,
        users,
      );
      const balanceFields = ["id", "accountId", "month", "balance", "notes", "asOfDate", "createdAt", "createdBy", "updatedAt", "updatedBy"];
      const balanceDesired = existingBalance && investmentRecordMatches_(existingBalance, balance, balanceFields, ["balance"]);
      if (
        existingBalance &&
        !balanceDesired &&
        (!balanceEntry.base ||
          !investmentRecordMatches_(existingBalance, balanceEntry.base, balanceFields, ["balance"]))
      )
        throw appError_("conflict", "This ending balance changed in the Sheet after you opened it.", false, "validation");

      const stagedUpserts = [], stagedDeletes = [], seenActivity = new Set();
      const upserts = operation.activity || operation.upserts || [];
      upserts.forEach(function (entry) {
        const source = entry && entry.record ? entry.record : entry;
        const id = requireUuid_(source && source.id, "Account activity ID");
        if (seenActivity.has(id)) throw new Error("Account activity may appear only once per operation.");
        seenActivity.add(id);
        const existing = transactions.get(id) || null;
        const activityType = String(source.activityType || source.kind || (account.type === "investment" ? "contribution" : "payment"));
        if (account.type === "investment" && activityType !== "contribution")
          throw new Error("Investment accounts require contribution activity.");
        if (account.type === "debt" && activityType !== "payment" && activityType !== "borrowing")
          throw new Error("Debt activity must be a payment or borrowing.");
        const amount = account.type === "debt"
          ? activityType === "borrowing" ? -Math.abs(Number(source.amount)) : Math.abs(Number(source.amount))
          : Number(source.amount);
        const raw = {
          ...source,
          id: id,
          accountId: accountId,
          amount: amount,
          date: source.date || month + "-15",
          source: source.source || account.source,
          createdAt: existing ? existing.createdAt : source.createdAt,
          createdBy: existing ? existing.createdBy : source.createdBy,
          notes: source.notes || "",
        };
        if (String(raw.date).slice(0, 7) !== month)
          throw new Error("Activity date must be within the reporting month.");
        const desired = existing
          ? validateUpdatedTransaction_(raw, existing, references)
          : validateTransaction_(raw, references);
        if (existing && editableTransactionsMatch_(existing, desired)) return;
        const base = entry && entry.record ? entry.base : null;
        if (existing && (!base || !editableTransactionsMatch_(existing, base)))
          throw appError_("conflict", "Account activity changed in the Sheet after you opened it.", false, "validation");
        if (existing && (existing.accountId !== accountId || String(existing.date).slice(0, 7) !== month))
          throw new Error("Account activity cannot be moved to another account or month.");
        stagedUpserts.push(desired);
      });

      (operation.deletes || []).forEach(function (entry) {
        const id = requireUuid_(entry && entry.id, "Account activity ID");
        if (seenActivity.has(id)) throw new Error("Account activity cannot be updated and deleted together.");
        seenActivity.add(id);
        const existing = transactions.get(id) || null;
        if (!existing) return;
        if (existing.accountId !== accountId || String(existing.date).slice(0, 7) !== month)
          throw new Error("That activity belongs to another account or month.");
        if (!entry.base || !editableTransactionsMatch_(existing, entry.base))
          throw appError_("conflict", "Account activity changed before it could be deleted.", false, "validation");
        stagedDeletes.push(id);
      });

      balances.set(balance.id, balance);
      balanceByMonth.set(monthKey, balance);
      stagedUpserts.forEach(function (record) { transactions.set(record.id, record); });
      stagedDeletes.forEach(function (id) { transactions.delete(id); });
      const activity = [...transactions.values()]
        .filter(function (item) { return item.accountId === accountId && String(item.date).slice(0, 7) === month; })
        .map(function (item) { return { ...item, month: month, activityType: account.type === "investment" ? "contribution" : Number(item.amount) < 0 ? "borrowing" : "payment" }; });
      saved.push({ id: operationId, accountId: accountId, month: month, balance: balance, activity: activity });
    } catch (error) {
      const classification = classifyError_(error);
      failed.push({
        id: operationId,
        code: classification.code,
        retryable: classification.retryable,
        error: errorMessage_(error),
      });
    }
  });

  if (saved.length) {
    timedPhase_("account_month_commit", function () {
      batchReplaceTableBodies_(spreadsheet.getId(), [
        { spec: TABLES.accountBalances, records: [...balances.values()], previousCount: balancePhysicalCount },
        { spec: TABLES.transactions, records: [...transactions.values()], previousCount: transactionPhysicalCount },
      ]);
    });
  }
  return { saved: saved, failed: failed };
}

function batchReplaceTableBodies_(spreadsheetId, definitions) {
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values)
    throw appError_("not_ready", "The Advanced Sheets service is not available.", false, "commit");
  const data = [];
  definitions.forEach(function (definition) {
    const count = Math.max(definition.previousCount, definition.records.length);
    if (!count) return;
    const blank = Array(definition.spec.headers.length).fill("");
    const values = definition.records.map(function (record) {
      return recordToRow_(definition.spec, record);
    });
    while (values.length < count) values.push(blank.slice());
    data.push({
      range: "'" + definition.spec.name.replace(/'/g, "''") + "'!A2:" + columnLabel_(definition.spec.headers.length) + (count + 1),
      majorDimension: "ROWS",
      values: values,
    });
  });
  if (data.length)
    Sheets.Spreadsheets.Values.batchUpdate(
      { valueInputOption: "RAW", data: data },
      spreadsheetId,
    );
}

function listLegacyInvestmentSnapshots_() {
  const balances = listInvestmentBalances_();
  const contributions = listInvestmentContributions_();
  return balances.map(function (balance) {
    return {
      ...balance,
      contribution: contributions
        .filter(function (item) {
          return (
            item.accountId === balance.accountId && item.month === balance.month
          );
        })
        .reduce(function (sum, item) {
          return sum + Number(item.amount || 0);
        }, 0),
    };
  });
}

function publicImportProfile_(record) {
  let columnMapping = {};
  try {
    columnMapping = JSON.parse(record.columnMappingJson || "{}");
  } catch (error) {
    throw appError_(
      "data_integrity",
      "Import profile " + record.id + " contains invalid mapping JSON.",
      false,
      "read",
    );
  }
  return {
    id: record.id,
    name: record.name,
    target: record.target,
    investmentAccountId: record.investmentAccountId || "",
    headerSignature: record.headerSignature || "[]",
    columnMapping: columnMapping,
    dateFormat: record.dateFormat,
    amountMode: record.amountMode,
    amountMultiplier: Number(record.amountMultiplier) || 1,
    active: record.active !== false,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function listImportProfiles_() {
  return listActiveRecords_(TABLES.importProfiles).map(publicImportProfile_);
}

function getImportProfileBundle_(id) {
  const profile = getRecordById_(
    TABLES.importProfiles,
    requireUuid_(id, "Import profile ID"),
  );
  if (!profile || profile.active === false)
    throw new Error("That import profile could not be found.");
  return {
    profile: publicImportProfile_(profile),
    vendorMappings: readRecords_(TABLES.importVendorMappings, false).filter(
      function (item) {
        return item.importProfileId === profile.id;
      },
    ),
    personMappings: readRecords_(TABLES.importPersonMappings, false).filter(
      function (item) {
        return item.importProfileId === profile.id;
      },
    ),
  };
}

function parseImportJson_(value, label, fallback) {
  const serialized =
    typeof value === "string"
      ? value
      : JSON.stringify(value === undefined ? fallback : value);
  if (serialized.length > 50000) throw new Error(label + " is too large.");
  try {
    return { value: JSON.parse(serialized), serialized: serialized };
  } catch (error) {
    throw new Error(label + " must be valid JSON.");
  }
}

function normalizeImportProfile_(input, existing) {
  if (!input || typeof input !== "object")
    throw new Error("An import profile is required.");
  const timestamp = new Date().toISOString();
  const target = String(input.target || "").toLowerCase();
  if (target !== "transaction" && target !== "budget" && target !== "investment")
    throw new Error("Import target must be transaction, budget, or investment.");
  const signature = parseImportJson_(
    input.headerSignature || "[]",
    "Header signature",
    [],
  );
  if (!Array.isArray(signature.value))
    throw new Error("Header signature must be an array.");
  const mapping = parseImportJson_(
    input.columnMapping === undefined
      ? input.columnMappingJson || "{}"
      : input.columnMapping,
    "Column mapping",
    {},
  );
  if (
    !mapping.value ||
    typeof mapping.value !== "object" ||
    Array.isArray(mapping.value)
  )
    throw new Error("Column mapping must be an object.");
  let investmentAccountId = "";
  if (target === "investment") {
    investmentAccountId = requireUuid_(
      input.investmentAccountId,
      "Investment account ID",
    );
    const account = getRecordById_(
      TABLES.accounts,
      investmentAccountId,
    );
    if (!account || account.active === false || account.type !== "investment")
      throw new Error("Choose an active investment account.");
  }
  const dateFormats = [
    "YYYY-MM-DD",
    "MM/DD/YYYY",
    "MM/DD/YY",
    "DD/MM/YYYY",
    "DD/MM/YY",
    "YYYY-MM",
  ];
  const dateFormat = String(
    input.dateFormat || (target === "investment" ? "YYYY-MM" : "YYYY-MM-DD"),
  );
  if (dateFormats.indexOf(dateFormat) < 0)
    throw new Error("Choose a supported date format.");
  const amountMode =
    target === "investment"
      ? "monthly"
      : input.amountMode === "debitCredit"
        ? "debitCredit"
        : "unified";
  const multiplier = Number(input.amountMultiplier);
  if (multiplier !== 1 && multiplier !== -1)
    throw new Error("Amount multiplier must be 1 or -1.");
  return {
    id: existing
      ? existing.id
      : requireUuid_(input.id || Utilities.getUuid(), "Import profile ID"),
    name: requiredName_(input.name),
    target: target,
    investmentAccountId: investmentAccountId,
    headerSignature: signature.serialized,
    columnMappingJson: mapping.serialized,
    dateFormat: dateFormat,
    amountMode: amountMode,
    amountMultiplier: multiplier,
    active: input.active !== false,
    createdAt: existing
      ? existing.createdAt
      : normalizeDateTime_(input.createdAt || timestamp),
    updatedAt: timestamp,
  };
}

function assertUniqueImportProfileName_(record) {
  const name = record.name.toLowerCase();
  readRecords_(TABLES.importProfiles, true).forEach(function (item) {
    if (
      item.id !== record.id &&
      item.active !== false &&
      item.name.toLowerCase() === name
    )
      throw new Error("That import profile name already exists.");
  });
}

function createImportProfile_(input) {
  const requestedId = input && input.id ? requireUuid_(input.id, "Import profile ID") : "";
  const existing = requestedId ? getRecordById_(TABLES.importProfiles, requestedId) : null;
  const record = normalizeImportProfile_(input, existing);
  if (existing) {
    const fields = ["id", "name", "target", "investmentAccountId", "headerSignature", "columnMappingJson", "dateFormat", "amountMode", "amountMultiplier", "active", "createdAt"];
    if (fields.every(function (field) { return String(existing[field] === undefined ? "" : existing[field]) === String(record[field] === undefined ? "" : record[field]); }))
      return publicImportProfile_(existing);
    throw new Error("That import profile ID already exists with different data.");
  }
  assertUniqueImportProfileName_(record);
  appendRows_(getTableSheet_(TABLES.importProfiles), [
    recordToRow_(TABLES.importProfiles, record),
  ]);
  return publicImportProfile_(record);
}

function importProfilesMatch_(left, right) {
  if (!left || !right) return false;
  return ["name", "target", "investmentAccountId", "headerSignature", "dateFormat", "amountMode", "amountMultiplier", "active"].every(function (field) {
    return String(left[field] === undefined ? "" : left[field]) === String(right[field] === undefined ? "" : right[field]);
  }) && JSON.stringify(left.columnMapping || {}) === JSON.stringify(right.columnMapping || {});
}

function updateImportProfile_(input, base) {
  const sheet = getTableSheet_(TABLES.importProfiles);
  const row = findRowById_(sheet, input && input.id);
  if (!row) throw new Error("That import profile could not be found.");
  const existing = rowToRecord_(
    TABLES.importProfiles,
    sheet
      .getRange(row, 1, 1, TABLES.importProfiles.headers.length)
      .getValues()[0],
  );
  const record = normalizeImportProfile_(
    { ...publicImportProfile_(existing), ...input },
    existing,
  );
  const existingPublic = publicImportProfile_(existing);
  const desiredPublic = publicImportProfile_(record);
  if (importProfilesMatch_(existingPublic, desiredPublic)) return existingPublic;
  if (!base || !importProfilesMatch_(existingPublic, base))
    throw appError_("conflict", "This import profile changed in the Sheet after you opened it.", false, "validation");
  assertUniqueImportProfileName_(record);
  sheet
    .getRange(row, 1, 1, TABLES.importProfiles.headers.length)
    .setValues([recordToRow_(TABLES.importProfiles, record)]);
  return publicImportProfile_(record);
}

function archiveImportProfile_(id) {
  return publicImportProfile_(archiveRecord_(TABLES.importProfiles, id));
}

function normalizeImportDescription_(value) {
  return String(value === null || value === undefined ? "" : value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function plainImportText_(value, maxLength) {
  const text = String(
    value === null || value === undefined ? "" : value,
  ).trim();
  if (text.length > maxLength)
    throw new Error("An import mapping field is too long.");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function validateImportMappingInputs_(inputs, idField, references, accountReferences) {
  if (!Array.isArray(inputs))
    throw new Error("Import mappings must be an array.");
  if (inputs.length > 500)
    throw new Error(
      "A maximum of 500 mappings of each type can be saved at once.",
    );
  const seen = new Set();
  inputs.forEach(function (input) {
    const source = plainImportText_(input && input.sourceDescription, 500);
    const normalized = normalizeImportDescription_(source);
    if (!normalized) throw new Error("A source description is required.");
    if (seen.has(normalized))
      throw new Error(
        "A source description can only appear once in a mapping batch.",
      );
    seen.add(normalized);
    if (input && input.id) requireUuid_(input.id, "Import mapping ID");
    const isPayee = idField === "vendorId";
    const hasVendor = Boolean(input && input.vendorId);
    const hasAccount = Boolean(input && input.accountId);
    if (isPayee && hasVendor === hasAccount)
      throw new Error("Choose exactly one vendor or account.");
    const referenceId = requireUuid_(
      input && (isPayee ? input.vendorId || input.accountId : input[idField]),
      isPayee ? (hasAccount ? "Account ID" : "Vendor ID") : "Assignment ID",
    );
    const reference = isPayee && hasAccount
      ? accountReferences.get(referenceId)
      : references.get(referenceId);
    if (!reference || reference.active === false)
      throw new Error(
        "Choose an active " +
          (isPayee ? (hasAccount ? "account." : "vendor.") : "assignment."),
      );
  });
}

function stageImportMappingKind_(
  spec,
  profileId,
  inputs,
  idField,
  references,
  accountReferences,
) {
  if (!Array.isArray(inputs))
    throw new Error("Import mappings must be an array.");
  if (inputs.length > 500)
    throw new Error(
      "A maximum of 500 mappings of each type can be saved at once.",
    );
  const sheet = getTableSheet_(spec);
  const records = readRecords_(spec, true);
  const byKey = new Map(
    records.map(function (item, index) {
      return [
        item.importProfileId + "|" + item.normalizedSourceDescription,
        { item: item, index: index },
      ];
    }),
  );
  const seen = new Set();
  const timestamp = new Date().toISOString();
  inputs.forEach(function (input) {
    const sourceDescription = plainImportText_(
      input && input.sourceDescription,
      500,
    );
    const normalized = normalizeImportDescription_(sourceDescription);
    if (!normalized) throw new Error("A source description is required.");
    const key = profileId + "|" + normalized;
    if (seen.has(key))
      throw new Error(
        "A source description can only appear once in a mapping batch.",
      );
    seen.add(key);
    const isPayee = idField === "vendorId";
    const hasAccount = Boolean(input && input.accountId);
    const referenceId = requireUuid_(
      input && (isPayee ? input.vendorId || input.accountId : input[idField]),
      isPayee ? (hasAccount ? "Account ID" : "Vendor ID") : "Assignment ID",
    );
    const reference = isPayee && hasAccount
      ? accountReferences.get(referenceId)
      : references.get(referenceId);
    if (!reference || reference.active === false)
      throw new Error(
        "Choose an active " +
          (isPayee ? (hasAccount ? "account." : "vendor.") : "assignment."),
      );
    const existing = byKey.get(key);
    const record = {
      id: existing
        ? existing.item.id
        : requireUuid_(input.id || Utilities.getUuid(), "Import mapping ID"),
      importProfileId: profileId,
      sourceDescription: sourceDescription,
      normalizedSourceDescription: normalized,
      active: true,
      createdAt: existing ? existing.item.createdAt : timestamp,
      updatedAt: timestamp,
    };
    if (isPayee) {
      record.vendorId = hasAccount ? "" : referenceId;
      record.accountId = hasAccount ? referenceId : "";
    } else record[idField] = referenceId;
    if (existing) records[existing.index] = record;
    else {
      byKey.set(key, { item: record, index: records.length });
      records.push(record);
    }
  });
  return {
    records: records,
    previousCount: Math.max(0, sheet.getLastRow() - 1),
    active: records.filter(function (item) {
      return item.importProfileId === profileId && item.active !== false;
    }),
  };
}

function upsertImportMappings_(profileId, vendorInputs, personInputs) {
  const lock = acquireScriptLock_();
  try {
    profileId = requireUuid_(profileId, "Import profile ID");
    const profile = getRecordById_(TABLES.importProfiles, profileId);
    if (!profile || profile.active === false)
      throw new Error("That import profile could not be found.");
    const vendors = new Map(
      readRecords_(TABLES.vendors, true).map(function (item) {
        return [item.id, item];
      }),
    );
    const assignments = new Map(
      readRecords_(TABLES.assignments, true).map(function (item) {
        return [item.id, item];
      }),
    );
    const accounts = new Map(
      readRecords_(TABLES.accounts, true).map(function (item) {
        return [item.id, item];
      }),
    );
    validateImportMappingInputs_(vendorInputs || [], "vendorId", vendors, accounts);
    validateImportMappingInputs_(
      personInputs || [],
      "assignmentId",
      assignments,
    );
    const vendorStage = stageImportMappingKind_(
        TABLES.importVendorMappings,
        profileId,
        vendorInputs || [],
        "vendorId",
        vendors,
        accounts,
      );
    const personStage = stageImportMappingKind_(
        TABLES.importPersonMappings,
        profileId,
        personInputs || [],
        "assignmentId",
        assignments,
        accounts,
      );
    const ids = new Map();
    vendorStage.records.concat(personStage.records).forEach(function (record) {
      const owner = ids.get(record.id);
      const identity = record.importProfileId + "|" + record.normalizedSourceDescription;
      if (owner && owner !== identity)
        throw new Error("An import mapping ID is used by multiple mappings.");
      ids.set(record.id, identity);
    });
    const definitions = [];
    if ((vendorInputs || []).length)
      definitions.push({ spec: TABLES.importVendorMappings, records: vendorStage.records, previousCount: vendorStage.previousCount });
    if ((personInputs || []).length)
      definitions.push({ spec: TABLES.importPersonMappings, records: personStage.records, previousCount: personStage.previousCount });
    batchReplaceTableBodies_(getSpreadsheet_().getId(), definitions);
    flushMutation_();
    return { vendorMappings: vendorStage.active, personMappings: personStage.active };
  } finally {
    lock.releaseLock();
  }
}

function addEntityCompatibility_(kind, input) {
  const result = addEntities_([{ kind: kind, record: input }]);
  if (result.failed.length) throw new Error(result.failed[0].error);
  if (result.saved.length) return result.saved[0].record;
  return result.reconciled[0].record;
}

function addEntities_(inputs) {
  if (!Array.isArray(inputs) || !inputs.length)
    throw new Error("At least one entity is required.");
  if (inputs.length > 50)
    throw new Error("A maximum of 50 entities can be added at once.");
  const lock = acquireScriptLock_();
  try {
    const spreadsheet = getSpreadsheet_();
    const definitions = {
      category: { spec: TABLES.categories },
      vendor: { spec: TABLES.vendors },
      assignment: { spec: TABLES.assignments },
    };
    const involvedKinds = [
      ...new Set(
        inputs
          .map(function (input) {
            return String((input && input.kind) || "");
          })
          .filter(function (kind) {
            return definitions[kind];
          }),
      ),
    ];
    involvedKinds.forEach(function (kind) {
      const definition = definitions[kind];
      definition.sheet = requiredSheet_(spreadsheet, definition.spec);
      definition.records = readRecordsFromSheet_(
        definition.sheet,
        definition.spec,
        true,
      );
      definition.byId = new Map(
        definition.records.map(function (record) {
          return [record.id, record];
        }),
      );
      definition.byName = new Map(
        definition.records.map(function (record) {
          return [entityNameKey_(kind, record), record];
        }),
      );
      definition.additions = [];
      definition.reactivations = [];
    });

    const saved = [],
      reconciled = [],
      failed = [];
    inputs.forEach(function (input) {
      const kind = String((input && input.kind) || "");
      const requestedId =
        input && input.record && input.record.id ? String(input.record.id) : "";
      try {
        if (!definitions[kind])
          throw new Error(
            "Entity kind must be category, vendor, or assignment.",
          );
        const definition = definitions[kind];
        const record = normalizeNewEntity_(kind, input.record);
        const existingId = definition.byId.get(record.id);
        if (existingId) {
          if (
            existingId.active === false &&
            entityNameKey_(kind, existingId) === entityNameKey_(kind, record)
          ) {
            const reactivated = {
              ...existingId,
              name: record.name,
              active: true,
              updatedAt: new Date().toISOString(),
            };
            definition.reactivations.push(reactivated);
            definition.byId.set(reactivated.id, reactivated);
            definition.byName.set(
              entityNameKey_(kind, reactivated),
              reactivated,
            );
            saved.push({ kind: kind, record: reactivated });
            return;
          }
          if (!entitiesMatch_(kind, existingId, record))
            throw new Error(
              "That entity ID is already used by different data.",
            );
          saved.push({ kind: kind, record: existingId });
          return;
        }
        const existingName = definition.byName.get(
          entityNameKey_(kind, record),
        );
        if (existingName) {
          if (existingName.active === false) {
            const reactivated = {
              ...existingName,
              name: record.name,
              active: true,
              updatedAt: new Date().toISOString(),
            };
            definition.reactivations.push(reactivated);
            definition.byId.set(reactivated.id, reactivated);
            definition.byName.set(
              entityNameKey_(kind, reactivated),
              reactivated,
            );
            reconciled.push({
              kind: kind,
              requestedId: record.id,
              record: reactivated,
            });
          } else {
            reconciled.push({
              kind: kind,
              requestedId: record.id,
              record: existingName,
            });
          }
          return;
        }
        definition.additions.push(record);
        definition.byId.set(record.id, record);
        definition.byName.set(entityNameKey_(kind, record), record);
        saved.push({ kind: kind, record: record });
      } catch (error) {
        failed.push(resultFailure_(requestedId, error, { kind: kind }));
      }
    });

    involvedKinds.forEach(function (kind) {
      const definition = definitions[kind];
      definition.reactivations.forEach(function (record) {
        const row = findRowById_(definition.sheet, record.id);
        if (!row) throw new Error("That archived entity could not be found.");
        definition.sheet
          .getRange(row, 1, 1, definition.spec.headers.length)
          .setValues([recordToRow_(definition.spec, record)]);
      });
      appendRows_(
        definition.sheet,
        definition.additions.map(function (record) {
          return recordToRow_(definition.spec, record);
        }),
      );
    });
    flushMutation_();
    return { saved: saved, reconciled: reconciled, failed: failed };
  } finally {
    lock.releaseLock();
  }
}

function normalizeNewEntity_(kind, input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("An entity record is required.");
  const timestamp = new Date().toISOString();
  const record = {
    id: requireUuid_(input.id || Utilities.getUuid(), "Entity ID"),
    name: requiredName_(input.name),
    active: true,
    isDefault: false,
    createdAt: normalizeDateTime_(input.createdAt || timestamp),
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
  };
  if (kind === "category") {
    const type = cleanText_(input.type, 20).toLowerCase();
    if (type !== "income" && type !== "expense")
      throw new Error("Category type must be income or expense.");
    record.type = type;
  }
  if (kind === "vendor") delete record.isDefault;
  return record;
}

function entityNameKey_(kind, record) {
  return (
    (kind === "category" ? String(record.type || "") + "|" : "") +
    String(record.name || "")
      .trim()
      .toLowerCase()
  );
}

function entitiesMatch_(kind, left, right) {
  const fields =
    kind === "category"
      ? ["id", "name", "type", "isDefault", "active", "createdAt", "updatedAt"]
      : kind === "assignment"
        ? ["id", "name", "isDefault", "active", "createdAt", "updatedAt"]
        : ["id", "name", "active", "createdAt", "updatedAt"];
  return fields.every(function (field) {
    return String(left[field]) === String(right[field]);
  });
}

function addCategory_(input) {
  const type = cleanText_(input && input.type, 20).toLowerCase();
  if (type !== "income" && type !== "expense")
    throw new Error("Category type must be income or expense.");
  return addNamedRecord_(TABLES.categories, {
    ...input,
    type: type,
    isDefault: false,
  });
}
function updateCategory_(input, base) {
  const existing = getRecordById_(TABLES.categories, input && input.id);
  if (!existing) throw new Error("That category could not be found.");
  if (input.type && input.type !== existing.type)
    throw new Error("A category type cannot be changed after creation.");
  return updateNamedRecord_(TABLES.categories, {
    ...input,
    type: existing.type,
    isDefault: existing.isDefault,
  }, base);
}

function addNamedRecord_(spec, input) {
  if (!input || typeof input !== "object")
    throw new Error("An entity object is required.");
  const timestamp = new Date().toISOString();
  const record = {
    id: requireUuid_(input.id || Utilities.getUuid(), spec.name + " ID"),
    name: requiredName_(input.name),
    active: true,
    createdAt: normalizeDateTime_(input.createdAt || timestamp),
    updatedAt: normalizeDateTime_(input.updatedAt || timestamp),
  };
  if (spec === TABLES.categories) {
    record.type = input.type;
    record.isDefault = Boolean(input.isDefault);
  }
  if (spec === TABLES.assignments) record.isDefault = Boolean(input.isDefault);
  ensureUniqueIdAndName_(
    spec,
    record.id,
    record.name,
    spec === TABLES.categories ? record.type : "",
  );
  appendRows_(getTableSheet_(spec), [recordToRow_(spec, record)]);
  return record;
}

function updateNamedRecord_(spec, input, base) {
  const sheet = getTableSheet_(spec);
  const row = findRowById_(sheet, input && input.id);
  if (!row)
    throw new Error(
      "That " +
        spec.name.toLowerCase().replace(/s$/, "") +
        " could not be found.",
    );
  const existing = rowToRecord_(
    spec,
    sheet.getRange(row, 1, 1, spec.headers.length).getValues()[0],
  );
  const name = requiredName_(input.name);
  const record = {
    ...existing,
    id: existing.id,
    name: name,
    active: input.active !== false,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  const fields = ["name", "active"];
  if (fields.every(function (field) { return String(existing[field]) === String(record[field]); }))
    return { data: existing };
  if (!base || !fields.every(function (field) { return String(existing[field]) === String(base[field]); }))
    throw appError_("conflict", "This record changed in the Sheet after you opened it.", false, "validation");
  ensureUniqueIdAndName_(
    spec,
    record.id,
    record.name,
    spec === TABLES.categories ? record.type : "",
    record.id,
  );
  sheet
    .getRange(row, 1, 1, spec.headers.length)
    .setValues([recordToRow_(spec, record)]);
  return { data: record };
}

function archiveRecord_(spec, id) {
  const sheet = getTableSheet_(spec),
    row = findRowById_(sheet, id);
  if (!row) throw new Error("That record could not be found.");
  const record = rowToRecord_(
    spec,
    sheet.getRange(row, 1, 1, spec.headers.length).getValues()[0],
  );
  if (record.isDefault) throw new Error("Default records cannot be archived.");
  record.active = false;
  record.updatedAt = new Date().toISOString();
  sheet
    .getRange(row, 1, 1, spec.headers.length)
    .setValues([recordToRow_(spec, record)]);
  return record;
}

function listActiveRecords_(spec) {
  return readRecords_(spec, false);
}
function listArchivedEntities_() {
  return {
    categories: readRecords_(TABLES.categories, true).filter(function (item) {
      return item.active === false && !item.isDefault;
    }),
    vendors: readRecords_(TABLES.vendors, true).filter(function (item) {
      return item.active === false;
    }),
    assignments: readRecords_(TABLES.assignments, true).filter(function (item) {
      return item.active === false && !item.isDefault;
    }),
  };
}
function readRecords_(spec, includeInactive) {
  return readRecordsFromSheet_(getTableSheet_(spec), spec, includeInactive);
}
function readRecordsFromSheet_(sheet, spec, includeInactive) {
  return readPhysicalRecordsFromSheet_(sheet, spec, includeInactive).map(
    function (entry) {
      return entry.record;
    },
  );
}
function readPhysicalRecordsFromSheet_(sheet, spec, includeInactive) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet
    .getRange(2, 1, lastRow - 1, spec.headers.length)
    .getValues()
    .map(function (row, index) {
      return { rowNumber: index + 2, row: row };
    })
    .filter(function (entry) {
      return entry.row[0] !== "";
    })
    .map(function (entry) {
      return {
        rowNumber: entry.rowNumber,
        record: rowToRecord_(spec, entry.row, entry.rowNumber),
      };
    })
    .filter(function (entry) {
      return includeInactive || entry.record.active !== false;
    });
}
function getRecordById_(spec, id) {
  return readRecords_(spec, true).find(function (item) {
    return item.id === id;
  });
}

function ensureUniqueIdAndName_(spec, id, name, type, excludeId) {
  const lowerName = name.toLowerCase();
  readRecords_(spec, true).forEach(function (item) {
    if (item.id === excludeId) return;
    if (item.id === id) throw new Error("That ID already exists.");
    const sameType = spec !== TABLES.categories || item.type === type;
    if (
      item.active !== false &&
      sameType &&
      String(item.name || fullUserName_(item)).toLowerCase() === lowerName
    )
      throw new Error("That name already exists.");
  });
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(
    APP.spreadsheetIdProperty,
  );
  const spreadsheet = id
    ? SpreadsheetApp.openById(id)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet)
    throw new Error(
      "No spreadsheet is configured. Set the SPREADSHEET_ID script property.",
    );
  return spreadsheet;
}
function getTableSheet_(spec) {
  const spreadsheet = getSpreadsheet_();
  const sheet = requiredSheet_(spreadsheet, spec);
  const current = sheet.getRange(1, 1, 1, spec.headers.length).getValues()[0];
  if (!headersMatch_(current, spec.headers))
    throw new Error(
      "The " + spec.name + " sheet headers do not match the expected schema.",
    );
  return sheet;
}

function ensureTableSheet_(spec) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(spec.name);
  if (!sheet) sheet = spreadsheet.insertSheet(spec.name);
  if (spec === TABLES.users) migrateLegacyUserHeaders_(sheet);
  if (spec === TABLES.accounts)
    migrateLegacyInvestmentHeaders_(sheet, spec);
  if (spec === TABLES.accounts) migrateV11AccountHeaders_(sheet);
  if (spec === TABLES.importVendorMappings)
    migrateImportPayeeMappingHeaders_(sheet, spec);
  ensureSheetHeaders_(sheet, spec.headers, spec.name);
  sheet.setFrozenRows(1);
  return sheet;
}

function migrateImportPayeeMappingHeaders_(sheet, spec) {
  const previousHeaders = [
    "ID",
    "Import Profile ID",
    "Source Description",
    "Normalized Source Description",
    "Vendor ID",
    "Active",
    "Created At",
    "Updated At",
  ];
  const current = sheet
    .getRange(1, 1, 1, previousHeaders.length)
    .getValues()[0];
  if (!headersMatch_(current, previousHeaders)) return;
  backupSheetForMigration_(sheet, "import-mapping-v16");
  const lastRow = sheet.getLastRow();
  const rows = lastRow < 2
    ? []
    : sheet.getRange(2, 1, lastRow - 1, previousHeaders.length).getValues();
  replaceSheetValues_(
    sheet,
    spec.headers,
    rows.map(function (row) {
      return row.slice(0, 5).concat([""], row.slice(5));
    }),
    Math.max(previousHeaders.length, spec.headers.length),
  );
}
function migrateLegacyInvestmentHeaders_(sheet, spec) {
  const accountHeaders = [
    "ID",
    "Name",
    "Institution",
    "Account Type",
    "Assignment ID",
    "Active",
    "Created At",
    "Updated At",
  ];
  const previousHeaders = [
    "ID",
    "Name",
    "Source",
    "Active",
    "Created At",
    "Updated At",
  ];
  let oldHeaders = accountHeaders;
  const accountCurrent = sheet
    .getRange(1, 1, 1, accountHeaders.length)
    .getValues()[0];
  if (!headersMatch_(accountCurrent, accountHeaders)) {
    const previousCurrent = sheet
      .getRange(1, 1, 1, previousHeaders.length)
      .getValues()[0];
    oldHeaders = headersMatch_(previousCurrent, previousHeaders)
      ? previousHeaders
      : null;
  }
  if (!oldHeaders) return;
  backupSheetForMigration_(sheet, "investment-headers-v16");
  const lastRow = sheet.getLastRow();
  const oldRows =
    lastRow < 2
      ? []
      : sheet.getRange(2, 1, lastRow - 1, oldHeaders.length).getValues();
  const migrated = oldRows
    .filter(function (row) {
      return row[0] !== "";
    })
    .map(function (row) {
      const isLegacy = oldHeaders === accountHeaders;
      return recordToRow_(spec, { id:row[0], name:row[1], type:"investment", assignmentId:(isLegacy?row[4]:"")||APP.sharedAssignmentId, active:(isLegacy?row[5]:row[3])===""?true:(isLegacy?row[5]:row[3]), createdAt:isLegacy?row[6]:row[4], updatedAt:isLegacy?row[7]:row[5], source:(isLegacy?"manual":row[2])==="paycheck"?"deduction":(isLegacy?"manual":row[2]), interestRate:"", categoryId:"" });
    });
  replaceSheetValues_(
    sheet,
    spec.headers,
    migrated,
    Math.max(oldHeaders.length, spec.headers.length),
  );
}

function migrateV11AccountHeaders_(sheet) {
  const currentHeaders = sheet.getRange(1,1,1,TABLES.accounts.headers.length).getValues()[0];
  if (headersMatch_(currentHeaders, TABLES.accounts.headers)) return;
  const oldHeaders = ["ID", "Name", "Type", "Assignment ID", "Active", "Created At", "Updated At", "Source", "Interest Rate"];
  const current = sheet.getRange(1,1,1,oldHeaders.length).getValues()[0];
  if (!headersMatch_(current, oldHeaders)) return;
  backupSheetForMigration_(sheet, "accounts-v11-v16");
  const lastRow=sheet.getLastRow();
  const rows=lastRow<2?[]:sheet.getRange(2,1,lastRow-1,oldHeaders.length).getValues();
  const migrated = rows.map(function(row){
    const type=String(row[2]);
    row[7]=row[7]==="paycheck"?"deduction":row[7]||"manual";
    return row.concat([type==="debt"?APP.debtPaymentCategoryId:""]);
  });
  replaceSheetValues_(sheet, TABLES.accounts.headers, migrated, TABLES.accounts.headers.length);
}

function derivedInvestmentContributionId_(snapshotId) {
  const compact = requireUuid_(snapshotId, "Investment snapshot ID")
    .replace(/-/g, "")
    .split("");
  compact[0] = ((parseInt(compact[0], 16) + 1) % 16).toString(16);
  compact[12] = "4";
  compact[16] = "8";
  return (
    compact.slice(0, 8).join("") +
    "-" +
    compact.slice(8, 12).join("") +
    "-" +
    compact.slice(12, 16).join("") +
    "-" +
    compact.slice(16, 20).join("") +
    "-" +
    compact.slice(20).join("")
  );
}

function legacyAccountReadSpec_(sheet,key,currentSpec) {
  const candidates=[currentSpec];
  if(PRODUCTION_V7_INVESTMENT_TABLES[key]) candidates.push(PRODUCTION_V7_INVESTMENT_TABLES[key]);
  for(let index=0;index<candidates.length;index+=1){
    const candidate=candidates[index];
    const header=sheet.getRange(1,1,1,candidate.headers.length).getValues()[0];
    if(headersMatch_(header,candidate.headers)) return candidate;
  }
  throw new Error("Cannot migrate "+currentSpec.name+": its headers do not match a supported legacy schema.");
}

function migrateLegacyAccountsV11_() {
  const spreadsheet = getSpreadsheet_();
  const legacy = {};
  Object.keys(LEGACY_ACCOUNT_TABLES).forEach(function (key) {
    const spec = LEGACY_ACCOUNT_TABLES[key];
    const sheet = spreadsheet.getSheetByName(spec.name);
    if (!sheet) { legacy[key] = []; return; }
    const readSpec=legacyAccountReadSpec_(sheet,key,spec);
    legacy[key] = readRecordsFromSheet_(sheet, readSpec, true);
  });
  const accountIds = new Map();
  function addAccount(record, type) {
    if (!record || !record.id) return;
    const unified = {
      id: record.id, name: record.name, type: type,
      assignmentId: record.assignmentId || APP.sharedAssignmentId,
      active: record.active !== false, createdAt: record.createdAt,
      updatedAt: record.updatedAt, source: type === "investment" ? (record.source === "paycheck" ? "deduction" : record.source || "manual") : "manual",
      interestRate: type === "debt" ? record.interestRate : "",
      categoryId: type === "debt" ? APP.debtPaymentCategoryId : "",
    };
    const previous = accountIds.get(unified.id);
    if (previous && (previous.type !== unified.type || previous.name !== unified.name || previous.assignmentId !== unified.assignmentId))
      throw new Error("Cannot migrate accounts: UUID " + unified.id + " exists in both legacy account tables with different records.");
    accountIds.set(unified.id, unified);
  }
  legacy.investmentAccounts.forEach(function (item) { addAccount(item, "investment"); });
  legacy.debtAccounts.forEach(function (item) { addAccount(item, "debt"); });
  const balances = legacy.investmentBalances.map(function (item) { return { ...item, accountId: item.accountId, asOfDate: item.asOfDate || investmentMonthEnd_(item.month) }; })
    .concat(legacy.debtBalances.map(function (item) { return { id: item.id, accountId: item.debtAccountId, month: item.month, balance: item.balance, notes: item.notes, createdAt: item.createdAt, createdBy: item.createdBy, updatedAt: item.updatedAt, updatedBy: item.updatedBy, asOfDate: item.asOfDate }; }));
  const activity = legacy.investmentContributions.map(function (item) { return { id: item.id, accountId: item.accountId, date: item.date || item.month + "-15", month: item.month, amount: item.amount, activityType: "contribution", flowType: item.flowType, transferId: item.transferId, counterpartyAccountId: item.counterpartyAccountId, createdAt: item.createdAt, createdBy: item.createdBy, updatedAt: item.updatedAt, updatedBy: item.updatedBy }; })
    .concat(legacy.debtPayments.map(function (item) { return { id: item.id, accountId: item.debtAccountId, date: item.date, month: item.month, amount: item.amount, activityType: item.kind === "borrowing" ? "borrowing" : "payment", flowType: "", transferId: "", counterpartyAccountId: "", createdAt: item.createdAt, createdBy: item.createdBy, updatedAt: item.updatedAt, updatedBy: item.updatedBy }; }));
  function appendMissing(spec, records) {
    const existing = readRecords_(spec, true);
    const byId = new Map(existing.map(function (item) { return [item.id, item]; }));
    const incoming = new Map();
    records.forEach(function (record) {
      const prior = incoming.get(record.id);
      if (prior && JSON.stringify(recordToRow_(spec, prior)) !== JSON.stringify(recordToRow_(spec, record)))
        throw new Error("Cannot migrate " + spec.name + ": legacy UUID " + record.id + " is used by different records.");
      incoming.set(record.id, record);
    });
    const additions = [...incoming.values()].filter(function (record) {
      const old = byId.get(record.id);
      if (!old) return true;
      if (JSON.stringify(recordToRow_(spec, old)) !== JSON.stringify(recordToRow_(spec, record)))
        throw new Error("Cannot migrate " + spec.name + ": UUID " + record.id + " conflicts with existing unified data.");
      return false;
    });
    appendRows_(getTableSheet_(spec), additions.map(function (item) { return recordToRow_(spec, item); }));
  }
  appendMissing(TABLES.accounts, [...accountIds.values()]);
  appendMissing(TABLES.accountBalances, balances);
  // AccountActivity is retained as a read-only migration/audit artifact.
}

function migrateInvestmentModelV6_() {
  const spreadsheet = getSpreadsheet_();
  const legacy = spreadsheet.getSheetByName("InvestmentSnapshots");
  if (!legacy || legacy.getLastRow() < 1) return;
  let balanceSheet = spreadsheet.getSheetByName(TABLES.accountBalances.name);
  let contributionSheet = spreadsheet.getSheetByName(
    TABLES.accountActivity.name,
  );
  if (!balanceSheet)
    balanceSheet = spreadsheet.insertSheet(TABLES.accountBalances.name);
  if (!contributionSheet)
    contributionSheet = spreadsheet.insertSheet(
      TABLES.accountActivity.name,
    );
  ensureSheetHeaders_(
    balanceSheet,
    TABLES.accountBalances.headers,
    TABLES.accountBalances.name,
  );
  ensureSheetHeaders_(
    contributionSheet,
    TABLES.accountActivity.headers,
    TABLES.accountActivity.name,
  );
  const originalHeaders = [
    "ID",
    "Account ID",
    "Month",
    "Balance Date",
    "Balance",
    "Employee Payroll",
    "Employer Match",
    "Manual Deposits",
    "Withdrawals",
    "Notes",
    "Created At",
    "Created By",
    "Updated At",
    "Updated By",
  ];
  const datedHeaders = [
    "ID",
    "Account ID",
    "Month",
    "Balance Date",
    "Balance",
    "Contribution",
    "Notes",
    "Created At",
    "Created By",
    "Updated At",
    "Updated By",
  ];
  const monthlyHeaders = [
    "ID",
    "Account ID",
    "Month",
    "Balance",
    "Contribution",
    "Notes",
    "Created At",
    "Created By",
    "Updated At",
    "Updated By",
  ];
  const originalCurrent = legacy
    .getRange(1, 1, 1, originalHeaders.length)
    .getValues()[0];
  const datedCurrent = legacy
    .getRange(1, 1, 1, datedHeaders.length)
    .getValues()[0];
  const monthlyCurrent = legacy
    .getRange(1, 1, 1, monthlyHeaders.length)
    .getValues()[0];
  const headers = headersMatch_(originalCurrent, originalHeaders)
    ? originalHeaders
    : headersMatch_(datedCurrent, datedHeaders)
      ? datedHeaders
      : headersMatch_(monthlyCurrent, monthlyHeaders)
        ? monthlyHeaders
        : null;
  if (!headers) return;
  const rows =
    legacy.getLastRow() < 2
      ? []
      : legacy
          .getRange(2, 1, legacy.getLastRow() - 1, headers.length)
          .getValues();
  const balances = new Map(
    readRecordsFromSheet_(balanceSheet, TABLES.accountBalances, true).map(
      function (item) {
        return [item.id, item];
      },
    ),
  );
  const contributions = new Map(
    readRecordsFromSheet_(
      contributionSheet,
      TABLES.accountActivity,
      true,
    ).map(function (item) {
      return [item.id, item];
    }),
  );
  rows
    .filter(function (row) {
      return row[0] !== "";
    })
    .forEach(function (row) {
      const original = headers === originalHeaders;
      const dated = headers === datedHeaders;
      const balance = Number(row[original || dated ? 4 : 3] || 0);
      const amount = original
        ? Number(row[5] || 0) +
          Number(row[6] || 0) +
          Number(row[7] || 0) -
          Number(row[8] || 0)
        : Number(row[dated ? 5 : 4] || 0);
      const notesIndex = original ? 9 : dated ? 6 : 5;
      const metadataIndex = original ? 10 : dated ? 7 : 6;
      balances.set(row[0], {
        id: row[0],
        accountId: row[1],
        month: row[2],
        balance: balance,
        notes: row[notesIndex] || "",
        createdAt: row[metadataIndex],
        createdBy: row[metadataIndex + 1],
        updatedAt: row[metadataIndex + 2],
        updatedBy: row[metadataIndex + 3],
      });
      if (amount !== 0) {
        const id = derivedInvestmentContributionId_(row[0]);
        contributions.set(id, {
          id: id,
          accountId: row[1],
          month: row[2],
          amount: amount,
          createdAt: row[metadataIndex],
          createdBy: row[metadataIndex + 1],
          updatedAt: row[metadataIndex + 2],
          updatedBy: row[metadataIndex + 3],
        });
      }
    });
  writeInvestmentRecords_(
    balanceSheet,
    TABLES.accountBalances,
    [...balances.values()],
    Math.max(0, balanceSheet.getLastRow() - 1),
  );
  writeInvestmentRecords_(
    contributionSheet,
    TABLES.accountActivity,
    [...contributions.values()],
    Math.max(0, contributionSheet.getLastRow() - 1),
  );
  const archiveName = "InvestmentSnapshots_Legacy_v5";
  if (
    !spreadsheet.getSheetByName(archiveName) &&
    typeof legacy.setName === "function"
  )
    legacy.setName(archiveName);
  if (typeof legacy.hideSheet === "function") legacy.hideSheet();
}
function migrateLegacyUserHeaders_(sheet) {
  const oldHeaders = [
    "ID",
    "First Name",
    "Last Name",
    "Created At",
    "Updated At",
  ];
  const current = sheet
    .getRange(1, 1, 1, TABLES.users.headers.length)
    .getValues()[0];
  if (!headersMatch_(current, oldHeaders)) return;
  backupSheetForMigration_(sheet, "users-v16");
  const lastRow = sheet.getLastRow();
  const oldRows =
    lastRow < 2
      ? []
      : sheet.getRange(2, 1, lastRow - 1, oldHeaders.length).getValues();
  replaceSheetValues_(
    sheet,
    TABLES.users.headers,
    oldRows.map(function (row) {
      return [row[0], row[1], row[2], true, row[3], row[4]];
    }),
    TABLES.users.headers.length,
  );
}
function getTransactionSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TABLES.transactions.name);
  if (!sheet) sheet = spreadsheet.insertSheet(TABLES.transactions.name);
  const current = sheet.getRange(1,1,1,TABLES.transactions.headers.length).getValues()[0];
  // The current schema begins with all ten V11 headers. Check the complete
  // schema first so repeated setup never mistakes a current sheet for V11 and
  // truncates Account ID, Source, and Legacy Activity ID from every row.
  if(!headersMatch_(current,TABLES.transactions.headers)){
    if(headersMatch_(current,LEGACY_TRANSACTION_HEADERS))
      migrateLegacyTransactions_(sheet);
    else if(headersMatch_(current,V11_TRANSACTION_HEADERS))
      migrateV11Transactions_(sheet);
  }
  ensureSheetHeaders_(
    sheet,
    TABLES.transactions.headers,
    TABLES.transactions.name,
  );
  sheet.setFrozenRows(1);
  return sheet;
}
function migrateV11Transactions_(sheet) {
  backupSheetForMigration_(sheet, "transactions-v11-v16");
  const lastRow=sheet.getLastRow();
  const rows=lastRow<2?[]:sheet.getRange(2,1,lastRow-1,V11_TRANSACTION_HEADERS.length).getValues();
  replaceSheetValues_(sheet, TABLES.transactions.headers, rows.map(function(row){return row.concat(["","manual",""]);}), TABLES.transactions.headers.length);
}

function migratedActivityId_(id) {
  const compact=requireUuid_(id,"Legacy activity ID").replace(/-/g,"").split("");
  compact[0]=((parseInt(compact[0],16)+8)%16).toString(16); compact[12]="4"; compact[16]="8";
  return compact.slice(0,8).join("")+"-"+compact.slice(8,12).join("")+"-"+compact.slice(12,16).join("")+"-"+compact.slice(16,20).join("")+"-"+compact.slice(20).join("");
}

/** V12: make Transactions canonical while retaining AccountActivity untouched. */
function migrateUnifiedActivityV12_() {
  const spreadsheet=getSpreadsheet_();
  const properties=PropertiesService.getScriptProperties();
  // Script properties can be inherited by a copied bound spreadsheet. Scope the
  // completion marker to the spreadsheet ID so every copy migrates exactly once.
  if(properties.getProperty(APP.unifiedActivityMigrationProperty)===spreadsheet.getId()) return;
  const accountSheet=getTableSheet_(TABLES.accounts);
  const accountRowCount=Math.max(accountSheet.getLastRow()-1,0);
  const accountRows=accountRowCount?accountSheet.getRange(2,1,accountRowCount,TABLES.accounts.headers.length).getValues():[];
  const sourceColumn = TABLES.accounts.fields.indexOf("source");
  const categoryColumn = TABLES.accounts.fields.indexOf("categoryId");
  const accounts=[];
  const accountSources=[];
  const accountCategories=[];
  accountRows.forEach(function(row){
    if(row[0]===""){
      accountSources.push([row[sourceColumn]||""]);
      accountCategories.push([row[categoryColumn]||""]);
      return;
    }
    const account=rowToRecord_(TABLES.accounts,row);
    account.source=account.source==="paycheck"||account.source==="deduction"?"deduction":"manual";
    if(account.type==="debt"&&!account.categoryId) account.categoryId=APP.debtPaymentCategoryId;
    accounts.push(account);
    accountSources.push([account.source]);
    accountCategories.push([account.categoryId||""]);
  });
  if(accountRowCount){
    accountSheet.getRange(2,sourceColumn+1,accountRowCount,1).setValues(accountSources);
    accountSheet.getRange(2,categoryColumn+1,accountRowCount,1).setValues(accountCategories);
  }
  const accountById=new Map(accounts.map(function(item){return [item.id,item];}));
  const transactionSheet=getTableSheet_(TABLES.transactions);
  const transactionRowCount=Math.max(transactionSheet.getLastRow()-1,0);
  const transactionRows=transactionRowCount?transactionSheet.getRange(2,1,transactionRowCount,TABLES.transactions.headers.length).getValues():[];
  const transactions=[];
  const transactionSheetRows=[];
  const legacyActivityIdRows=transactionRows.map(function(row,index){
    if(row[0]==="")return [row[12]||""];
    const item=rowToRecord_(TABLES.transactions,row);
    item.accountId=item.accountId||"";
    item.source=item.source==="deduction"?"deduction":"manual";
    item.legacyActivityId=item.legacyActivityId||"";
    transactions.push(item);
    transactionSheetRows.push(index);
    return [item.legacyActivityId];
  });
  const existingTransactionCount=transactions.length;
  const byId=new Map(transactions.map(function(item){return [item.id,item];}));
  const imported=new Set(transactions.map(function(item){return item.legacyActivityId;}).filter(Boolean));
  const legacyActivitySheet = spreadsheet.getSheetByName(TABLES.accountActivity.name);
  let legacyActivity=legacyActivitySheet
    ? readRecordsFromSheet_(legacyActivitySheet,TABLES.accountActivity,true)
    : [];
  const oldInvestments=spreadsheet.getSheetByName(LEGACY_ACCOUNT_TABLES.investmentContributions.name);
  if(oldInvestments) legacyActivity=legacyActivity.concat(readRecordsFromSheet_(oldInvestments,LEGACY_ACCOUNT_TABLES.investmentContributions,true).map(function(item){return {...item,activityType:"contribution"};}));
  const oldDebt=spreadsheet.getSheetByName(LEGACY_ACCOUNT_TABLES.debtPayments.name);
  if(oldDebt) legacyActivity=legacyActivity.concat(readRecordsFromSheet_(oldDebt,LEGACY_ACCOUNT_TABLES.debtPayments,true).map(function(item){return {...item,accountId:item.debtAccountId,activityType:item.kind==="borrowing"?"borrowing":"payment"};}));
  const orphanedActivity = legacyActivity.filter(function (activity) {
    return activity.id && !accountById.has(activity.accountId);
  });
  if (orphanedActivity.length)
    throw new Error(
      "Cannot complete activity migration: " +
        orphanedActivity.length +
        " record(s) reference missing accounts.",
    );
  const hasPendingActivity=legacyActivity.some(function(activity){
    return activity.id&&accountById.has(activity.accountId)&&!imported.has(activity.id);
  });
  // Adopt spreadsheets successfully migrated before the completion property
  // existed. Their account-linked rows already carry every legacy activity ID.
  if(!hasPendingActivity){
    properties.setProperty(APP.unifiedActivityMigrationProperty,spreadsheet.getId());
    return;
  }
  legacyActivity.forEach(function(activity){
    if(!activity.id||imported.has(activity.id)) return;
    const account=accountById.get(activity.accountId); if(!account)return;
    let amount=Number(activity.amount)||0;
    if(account.type==="debt"&&activity.activityType==="borrowing") amount=-Math.abs(amount);
    const explicit=normalizeDateId_(activity.date);
    const month=normalizeMonthId_(activity.month||explicit);
    const date=/^\d{4}-\d{2}-\d{2}$/.test(explicit)?explicit:month+"-15";
    const source=activity.flowType==="transfer"?"manual":account.source;
    function adoptExisting_(same){
      if(!same||same.accountId!==activity.accountId||Number(same.amount)!==amount||normalizeDateId_(same.date)!==date||String(same.source||"manual")!==String(source||"manual")) return false;
      same.legacyActivityId=activity.id;
      const existingIndex=transactions.indexOf(same);
      if(existingIndex>=0&&existingIndex<existingTransactionCount) legacyActivityIdRows[transactionSheetRows[existingIndex]][0]=activity.id;
      imported.add(activity.id);
      return true;
    }
    let id=activity.id;
    if(byId.has(id)){if(adoptExisting_(byId.get(id)))return;id=migratedActivityId_(activity.id);}
    if(byId.has(id)){if(adoptExisting_(byId.get(id)))return;throw new Error("Cannot migrate AccountActivity: derived transaction ID collision for "+activity.id+".");}
    const record={id:id,createdAt:activity.createdAt,createdBy:activity.createdBy,type:"",amount:amount,date:date,categoryId:"",vendorId:"",assignmentId:"",notes:"",accountId:account.id,source:source,legacyActivityId:activity.id};
    transactions.push(record);byId.set(id,record);imported.add(activity.id);
  });
  // Existing transactions are immutable here, except for the migration marker.
  // In particular, setup must never rewrite or clear their Account ID values.
  if(legacyActivityIdRows.length)transactionSheet.getRange(2,13,legacyActivityIdRows.length,1).setValues(legacyActivityIdRows);
  appendRows_(transactionSheet,transactions.slice(existingTransactionCount).map(function(item){return recordToRow_(TABLES.transactions,item);}));
  flushMutation_();
  properties.setProperty(APP.unifiedActivityMigrationProperty,spreadsheet.getId());
}

/** Repairs the v12 category write that used the undeclared K column. */
function repairAccountCategoryColumnV16_() {
  const spreadsheet = getSpreadsheet_();
  const properties = PropertiesService.getScriptProperties();
  if (
    properties.getProperty(APP.accountCategoryRepairProperty) ===
    spreadsheet.getId()
  )
    return;
  const sheet = getTableSheet_(TABLES.accounts);
  const rowCount = Math.max(sheet.getLastRow() - 1, 0);
  if (rowCount) {
    const categoryColumn = TABLES.accounts.fields.indexOf("categoryId") + 1;
    const rows = sheet.getRange(2, categoryColumn, rowCount, 2).getValues();
    const accountRows = sheet
      .getRange(2, 1, rowCount, TABLES.accounts.headers.length)
      .getValues();
    let changed = false;
    rows.forEach(function (row, index) {
      const account = rowToRecord_(TABLES.accounts, accountRows[index], index + 2);
      const erroneous = String(row[1] || "");
      if (
        account.type === "debt" &&
        !row[0] &&
        erroneous === APP.debtPaymentCategoryId
      ) {
        row[0] = APP.debtPaymentCategoryId;
        row[1] = "";
        changed = true;
      }
    });
    if (changed) {
      backupSheetForMigration_(sheet, "category-column-v16");
      sheet.getRange(2, categoryColumn, rowCount, 2).setValues(rows);
    }
  }
  flushMutation_();
  properties.setProperty(APP.accountCategoryRepairProperty, spreadsheet.getId());
}
function migrateLegacyTransactions_(sheet) {
  backupSheetForMigration_(sheet, "transactions-legacy-v16");
  const lastRow = sheet.getLastRow();
  const rows =
    lastRow < 2
      ? []
      : sheet
          .getRange(2, 1, lastRow - 1, LEGACY_TRANSACTION_HEADERS.length)
          .getValues();
  const migrated = rows
    .filter(function (row) {
      return row[0] !== "";
    })
    .map(function (row) {
      const legacy = {};
      LEGACY_TRANSACTION_HEADERS.forEach(function (header, index) {
        legacy[header] = row[index];
      });
      const type =
        String(legacy.Type).toLowerCase() === "income" ? "income" : "expense";
      const category =
        type === "income"
          ? getRecordById_(TABLES.categories, APP.incomeCategoryId)
          : findOrCreateNamed_(TABLES.categories, legacy.Category || "Other", {
              type: "expense",
              isDefault: false,
            });
      const vendor =
        type === "income"
          ? null
          : findOrCreateNamed_(TABLES.vendors, legacy.Vendor || "Unknown", {});
      const assignment = findOrCreateNamed_(
        TABLES.assignments,
        legacy.Assignment || "Shared",
        {},
      );
      return recordToRow_(TABLES.transactions, {
        id: isUuid_(legacy.ID) ? String(legacy.ID) : Utilities.getUuid(),
        createdAt: normalizeDateTime_(legacy["Created At"]),
        createdBy: String(legacy["Created By"] || ""),
        type: type,
        amount: numericCell_(
          legacy.Amount,
          { name: "legacy Transactions" },
          "migration",
          "Amount",
        ),
        date: serializeCell_(legacy.Date, "date"),
        categoryId: category.id,
        vendorId: vendor ? vendor.id : "",
        assignmentId: assignment.id,
        notes: String(legacy.Notes || ""),
      });
    });
  replaceSheetValues_(
    sheet,
    TABLES.transactions.headers,
    migrated,
    Math.max(LEGACY_TRANSACTION_HEADERS.length, TABLES.transactions.headers.length),
  );
}
function findOrCreateNamed_(spec, name, extras) {
  const text = String(name || "").trim();
  const existing = readRecords_(spec, true).find(function (item) {
    return (
      item.name.toLowerCase() === text.toLowerCase() &&
      (!extras.type || item.type === extras.type)
    );
  });
  return existing || addNamedRecord_(spec, { name: text, ...extras });
}

function backupSheetForMigration_(sheet, label) {
  const spreadsheet = sheet.getParent ? sheet.getParent() : getSpreadsheet_();
  const name = ("_TED_Backup_" + sheet.getName() + "_" + label).slice(0, 99);
  if (spreadsheet.getSheetByName(name)) return;
  if (typeof sheet.copyTo !== "function") return;
  const backup = sheet.copyTo(spreadsheet).setName(name);
  if (typeof backup.hideSheet === "function") backup.hideSheet();
}

function ensureSheetHeaders_(sheet, headers, label) {
  const range = sheet.getRange(1, 1, 1, headers.length),
    current = range.getValues()[0];
  const hasAny = current.some(function (value) {
    return value !== "";
  });
  if (!hasAny) {
    range.setValues([headers]);
    return;
  }
  if (headersMatch_(current, headers)) return;
  const prefixMatches = headers.every(function (header, index) {
    return current[index] === header || current[index] === "";
  });
  if (prefixMatches) {
    range.setValues([headers]);
    const activeIndex = headers.indexOf("Active");
    if (activeIndex >= 0 && sheet.getLastRow() > 1) {
      const activeRange = sheet.getRange(
        2,
        activeIndex + 1,
        sheet.getLastRow() - 1,
        1,
      );
      const values = activeRange.getValues().map(function (row) {
        return [row[0] === "" ? true : row[0]];
      });
      activeRange.setValues(values);
    }
    return;
  }
  throw new Error(
    "The " + label + " sheet headers do not match the expected schema.",
  );
}
function headersMatch_(actual, expected) {
  return expected.every(function (header, index) {
    return actual[index] === header;
  });
}

function rowToRecord_(spec, row, rowNumber) {
  const record = {};
  spec.fields.forEach(function (field, index) {
    record[field] = serializeCell_(row[index], field);
  });
  if ("active" in record) record.active = parseBooleanCell_(record.active, true, spec, rowNumber, "active");
  if ("isDefault" in record) record.isDefault = parseBooleanCell_(record.isDefault, false, spec, rowNumber, "isDefault");
  if ("amount" in record) record.amount = numericCell_(record.amount, spec, rowNumber, "amount");
  ["balance", "contribution"].forEach(function (field) {
    if (field in record) record[field] = numericCell_(record[field], spec, rowNumber, field);
  });
  return record;
}
function numericCell_(value, spec, rowNumber, field) {
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  if (!isFinite(number))
    throw appError_(
      "data_integrity",
      "Invalid numeric value in " + spec.name + " row " + (rowNumber || "?") + ", field " + field + ".",
      false,
      "read",
    );
  return number;
}
function parseBooleanCell_(value, blankDefault, spec, rowNumber, field) {
  if (value === "" || value === null || value === undefined) return blankDefault;
  if (value === true || String(value).toLowerCase() === "true") return true;
  if (value === false || String(value).toLowerCase() === "false") return false;
  throw appError_(
    "data_integrity",
    "Invalid boolean value in " + spec.name + " row " + (rowNumber || "?") + ", field " + field + ".",
    false,
    "read",
  );
}
function recordToRow_(spec, record) {
  return spec.fields.map(function (field) {
    return record[field] === undefined || record[field] === null
      ? ""
      : record[field];
  });
}
function replaceSheetValues_(sheet, headers, rows, previousWidth) {
  const width = Math.max(headers.length, previousWidth || 0);
  const rowCount = Math.max(sheet.getLastRow(), rows.length + 1, 1);
  const values = Array.from({ length: rowCount }, function () {
    return Array(width).fill("");
  });
  headers.forEach(function (value, index) {
    values[0][index] = value;
  });
  rows.forEach(function (row, rowIndex) {
    row.forEach(function (value, columnIndex) {
      if (columnIndex < width) values[rowIndex + 1][columnIndex] = value;
    });
  });
  sheet.getRange(1, 1, rowCount, width).setValues(values);
}
function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet
    .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
    .setValues(rows);
}
function findRowById_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return 0;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const index = ids.findIndex(function (row) {
    return row[0] === id;
  });
  return index < 0 ? 0 : index + 2;
}

function parsePostBody_(e) {
  const contents = e && e.postData && e.postData.contents;
  if (!contents) throw new Error("The request body is empty.");
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error("The request body is not valid JSON.");
  }
}
function serializeCell_(value, field) {
  if (field === "amount") return value;
  if (field === "month") return normalizeMonthId_(value);
  if (field === "date" || field === "asOfDate") return normalizeDateId_(value);
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (/At$/.test(field) && value !== "") return normalizeDateTime_(value);
  return value === null || value === undefined ? "" : String(value);
}
function normalizeDateId_(value) {
  const text = String(value === null || value === undefined ? "" : value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = value instanceof Date ? value : new Date(text);
  return isNaN(date.getTime())
    ? ""
    : Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}
function normalizeMonthId_(value) {
  const text = String(value === null || value === undefined ? "" : value);
  const match = text.match(/^\d{4}-\d{2}/);
  if (match) return match[0];
  const date = value instanceof Date ? value : new Date(text);
  return isNaN(date.getTime())
    ? ""
    : Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM");
}
function normalizeDateTime_(value) {
  const text = cleanText_(value, 50),
    parsed = text ? new Date(text) : new Date();
  if (isNaN(parsed.getTime())) throw new Error("A timestamp is invalid.");
  return parsed.toISOString();
}
function isValidISODate_(value) {
  const parts = value.split("-").map(Number),
    date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return (
    date.getUTCFullYear() === parts[0] &&
    date.getUTCMonth() === parts[1] - 1 &&
    date.getUTCDate() === parts[2]
  );
}
function requiredName_(value) {
  const name = cleanText_(value, 150);
  if (!name) throw new Error("A name is required.");
  return name;
}
function requireUuid_(value, label) {
  const id = cleanText_(value, 100).toLowerCase();
  if (!isUuid_(id)) throw new Error(label + " must be a valid UUID.");
  return id;
}
function isUuid_(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}
function cleanText_(value, maxLength) {
  const text =
    value === null || value === undefined ? "" : String(value).trim();
  if (text.length > maxLength) throw new Error("A field is too long.");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
function errorMessage_(error) {
  return error && error.message
    ? error.message
    : String(error || "Unexpected server error.");
}
function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
