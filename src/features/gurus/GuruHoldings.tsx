import { reportedChanges, type GuruFiling, type GuruHolding } from "./model";
import { GuruHoldingsTable, type GuruHoldingDisplayRow } from "./GuruHoldingsTable";
import styles from "./Guru.module.css";

export function filingQuarter(period: string) {
  return `${period.slice(0, 4)}년 ${Math.ceil(Number(period.slice(5, 7)) / 3)}분기`;
}

const number = (value: number) => value.toLocaleString("ko-KR");
const securityKey = (row: GuruHolding) => [row.cusip, row.shareClass, row.shareType, row.option ?? ""].join(":");

/** Compute and format on the server; raw filings never cross the client boundary. */
export function buildHoldingsDisplay(filing: GuruFiling, previous?: GuruFiling, pendingCorrection = false,
  options: { query?: string; limit?: string | number } = {}) {
  const changes = previous && !pendingCorrection ? reportedChanges(previous, filing) : null;
  const changesByKey = new Map(changes?.map(change => [change.id, change]));
  // A filing may split one security over several managers. Match the same
  // security identity used for the quarter comparison before displaying totals.
  const holdings = new Map<string, GuruHolding>();
  for (const row of filing.holdings) {
    const key = securityKey(row), existing = holdings.get(key);
    holdings.set(key, existing ? { ...existing, shares: existing.shares + row.shares, valueUsd: existing.valueUsd + row.valueUsd } : { ...row });
  }
  const rows: { id: string; row: GuruHolding; current: number | null; previous: number | null }[] = [...holdings].sort((a, b) => b[1].valueUsd - a[1].valueUsd).map(([id, row]) => ({
    id, row, current: row.shares, previous: changes ? (changesByKey.get(id)?.previous ?? (changesByKey.has(id) ? null : row.shares)) : null,
  }));
  for (const change of changes ?? []) {
    if (change.current === null) rows.push({ id: change.id, row: change.row, current: null, previous: change.previous });
  }
  const query = options.query?.trim() ?? "", term = query.toLowerCase();
  const rawLimit = String(options.limit ?? 50);
  const requestedLimit = /^[1-9]\d*$/.test(rawLimit) ? Number(rawLimit) : 50;
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(50, requestedLimit) : 50;
  const results = term ? rows.filter(({ row }) => `${row.issuer} ${row.cusip} ${row.mapping?.symbol ?? ""}`.toLowerCase().includes(term)) : rows;
  const quantity = (value: number | null, row: GuruHolding, missing: string) => value === null ? missing : `${number(value)}${row.shareType === "SH" ? "주" : " (원금)"}`;
  // Search the complete server-side set, then format and serialize only this window.
  const displayRows: GuruHoldingDisplayRow[] = results.slice(0, limit).map(({ id, row, current, previous: before }) => ({
    id, issuer: row.issuer, security: `${row.shareClass}${row.option ? ` · ${row.option}` : ""}`,
    cusip: row.cusip, symbol: row.mapping?.symbol ?? null,
    value: current === null ? "—" : `$${number(row.valueUsd)}`,
    weight: current === null || filing.expectedValueUsd === 0 ? "—" : `${(row.valueUsd / filing.expectedValueUsd * 100).toFixed(2)}%`,
    quantity: quantity(current, row, "이번 보고 없음"),
    previousQuantity: changes === null ? null : before === null ? "이전 보고 없음" : `직전 ${quantity(before, row, "")}`,
  }));
  const comparisonNote = changes !== null && previous ? `${previous.period} → ${filing.period} 보고 수량 비교입니다. 실제 매매 수량이 아니며 주식분할은 조정하지 않았습니다.` : pendingCorrection ? "정정 공시를 확인 중인 기간은 수량 비교를 제공하지 않습니다." : previous ? "보고 범위가 달라 수량 비교를 제공하지 않습니다." : "비교할 이전 분기 공시가 없습니다.";
  return { rows: displayRows, totalCount: rows.length, resultCount: results.length, query, limit, comparisonNote };
}

export function GuruHoldings({ filing, previous, pendingCorrection = false, holdingsQuery, holdingsLimit }: {
  filing: GuruFiling; previous?: GuruFiling; pendingCorrection?: boolean; holdingsQuery?: string; holdingsLimit?: string | number;
}) {
  const { rows, totalCount, resultCount, query, limit, comparisonNote } = buildHoldingsDisplay(filing, previous, pendingCorrection,
    { query: holdingsQuery, limit: holdingsLimit });
  return <section className={styles.holdingsSection} aria-labelledby="guru-holdings">
    <div className={styles.sectionHeading}><h2 id="guru-holdings">보유 종목</h2><span className={styles.muted}>공시 금액 · USD</span></div>
    <GuruHoldingsTable key={filing.accession} visibleRows={rows} totalCount={totalCount} resultCount={resultCount} query={query} limit={limit}
      caption={`${filingQuarter(filing.period)} 분기 말 보유 내역과 직전 분기 보고 수량`} />
    <p className={styles.tableNote}>{comparisonNote}</p>
  </section>;
}
