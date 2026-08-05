export interface ToastOptions { type?: "error"; sticky?: boolean; duration?: number; action?: string; onAction?: () => void; }
export class ToastStack extends HTMLElement {
  connectedCallback(): void { this.classList.add("toast-stack"); this.setAttribute("aria-live", "polite"); this.setAttribute("aria-atomic", "false"); }
  show(text: string, options: ToastOptions = {}): HTMLElement {
    const toast = document.createElement("div"); toast.className = `toast${options.type === "error" ? " error" : ""}`;
    const copy = document.createElement("p"); copy.textContent = text; const actions = document.createElement("div"); actions.className = "toast-actions";
    if (options.action) { const action = document.createElement("button"); action.type = "button"; action.textContent = options.action; action.addEventListener("click", () => { options.onAction?.(); toast.remove(); }); actions.append(action); }
    const dismiss = document.createElement("button"); dismiss.type = "button"; dismiss.ariaLabel = "Dismiss notification"; dismiss.textContent = "×"; dismiss.addEventListener("click", () => toast.remove());
    actions.append(dismiss); toast.append(copy, actions); this.append(toast);
    if (!options.sticky) setTimeout(() => toast.remove(), options.duration ?? 4500);
    return toast;
  }
}
if (!customElements.get("toast-stack")) customElements.define("toast-stack", ToastStack);
