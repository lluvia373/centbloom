import type { ReactNode } from "react";
import { SideRailPreview } from "@/features/ads";
import styles from "./PageFrame.module.css";

/** Shared content bounds. Side areas stay reserved even when no ad is served. */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.frame}>
        <div className={styles.rail}><SideRailPreview side="left" /></div>
        <main id="main-content" className={`main-content ${styles.content}`}>{children}</main>
        <div className={styles.rail}><SideRailPreview side="right" /></div>
      </div>
    </div>
  );
}
