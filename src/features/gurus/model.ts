export interface GuruHolding {
  rowId: string;
  issuer: string;
  shareClass: string;
  cusip: string;
  valueUsd: number;
  shares: number;
  shareType: "SH" | "PRN";
  option: "PUT" | "CALL" | null;
  // A name match is not a security mapping. Evidence and effective dates are mandatory.
  mapping: { symbol: string; source: string; validFrom: string; validThrough: string } | null;
}
export interface GuruFiling {
  guruId: string;
  accession: string;
  period: string;
  filedDate: string;
  acceptedAt: string; // SEC's displayed acceptance time, not public availability.
  publicAt: string | null;
  source: string;
  tableSource: string;
  kind: "original" | "restatement" | "addition";
  revision: number;
  parentAccession: string | null;
  expectedRows: number;
  expectedValueUsd: number;
  complete: boolean;
  holdings: GuruHolding[];
}
export function secSource(source: string) {
  try { const url = new URL(source); return url.protocol === "https:" && url.hostname === "www.sec.gov" && url.pathname.startsWith("/Archives/edgar/"); }
  catch { return false; }
}
export function validateFiling(filing: GuruFiling): string | null {
  if (!filing.complete || !secSource(filing.source) || !secSource(filing.tableSource)) return "원문 또는 전체 자료 확인이 필요합니다.";
  if (!/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) || !/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(filing.period)
    || !Number.isFinite(Date.parse(filing.period)) || !Number.isFinite(Date.parse(filing.filedDate)) || filing.filedDate < filing.period
    || !Number.isInteger(filing.revision) || filing.revision < 0) return "공시 식별자·기준일을 확인해 주세요.";
  if (filing.holdings.length !== filing.expectedRows || !Number.isSafeInteger(filing.expectedValueUsd) || filing.expectedValueUsd < 0) return "공시의 행 수 또는 합계가 일치하지 않습니다.";
  const ids = new Set<string>();
  let total = 0;
  for (const row of filing.holdings) {
    if (!row.rowId || ids.has(row.rowId) || !row.issuer || !row.shareClass || !/^[A-Z0-9]{9}$/.test(row.cusip)
      || !Number.isSafeInteger(row.valueUsd) || row.valueUsd < 0 || !Number.isFinite(row.shares) || row.shares < 0
      || !["SH", "PRN"].includes(row.shareType) || ![null, "PUT", "CALL"].includes(row.option)) return "보유 행 검증에 실패했습니다.";
    ids.add(row.rowId); total += row.valueUsd;
    if (row.mapping && (!/^https:\/\//.test(row.mapping.source) || !row.mapping.symbol
      || row.mapping.validFrom > filing.period || row.mapping.validThrough < filing.period)) return "종목 연결의 기준일·근거를 확인해 주세요.";
  }
  return total !== filing.expectedValueUsd ? "공시의 금액 합계가 일치하지 않습니다." : null;
}

export interface FilingArchive { versions: GuruFiling[]; activeAccession: string | null }
/** Immutable activation: rejected/partial/late reports cannot replace the last good snapshot. */
export function ingestFiling(archive: FilingArchive, incoming: GuruFiling): { archive: FilingArchive; error: string | null } {
  const invalid = validateFiling(incoming);
  if (invalid) return { archive, error: invalid };
  const duplicate = archive.versions.find(f => f.accession === incoming.accession);
  if (duplicate) return { archive, error: JSON.stringify(duplicate) === JSON.stringify(incoming) ? null : "같은 공시 번호의 내용이 달라졌습니다. 원본을 보존합니다." };
  if (archive.versions.some(f => f.guruId !== incoming.guruId)) return { archive, error: "다른 운용사의 자료입니다." };
  if (incoming.kind !== "original") {
    const parent = archive.versions.find(f => f.accession === incoming.parentAccession);
    if (!parent || parent.period !== incoming.period || parent.revision + 1 !== incoming.revision || incoming.filedDate < parent.filedDate
      || archive.versions.some(f=>f.period===incoming.period && f.revision>parent.revision))
      return { archive, error: "정정 원본과 순서를 확인해야 합니다." };
    // Additions must be reconciled with their original, not treated as a full replacement.
    if (incoming.kind === "addition") return { archive, error: "추가 보고는 원본과의 중복·범위 대조 후 반영해야 합니다." };
  } else if (incoming.revision !== 0 || incoming.parentAccession !== null) return { archive, error: "원본 공시의 정정 정보가 잘못되었습니다." };
  const current = archive.versions.find(f => f.accession === archive.activeAccession);
  const activate = !current || incoming.period > current.period || (incoming.period === current.period && incoming.revision > current.revision);
  return { archive: { versions: [...archive.versions, structuredClone(incoming)], activeAccession: activate ? incoming.accession : archive.activeAccession }, error: null };
}

/** Raw reported quantity differences only. Never label these as executed buys/sells. */
export function reportedChanges(previous: GuruFiling, current: GuruFiling) {
  if (validateFiling(previous) || validateFiling(current) || previous.guruId !== current.guruId || previous.period >= current.period) return null;
  const quarter = (date:string) => Number(date.slice(0,4))*4 + Number(date.slice(5,7))/3;
  if (quarter(current.period)-quarter(previous.period)!==1) return null;
  const key = (r: GuruHolding) => [r.cusip, r.shareClass, r.shareType, r.option ?? ""].join(":");
  const totals = (rows: GuruHolding[]) => {
    const result = new Map<string, { row: GuruHolding; shares: number }>();
    for (const row of rows) { const id = key(row); result.set(id, { row, shares: (result.get(id)?.shares ?? 0) + row.shares }); }
    return result;
  };
  const before = totals(previous.holdings), after = totals(current.holdings);
  return [...new Set([...before.keys(), ...after.keys()])].map(id => ({
    id, row: (after.get(id) ?? before.get(id))!.row,
    previous: before.get(id)?.shares ?? null, current: after.get(id)?.shares ?? null,
  })).filter(row => row.previous !== row.current);
}
