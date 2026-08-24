export interface DatedValue { date: string; value: number; interpolated?: boolean }
export interface DatedFlow { date: string; amount: number; flowType?: "external" | "transfer" }

const day = 86_400_000;
const time = (value: string): number => {
  const result = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(result) ? result : NaN;
};

export function monthEnd(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
}

export function midpoint(month: string): string { return `${month}-15`; }

export function interpolateValue(
  values: DatedValue[],
  targetDate: string,
): DatedValue | null {
  const sorted = [...values].filter((item) => Number.isFinite(time(item.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const exact = sorted.find((item) => item.date === targetDate);
  if (exact) return { ...exact, interpolated: false };
  const before = sorted.filter((item) => item.date < targetDate).at(-1);
  const after = sorted.find((item) => item.date > targetDate);
  if (!before || !after) return null;
  const span = time(after.date) - time(before.date);
  if (span <= 0) return null;
  const progress = (time(targetDate) - time(before.date)) / span;
  return {
    date: targetDate,
    value: before.value + (after.value - before.value) * progress,
    interpolated: true,
  };
}

export function modifiedDietz(
  opening: DatedValue,
  ending: DatedValue,
  flows: DatedFlow[],
): number | null {
  const start = time(opening.date);
  const finish = time(ending.date);
  const duration = (finish - start) / day;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const periodFlows = flows.filter((item) => item.date > opening.date && item.date <= ending.date);
  const net = periodFlows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const weighted = periodFlows.reduce((sum, item) => {
    const remaining = (finish - time(item.date)) / day;
    return sum + Number(item.amount || 0) * (remaining / duration);
  }, 0);
  const denominator = Number(opening.value) + weighted;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return (Number(ending.value) - Number(opening.value) - net) / denominator;
}

export function chainLinkedReturn(
  values: DatedValue[],
  flows: DatedFlow[],
): { rate: number | null; estimated: boolean; start?: string; end?: string } {
  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return { rate: null, estimated: false };
  let factor = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const rate = modifiedDietz(sorted[index - 1], sorted[index], flows);
    if (rate === null) return { rate: null, estimated: sorted.some((item) => item.interpolated) };
    factor *= 1 + rate;
  }
  return {
    rate: factor - 1,
    estimated: sorted.some((item) => item.interpolated),
    start: sorted[0].date,
    end: sorted.at(-1)!.date,
  };
}

export function dollarReturn(opening: number, ending: number, flows: DatedFlow[]): number {
  return ending - opening - flows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

export function commonCutoff(latestDates: string[]): string | null {
  const valid = latestDates.filter((value) => Number.isFinite(time(value))).sort();
  return valid.length === latestDates.length && valid.length ? valid[0] : null;
}

export function annualBoundaries(year: number, cutoff: string): string[] {
  const start = `${year - 1}-12-31`;
  const end = cutoff < `${year}-12-31` ? cutoff : `${year}-12-31`;
  const result = [start];
  for (let month = 1; month <= 11; month += 1) {
    const boundary = monthEnd(`${year}-${String(month).padStart(2, "0")}`);
    if (boundary < end) result.push(boundary);
  }
  if (end > start) result.push(end);
  return [...new Set(result)];
}
