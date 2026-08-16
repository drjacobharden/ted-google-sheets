export interface SavingsRateBreakdownInput {
  income: number;
  spend: number;
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
  const totalIncome = normalizedIncome + normalizedDeductions;
  const amountSaved =
    normalizedIncome - normalizedSpend + normalizedDeductions;

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

  const rate = (amountSaved / totalIncome) * 100;
  const spendPercent = clamp((normalizedSpend / totalIncome) * 100, 0, 100);
  const remainingAfterSpend = 100 - spendPercent;
  const deductionsPercent = clamp(
    (normalizedDeductions / totalIncome) * 100,
    0,
    remainingAfterSpend,
  );
  const savingsPercent = Math.max(
    0,
    100 - spendPercent - deductionsPercent,
  );

  return {
    amountSaved,
    totalIncome,
    rate,
    savingsPercent,
    deductionsPercent,
    spendPercent,
  };
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
