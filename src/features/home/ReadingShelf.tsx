import Link from "next/link";
import { reading } from "./reading";
import styles from "./home.module.css";
import readingStyles from "./reading.module.css";
export function ReadingShelf({ variant = "section" }: { variant?: "section" | "listing" }) {
  const ArticleHeading = variant === "listing" ? "h2" : "h3";
  return (
    <section className={readingStyles.readingSection} aria-label="투자 읽을거리">
      {variant === "section" && <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>리서치 가이드</span>
          <h2>투자 판단을 위한 읽을거리</h2>
        </div>
        <Link href="/community" className={styles.textLink}>
          가이드 전체
        </Link>
      </div>}
      <div className={readingStyles.readingGrid}>
        {reading.map((article) => (
          <Link
            href={"/read/" + article.slug}
            key={article.slug}
            className={readingStyles.readingCard}
          >
            <span className={readingStyles.readingTag}>
              {article.tag}
              <span>{article.number}</span>
            </span>
            <ArticleHeading>{article.title}</ArticleHeading>
            <p>{article.summary}</p>
            <span className={readingStyles.articleByline}>
              Centbloom 읽을거리
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
