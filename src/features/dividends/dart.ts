/** Public disclosure facts only. Record date is NOT an ex-date or proof of receipt. */
export interface DartDividendCandidate {
  receipt: string;
  corpCode: string;
  stockCode: string;
  name: string;
  filedDate: string;
  decisionDate: string;
  recordDate: string;
  paymentDate: string | null;
  amountPerShare: number;
  shareClass: "common";
  distribution: string;
  amended: boolean;
  originalFiledDate: string | null;
  sourceUrl: string;
}

export interface DartFiling {
  rcept_no: string; corp_code: string; stock_code: string; corp_name: string;
  rcept_dt: string; report_nm: string; corp_cls: string;
}

const compact = (value: string) => value.replace(/\s+/g, "");
export function validDartDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function text(value: string): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
      const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : " ";
    }).replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;/g, entity => ({"&nbsp;":" ","&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"'}[entity]!))
    .replace(/\s+/g, " ").trim();
}

/** Strict table extraction: correction comparison tables must never win over the final table. */
export function parseDartDividend(document: string, filing: DartFiling): DartDividendCandidate {
  if (document.length > 8_000_000 || document.includes("\ufffd") ||
      !/^\d{14}$/.test(filing.rcept_no) || !/^\d{8}$/.test(filing.corp_code) ||
      !/^[A-Z0-9]{6}$/.test(filing.stock_code) || !["Y", "K"].includes(filing.corp_cls) ||
      !filing.corp_name || !/^\d{8}$/.test(filing.rcept_dt) ||
      !compact(filing.report_nm).includes("현금ㆍ현물배당결정") || /철회|취소/.test(filing.report_nm))
    throw Error("Unsupported DART dividend filing");
  const tables = [...document.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(match =>
    [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
      [...row[1].matchAll(/<(?:td|th|tu)\b[^>]*>([\s\S]*?)<\/(?:td|th|tu)>/gi)].map(cell => text(cell[1]))));
  const main = tables.filter(rows => rows.some(row => compact(row[0] ?? "") === "2.배당종류") &&
    rows.some(row => compact(row[0] ?? "") === "6.배당기준일"));
  if (main.length !== 1) throw Error("Expected one final DART dividend table");
  const rows = main[0];
  const value = (label: string) => {
    const matches = rows.filter(row => compact(row[0] ?? "") === label);
    if (matches.length !== 1) throw Error("Missing or duplicate dividend field");
    return matches[0].at(-1)!;
  };
  if (compact(value("2.배당종류")) !== "현금배당") throw Error("Non-cash distribution requires review");
  const amountRows = rows.filter(row => /^3\.1주당배당금?\(원\)$/.test(compact(row[0] ?? "")) && compact(row[1] ?? "") === "보통주식");
  if (amountRows.length !== 1) throw Error("Common-share cash amount missing");
  const amount = compact(amountRows[0].at(-1)!);
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(amount)) throw Error("Invalid dividend amount");
  const amountPerShare = Number(amount.replaceAll(",", ""));
  if (!Number.isFinite(amountPerShare) || amountPerShare <= 0) throw Error("Non-positive dividend requires review");
  const recordDate = compact(value("6.배당기준일"));
  const payment = compact(value("7.배당금지급예정일자"));
  const decisionDate = compact(value("10.이사회결의일(결정일)"));
  const filedDate = filing.rcept_dt.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const paymentDate = ["-", "", "미정"].includes(payment) ? null : payment;
  if (![recordDate, decisionDate, filedDate].every(validDartDate) || decisionDate > filedDate ||
      (paymentDate !== null && (!validDartDate(paymentDate) || paymentDate < recordDate)))
    throw Error("Inconsistent DART dividend dates");
  const amended = /정정/.test(filing.report_nm);
  const originals = tables.flat().filter(row => compact(row[0] ?? "") === "2.정정관련공시서류제출일");
  const originalFiledDate = amended && originals.length === 1 ? compact(originals[0].at(-1)!) : null;
  if (amended && (!originalFiledDate || !validDartDate(originalFiledDate) || originalFiledDate > filedDate))
    throw Error("Amendment predecessor missing");
  return { receipt: filing.rcept_no, corpCode: filing.corp_code, stockCode: filing.stock_code,
    name: filing.corp_name, filedDate, decisionDate, recordDate, paymentDate, amountPerShare,
    shareClass: "common", distribution: value("1.배당구분"), amended, originalFiledDate,
    sourceUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${filing.rcept_no}` };
}

export interface DartDividendSnapshot {
  version: 1; checkedAt: string; from: string; through: string;
  candidates: DartDividendCandidate[];
}

/** Staging never overwrites SEC/live estimates. All revisions remain traceable by receipt. */
export function prepareDartSnapshot(candidates: DartDividendCandidate[], previous: DartDividendSnapshot | null,
  checkedAt: string, from: string, through: string): DartDividendSnapshot {
  if (!validDartDate(from) || !validDartDate(through) || from > through || !Number.isFinite(Date.parse(checkedAt)) ||
      through > checkedAt.slice(0, 10) || (previous && (previous.version !== 1 || !Number.isFinite(Date.parse(previous.checkedAt)) ||
      checkedAt < previous.checkedAt || from > previous.from || through < previous.through))) throw Error("Invalid or regressing DART collection");
  const ids = new Set<string>();
  for (const event of candidates) {
    if (ids.has(event.receipt) || event.filedDate < from || event.filedDate > through) throw Error("Duplicate or out-of-range DART receipt");
    ids.add(event.receipt);
  }
  for (const old of previous?.candidates ?? []) {
    const next = candidates.find(event => event.receipt === old.receipt);
    if (!next || JSON.stringify(next) !== JSON.stringify(old)) throw Error("DART source changed or missing; retain previous snapshot");
  }
  return { version: 1, checkedAt, from, through, candidates: [...candidates].sort((a, b) => a.receipt.localeCompare(b.receipt)) };
}
