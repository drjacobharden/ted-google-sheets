export const PLOT_INSET_PERCENT = 8;

/** Returns the arithmetic mean of finite values, or zero when none are usable. */
export function calculateMean(values: ReadonlyArray<number>): number {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) return 0;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

/** Maps a raw linear value into the chart's inset plot range. */
export function mapLinearValue(
  value: number,
  maximum: number,
  start: number,
  size: number,
  inverted = false,
  flatDomain = false,
  insetPercent = PLOT_INSET_PERCENT,
): number {
  const inset = Math.max(0, Math.min(49, insetPercent)) / 100;
  const normalized = flatDomain || maximum <= 0
    ? 0.5
    : Math.max(0, Math.min(1, value / maximum));
  const insetPosition = inset + normalized * (1 - inset * 2);
  return start + (inverted ? 1 - insetPosition : insetPosition) * size;
}

/** Generates human-readable linear tick values from zero through the domain. */
export function generateLinearTicks(
  maximum: number,
  targetCount = 5,
): number[] {
  if (!Number.isFinite(maximum) || maximum <= 0) return [0];

  const roughStep = maximum / Math.max(1, targetCount);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const step = (normalizedStep >= 5 ? 5 : normalizedStep >= 2.5 ? 5 : normalizedStep >= 1.5 ? 2 : 1) * magnitude;
  const last = Math.ceil(maximum / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= last + step / 100; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

/** Uses square-root scaling so bubble area tracks normalized total spend. */
export function calculateBubbleRadius(
  value: number,
  minimum: number,
  maximum: number,
  minimumRadius: number,
  maximumRadius: number,
): number {
  if (maximum <= minimum) return (minimumRadius + maximumRadius) / 2;
  const normalized = Math.max(
    0,
    Math.min(1, (value - minimum) / (maximum - minimum)),
  );
  return minimumRadius +
    Math.sqrt(normalized) * (maximumRadius - minimumRadius);
}
