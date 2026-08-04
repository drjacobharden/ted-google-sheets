interface Listener<T> extends EventListenerObject {
  handleEvent(event: CustomEvent<T>): void;
}

export const createEventHandler = <T extends CustomEvent>(
  eventName: string,
  target: EventTarget,
) => ({
  dispatch: (detail: T["detail"]) =>
    target.dispatchEvent(new CustomEvent<T>(eventName, { detail })),
  addListener: (fxn: Listener<T>) => target.addEventListener(eventName, fxn),
  removeListener: (fxn: Listener<T>) =>
    target.removeEventListener(eventName, fxn),
  handleEvent: (event: Event, handler: (e: T) => void) => {
    const e = event as T;
    handler(e);
  },
});
