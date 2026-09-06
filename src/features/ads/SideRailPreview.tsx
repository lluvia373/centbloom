"use client";
import { usePathname } from "next/navigation";
import { isPublicRoute } from "@/features/auth/public-routes";
import { adPreviewEnabled } from "./preview-mode";
import styles from "./side-rail.module.css";

/**
 * Layout preview only. Production side rails must be served by AdSense Auto ads,
 * not by inserting manual ad units into these two sticky boxes.
 */
export function SideRailPreview({ side }: { side: "left" | "right" }) {
  const pathname = usePathname();
  if (!adPreviewEnabled || !isPublicRoute(pathname)) return null;
  return (
    <aside className={styles.preview} data-ad-side={side}
      aria-label={`${side === "left" ? "왼쪽" : "오른쪽"} 사이드 레일 광고 미리보기`}>
      <span className={styles.label}>광고</span>
      <div className={styles.space}>
        <span>AdSense</span>
        <span>사이드 레일</span>
        <small>로컬 미리보기</small>
      </div>
    </aside>
  );
}
