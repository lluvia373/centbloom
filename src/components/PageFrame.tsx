import type { ReactNode } from "react";
import { SideRailPreview } from "@/features/ads";
import styles from "./PageFrame.module.css";

/** Keep content centered; the optional sticky ad occupies only the right gutter. */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.frame}>
        <main id="main-content" className={`main-content ${styles.content}`}>{children}</main>
        <div className={styles.rail}><SideRailPreview /></div>
      </div>
    </div>
  );
}
