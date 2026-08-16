export interface CurrencyAxisScale {
  interval: number;
  maximum: number;
  ticks: number[];
}

const CLEAN_MULTIPLIERS = [1, 2, 2.5, 5];

/** Builds a zero-based currency scale whose final clean tick is above the data. */
export function buildCurrencyAxisScale(highestValue: number): CurrencyAxisScale {
  if (!Number.isFinite(highestValue) || highestValue <= 0) {
    return { interval: 1, maximum: 1, ticks: [0, 1] };
  }

  const magnitude = Math.floor(Math.log10(highestValue));
  const candidates = Array.from({ length: 7 }, (_, offset) => magnitude - 4 + offset)
    .flatMap((exponent) =>
      CLEAN_MULTIPLIERS.map((multiplier) => multiplier * 10 ** exponent),
    )
    .map((interval) => {
      // Advancing from an exact multiple guarantees breathing room above the peak.
      const intervals = Math.floor(highestValue / interval + 1e-10) + 1;
      return {
        interval,
        intervals,
        maximum: intervals * interval,
        headroom: intervals * interval - highestValue,
      };
    })
    .filter(({ intervals }) => intervals >= 3 && intervals <= 7)
    .sort((a, b) =>
      a.headroom - b.headroom ||
      Math.abs(a.intervals - 5) - Math.abs(b.intervals - 5) ||
      a.interval - b.interval,
    );

  const selected = candidates[0] ?? {
    interval: 10 ** magnitude,
    intervals: Math.floor(highestValue / 10 ** magnitude) + 1,
    maximum: (Math.floor(highestValue / 10 ** magnitude) + 1) * 10 ** magnitude,
  };
  return {
    interval: selected.interval,
    maximum: selected.maximum,
    ticks: Array.from(
      { length: selected.intervals + 1 },
      (_, index) => index * selected.interval,
    ),
  };
}
