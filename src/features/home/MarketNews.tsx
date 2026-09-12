"use client";
import Link from "next/link";
import type { NewsFeed } from "@/features/market/trending-news";
import { useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useMarketNews } from "@/features/market/use-market-news";
import { HomeSection } from "./HomeSection";
import styles from "./home.module.css";
export function MarketNews({ symbol, initialData }: { symbol?: string; initialData?: NewsFeed | null }) {
  const { stories, loading, error, partial, retry } = useMarketNews(symbol, initialData);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const initialCount = symbol ? 4 : 8;
  const [original, setOriginal] = useState(false);
  const hasTranslation = stories.some((story) => story.titleKo);
  return (
    <HomeSection title="주요뉴스" toggle={!loading && stories.length > initialCount ? {
      expanded, controls: listId, onClick: () => setExpanded((value) => !value),
    } : undefined} actions={hasTranslation ? <div className={styles.newsLanguage}>
          {!original && <span>자동 번역</span>}
          <button type="button" onClick={() => setOriginal((value) => !value)}
            aria-label={original ? "뉴스 제목 한국어로 보기" : "뉴스 제목 원문으로 보기"}>
            {original ? "한국어" : "원문"}
          </button>
        </div> : undefined}>
      {(partial || (error && stories.length > 0)) && (
        <p className={styles.note} role="status">
          {error ? "갱신 실패 · 이전 뉴스 표시 중" : "일부 종목의 뉴스를 가져오지 못했어요."}
          <button onClick={retry}>다시 시도</button>
        </p>
      )}
      {loading ? (
        <div className={styles.newsLoading} role="status">
          뉴스를 불러오는 중…
        </div>
      ) : error && !stories.length ? (
        <div className={styles.empty} role="status">
          <p>소식을 잠시 가져오지 못했어요.</p>
          <button onClick={retry}>
            <RefreshCw size={14} /> 다시 불러오기
          </button>
        </div>
      ) : !stories.length ? (
        <p className={styles.empty}>{symbol ? "최근 7일 내 관련 뉴스가 없어요." : "최근 72시간 내 관련 뉴스가 없어요."}</p>
      ) : (
        <ol id={listId} className={styles.newsList}>
          {stories.slice(0, expanded ? stories.length : initialCount).map((story) => (
            <li key={story.id}>
              <div>
                <a
                  className={styles.newsTitle}
                  href={story.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {!original && story.titleKo ? story.titleKo : story.title}
                </a>
                <div className={styles.newsMeta}>
                  <span>{story.publisher}</span>
                  {!original && hasTranslation && !story.titleKo && !/[가-힣]/.test(story.title) && <span>원문</span>}
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
    </HomeSection>
  );
}
