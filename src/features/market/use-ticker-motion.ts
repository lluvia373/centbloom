"use client";
import { useEffect, type RefObject } from "react";

/** Native scrolling keeps touch, keyboard focus and reduced-motion usable. No frame renders. */
export function useTickerMotion(
  viewportRef: RefObject<HTMLDivElement | null>,
  listRef: RefObject<HTMLUListElement | null>,
) {
  useEffect(() => {
    const viewport = viewportRef.current, list = listRef.current;
    if (!viewport || !list) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, previous = 0;
    let touching = false;
    let position = viewport.scrollLeft;
    const animate = (time: number) => {
      if (previous) {
        position += Math.min(time - previous, 64) * 0.032;
        const width = list.offsetWidth;
        if (width) position %= width;
        viewport.scrollLeft = position;
      }
      previous = time;
      frame = requestAnimationFrame(animate);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      position = viewport.scrollLeft;
      if (!touching && !media.matches && !document.hidden &&
          !viewport.matches(":hover") && !viewport.contains(document.activeElement)) {
        frame = requestAnimationFrame(animate);
      }
    };
    const touchStart = () => { touching = true; update(); };
    const touchEnd = () => { touching = false; update(); };
    viewport.addEventListener("touchstart", touchStart, { passive: true });
    viewport.addEventListener("touchend", touchEnd);
    viewport.addEventListener("touchcancel", touchEnd);
    const events = ["mouseenter", "mouseleave", "focusin", "focusout"] as const;
    events.forEach(event => viewport.addEventListener(event, update));
    document.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      events.forEach(event => viewport.removeEventListener(event, update));
      viewport.removeEventListener("touchstart", touchStart);
      viewport.removeEventListener("touchend", touchEnd);
      viewport.removeEventListener("touchcancel", touchEnd);
      document.removeEventListener("visibilitychange", update);
      media.removeEventListener("change", update);
    };
  }, [viewportRef, listRef]);
}
