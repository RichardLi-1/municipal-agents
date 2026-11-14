import { createStore } from "./store.ts";

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: "info" | "ok" | "warn";
  action?: { label: string; run: () => void };
}

export const toasts = createStore<Toast[]>([]);
let next = 1;

/** Show a short note in the corner; it leaves by itself. */
export function toast(t: Omit<Toast, "id">, ms = 4200) {
  const id = next++;
  toasts.set((all) => [...all.slice(-2), { ...t, id }]);
  setTimeout(() => dismiss(id), ms);
  return id;
}

export function dismiss(id: number) {
  toasts.set((all) => all.filter((t) => t.id !== id));
}
