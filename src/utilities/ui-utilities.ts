import type { InvestmentSource } from "../api/investment-api";

export interface DateRangeValue { preset?: string; start: string; end: string; label?: string; }
export interface DateRangePickerElement extends HTMLElement { value: DateRangeValue; }
export function dateRangeDetail(event: Event): DateRangeValue | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail.start !== "string" || typeof event.detail.end !== "string") return null;
  return event.detail as DateRangeValue;
}
export function eventTargetElement(event: Event): Element | null { return event.target instanceof Element ? event.target : null; }
export function isInvestmentSource(value: FormDataEntryValue | null): value is InvestmentSource { return value === "manual" || value === "paycheck"; }
