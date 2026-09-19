// @ts-nocheck
import type { ActivitySource, BudgetAPIContract, BudgetTransaction, SyncItem } from "./budget-api";
import { now, readStorageRecords, uuid, writeStorageArray } from "../utilities/data-utilities";
import { DateUtils } from "../utilities/date-utilities";
import { monthEnd } from "../utilities/investment-returns";

export type AccountType = "investment" | "debt";
export type AccountActivityType = "contribution" | "payment" | "borrowing";
export interface Account { id:string; name:string; type:AccountType; assignmentId:string; active:boolean; source:ActivitySource; categoryId?:string; interestRate?:number; createdAt:string; updatedAt:string; }
export interface AccountBalance { id:string; accountId:string; month:string; asOfDate:string; balance:number; notes:string; createdAt:string; createdBy:string; updatedAt:string; updatedBy:string; }
export interface AccountActivity { id:string; accountId:string; date:string; month:string; amount:number; source:ActivitySource; activityType:AccountActivityType; createdAt:string; createdBy:string; updatedAt?:string; updatedBy?:string; }
export interface AccountMonth { accountId:string; month:string; balance:AccountBalance|null; activity:AccountActivity[]; }
export interface AccountMonthInput { accountId:string; month:string; balance:number|string; notes?:string; balanceId?:string; asOfDate?:string; existingActivity?:AccountActivity[]; activity?:Array<Partial<AccountActivity>&Pick<AccountActivity,"amount"|"activityType">>; }
export interface AccountAPIContract { accounts():Account[]; balances():AccountBalance[]; activity():AccountActivity[]; investmentActivity():AccountActivity[]; debtActivity():AccountActivity[]; activityForAccount(accountId:string):AccountActivity[]; activityForAccountMonth(accountId:string,month:string):AccountActivity[]; monthData(accountId:string,month:string):AccountMonth|null; load(options?:{refresh?:boolean}):Promise<void>; saveAccount(input:Partial<Account>&Pick<Account,"name"|"type">):Promise<Account>; archiveAccount(id:string):Promise<Account>; saveMonth(input:AccountMonthInput):Promise<AccountMonth|null>; queueImportedMonths(inputs:AccountMonthInput[]):unknown[]; awaitImportedMonths(ids:string[],onProgress?:(progress:{completed:number;total:number})=>void):Promise<string[]>; deleteActivity(id:string):Promise<void>; deleteBalance(id:string):Promise<void>; applyBootstrapData(data:unknown):void; applyTransactions(transactions:readonly BudgetTransaction[]):void; getSyncItems():SyncItem[]; retry(source:string,id:string):void; discard(source:string,id:string):void; }

export interface AccountActivityProjection {
  all: AccountActivity[];
  investment: AccountActivity[];
  debt: AccountActivity[];
  byAccount: Map<string, AccountActivity[]>;
  byAccountMonth: Map<string, AccountActivity[]>;
}

/** Builds the account-facing read model once from canonical transactions. */
export function buildAccountActivityProjection(
  accounts: readonly Account[],
  transactions: readonly BudgetTransaction[],
): AccountActivityProjection {
  const owners = new Map(accounts.map((item) => [item.id, item]));
  const byId = new Map<string, BudgetTransaction>();
  transactions.forEach((item) => {
    if (item.accountId) byId.set(item.id, item);
  });
  const all = [...byId.values()].flatMap((item) => {
    const owner = owners.get(item.accountId || "");
    if (!owner) return [];
    return [{
      ...item,
      accountId: owner.id,
      month: item.date.slice(0, 7),
      source: item.source || "manual",
      activityType: owner.type === "investment"
        ? "contribution"
        : Number(item.amount) < 0
          ? "borrowing"
          : "payment",
    } as AccountActivity];
  }).sort((left, right) => left.date.localeCompare(right.date));
  const investment: AccountActivity[] = [];
  const debt: AccountActivity[] = [];
  const byAccount = new Map<string, AccountActivity[]>();
  const byAccountMonth = new Map<string, AccountActivity[]>();
  all.forEach((item) => {
    const owner = owners.get(item.accountId)!;
    (owner.type === "investment" ? investment : debt).push(item);
    const accountRows = byAccount.get(item.accountId) || [];
    accountRows.push(item);
    byAccount.set(item.accountId, accountRows);
    const monthKey = `${item.accountId}:${item.month}`;
    const monthRows = byAccountMonth.get(monthKey) || [];
    monthRows.push(item);
    byAccountMonth.set(monthKey, monthRows);
  });
  return { all, investment, debt, byAccount, byAccountMonth };
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const ACTIVITY_TYPES = new Set<AccountActivityType>([
  "contribution",
  "payment",
  "borrowing",
]);

function isDateId(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Normalizes legacy cached activity and rejects records that cannot be used safely. */
export function normalizeAccountActivityRecords(
  records: readonly Record<string, unknown>[],
): AccountActivity[] {
  return records.flatMap((record) => {
    const id = String(record.id ?? "").trim();
    const accountId = String(
      record.accountId ?? record.debtAccountId ?? "",
    ).trim();
    const activityType = String(
      record.activityType ?? record.kind ?? "",
    ) as AccountActivityType;
    const amount = Number(record.amount);
    const rawDate = String(record.date ?? "").slice(0, 10);
    const rawMonth = String(record.month ?? "").slice(0, 7);
    const hasDate = isDateId(rawDate);
    const month = MONTH_PATTERN.test(rawMonth)
      ? rawMonth
      : hasDate
        ? rawDate.slice(0, 7)
        : "";
    if (
      !id ||
      !accountId ||
      !month ||
      !ACTIVITY_TYPES.has(activityType) ||
      !Number.isFinite(amount)
    ) {
      return [];
    }
    const date = hasDate && rawDate.startsWith(month) ? rawDate : `${month}-15`;
    return [
      {
        ...record,
        id,
        accountId,
        activityType,
        amount,
        month,
        date,
      } as AccountActivity,
    ];
  });
}

const KEYS={accounts:"myFinance.accounts.v1",balances:"myFinance.accountBalances.v1",outbox:"myFinance.accountOutbox.v1"};

/** Owns normalized account persistence, offline writes, retries, and month conflict state. */
export function AccountAPI(budget:BudgetAPIContract):AccountAPIContract {
  let loaded=false, syncing:Promise<void>|null=null;
  let retryTimer:any=null;
  const MAX_ATTEMPTS=6;
  const RETRY_DELAYS=[2000,5000,15000,30000,60000];
  let accountsCache:Account[]|null=null;
  let balancesCache:AccountBalance[]|null=null;
  let activityProjection:AccountActivityProjection|null=null;
  let canonicalTransactions:BudgetTransaction[]|null=null;
  const read=(key:string)=>readStorageRecords(key) as any[];
  const invalidateActivity=()=>{activityProjection=null;};
  const write=(key:string,value:any[])=>{writeStorageArray(key,value);if(key===KEYS.accounts){accountsCache=null;invalidateActivity();}if(key===KEYS.balances)balancesCache=null;};
  const offline=()=>typeof navigator!=="undefined"&&navigator.onLine===false;
  const emit=(name:string,detail?:any)=>window.dispatchEvent(new CustomEvent(name,{detail}));
  const request=async(action:string,body:any={})=>{const endpoint=budget.getConfig().endpoint;if(!endpoint)throw new Error("No Apps Script URL is configured.");const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,requestId:uuid(),...body}),redirect:"follow"});const payload=await response.json();if(!response.ok||payload?.ok===false){const detail=payload?.error&&typeof payload.error==="object"?payload.error:{message:payload?.error};const error:any=new Error(detail.message||"Account sync failed.");error.code=detail.code||"server";error.retryable=detail.retryable===true;error.isApiError=true;throw error;}return payload?.data??payload;};
  const accounts=()=>accountsCache??=(read(KEYS.accounts).map(item=>({...item,source:item.source==="deduction"||item.source==="paycheck"?"deduction":"manual"})).sort((a,b)=>String(a.name??"").localeCompare(String(b.name??""))) as Account[]);
  const balances=()=>balancesCache??=(read(KEYS.balances).sort((a,b)=>String(a.asOfDate??a.month??"").localeCompare(String(b.asOfDate??b.month??""))) as AccountBalance[]);
  const projectedActivity=()=>activityProjection??=buildAccountActivityProjection(accounts(),canonicalTransactions??[...(budget.getCachedTransactions()||[]),...budget.getOutboxTransactions()]);
  const activity=()=>projectedActivity().all;
  const investmentActivity=()=>projectedActivity().investment;
  const debtActivity=()=>projectedActivity().debt;
  const activityForAccount=(accountId:string)=>projectedActivity().byAccount.get(accountId)||[];
  const activityForAccountMonth=(accountId:string,month:string)=>projectedActivity().byAccountMonth.get(`${accountId}:${month}`)||[];
  const applyTransactions=(transactions:readonly BudgetTransaction[])=>{canonicalTransactions=[...transactions];invalidateActivity();};
  const outbox=()=>read(KEYS.outbox).map(item=>item.status==="syncing"?{...item,status:"pending",nextRetryAt:0}:item);
  const account=(id:string)=>accounts().find(item=>item.id===id)||null;
  const monthData=(accountId:string,month:string)=>account(accountId)?{accountId,month,balance:balances().find(item=>item.accountId===accountId&&item.month===month)||null,activity:activityForAccountMonth(accountId,month)}:null;
  const dateId=(value:any,fallback="")=>{const text=String(value||"");if(/^\d{4}-\d{2}-\d{2}/.test(text))return DateUtils.toDateId(DateUtils.fromDateId(text.slice(0,10)));const parsed=new Date(text);return Number.isNaN(parsed.getTime())?fallback:DateUtils.toDateId(parsed);};
  const monthId=(value:any,fallback="")=>{const text=String(value||"");if(/^\d{4}-\d{2}$/.test(text))return text;return dateId(text,fallback?`${fallback}-01`:"").slice(0,7);};
  const normalizeBalanceDates=(records:any[])=>records.map((item)=>{const month=monthId(item.month,dateId(item.asOfDate).slice(0,7));return {...item,month,asOfDate:dateId(item.asOfDate,month?monthEnd(month):"")};});
  const normalizeActivityDates=(records:any[])=>records.map((item)=>({
    ...item,
    month:monthId(item.month,dateId(item.date).slice(0,7)),
    date:dateId(item.date,`${monthId(item.month,dateId(item.date).slice(0,7))}-15`),
  }));
  function migrateLegacy(){if(localStorage.getItem(KEYS.accounts)!==null)return;const investments=read("myFinance.investmentAccounts.v1").map(item=>({...item,type:"investment",source:item.source==="paycheck"?"deduction":"manual"}));const debts=read("myFinance.debtAccounts.v1").map(item=>({...item,type:"debt",source:"manual"}));const investmentBalances=read("myFinance.investmentBalances.v1");const debtBalances=read("myFinance.debtBalances.v1").map(item=>({...item,accountId:item.accountId||item.debtAccountId}));write(KEYS.accounts,[...investments,...debts]);write(KEYS.balances,[...investmentBalances,...debtBalances]);const investmentOutbox=read("myFinance.investmentMonthOutbox.v1").map(item=>({...item,kind:"month"}));const debtOutbox=read("myFinance.debtOutbox.v1").map(item=>({...item,kind:item.kind==="account"?"account":"month"}));write(KEYS.outbox,[...investmentOutbox,...debtOutbox]);}
  migrateLegacy();
  const applyBootstrapData=(data:any)=>{if(!Array.isArray(data?.accounts))return;const pending=new Set(outbox().flatMap(item=>item.kind==="account"?[item.record?.id]:item.kind==="month"?[item.accountId]:[]));write(KEYS.accounts,[...data.accounts.filter(item=>!pending.has(item.id)).map(item=>({...item,source:item.source==="deduction"||item.source==="paycheck"?"deduction":"manual"})),...accounts().filter(item=>pending.has(item.id))]);if(Array.isArray(data.accountBalances))write(KEYS.balances,normalizeBalanceDates(data.accountBalances));loaded=true;emit("budget:accounts-loaded");emit("budget:accounts-changed");};
  const load=async(options:any={})=>{if(loaded&&!options.refresh)return;if(budget.getConfig().endpoint){const data=await request("bootstrap");applyBootstrapData(data);}loaded=true;};
  const enqueue=(operation:any)=>{write(KEYS.outbox,[...outbox().filter(item=>item.id!==operation.id),operation]);emit("budget:sync-changed");void sync();};
  const saveAccount=async(input:any)=>{const existing=input.id?account(input.id):null;const timestamp=now();const type=input.type||existing?.type;if(existing&&type!==existing.type)throw new Error("An account type cannot be changed after creation.");const record={id:input.id||uuid(),name:String(input.name||"").trim(),type,active:input.active!==false,assignmentId:input.assignmentId||budget.SHARED_ASSIGNMENT_ID,source:input.source==="deduction"?"deduction":"manual",categoryId:type==="debt"?String(input.categoryId||""):"",interestRate:type==="debt"?Number(input.interestRate||0):undefined,createdAt:existing?.createdAt||timestamp,updatedAt:timestamp};if(!record.name)throw new Error("Enter an account name.");write(KEYS.accounts,[...accounts().filter(item=>item.id!==record.id),record]);enqueue({id:`account:${record.id}`,kind:"account",record,base:existing,status:"pending",attempts:0,nextRetryAt:0,revision:(outbox().find(item=>item.id===`account:${record.id}`)?.revision||0)+1});emit("budget:accounts-changed");return record;};
  const archiveAccount=async(id:string)=>saveAccount({...account(id),id,active:false});
  const saveMonth=async(input:any)=>{const owner=account(input.accountId);if(!owner||owner.active===false)throw new Error("Choose an active account.");const month=monthId(input.month);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error("Choose a reporting month.");const previous=monthData(input.accountId,month);const user=budget.getActiveUser();if(!user)throw new Error("Choose an app user first.");const timestamp=now();const balance={...(previous?.balance||{}),id:previous?.balance?.id||input.balanceId||uuid(),accountId:input.accountId,month,asOfDate:dateId(input.asOfDate,monthEnd(month)),balance:Number(input.balance),notes:String(input.notes||""),createdAt:previous?.balance?.createdAt||timestamp,createdBy:previous?.balance?.createdBy||user.id,updatedAt:timestamp,updatedBy:user.id};const next=(input.activity||[]).map(item=>({...item,id:item.id||uuid(),accountId:input.accountId,month,date:dateId(item.date,`${month}-15`),source:item.source==="deduction"?"deduction":item.source==="manual"?"manual":owner.source,createdAt:item.createdAt||timestamp,createdBy:item.createdBy||user.id}));if(next.some(item=>item.activityType==="contribution"&&owner.type!=="investment")||next.some(item=>item.activityType!=="contribution"&&owner.type!=="debt"))throw new Error("Activity type does not match the account type.");for(const item of next){const amount=owner.type==="debt"&&item.activityType==="borrowing"?-Math.abs(Number(item.amount)):Number(item.amount);const record={id:item.id,accountId:owner.id,source:item.source,amount,date:item.date,notes:"",createdAt:item.createdAt,createdBy:item.createdBy};const base=previous?.activity.find(entry=>entry.id===item.id);base?budget.queueTransactionUpdate(record as any,base as any):budget.queueTransaction(record as any);}for(const old of previous?.activity||[]){if(!next.some(item=>item.id===old.id))await budget.deleteTransaction(old.id,old as any);}write(KEYS.balances,[...balances().filter(item=>!(item.accountId===input.accountId&&item.month===month)),balance]);const prior=outbox().find(item=>item.kind==="month"&&item.accountId===input.accountId&&item.month===month);enqueue({id:prior?.id||uuid(),kind:"month",accountId:input.accountId,month,draft:{accountId:input.accountId,month,balance},base:prior?.base?{balance:prior.base.balance}:previous?{balance:previous.balance}:null,revision:(prior?.revision||0)+1,status:"pending",attempts:0,nextRetryAt:0});emit("budget:accounts-changed");return monthData(input.accountId,month);};
  const deleteActivity=async(id:string)=>{const record=activity().find(item=>item.id===id);if(!record)return;await budget.deleteTransaction(id,record as any);emit("budget:accounts-changed");};
  const schedule=(delay:number)=>{if(retryTimer)clearTimeout(retryTimer);retryTimer=setTimeout(()=>{retryTimer=null;void sync();},Math.max(0,delay));};
  async function sync(){
    if(syncing||offline()||!budget.getConfig().endpoint)return syncing;
    const eligible=outbox().filter(item=>item.status==="pending"&&Number(item.nextRetryAt||0)<=Date.now());
    if(!eligible.length){const future=outbox().filter(item=>item.status==="pending"&&Number(item.nextRetryAt||0)>Date.now()).sort((a,b)=>a.nextRetryAt-b.nextRetryAt)[0];if(future)schedule(future.nextRetryAt-Date.now());return null;}
    syncing=(async()=>{
      for(const snapshot of eligible){
        const item=outbox().find(entry=>entry.id===snapshot.id);
        if(!item)continue;
        const revision=item.revision||0;
        try{
          let canonical:any=null;
          if(item.kind==="account")canonical=await request("saveAccount",{account:item.record,base:item.base});
          else if(item.kind==="balance-delete")canonical=await request("deleteAccountBalance",{id:item.balanceId,base:item.base});
          else{
            const draft=item.draft;
            const result=await request("saveAccountMonths",{months:[{id:item.id,accountId:item.accountId,month:item.month,balance:{record:draft.balance,base:item.base?.balance||null},upserts:[],deletes:[]}]});
            const saved=result.saved?.find((entry:any)=>entry.id===item.id);
            const failure=result.failed?.find((entry:any)=>entry.id===item.id);
            if(failure){const error:any=new Error(failure.error||"The account month was not saved.");error.code=failure.code||"validation";error.retryable=failure.retryable===true;error.current=failure.current;throw error;}
            if(!saved){const error:any=new Error("The Sheet did not return a result for this account month.");error.code="protocol";error.retryable=false;throw error;}
            canonical=saved;
          }
          const current=outbox().find(entry=>entry.id===item.id);
          if(current&&(current.revision||0)!==revision){write(KEYS.outbox,outbox().map(entry=>entry.id===item.id?{...entry,status:"pending",attempts:0,nextRetryAt:0}:entry));continue;}
          if(item.kind==="account"&&canonical){const requestedId=item.record.id;write(KEYS.accounts,[...accounts().filter(entry=>entry.id!==requestedId&&entry.id!==canonical.id),canonical]);emit("budget:accounts-changed");}
          write(KEYS.outbox,outbox().filter(entry=>entry.id!==item.id));
        }catch(error:any){
          const attempts=(item.attempts||0)+1;
          const retryable=error?.retryable===true||(!error?.isApiError&&error?.name==="TypeError");
          const terminal=!retryable||attempts>=MAX_ATTEMPTS;
          const baseDelay=RETRY_DELAYS[Math.min(attempts-1,RETRY_DELAYS.length-1)];
          const delay=baseDelay+Math.floor(Math.random()*Math.max(250,baseDelay/2));
          write(KEYS.outbox,outbox().map(entry=>entry.id===item.id&&((entry.revision||0)===revision)?{...entry,status:terminal?"failed":"pending",attempts,nextRetryAt:terminal?0:Date.now()+delay,error:terminal&&retryable?`${error.message} Automatic retries paused after ${attempts} attempts.`:error.message,failureCode:terminal&&retryable?"retry_exhausted":error.code||"" ,current:error.current||null}:entry));
          if(!terminal)schedule(delay);
          break;
        }
      }
    })().finally(()=>{syncing=null;emit("budget:sync-changed");const future=outbox().filter(item=>item.status==="pending").sort((a,b)=>a.nextRetryAt-b.nextRetryAt)[0];if(future)schedule(Math.max(0,future.nextRetryAt-Date.now()));});
    return syncing;
  }
  const queueImportedMonths=(inputs:any[])=>inputs.map(input=>{void saveMonth(input);return {syncOperationId:outbox().find(item=>item.kind==="month"&&item.accountId===input.accountId&&item.month===input.month)?.id};});
  const awaitImportedMonths=async(ids:string[],progress?:any)=>{const pending=new Set(ids);while(pending.size){if(offline())throw new Error("The import paused because the browser went offline.");const items=outbox();const failed=items.find(item=>pending.has(item.id)&&item.status==="failed");if(failed)throw new Error(failed.error||"An account month needs attention.");for(const id of [...pending])if(!items.some(item=>item.id===id))pending.delete(id);progress?.({completed:ids.length-pending.size,total:ids.length,status:pending.size?"syncing":"completed"});if(!pending.size)break;await sync();const next=outbox().filter(item=>pending.has(item.id)&&item.status==="pending"&&item.nextRetryAt>Date.now()).sort((a,b)=>a.nextRetryAt-b.nextRetryAt)[0];if(next){progress?.({completed:ids.length-pending.size,total:ids.length,status:"waiting_to_retry",nextRetryAt:next.nextRetryAt});await new Promise(resolve=>setTimeout(resolve,Math.min(1000,Math.max(0,next.nextRetryAt-Date.now()))));}else await Promise.resolve();}return ids;};
  const deleteBalance=async(id:string)=>{const existing=balances().find(item=>item.id===id);if(!existing)return;write(KEYS.balances,balances().filter(item=>item.id!==id));enqueue({id:`balance-delete:${id}`,kind:"balance-delete",balanceId:id,base:existing,status:"pending",attempts:0,nextRetryAt:0});};
  const getSyncItems=()=>outbox().map(item=>({key:item.id,source:item.kind==="month"?"accountMonth":item.kind==="balance-delete"?"accountBalance":"account",id:item.id,status:item.status,error:item.error||"",failureCode:item.failureCode||"",attempts:item.attempts||0,nextRetryAt:item.nextRetryAt||0,retrying:item.status==="pending"&&(item.attempts||0)>0&&(item.nextRetryAt||0)>Date.now(),waitingForOnline:offline(),record:item.draft||item.record,current:item.current}));
  const retry=(source:string,id:string)=>{write(KEYS.outbox,outbox().map(item=>item.id===id?{...item,status:"pending",error:"",failureCode:"",nextRetryAt:0}:item));emit("budget:sync-changed");void sync();}; const discard=(source:string,id:string)=>{write(KEYS.outbox,outbox().filter(item=>item.id!==id));emit("budget:sync-changed");};
  ["budget:transaction-queued","budget:transactions-queued","budget:transaction-saved","budget:transaction-restored","budget:transaction-removed","budget:transaction-sync-changed"].forEach(name=>window.addEventListener(name,invalidateActivity));
  window.addEventListener("budget:transactions-loaded",()=>{if(!activityProjection)projectedActivity();});
  window.addEventListener("online",()=>void sync()); return {accounts,balances,activity,investmentActivity,debtActivity,activityForAccount,activityForAccountMonth,monthData,load,saveAccount,archiveAccount,saveMonth,queueImportedMonths,awaitImportedMonths,deleteActivity,deleteBalance,applyBootstrapData,applyTransactions,getSyncItems,retry,discard};
}
