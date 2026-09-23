"use client";
import { useEffect, useState } from "react";

/** Keep schedule labels current without running a timer in a hidden tab. */
export function useMarketClock(initialNow: number) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const resume = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (document.visibilityState !== "hidden") {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 30_000);
      }
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return now;
}
