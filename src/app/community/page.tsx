import { ReadingShelf } from "@/features/home/ReadingShelf";
import styles from "@/features/home/home.module.css";
export default function ReadingPage() {
  return (
    <div className={styles.home}>
      <div className={styles.intro}>
        <div>
          <h1>리서치 가이드</h1>
          <p className={styles.description}>
            시장과 기업을 읽고, 나의 판단을 정리하는 방법.
          </p>
        </div>
      </div>
      <ReadingShelf />
    </div>
  );
}
