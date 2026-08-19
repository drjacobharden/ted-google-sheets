export class AppAlert extends HTMLElement implements EventListenerObject {
  #timer: ReturnType<typeof setTimeout> | null = null; #text!: HTMLSpanElement;
  connectedCallback(): void {
    this.className = "app-notice"; this.setAttribute("role", "status"); this.hidden = true;
    this.innerHTML = '<span></span><button type="button" aria-label="Dismiss notification">×</button>';
    this.#text = this.querySelector("span")!; this.querySelector("button")!.addEventListener("click", this); window.addEventListener("budget:api-warning", this);
  }
  disconnectedCallback(): void { this.querySelector("button")?.removeEventListener("click", this); window.removeEventListener("budget:api-warning", this); if (this.#timer) clearTimeout(this.#timer); }
  handleEvent(event: Event): void { if (event.type === "click") this.hide(); else this.show(String((event as CustomEvent).detail || "The Ledger needs attention.")); }
  show(text: string): void { if (this.#timer) clearTimeout(this.#timer); this.#text.textContent = text; this.hidden = false; this.#timer = setTimeout(() => this.hide(), 10000); }
  hide(): void { if (this.#timer) clearTimeout(this.#timer); this.#timer = null; this.hidden = true; }
}
if (!customElements.get("app-alert")) customElements.define("app-alert", AppAlert);
