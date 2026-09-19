import { describe, expect, test } from "bun:test";

const server = await Bun.file(
  new URL("../apps-script/Code.gs", import.meta.url),
).text();
const setup = await Bun.file(
  new URL("../apps-script/Setup.gs", import.meta.url),
).text();
const budgetClient = await Bun.file(
  new URL("../src/api/budget-api.ts", import.meta.url),
).text();
const accountClient = await Bun.file(
  new URL("../src/api/account-api.ts", import.meta.url),
).text();

describe("Apps Script reliability boundaries", () => {
  test("runtime table reads are strict and setup owns schema mutation", () => {
    const runtime = server.slice(
      server.indexOf("function getTableSheet_"),
      server.indexOf("function ensureTableSheet_"),
    );
    const ensure = server.slice(
      server.indexOf("function ensureTableSheet_"),
      server.indexOf("function migrateImportPayeeMappingHeaders_"),
    );
    expect(runtime).toContain("requiredSheet_");
    expect(runtime).not.toContain("insertSheet");
    expect(runtime).not.toContain("migrateLegacy");
    expect(ensure).toContain("insertSheet");
    expect(ensure).toContain("ensureSheetHeaders_");
  });

  test("transaction updates use physical rows and deletes are idempotent", () => {
    const updates = server.slice(
      server.indexOf("function updateTransactions_"),
      server.indexOf("function validateUpdatedTransaction_"),
    );
    expect(updates).toContain("readPhysicalRecordsFromSheet_");
    expect(updates).toContain("write.rowNumber");
    expect(updates).toContain("transactionSheet.deleteRow(entry.rowNumber)");
    expect(updates).toContain("alreadyDeleted: true");
    expect(updates).not.toContain("records.splice");
  });

  test("account-month batches lock, stage, classify, and commit together", () => {
    expect(server).toContain(
      'return success_(withScriptLock_(function () { return saveAccountMonths_(request.months); }))',
    );
    const months = server.slice(
      server.indexOf("function saveAccountMonths_"),
      server.indexOf("function listLegacyInvestmentSnapshots_"),
    );
    expect(months).toContain("balanceDesired");
    expect(months).toContain("stagedUpserts");
    expect(months).toContain("stagedDeletes");
    expect(months).toContain("batchReplaceTableBodies_");
    expect(months).not.toContain("releaseLock: function");
    expect(months).not.toContain("upsertAccountTransaction_");
  });

  test("stored scalar parsing rejects corruption and normalizes every date field", () => {
    expect(server).toContain('field !== "asOfDate"');
    expect(server).toContain('"data_integrity"');
    expect(server).toContain("numericCell_");
    expect(server).toContain("parseBooleanCell_");
    expect(server).not.toContain("Number(record.amount) || 0");
  });

  test("setup has an explicit state machine and migration checkpoints", () => {
    expect(setup).toContain('"in_progress:" + spreadsheetId');
    expect(setup).toContain('"failed:" + spreadsheetId');
    expect(setup).toContain('"completed:" + spreadsheetId');
    expect(server).toContain("APP.legacyAccountsMigrationProperty");
    expect(server).toContain("APP.accountCategoryRepairProperty");
    expect(server).toContain('TABLES.accounts.fields.indexOf("categoryId")');
  });
});

describe("client retry contracts", () => {
  test("bootstrap covers body parsing, retries classified errors, and is single-flight", () => {
    expect(budgetClient).toContain("BOOTSTRAP_TIMEOUT_MS = 45000");
    expect(budgetClient).toContain("BOOTSTRAP_MAX_ATTEMPTS = 3");
    expect(budgetClient).toContain("error?.retryable === true");
    expect(budgetClient).toContain("normalizeResponse(await response.json())");
    expect(budgetClient).toContain("appDataInFlight");
  });

  test("transaction and account outboxes bound retries and preserve revisions", () => {
    expect(budgetClient).toContain("MAX_AUTOMATIC_SYNC_ATTEMPTS = 6");
    expect(budgetClient).toContain('failureCode: permanent ? error.code || "server" : "retry_exhausted"');
    expect(budgetClient).toContain('status: "waiting_to_retry"');
    expect(accountClient).toContain("MAX_ATTEMPTS=6");
    expect(accountClient).toContain("(current.revision||0)!==revision");
    expect(accountClient).toContain('error.retryable=failure.retryable===true');
    expect(accountClient).toContain('status:"waiting_to_retry"');
  });
});
