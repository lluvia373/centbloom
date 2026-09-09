import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./home.module.css";

export function HomeSection({
  title, label = title, actions, toggle, className, grouped = false, children,
}: {
  title: string;
  label?: string;
  actions?: ReactNode;
  toggle?: { expanded: boolean; controls: string; onClick: () => void };
  className?: string;
  grouped?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={[styles.homeSection, className].filter(Boolean).join(" ")} aria-label={label}>
      <div className={styles.homeSectionHead}>
        <h2>{toggle ? (
          <button type="button" className={styles.headingToggle}
            aria-expanded={toggle.expanded} aria-controls={toggle.controls}
            onClick={toggle.onClick}>
            {title}
            <ChevronDown size={16} className={styles.headingChevron} aria-hidden="true" />
          </button>
        ) : title}</h2>
        {actions}
      </div>
      {grouped ? children : <div className={styles.sectionCard}>{children}</div>}
    </section>
  );
}
