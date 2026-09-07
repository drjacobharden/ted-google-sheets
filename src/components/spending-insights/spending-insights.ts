import { getIcon } from "../../icons";

export interface InsightItem {
  id: string;
  group: string;
  score: number;
  headline: string;
  detail: string;
  dayIds?: readonly string[];
  highlightZeroSpendDays?: boolean;
  isFallback?: boolean;
}

export interface SpendingInsightSelectionEvent extends CustomEvent {
  detail: {
    index: number;
    insight: InsightItem;
  };
}

export class SpendingInsights extends HTMLElement implements EventListenerObject {
  #data: readonly InsightItem[] = [];
  #selectedIndex = 0;
  #caption: HTMLElement | null = null;
  #counter: HTMLElement | null = null;
  #fadeTimer: number | null = null;
  #listening = false;

  set data(value: readonly InsightItem[] | null) {
    this.#data = value ? [...value] : [];
    this.#clearFadeTimer();
    if (this.isConnected) this.#render();
  }

  get data(): readonly InsightItem[] {
    return this.#data;
  }

  connectedCallback(): void {
    if (!this.#listening) {
      this.#listening = true;
      this.addEventListener("click", this);
    }
    this.#render();
  }

  disconnectedCallback(): void {
    this.#clearFadeTimer();
    if (!this.#listening) return;
    this.#listening = false;
    this.removeEventListener("click", this);
  }

  handleEvent(event: Event): void {
    if (event.type !== "click") return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const navigationButton = target.closest<HTMLButtonElement>(
      ".spending-insights__nav-button",
    );
    if (navigationButton && this.contains(navigationButton)) {
      const direction = navigationButton.dataset.direction === "previous" ? -1 : 1;
      this.#selectIndex(this.#selectedIndex + direction);
      return;
    }
  }

  #selectIndex(index: number): void {
    if (this.#data.length < 2) return;
    const nextIndex = (index + this.#data.length) % this.#data.length;
    if (nextIndex === this.#selectedIndex) return;
    this.#caption?.classList.add("is-fading");
    this.#clearFadeTimer();
    this.#fadeTimer = window.setTimeout(() => {
      this.#fadeTimer = null;
      this.#selectedIndex = nextIndex;
      this.#updateCaption();
      this.#dispatchSelection();
      requestAnimationFrame(() => this.#caption?.classList.remove("is-fading"));
    }, 140);
  }

  #clearFadeTimer(): void {
    if (this.#fadeTimer !== null) {
      window.clearTimeout(this.#fadeTimer);
      this.#fadeTimer = null;
    }
  }

  #render(): void {
    const insight = this.#data[this.#selectedIndex] ?? this.#data[0];
    this.#selectedIndex = Math.max(0, Math.min(this.#selectedIndex, this.#data.length - 1));

    if (!insight) {
      this.replaceChildren();
      this.#caption = null;
      this.#counter = null;
      return;
    }

    const caption = document.createElement("div");
    caption.className = "spending-insights__caption";
    caption.setAttribute("aria-live", "polite");

    const headline = document.createElement("h3");
    headline.className = "type-section-title";
    const detail = document.createElement("p");
    detail.className = "type-body type-muted";
    caption.append(headline, detail);

    const selector = document.createElement("div");
    selector.className = "spending-insights__selector";
    selector.setAttribute("aria-label", "Spending insights");
    selector.hidden = this.#data.length <= 1 || Boolean(insight.isFallback);

    const counter = document.createElement("span");
    counter.className = "spending-insights__counter";
    counter.setAttribute("aria-live", "polite");
    counter.setAttribute("aria-label", "Current spending insight");

    this.#caption = caption;
    this.#counter = counter;
    this.replaceChildren(caption, selector);
    this.#updateCaption();

    if (!selector.hidden) {
      selector.append(
        this.#navigationButton("previous", "Previous spending insight"),
        counter,
      );
      selector.append(this.#navigationButton("next", "Next spending insight"));
    }
    this.#dispatchSelection();
  }

  #dispatchSelection(): void {
    const insight = this.#data[this.#selectedIndex];
    if (!insight) return;
    this.dispatchEvent(
      new CustomEvent<SpendingInsightSelectionEvent["detail"]>(
        "spending-insight-change",
        {
          bubbles: true,
          detail: { index: this.#selectedIndex, insight },
        },
      ),
    );
  }

  #navigationButton(
    direction: "previous" | "next",
    label: string,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "spending-insights__nav-button";
    button.dataset.direction = direction;
    button.setAttribute("aria-label", label);
    const icon = getIcon(direction === "previous" ? "chevronLeft" : "chevronRight");
    icon?.setAttribute("aria-hidden", "true");
    button.append(icon!);
    return button;
  }

  #updateCaption(): void {
    const insight = this.#data[this.#selectedIndex] ?? this.#data[0];
    if (!insight || !this.#caption) return;
    const headline = this.#caption.querySelector("h3");
    const detail = this.#caption.querySelector("p");
    if (headline) headline.textContent = insight.headline;
    if (detail) detail.textContent = insight.detail;

    if (this.#counter) {
      this.#counter.textContent = `${this.#selectedIndex + 1} / ${this.#data.length}`;
      this.#counter.setAttribute(
        "aria-label",
        `Spending insight ${this.#selectedIndex + 1} of ${this.#data.length}`,
      );
    }
  }
}

if (!customElements.get("spending-insights")) {
  customElements.define("spending-insights", SpendingInsights);
}
