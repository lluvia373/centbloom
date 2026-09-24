import { getPreparedDirectory } from "@/features/gurus/directory-repository";
import { GuruDirectory } from "@/features/gurus/GuruDirectory";
import styles from "@/features/gurus/Guru.module.css";

export default function GurusPage() {
  const { summaries, pending } = getPreparedDirectory();
  return <div className={styles.page}>
    <header className={styles.heading}><div><h1>구루 포트폴리오</h1><p className={styles.subtitle}>운용사의 분기 말 보유 종목과 변화를 살펴보세요.</p></div></header>
    <GuruDirectory gurus={summaries} pending={pending} />
  </div>;
}
