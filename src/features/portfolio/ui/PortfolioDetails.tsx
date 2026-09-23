"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./PortfolioDetails.module.css";

interface PortfolioDetailsProps {
  holdings: ReactNode;
  history: ReactNode;
}

const TABS = [
  { key: "holdings", label: "보유종목" },
  { key: "history", label: "투자 성과" },
] as const;

export function PortfolioDetails({ holdings, history }: PortfolioDetailsProps) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const content = { holdings, history };

  function select(index: number) {
    setSelected(index);
    buttons.current[index]?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % TABS.length; break;
      case "ArrowLeft": next = (index + TABS.length - 1) % TABS.length; break;
      case "Home": next = 0; break;
      case "End": next = TABS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    select(next);
  }

  return (
    <div className={styles.details}>
      <div className={styles.tabs} role="tablist" aria-label="투자 상세 보기">
        {TABS.map((tab, index) => (
          <button
            key={tab.key}
            ref={button => { buttons.current[index] = button; }}
            id={`${id}-tab-${tab.key}`}
            className={styles.tab}
            type="button"
            role="tab"
            aria-selected={selected === index}
            aria-controls={`${id}-panel-${tab.key}`}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={event => handleKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {TABS.map((tab, index) => (
        <div
          key={tab.key}
          id={`${id}-panel-${tab.key}`}
          className={styles.panel}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tab.key}`}
          hidden={selected !== index}
          tabIndex={0}
        >
          {content[tab.key]}
        </div>
      ))}
    </div>
  );
}
