export interface TreemapDatum {
  id: string;
  label: string;
  amount: number;
  /** Prior-year amount used for visual comparison; omitted means unavailable. */
  previousAmount?: number | null;
}

export interface TreemapNode extends TreemapDatum {
  percentage: number;
  growthPercentage: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutItem {
  datum: TreemapDatum;
}

interface NormalizedDatum extends TreemapDatum {
  previousAmount: number | null;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizedData(data: ReadonlyArray<TreemapDatum>): NormalizedDatum[] {
  const byId = new Map<string, NormalizedDatum>();

  for (const item of data) {
    const id = String(item.id ?? "").trim() || "uncategorized";
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) continue;

    const label = String(item.label ?? "").trim() || "Uncategorized";
    const previousAmount = item.previousAmount === null || item.previousAmount === undefined
      ? null
      : Number(item.previousAmount);
    const hasPreviousAmount = typeof previousAmount === "number" && Number.isFinite(previousAmount);
    const current = byId.get(id);
    if (current) {
      current.amount += amount;
      if (hasPreviousAmount) {
        current.previousAmount = (current.previousAmount ?? 0) + previousAmount;
      }
    } else {
      byId.set(id, {
        id,
        label,
        amount,
        previousAmount: hasPreviousAmount ? previousAmount : null,
      });
    }
  }

  return [...byId.values()]
    .filter((item) => item.amount > 0)
    .sort((left, right) =>
      right.amount - left.amount ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id),
    );
}

function splitIndex(items: LayoutItem[]): number {
  const total = items.reduce((sum, item) => sum + item.datum.amount, 0);
  const target = total / 2;
  let running = 0;
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < items.length - 1; index += 1) {
    running += items[index].datum.amount;
    const distance = Math.abs(target - running);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index + 1;
    }
  }
  return bestIndex;
}

/**
 * Recursively partitions the longer axis. Keeping the input order in the
 * depth-first traversal makes the largest category top-left and the smallest
 * category bottom/right, while each leaf still receives its exact area share.
 */
function placeItems(
  items: LayoutItem[],
  bounds: Bounds,
  output: TreemapNode[],
  total: number,
): void {
  if (items.length === 0 || bounds.width <= 0 || bounds.height <= 0) return;
  if (items.length === 1) {
    const item = items[0].datum;
    output.push({
      ...item,
      percentage: (item.amount / total) * 100,
      growthPercentage: growthPercentage(item.amount, item.previousAmount),
      ...bounds,
    });
    return;
  }

  const index = splitIndex(items);
  const first = items.slice(0, index);
  const second = items.slice(index);
  const firstAmount = first.reduce((sum, item) => sum + item.datum.amount, 0);
  const ratio = firstAmount / (firstAmount + second.reduce((sum, item) => sum + item.datum.amount, 0));

  if (bounds.width >= bounds.height) {
    const firstWidth = bounds.width * ratio;
    placeItems(first, {
      ...bounds,
      width: firstWidth,
    }, output, total);
    placeItems(second, {
      ...bounds,
      x: bounds.x + firstWidth,
      width: bounds.width - firstWidth,
    }, output, total);
    return;
  }

  const firstHeight = bounds.height * ratio;
  placeItems(first, {
    ...bounds,
    height: firstHeight,
  }, output, total);
  placeItems(second, {
    ...bounds,
    y: bounds.y + firstHeight,
    height: bounds.height - firstHeight,
  }, output, total);
}

function growthPercentage(amount: number, previousAmount?: number | null): number | null {
  if (previousAmount === null || previousAmount === undefined || !Number.isFinite(previousAmount)) {
    return null;
  }
  if (previousAmount === 0) return amount > 0 ? Number.POSITIVE_INFINITY : 0;
  return ((amount - previousAmount) / Math.abs(previousAmount)) * 100;
}

/**
 * Creates a deterministic compact treemap. Invalid, zero, and negative
 * amounts are omitted because they cannot represent positive spending area.
 * Duplicate IDs are combined without changing the caller's input array.
 */
export function createTreemapLayout(
  data: ReadonlyArray<TreemapDatum>,
  width: number,
  height: number,
): TreemapNode[] {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  if (safeWidth === 0 || safeHeight === 0) return [];

  const items = normalizedData(data);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  if (total <= 0) return [];

  const output: TreemapNode[] = [];
  placeItems(
    items.map((datum) => ({ datum })),
    { x: 0, y: 0, width: safeWidth, height: safeHeight },
    output,
    total,
  );
  return output;
}
