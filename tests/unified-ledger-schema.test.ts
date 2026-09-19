import { describe, expect, test } from "bun:test";

const code = await Bun.file(new URL("../apps-script/Code.gs", import.meta.url)).text();

describe("unified ledger Apps Script schema",()=>{
  test("versions and canonical fields are upgraded",()=>{
    expect(code).toContain('setupVersion: "16"');
    expect(code).toContain("apiVersion: 16");
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
  test("migration is spreadsheet-scoped and never rewrites existing account IDs",()=>{
    const migration = code.slice(
      code.indexOf("function migrateUnifiedActivityV12_"),
      code.indexOf("function repairAccountCategoryColumnV16_"),
    );
    expect(migration).toContain("APP.unifiedActivityMigrationProperty");
    expect(migration).toContain("===spreadsheet.getId()) return");
    expect(migration).toContain("if(!hasPendingActivity)");
    expect(migration).toContain("transactionSheet.getRange(2,13,legacyActivityIdRows.length,1)");
    expect(migration).toContain("properties.setProperty(APP.unifiedActivityMigrationProperty,spreadsheet.getId())");
    expect(migration).toContain("transactions.slice(existingTransactionCount)");
    expect(migration).not.toContain("transactionSheet.getRange(2,1,transactions.length");
    expect(migration).not.toContain("transactionSheet.getRange(2,11");
    expect(migration).not.toContain("clearContent()");
  });
  test("migration adopts matching account-aware rows without clearing their account IDs",()=>{
    const migration = code.slice(
      code.indexOf("function migrateUnifiedActivityV12_"),
      code.indexOf("function repairAccountCategoryColumnV16_"),
    );
    expect(migration).toContain("same.accountId!==activity.accountId");
    expect(migration).toContain("same.legacyActivityId=activity.id");
    expect(migration).toContain("accountId:account.id");
  });
  test("current transaction headers are never mistaken for the V11 prefix",()=>{
    const getTransactionSheet = code.slice(
      code.indexOf("function getTransactionSheet_"),
      code.indexOf("function migrateV11Transactions_"),
    );
    expect(getTransactionSheet).toContain(
      "if(!headersMatch_(current,TABLES.transactions.headers))",
    );
    expect(getTransactionSheet.indexOf("TABLES.transactions.headers")).toBeLessThan(
      getTransactionSheet.indexOf("V11_TRANSACTION_HEADERS"),
    );
    expect(getTransactionSheet).toContain("else if(headersMatch_(current,V11_TRANSACTION_HEADERS))");

    const currentHeaders = [
      "ID", "Created At", "Created By", "Type", "Amount", "Date",
      "Category ID", "Vendor ID", "Assignment ID", "Notes", "Account ID",
      "Source", "Legacy Activity ID",
    ];
    const legacyHeaders = [
      "ID", "Created At", "Created By", "Type", "Amount", "Date",
      "Category", "Vendor", "Assignment", "Notes",
    ];
    const v11Headers = currentHeaders.slice(0, 10);
    const migrationCalls: string[] = [];
    const sheet = {
      getRange: (_row: number, _column: number, _rows: number, columns: number) => ({
        getValues: () => [currentHeaders.slice(0, columns)],
      }),
      setFrozenRows: () => {},
    };
    const factory = new Function(
      "getSpreadsheet_", "TABLES", "headersMatch_", "LEGACY_TRANSACTION_HEADERS",
      "V11_TRANSACTION_HEADERS", "migrateLegacyTransactions_", "migrateV11Transactions_",
      "ensureSheetHeaders_",
      getTransactionSheet + "; return getTransactionSheet_;",
    );
    const getCurrentTransactionSheet = factory(
      () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }),
      { transactions: { name: "Transactions", headers: currentHeaders } },
      (actual: string[], expected: string[]) => expected.every((header, index) => actual[index] === header),
      legacyHeaders,
      v11Headers,
      () => migrationCalls.push("legacy"),
      () => migrationCalls.push("v11"),
      () => {},
    );
    expect(getCurrentTransactionSheet()).toBe(sheet);
    expect(migrationCalls).toEqual([]);
  });
  test("production v7 investment schemas are accepted by account unification",()=>{
    const v7Schemas = code.slice(
      code.indexOf("const PRODUCTION_V7_INVESTMENT_TABLES"),
      code.indexOf("const TABLES"),
    );
    expect(v7Schemas).toContain('["ID", "Name", "Source", "Active", "Created At", "Updated At"]');
    expect(v7Schemas).toContain('["ID", "Account ID", "Month", "Ending Balance", "Notes", "Created At", "Created By", "Updated At", "Updated By"]');
    expect(v7Schemas).toContain('["ID", "Account ID", "Month", "Amount", "Created At", "Created By", "Updated At", "Updated By"]');

    const compatibility = code.slice(
      code.indexOf("function legacyAccountReadSpec_"),
      code.indexOf("function migrateLegacyAccountsV11_"),
    );
    const factory = new Function(
      "PRODUCTION_V7_INVESTMENT_TABLES", "headersMatch_",
      compatibility + "; return legacyAccountReadSpec_;",
    );
    const productionSpecs = {
      investmentAccounts: {
        name: "InvestmentAccounts",
        headers: ["ID", "Name", "Source", "Active", "Created At", "Updated At"],
        fields: ["id", "name", "source", "active", "createdAt", "updatedAt"],
      },
    };
    const currentSpec = {
      name: "InvestmentAccounts",
      headers: ["ID", "Name", "Source", "Assignment ID", "Active", "Created At", "Updated At"],
    };
    const v7Headers = productionSpecs.investmentAccounts.headers;
    const sheet = {
      getRange: (_row: number, _column: number, _rows: number, columns: number) => ({
        getValues: () => [v7Headers.slice(0, columns)],
      }),
    };
    const selectSpec = factory(
      productionSpecs,
      (actual: string[], expected: string[]) => expected.every((header, index) => actual[index] === header),
    );
    expect(selectSpec(sheet, "investmentAccounts", currentSpec)).toBe(
      productionSpecs.investmentAccounts,
    );

    const accountMigration = code.slice(
      code.indexOf("function migrateLegacyAccountsV11_"),
      code.indexOf("function migrateInvestmentModelV6_"),
    );
    expect(accountMigration).toContain('record.source === "paycheck" ? "deduction"');
    expect(accountMigration).toContain("item.asOfDate || investmentMonthEnd_(item.month)");
  });
  test("derived Ledger is not part of persistence or runtime maintenance",()=>{
    expect(code).not.toContain("TABLES.ledger");
    expect(code).not.toContain("function rebuildLedger_");
    expect(code).not.toContain("function getLedgerSheet_");
    expect(code).not.toContain("ledgerDirtyProperty");
    expect(code).not.toContain('case "rebuildLedger"');
  });
  test("runtime bootstrap and repositories use Transactions rather than AccountActivity",()=>{
    const bootstrap = code.slice(code.indexOf("function bootstrapSpecs_"), code.indexOf("function readBootstrapWithSheetsApi_"));
    expect(bootstrap).not.toContain("TABLES.accountActivity");
    const runtimeList = code.slice(code.indexOf("function listAccountActivity_"), code.indexOf("function legacyDebtBalance_"));
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
