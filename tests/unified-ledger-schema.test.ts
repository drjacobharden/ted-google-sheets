import { describe, expect, test } from "bun:test";

const code = await Bun.file(new URL("../apps-script/Code.gs", import.meta.url)).text();

describe("unified ledger Apps Script schema",()=>{
  test("versions and canonical fields are upgraded",()=>{
    expect(code).toContain('setupVersion: "13"');
    expect(code).toContain("apiVersion: 15");
    expect(code).toContain('"Account ID",\n      "Source",\n      "Legacy Activity ID"');
    expect(code).toContain('debtPaymentCategoryId: "00000000-0000-4000-8000-000000000002"');
  });
  test("learned import payees support vendors or accounts without rewriting old rows",()=>{
    const mappingSchema = code.slice(
      code.indexOf("importVendorMappings: {"),
      code.indexOf("importPersonMappings: {"),
    );
    expect(mappingSchema).toContain('"Vendor ID",\n      "Account ID"');
    expect(code).toContain("migrateImportPayeeMappingHeaders_");
    expect(code).toContain('throw new Error("Choose exactly one vendor or account.")');
  });
  test("migration records origins, midpoint dates, borrowing signs, and explicit sources",()=>{
    expect(code).toContain("imported.has(activity.id)");
    expect(code).toContain('month+"-15"');
    expect(code).toContain('activity.activityType==="borrowing"')
    expect(code).toContain("legacyActivityId:activity.id");
    expect(code).toContain('activity.flowType==="transfer"?"manual":account.source');
  });
  test("migration preserves existing transaction cells and only backfills V12 metadata",()=>{
    const migration = code.slice(
      code.indexOf("function migrateUnifiedActivityV12_"),
      code.indexOf("function getLedgerSheet_"),
    );
    expect(migration).toContain("transactionSheet.getRange(2,11,metadataRows.length,3)");
    expect(migration).toContain("transactions.slice(existingTransactionCount)");
    expect(migration).not.toContain("transactionSheet.getRange(2,1,transactions.length");
    expect(migration).not.toContain("clearContent()");
  });
  test("ledger rebuild uses hydrated account data without per-row sheet reads",()=>{
    const ledger = code.slice(
      code.indexOf("function rebuildLedger_"),
      code.indexOf("function safeSyncLedgerName_"),
    );
    expect(ledger).toContain("transaction.accountType");
    expect(ledger).toContain("Ledger rebuild stopped before writing:");
    expect(ledger).not.toContain("getRecordById_");
    expect(ledger).not.toContain("clearContent()");
  });
  test("runtime bootstrap and repositories use Transactions rather than AccountActivity",()=>{
    const bootstrap = code.slice(code.indexOf("function bootstrapSpecs_"), code.indexOf("function readBootstrapWithSheetsApi_"));
    expect(bootstrap).not.toContain("TABLES.accountActivity");
    const runtimeList = code.slice(code.indexOf("function listAccountActivity_"), code.indexOf("function accountTypeById_"));
    expect(runtimeList).toContain("TABLES.transactions");
    expect(runtimeList).not.toContain("TABLES.accountActivity");
  });
  test("accounts schema and persistence omit lender",()=>{
    const accountsSchema = code.slice(
      code.indexOf("accounts: {"),
      code.indexOf("accountBalances: {"),
    );
    const debtSave = code.slice(
      code.indexOf("function saveDebtAccount_"),
      code.indexOf("function saveDebtBalance_"),
    );
    expect(accountsSchema).toContain('"Interest Rate", "Category ID"');
    expect(accountsSchema).not.toContain("Lender");
    expect(accountsSchema).not.toContain("lender");
    expect(debtSave).not.toContain("lender");
  });
});
