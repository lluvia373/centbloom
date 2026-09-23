"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./home-layout.module.css";

const slotNames = ["market", "changes", "rankings", "calendar", "news", "utilities"] as const;
type SlotName = typeof slotNames[number];
type Slots = Record<SlotName, ReactNode>;

export function homeColumnPositions(heights: Record<SlotName, number>, gap: number) {
  const tops = {} as Record<SlotName, number>;
  const totals = [["changes", "rankings", "news"], ["market", "calendar", "utilities"]].map(column => {
    let end = 0;
    for (const name of column as SlotName[]) {
      const height = heights[name];
      tops[name] = height > 0 && end > 0 ? end + gap : end;
      if (height > 0) end = tops[name] + height;
    }
    return end;
  });
  return { tops, height: Math.max(...totals) };
}

/** Keep one stable DOM tree: no data subscribers or selections remount on resize.
 * Mobile uses normal document flow. Desktop measures only slot geometry so its
 * two independent stacks never reserve a tall, empty grid row beside a card.
 * Before hydration / without JS the readable, nonoverlapping CSS grid remains.
 */
export function HomeLayout(slots: Slots) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layout = root.current;
    if (!layout) return;
    const nodes = Array.from(layout.children) as HTMLDivElement[];
    const update = () => {
      const heights = Object.fromEntries(nodes.map(node => [node.dataset.slot, node.getBoundingClientRect().height])) as Record<SlotName, number>;
      const gap = Number.parseFloat(getComputedStyle(layout).rowGap) || 0;
      const positions = homeColumnPositions(heights, gap);
      for (const name of slotNames) layout.style.setProperty(`--home-y-${name}`, `${positions.tops[name]}px`);
      layout.style.setProperty("--home-height", `${positions.height}px`);
      layout.dataset.measured = "true";
    };
    const observer = new ResizeObserver(update);
    nodes.forEach(node => observer.observe(node));
    update();
    return () => observer.disconnect();
  }, []);
  return <div ref={root} className={styles.layout}>
    {slotNames.map(name => <div key={name} data-slot={name} className={`${styles.slot} ${styles[name]}`}>{slots[name]}</div>)}
  </div>;
}
