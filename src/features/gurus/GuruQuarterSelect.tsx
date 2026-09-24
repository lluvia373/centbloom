"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./Guru.module.css";

export function GuruQuarterSelect({ slug, selected, options }: { slug: string; selected: string; options: { accession: string; label: string }[] }) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className={styles.quarterNavigation}>
    <label htmlFor={id}>보고 분기</label>
    <select id={id} aria-label="보고 분기 선택" value={selected} aria-busy={pending} onChange={event => {
      const accession = event.target.value;
      startTransition(() => router.push(`/gurus/${encodeURIComponent(slug)}?filing=${encodeURIComponent(accession)}`, { scroll: false }));
    }}>
      {options.map(option => <option key={option.accession} value={option.accession}>{option.label}</option>)}
    </select>
  </div>;
}
