import type { ReactNode } from "react";
import styles from "./home.module.css";

export function HomeSection({
  title, label = title, actions, className, grouped = false, children,
}: {
  title: string;
  label?: string;
  actions?: ReactNode;
  className?: string;
  grouped?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={[styles.homeSection, className].filter(Boolean).join(" ")} aria-label={label}>
      <div className={styles.homeSectionHead}>
        <h2>{title}</h2>
        {actions}
      </div>
      {grouped ? children : <div className={styles.sectionCard}>{children}</div>}
    </section>
  );
}
