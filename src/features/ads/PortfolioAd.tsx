"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { readAdSenseConfig, requestAdOnce, type AdSenseConfig } from "./adsense";
import styles from "./PortfolioAd.module.css";

function AdSlot({ client, slot }: AdSenseConfig) {
  const element = useRef<HTMLModElement>(null);
  const ready = useRef(false);
  const [failed, setFailed] = useState(false);

  const request = useCallback(() => {
    if (!ready.current || !element.current) return;
    const adWindow = window as Window & {
      adsbygoogle?: { push: (value: Record<string, never>) => unknown };
    };
    const queue = (adWindow.adsbygoogle ??= new Array<Record<string, never>>());
    if (requestAdOnce(element.current, queue) === "failed") setFailed(true);
  }, []);

  useEffect(() => {
    if (!element.current) return;
    const observer = new ResizeObserver(request);
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [request]);

  return (
    <aside className={styles.ad} aria-label="광고" hidden={failed}>
      <p className={styles.label}>광고</p>
      <ins
        ref={element}
        className={`adsbygoogle ${styles.slot}`}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="horizontal"
        data-full-width-responsive="false"
        data-adtest={process.env.NODE_ENV === "production" ? undefined : "on"}
      />
      <Script
        id="centbloom-adsense"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        crossOrigin="anonymous"
        strategy="lazyOnload"
        onReady={() => {
          ready.current = true;
          request();
        }}
        onError={() => setFailed(true)}
      />
    </aside>
  );
}

export function PortfolioAd({ hasContent }: { hasContent: boolean }) {
  const config = readAdSenseConfig(
    process.env.NEXT_PUBLIC_ADSENSE_PORTFOLIO_ENABLED,
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID,
    process.env.NEXT_PUBLIC_ADSENSE_PORTFOLIO_SLOT,
  );
  if (!config) {
    return (
      <aside className={styles.ad} aria-label="광고">
        <p className={styles.label}>광고</p>
        <div className={`${styles.slot} ${styles.placeholder}`} aria-hidden="true" />
      </aside>
    );
  }
  if (!hasContent) return null;
  return <AdSlot key={`${config.client}:${config.slot}`} {...config} />;
}
