import type { ToastOptions, ToastStack } from "./toast-stack";
let stack: ToastStack | null = null;
export function registerToastStack(value: ToastStack): void { stack = value; }
export function showToast(text: string, options: ToastOptions = {}): HTMLElement | null { return stack?.show(text, options) ?? null; }
