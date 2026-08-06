import type { BudgetEntity, TransactionType } from "../api/budget-api";
import type { ImportProfile, ImportProfileBundle } from "../api/import-api";
import type { InvestmentAccount, InvestmentMonth } from "../api/investment-api";

export type ImportColumnReference = number | string | { index: number } | null | undefined;
export type ImportColumnKey =
  | "date" | "amount" | "debit" | "credit" | "vendorDescription"
  | "categoryDescription" | "personDescription" | "notes" | "month" | "balance";

export interface ParsedImportHeader { index: number; name: string; normalized: string; label: string; }
export interface ParsedImportRow { sourceRowNumber: number; values: string[]; extraValues: string[]; }
export interface ParsedImport { headers: ParsedImportHeader[]; rows: ParsedImportRow[]; warnings: string[]; signature: string; }

export interface ImportReferences {
  categories: BudgetEntity[];
  vendors: BudgetEntity[];
  people: BudgetEntity[];
  accounts: InvestmentAccount[];
  sharedAssignmentId: string;
}

export interface ImportFlow {
  id: string;
  sourceDate: string;
  sourceColumn: string;
  sourceColumnIndex: number;
  sourceRowNumber: number;
  amount: number | string | null;
}

export interface StagedImportRow {
  [key: string]: unknown;
  stagingId: string;
  sourceRowNumber: number;
  sourceRowCount?: number;
  include: boolean;
  queued: boolean;
  originalValues?: string[];
  date?: string | null;
  amount?: number | string | null;
  sourceAmount?: number | null;
  sourceDirection?: "unified" | "debit" | "credit";
  amountSignConvention?: "expensesNegative" | "expensesPositive";
  amountEdited?: boolean;
  amountLayoutError?: string;
  vendorDescription?: string;
  normalizedVendorDescription?: string;
  categoryDescription?: string;
  normalizedCategoryDescription?: string;
  personDescription?: string;
  normalizedPersonDescription?: string;
  vendorId?: string;
  vendorResolution?: "saved" | "unresolved" | "pending" | "custom";
  personId?: string;
  personResolution?: "saved" | "unresolved" | "pending" | "default" | "custom";
  categoryId?: string;
  type?: TransactionType | "";
  notes?: string;
  accountId?: string;
  month?: string | null;
  balance?: number | string | null;
  balanceOrigin?: "" | "csv" | "existing" | "manual";
  balanceSourceDate?: string;
  flows: ImportFlow[];
  existing?: InvestmentMonth | null;
  warnings: string[];
  errors: string[];
}

export interface ImportUtilities {
  normalizeDescription(value: unknown): string;
  parseCSV(input: unknown): ParsedImport;
  parseDate(value: unknown, format: string): string | null;
  columnIndex(mapping: unknown): number | null;
  valueAt(row: ParsedImportRow, mapping: unknown): string;
  columnValues(parsed: ParsedImport, mapping: unknown): string[];
  isNumericColumn(parsed: ParsedImport, mapping: unknown): boolean;
  validDateFormats(parsed: ParsedImport, mapping: unknown): string[];
  validMonthFormats(parsed: ParsedImport, mapping: unknown): string[];
  headerScore(header: ParsedImportHeader | string, kind: string): number;
  inferAmountSignConvention(parsed: ParsedImport, mapping: unknown): { negative: number; positive: number; convention: "expensesNegative" | "expensesPositive" };
  suggestBudgetMapping(parsed: ParsedImport): {
    [key: string]: ImportColumnReference | string | boolean;
    amountMode: "unified" | "debitCredit";
    amountSignConvention: "expensesNegative" | "expensesPositive";
    dateFormat: string;
  };
  suggestInvestmentMapping(parsed: ParsedImport): {
    [key: string]: ImportColumnReference | string | number[];
    contributions: number[];
    dateFormat: string;
  };
  suggestBudgetType(row: StagedImportRow): TransactionType;
  fillBlankMatches(
    rows: StagedImportRow[], field: keyof StagedImportRow, key: string,
    keyForRow: (row: StagedImportRow) => string | undefined,
    value: string, apply?: (row: StagedImportRow) => void,
  ): StagedImportRow[];
  createBudgetRows(
    parsed: ParsedImport, profile: ImportProfile, bundle: ImportProfileBundle,
    references: ImportReferences,
    createDraftEntity: (kind: "category" | "vendor" | "assignment", name: string, type?: TransactionType) => BudgetEntity,
  ): StagedImportRow[];
  validateBudgetRow(row: StagedImportRow, references: ImportReferences, profile: ImportProfile): { errors: string[]; warnings: string[]; type: TransactionType | ""; amount: number };
  createInvestmentMonths(parsed: ParsedImport, profile: ImportProfile, existingMonths: InvestmentMonth[]): StagedImportRow[];
  validateInvestmentMonth(row: StagedImportRow, references: ImportReferences, profile: ImportProfile): { errors: string[]; warnings: string[] };
}

import { ImportUtils } from "./import-utilities";

/** Returns the typed CSV parsing and staging utilities exposed by the legacy runtime. */
export function importUtilities(): ImportUtilities {
  return ImportUtils as ImportUtilities;
}
