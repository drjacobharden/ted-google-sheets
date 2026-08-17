import { AppliedFilter } from "../components/filter-bar/filter-bar";
import { DatePickerStep, DateRange } from "./date-utilities";

interface Listener extends EventListenerObject {
  handleEvent(event: CustomEvent): void;
}

type EventNames = keyof EventDetails;
type EventDetails<T = any> = Readonly<{
  "date-range-changed": { range: DateRange; step: DatePickerStep };
  "checkbox-selection": { isOn: boolean };
  "dropdown-selection": { id: string; value: string; title: string };
  "filters-changed": { filters: AppliedFilter<any>[] };
  "table-sort-request": { key: string };
  "segmented-control-selection": { value: string; title: string };
  "table-data-changed": { data: readonly T[] };
  "drawer:close-requested": {};
}>;

export const addListener = (
  eventName: EventNames,
  target: EventTarget,
  listener: Listener,
) => target.addEventListener(eventName, listener);

export const removeListener = (
  eventName: EventNames,
  target: EventTarget,
  listener: Listener,
) => target.removeEventListener(eventName, listener);

export const handleCustomEvent = <T extends any, K extends EventNames>(
  eventName: K,
  event: Event,
  fxn: (detail: EventDetails<T>[K]) => void,
) => {
  const e = event as CustomEvent;
  fxn(e.detail);
};

export const createEventHandler = <T extends any, K extends EventNames>(
  eventName: K,
  target: EventTarget,
) => ({
  dispatch: (detail: EventDetails<T>[K], bubbles = { bubbles: false }) =>
    target.dispatchEvent(new CustomEvent(eventName, { detail, ...bubbles })),
  addListener: (fxn: Listener) => addListener(eventName, target, fxn),
  removeListener: (fxn: Listener) => removeListener(eventName, target, fxn),
  handleEvent: (event: Event, handler: (details: EventDetails<T>[K]) => void) =>
    handleCustomEvent(eventName, event, handler),
});
