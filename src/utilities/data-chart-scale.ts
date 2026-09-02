import { buildCurrencyAxisScale } from "./currency-axis-scale";

export interface DataChartScale {
  min: number;
  max: number;
  ticks: number[];
}

export function buildDataChartScale(values: readonly number[]): DataChartScale {
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  if (minimum === maximum) {
    const scale = buildCurrencyAxisScale(Math.abs(maximum) || 1);
    return { min: 0, max: scale.maximum, ticks: scale.ticks };
  }

  const roughStep = (maximum - minimum) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const naturalStep =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude;
  // Keep sub-200k currency charts readable; 50k intervals begin only above 200k.
  const step = maximum <= 200_000
    ? Math.min(naturalStep, 25_000)
    : Math.min(naturalStep, 50_000);
  const min = Math.floor(minimum / step) * step;
  const max = Math.ceil(maximum / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.push(Math.abs(value) < step / 1000 ? 0 : value);
  }
  return { min, max, ticks };
}
