import type { CompanyObservation, CompanyRow, CompanySnapshot } from "./company-data";
import styles from "./StockCompanyFacts.module.css";

const numeric = (value: CompanyRow[string]) => typeof value === "number" ? new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(value) : "미확인";
const date = (value: CompanyRow[string]) => typeof value === "string" ? value.replaceAll("-", ".") : "미확인";
function note(observation: CompanyObservation) {
  if (observation.status !== "received" && observation.rows.length) return "갱신하지 못해 이전 확인 자료를 표시합니다.";
  if (observation.status === "failed") return "새 자료를 확인하지 못했습니다.";
  if (observation.status === "empty-unverified") return "확인된 내역이 없습니다.";
  return null;
}

/** Server-rendered compact facts. No personal-income calculation from incomplete corporate actions. */
export function StockCompanyFacts({ snapshot, asOfDate = new Date().toISOString().slice(0, 10) }: { snapshot: CompanySnapshot | null; asOfDate?: string }) {
  if (!snapshot) return null;
  const { dividends, earnings, profile } = snapshot.datasets;
  // FMP explicitly documents earnings EPS in the stock's trading currency.
  // This rule does NOT establish dividend or revenue currency.
  const tradingCurrency = profile.status === "received" && profile.rows[0]?.symbol === snapshot.symbol &&
    typeof profile.rows[0].currency === "string" && /^[A-Z]{3}$/.test(profile.rows[0].currency) ? profile.rows[0].currency : null;
  // Show the nearest upcoming release, then recent results, not several distant estimates.
  const today = asOfDate;
  const upcoming = earnings.rows.filter(row => String(row.date) > today).at(-1);
  const releases = [...(upcoming ? [upcoming] : []), ...earnings.rows.filter(row => String(row.date) <= today)].slice(0, 4);
  // Do not expose an unconfigured developer integration as an empty customer-facing feature.
  if (!dividends.receivedAt && !earnings.receivedAt) return null;
  return <div className={styles.grid}>
    {dividends.receivedAt && <section aria-label="주당 배당 내역" className={styles.section}>
      <h2>주당 배당</h2><div className={styles.card}>
        <ul>{dividends.rows.slice(0, 4).map(row => <li key={String(row.date)}>
          <div><span className={styles.label}>배당락일 {date(row.date)}</span><span className={styles.label}>지급일 {date(row.paymentDate)}</span></div>
          <div className={styles.amount}><strong>{numeric(row.amount)}</strong><span className={styles.label}>{row.currency ?? "통화 미확인"}</span></div>
        </li>)}</ul>
        {note(dividends) && <p className={styles.note}>{note(dividends)}</p>}
        <p className={styles.note}>{date(dividends.receivedAt.slice(0, 10))} 확인 · <a href="https://site.financialmodelingprep.com/developer/docs/stable/dividends-company" target="_blank" rel="noreferrer">FMP</a></p>
      </div>
    </section>}
    {earnings.receivedAt && <section aria-label="실적 발표 내역" className={styles.section}>
      <h2>실적 발표</h2><div className={styles.card}>
        <ul>{releases.map(row => <li key={String(row.date)}>
          <div><strong>{date(row.date)}</strong><span className={styles.label}>{row.epsActual !== null || row.revenueActual !== null ? "발표 결과" : String(row.date) > today ? "발표 예정" : "결과 미확인"}</span></div>
          <div className={styles.amount}><span>주당이익 {numeric(row.epsActual)}</span><span className={styles.label}>예상 {numeric(row.epsEstimated)} · {row.currency ?? tradingCurrency ?? "통화 미확인"}</span></div>
        </li>)}</ul>
        {note(earnings) && <p className={styles.note}>{note(earnings)}</p>}
        <p className={styles.note}>{date(earnings.receivedAt.slice(0, 10))} 확인 · <a href="https://site.financialmodelingprep.com/developer/docs/stable/earnings-company" target="_blank" rel="noreferrer">FMP</a></p>
      </div>
    </section>}
  </div>;
}
