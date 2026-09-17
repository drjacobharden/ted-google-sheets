export interface NamedCategory {
  name: string;
}

export function isNeedsReviewCategory(category: NamedCategory): boolean {
  return category.name.trim().toLocaleLowerCase() === "needs review";
}

export function compareNeedsReviewLast(
  left: NamedCategory,
  right: NamedCategory,
): number {
  const leftIsNeedsReview = isNeedsReviewCategory(left);
  const rightIsNeedsReview = isNeedsReviewCategory(right);

  if (leftIsNeedsReview === rightIsNeedsReview) return 0;
  return leftIsNeedsReview ? 1 : -1;
}

export function sortNeedsReviewLast<T extends NamedCategory>(
  items: readonly T[],
): T[] {
  return [...items].sort(compareNeedsReviewLast);
}

export function compareCategoriesByName(left: NamedCategory, right: NamedCategory): number {
  return (
    compareNeedsReviewLast(left, right) || left.name.localeCompare(right.name)
  );
}

export function compareCategoryOptions(
  left: NamedCategory & { type?: string },
  right: NamedCategory & { type?: string },
): number {
  const needsReviewOrder = compareNeedsReviewLast(left, right);
  if (needsReviewOrder) return needsReviewOrder;

  const leftTypeOrder = left.type === "expense" ? 0 : 1;
  const rightTypeOrder = right.type === "expense" ? 0 : 1;
  return (
    leftTypeOrder - rightTypeOrder ||
    left.name.localeCompare(right.name, "en-US", {
      numeric: true,
      sensitivity: "base",
    })
  );
}
