import { describe, expect, test } from "bun:test";
import { activityEffects, budgetingActivities, reportingTransactions } from "../src/utilities/activity-effects";
import type { Account } from "../src/api/account-api";

const accounts: Account[]=[
  {id:"brokerage",name:"Brokerage",type:"investment",assignmentId:"shared",active:true,source:"manual",createdAt:"",updatedAt:""},
  {id:"mortgage",name:"Mortgage",type:"debt",assignmentId:"home",categoryId:"housing",active:true,source:"manual",createdAt:"",updatedAt:""},
];
const row=(values:any)=>({id:"row",createdAt:"",createdBy:"user",amount:100,date:"2026-03-15",notes:"",source:"manual",...values});

describe("unified activity effects",()=>{
  test("ordinary and deduction expenses derive centralized budget effects",()=>{
    expect(activityEffects(row({type:"expense",categoryId:"food"}),accounts)).toMatchObject({income:0,expense:100,categoryId:"food"});
    expect(activityEffects(row({type:"expense",categoryId:"health",source:"deduction"}),accounts)).toMatchObject({income:100,expense:100,categoryId:"health"});
  });
  test("investment source changes income but never creates expense",()=>{
    expect(activityEffects(row({accountId:"brokerage",amount:500}),accounts)).toMatchObject({income:0,expense:0,investmentFlow:500,budgetVisible:false});
    expect(activityEffects(row({accountId:"brokerage",amount:500,source:"deduction"}),accounts)).toMatchObject({income:500,expense:0,investmentFlow:500,budgetVisible:true});
  });
  test("debt category and assignment resolve dynamically while borrowing has no budget effect",()=>{
    expect(activityEffects(row({accountId:"mortgage",amount:2500}),accounts)).toMatchObject({expense:2500,categoryId:"housing",assignmentId:"home",kind:"debt-payment"});
    expect(activityEffects(row({accountId:"mortgage",amount:-200,source:"deduction"}),accounts)).toMatchObject({income:0,expense:0,debtFlow:-200,budgetVisible:false,kind:"borrowing"});
  });
  test("presentation hides manual investments and reporting expands deduction effects without persistence",()=>{
    const rows=[row({id:"manual",accountId:"brokerage",amount:500}),row({id:"deduction",type:"expense",categoryId:"health",source:"deduction",amount:300})];
    expect(budgetingActivities(rows,accounts).map(item=>item.id)).toEqual(["deduction"]);
    expect(reportingTransactions(rows,accounts).map(item=>[item.type,item.amount])).toEqual([["income",300],["expense",300]]);
  });
});
