"use client";
import { useEffect, useState } from "react";
import { marketRequests } from "@/lib/stock-api";
import type { MarketStory } from "./news-model";
export function useMarketNews(symbol?: string) {
  const [retry, setRetry] = useState(0);
  const key = symbol ?? "market";
  const [state, setState] = useState<{
    key: string;
    stories: MarketStory[];
    error: boolean;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    marketRequests
      .request(
        "news:" + key,
        async (signal) => {
          const response = await fetch(
            "/api/news" +
              (symbol ? "?symbol=" + encodeURIComponent(symbol) : ""),
            { signal },
          );
          if (!response.ok) throw new Error("News unavailable");
          return response.json() as Promise<MarketStory[]>;
        },
        { signal: controller.signal, ttlMs: 120_000 },
      )
      .then((stories) => {
        if (!controller.signal.aborted)
          setState({ key, stories, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, stories: [], error: true });
      });
    return () => controller.abort();
  }, [key, symbol, retry]);
  return {
    stories: state?.key === key ? state.stories : [],
    loading: state?.key !== key,
    error: state?.key === key && state.error,
    retry: () => setRetry((value) => value + 1),
  };
}
