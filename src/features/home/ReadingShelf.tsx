import Link from "next/link";
import { reading } from "./reading";
import styles from "./home.module.css";
export function ReadingShelf() {
  return (
    <section className={styles.readingSection} aria-label="투자 읽을거리">
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>리서치 가이드</span>
          <h2>투자 판단을 위한 읽을거리</h2>
        </div>
        <Link href="/community" className={styles.textLink}>
          가이드 전체
        </Link>
      </div>
      <div className={styles.readingGrid}>
        {reading.map((article) => (
          <Link
            href={"/read/" + article.slug}
            key={article.slug}
            className={styles.readingCard}
          >
            <span className={styles.readingTag}>
              {article.tag}
              <span>{article.number}</span>
            </span>
            <h3>{article.title}</h3>
            <p>{article.summary}</p>
            <span className={styles.articleByline}>
              Centbloom 읽을거리
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
