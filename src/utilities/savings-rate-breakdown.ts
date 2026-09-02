export interface SavingsRateBreakdownInput {
  /** Gross income, including all deduction-sourced income. */
  income: number;
  spend: number;
  /** The portion of gross income represented by deducted savings. */
  deductions: number;
}

export interface SavingsRateBreakdown {
  amountSaved: number;
  totalIncome: number;
  rate: number | null;
  savingsPercent: number;
  deductionsPercent: number;
  spendPercent: number;
}

export interface ActiveMonth {
  hasData: boolean;
}

const finite = (value: number): number =>
  Number.isFinite(value) ? value : 0;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** Builds the three non-overlapping portions of gross income used by the chart. */
export function savingsRateBreakdown({
  income,
  spend,
  deductions,
}: SavingsRateBreakdownInput): SavingsRateBreakdown {
  const normalizedIncome = finite(income);
  const normalizedSpend = finite(spend);
  const normalizedDeductions = finite(deductions);
  const totalIncome = normalizedIncome;
  const amountSaved =
    normalizedIncome - normalizedSpend - normalizedDeductions;

  if (totalIncome <= 0) {
    return {
      amountSaved,
      totalIncome,
      rate: null,
      savingsPercent: 0,
      deductionsPercent: 0,
      spendPercent: 0,
    };
  }

  const spendPercent = (normalizedSpend / totalIncome) * 100;
  const deductionsPercent = clamp(
    (normalizedDeductions / totalIncome) * 100,
    0,
    100,
  );
  const savingsPercent = clamp(
    (amountSaved / totalIncome) * 100,
    0,
    100,
  );
  const rate = savingsPercent + deductionsPercent;

  return {
    amountSaved,
    totalIncome,
    rate,
    savingsPercent,
    deductionsPercent,
    spendPercent,
  };
}

/** Divides a yearly total only by months that contain financial data. */
export function activeMonthAverage(
  total: number,
  months: ReadonlyArray<ActiveMonth>,
): number | null {
  const activeMonths = months.filter(({ hasData }) => hasData).length;
  return activeMonths === 0 ? null : finite(total) / activeMonths;
}

/** Returns the signed percentage-point change when both years have income. */
export function savingsRateChange(
  current: SavingsRateBreakdown,
  previous: SavingsRateBreakdown | null,
): number | null {
  return current.rate === null || previous === null || previous.rate === null
    ? null
    : current.rate - previous.rate;
}
