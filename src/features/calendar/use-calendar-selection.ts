"use client";
import { useSearchParams } from "next/navigation";
/** Native history integrates with App Router and preserves the current scroll position. */
export function useCalendarSelection() {
  const params = useSearchParams();
  function update(values: Record<string,string>) {
    const url = new URL(window.location.href);
    for (const [key,value] of Object.entries(values)) url.searchParams.set(key,value);
    window.history.replaceState(null,"",url.pathname + url.search + url.hash);
  }
  return {params,update};
}
