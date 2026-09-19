"use client";
import { todayISO } from "@/lib/format";
import { useSyncExternalStore } from "react";

let date = todayISO();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
function refresh() {
  const now = new Date();
  const next = todayISO(now);
  if (next !== date) {
    date = next;
    listeners.forEach((listener) => listener());
  }
  clearTimeout(timer);
  if (listeners.size) {
    const midnight = Date.parse(`${next}T00:00:00+09:00`) + 86_400_000;
    timer = setTimeout(refresh, Math.max(1, midnight - now.getTime() + 1));
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    }
  };
}
export function useKstDate() {
  return useSyncExternalStore(subscribe, () => date, () => "");
}
