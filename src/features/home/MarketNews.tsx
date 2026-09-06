"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useMarketNews } from "@/features/market/use-market-news";
import styles from "./home.module.css";
export function MarketNews({ symbol }: { symbol?: string }) {
  const { stories, loading, error, retry } = useMarketNews(symbol);
  const [visible, setVisible] = useState(8);
  return (
    <section
      className={styles.panel}
      aria-label={symbol ? "종목 관련 뉴스" : "시장 뉴스"}
    >
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>{symbol ? "기업 소식" : "미국 시장 · 기업 이슈"}</span>
          <h2>{symbol ? "이 종목의 소식" : "주요 소식과 시장 이슈"}</h2>
        </div>
        <span className={styles.note}>Yahoo Finance · 영문 원문</span>
      </div>
      {loading ? (
        <div className={styles.newsLoading} role="status">
          시장 소식을 불러오고 있어요.
        </div>
      ) : error ? (
        <div className={styles.empty} role="status">
          <p>소식을 잠시 가져오지 못했어요.</p>
          <button onClick={retry}>
            <RefreshCw size={14} /> 다시 불러오기
          </button>
        </div>
      ) : !stories.length ? (
        <p className={styles.empty}>최근 7일 내 제공된 소식이 없어요.</p>
      ) : (
        <ol className={styles.newsList}>
          {stories.slice(0, symbol ? 4 : visible).map((story, index) => (
            <li key={story.id}>
              <span className={styles.newsNumber}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <a
                  className={styles.newsTitle}
                  href={story.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {story.title}
                  <ArrowUpRight size={15} />
                </a>
                <div className={styles.newsMeta}>
                  <span>{story.publisher}</span>
                  <time dateTime={story.publishedAt}>
                    {new Intl.DateTimeFormat("ko-KR", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Seoul",
                    }).format(new Date(story.publishedAt))}{" "}
                    KST
                  </time>
                </div>
                <div className={styles.tags}>
                  {story.symbols.map((ticker) => (
                    <Link
                      key={ticker}
                      href={"/stock/" + encodeURIComponent(ticker)}
                    >
                      {ticker}
                    </Link>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!symbol && stories.length > visible && (
        <button
          className={styles.moreNews}
          onClick={() => setVisible((n) => n + 8)}
        >
          소식 더 보기 · {stories.length - visible}개
        </button>
      )}
    </section>
  );
}
