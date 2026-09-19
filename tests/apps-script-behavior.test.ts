import { describe, expect, test } from "bun:test";
import vm from "node:vm";

const code = await Bun.file(
  new URL("../apps-script/Code.gs", import.meta.url),
).text();

function context() {
  const sandbox = vm.createContext({ console });
  vm.runInContext(`${code}\nglobalThis.TEST_TABLES = TABLES;`, sandbox);
  vm.runInContext(
    `
      Session={getScriptTimeZone(){return "UTC"}};
      Utilities={
        getUuid(){return "00000000-0000-4000-8000-000000000999"},
        formatDate(date,tz,format){
          const iso=date.toISOString();
          if(format==="yyyy-MM-dd")return iso.slice(0,10);
          if(format==="yyyy-MM")return iso.slice(0,7);
          return iso;
        }
      };
    `,
    sandbox,
  );
  return sandbox;
}

describe("Apps Script behavioral regressions", () => {
  test("numeric as-of dates use the date-only spreadsheet conversion", () => {
    const sandbox = context();
    const result = vm.runInContext(
      `
        const row=TEST_TABLES.accountBalances.fields.map(field=>field==="asOfDate"?46000:field==="id"?"00000000-0000-4000-8000-000000000001":"");
        normalizeBatchRow_(TEST_TABLES.accountBalances,row)[9];
      `,
      sandbox,
    );
    expect(result).toBe("2025-12-09");
  });

  test("sub-cent transactions are rejected after rounding", () => {
    const sandbox = context();
    expect(() =>
      vm.runInContext(
        `
          validateTransaction_({
            id:"00000000-0000-4000-8000-000000000001",
            amount:0.001,type:"expense",date:"2026-01-01",
            categoryId:"00000000-0000-4000-8000-000000000002",
            assignmentId:"00000000-0000-4000-8000-000000000003",
            createdBy:"00000000-0000-4000-8000-000000000004",
            vendorId:"00000000-0000-4000-8000-000000000005"
          },{
            accounts:new Map(),
            categories:new Map([["00000000-0000-4000-8000-000000000002",{type:"expense",active:true}]]),
            assignments:new Map([["00000000-0000-4000-8000-000000000003",{active:true}]]),
            users:new Map([["00000000-0000-4000-8000-000000000004",{active:true}]]),
            vendors:new Map([["00000000-0000-4000-8000-000000000005",{active:true}]])
          });
        `,
        sandbox,
      ),
    ).toThrow("Amount must be a non-zero value");
  });

  test("impossible balance dates are rejected", () => {
    const sandbox = context();
    expect(() =>
      vm.runInContext(
        `
          normalizeInvestmentBalance_({
            id:"00000000-0000-4000-8000-000000000001",
            accountId:"00000000-0000-4000-8000-000000000002",
            month:"2026-02",asOfDate:"2026-02-31",balance:100,
            createdBy:"00000000-0000-4000-8000-000000000003"
          },null,
          new Map([["00000000-0000-4000-8000-000000000002",{active:true}]]),
          new Map([["00000000-0000-4000-8000-000000000003",{active:true}]]));
        `,
        sandbox,
      ),
    ).toThrow("Balance date must be within the reporting month");
  });

  test("malformed stored money produces a data-integrity error", () => {
    const sandbox = context();
    expect(() =>
      vm.runInContext(
        `rowToRecord_(TEST_TABLES.transactions,recordToRow_(TEST_TABLES.transactions,{id:"00000000-0000-4000-8000-000000000001",amount:"#VALUE!"}),2)`,
        sandbox,
      ),
    ).toThrow("Invalid numeric value in Transactions row 2");
  });

  test("investment account updates honor an archive request", () => {
    const sandbox = context();
    const active = vm.runInContext(
      `
        readRecords_=()=>[{id:"00000000-0000-4000-8000-000000000002"}];
        normalizeInvestmentAccount_({
          name:"Fund",source:"manual",
          assignmentId:"00000000-0000-4000-8000-000000000002",
          active:false,updatedAt:"2026-01-02T00:00:00.000Z"
        },{
          id:"00000000-0000-4000-8000-000000000001",active:true,
          createdAt:"2026-01-01T00:00:00.000Z"
        }).active;
      `,
      sandbox,
    );
    expect(active).toBe(false);
  });
});
