"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { investmentNavigation, investmentTab } from "./model";
import styles from "./navigation.module.css";

export function InvestmentNavigation() {
  const current = investmentTab(usePathname());
  if (!current) return null;
  return (
    <nav className={styles.tabs} aria-label="내 투자 메뉴">
      {investmentNavigation.map((item) => (
        <Link key={item.href} href={item.href}
          aria-current={current.href === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
