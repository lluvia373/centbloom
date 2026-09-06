import { notFound } from "next/navigation";
import Link from "next/link";
import { reading } from "@/features/home/reading";
import styles from "@/features/home/home.module.css";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = reading.find((item) => item.slug === slug);
  return {
    title: article ? article.title + " | Centifolio" : "읽을거리 | Centifolio",
  };
}
export default async function ReadingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = reading.find((item) => item.slug === slug);
  if (!article) notFound();
  return (
    <article className={styles.article}>
      <Link href="/community" className={styles.textLink}>
        ← 투자 이야기
      </Link>
      <span className={styles.eyebrow}>{article.tag}</span>
      <h1>{article.title}</h1>
      <p className={styles.articleSummary}>{article.summary}</p>
      <div className={styles.articleMeta}>Centifolio 읽을거리 · 2026.09.06</div>
      {article.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <div className={styles.articleEnd}>
        <p>읽고 떠오른 생각을 나만의 투자 노트에 남겨보세요.</p>
        <Link href="/journal">투자 노트 작성하기 ↗</Link>
      </div>
    </article>
  );
}
