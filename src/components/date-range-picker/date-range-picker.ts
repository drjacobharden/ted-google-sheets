import DateRangePickerTempString from "./template.html" with { type: "text" };

const DateRangePickerTemp = document.createElement("template");
DateRangePickerTemp.innerHTML = DateRangePickerTempString;

class DateRangePicker extends HTMLElement {
  #elementName: HTMLElement | null = null;

  static get observedAttributes(): string[] {
    return [];
  }

  connectedCallback(): void {
    const clone = DateRangePickerTemp.content.cloneNode(
      true,
    ) as DocumentFragment;
    const container = clone.querySelector("date-range-picker") as HTMLElement;
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue) return;
  }

  handleEvent(event: Event) {
    switch (event.type) {
      default:
        break;
    }
  }

  disconnectedCallback() {}
}

customElements.define("date-range-picker", DateRangePicker);
