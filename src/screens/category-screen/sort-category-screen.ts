import { BudgetEntity } from "../../api/budget-api";

export type SortedEntityArrayFxn = (
  data: BudgetEntity[],
  totals: Map<
    string,
    {
      count: number;
      total: number;
    }
  >,
) => BudgetEntity[];

export function sortCategoryScreen(
  key: string,
): SortedEntityArrayFxn {
  if (key === "name") {
    return (data, totals) => data;
  }

  if (key === "status") {
    return (data, totals) =>
      data.sort((a, b) => {
        const aVal = a.active ? 0 : 1;
        const bVal = b.active ? 0 : 1;
        return aVal - bVal;
      });
  }

  if (key === "count") {
    return (data, totals) =>
      data.sort((a, b) => {
        const aVal = totals.get(a.id) ?? { count: 0, total: 0 };
        const bVal = totals.get(b.id) ?? { count: 0, total: 0 };
        return bVal.count - aVal.count;
      });
  }

  if (key === "total") {
    return (data, totals) =>
      data.sort((a, b) => {
        const aVal = totals.get(a.id) ?? { count: 0, total: 0 };
        const bVal = totals.get(b.id) ?? { count: 0, total: 0 };
        return bVal.total - aVal.total;
      });
  }

  return (data, totals) => data;
}
