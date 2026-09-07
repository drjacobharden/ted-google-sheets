import type { MoneyBlockDatum } from "../../utilities/annual-spending-blocks";

export type MoneyBlockOrientation = "horizontal" | "vertical";

export interface MoneyBlockLayout extends MoneyBlockDatum {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MoneyBlockLayoutResult {
  blocks: MoneyBlockLayout[];
  width: number;
  height: number;
}

const MIN_BLOCK_WIDTH = 6;
const MIN_BLOCK_HEIGHT = 1;

/** Packs proportional blocks into separated rows or columns without mutating input. */
export function layoutMoneyBlocks(
  items: ReadonlyArray<MoneyBlockDatum>,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    targetHeight: number;
    areaScale: number;
    orientation: MoneyBlockOrientation;
    gap: number;
    singleRow?: boolean;
  },
): MoneyBlockLayoutResult {
  const validItems = items.filter(
    (item) => Number.isFinite(item.amount) && item.amount > 0,
  );
  if (!validItems.length || options.maxWidth <= 0 || options.targetHeight <= 0) {
    return { blocks: [], width: 0, height: 0 };
  }

  const blocks: MoneyBlockLayout[] = [];
  const sorted = validItems
    .slice()
    .sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label));
  const totalArea = sorted.reduce(
    (sum, item) => sum + Math.max(1, item.amount * options.areaScale),
    0,
  );

  if (options.orientation === "vertical") {
    const columnWidth = Math.max(
      MIN_BLOCK_WIDTH,
      Math.min(options.maxWidth, options.maxWidth / 2),
    );
    let columnX = options.x;
    let columnY = options.y;
    let columnHeight = 0;
    let maxHeight = 0;

    for (const item of sorted) {
      const area = Math.max(1, item.amount * options.areaScale);
      const height = Math.max(MIN_BLOCK_HEIGHT, area / columnWidth);
      if (
        columnY > options.y &&
        columnY + height > options.y + options.targetHeight
      ) {
        columnX += columnWidth + options.gap;
        columnY = options.y;
        columnHeight = 0;
      }
      blocks.push({ ...item, x: columnX, y: columnY, width: columnWidth, height });
      columnY += height + options.gap;
      columnHeight += height + options.gap;
      maxHeight = Math.max(maxHeight, columnHeight - options.gap);
    }

    return {
      blocks,
      width: Math.max(0, columnX + columnWidth - options.x),
      height: maxHeight,
    };
  }

  const rowCount = options.singleRow
    ? 1
    : Math.max(
        1,
        Math.ceil(totalArea / Math.max(1, options.maxWidth * options.targetHeight)),
      );
  const rowHeight = Math.max(
    MIN_BLOCK_HEIGHT,
    options.singleRow
      ? options.targetHeight
      : (options.targetHeight - options.gap * (rowCount - 1)) / rowCount,
  );
  let rowX = options.x;
  let rowY = options.y;
  let rowHeightUsed = rowHeight;
  let maxRight = options.x;
  let maxBottom = options.y;

  for (const item of sorted) {
    const area = Math.max(1, item.amount * options.areaScale);
    let width = Math.max(MIN_BLOCK_WIDTH, area / rowHeight);
    if (rowX > options.x && rowX + width > options.x + options.maxWidth) {
      rowY += rowHeightUsed + options.gap;
      rowX = options.x;
      rowHeightUsed = rowHeight;
    }
    width = Math.min(options.maxWidth, width);
    const height = Math.max(MIN_BLOCK_HEIGHT, area / width);
    blocks.push({ ...item, x: rowX, y: rowY, width, height });
    rowX += width + options.gap;
    rowHeightUsed = Math.max(rowHeightUsed, height);
    maxRight = Math.max(maxRight, rowX - options.gap);
    maxBottom = Math.max(maxBottom, rowY + height);
  }

  return {
    blocks,
    width: Math.max(0, maxRight - options.x),
    height: Math.max(0, maxBottom - options.y),
  };
}
