import { adPlacements, type AdPlacement } from "./placements";
import { adPreviewEnabled } from "./preview-mode";
import styles from "./ads.module.css";

/** Public-page placement boundary; replace only the preview body when connecting AdSense. */
export function AdSlot({ placement }: { placement: AdPlacement }) {
  if (!adPreviewEnabled) return null;
  const slot = adPlacements[placement];
  return (
    <aside
      aria-label={slot.label + " 광고 위치 미리보기"}
      data-ad-placement={placement}
      className={[styles.slot, styles[slot.format]].join(" ")}
    >
      <span className={styles.label}>광고</span>
      <div className={styles.preview}>
        <span>{slot.label}</span>
        <span>AdSense 광고 위치 · 로컬 미리보기</span>
      </div>
    </aside>
  );
}
