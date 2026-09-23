import Link from "next/link";
import { guruCatalog } from "@/features/gurus/catalog";
import styles from "@/features/gurus/Guru.module.css";

export default function GurusPage() {
  return <div className={styles.page}>
    <header className={styles.heading}><h1>구루 포트폴리오</h1><Link className={styles.control} href="/notifications">알림</Link></header>
    <p className={styles.muted}>{guruCatalog.length ? "확인된 과거 공시입니다. 현재 보유 내역과 다를 수 있습니다." : "확인된 구루 공시가 없습니다."}</p>
    <ul className={styles.list}>{guruCatalog.map(guru => <li className={styles.panel} key={guru.slug}>
      <h2><Link href={`/gurus/${guru.slug}`} className={styles.control}>{guru.name}</Link></h2>
      <p className={styles.muted}>{guru.manager} · 분기 말 보유 보고(13F)</p>
      <p className={styles.muted}>{guru.archive.versions.at(-1)?.period} 기준</p>
    </li>)}</ul>
  </div>;
}
