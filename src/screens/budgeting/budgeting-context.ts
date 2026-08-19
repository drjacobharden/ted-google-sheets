import type { BudgetTransaction } from "../../api/budget-api";
import { appState, type BudgetingContext } from "../../state/app-state";
import { DateUtils, type DateRange } from "../../utilities/date-utilities";

export function budgetingYearRange(year: number): DateRange {
  return {
    start: DateUtils.fromDateId(`${year}-01-01`),
    end: DateUtils.fromDateId(`${year}-12-31`),
  };
}

export function currentBudgetingContext(): BudgetingContext {
  return appState.get("budgetingContext");
}

export function filterForBudgetingContext(
  transactions: BudgetTransaction[],
  context = currentBudgetingContext(),
): BudgetTransaction[] {
  const yearPrefix = `${context.year}-`;
  return transactions.filter(
    (transaction) =>
      transaction.date.startsWith(yearPrefix) &&
      (context.assignmentId === null ||
        transaction.assignmentId === context.assignmentId),
  );
}
