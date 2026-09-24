import type { DartDividendCandidate, DartDividendSnapshot } from "./dart";

export const krxDividendRights = "https://global.krx.co.kr/contents/GLB/06/0602/0602010204/GLB0602010204T1.jsp";
const yearEnd2025Source = "https://www.samsungpop.com/mbw/o2Info/contents.do?boardId=1590&cmd=detail&isEbd=Y";

/** Reviewed instruments, not a fabricated list of future dividend amounts. */
export const koreanDividendCompanies = [
  { symbol: "005930.KS", corpCode: "00126380", stockCode: "005930", shareHistoryFrom: "2018-05-04",
    factsCheckedUrl: "https://www.samsung.com/global/ir/stock-information/listing-Info/" },
  { symbol: "035420.KS", corpCode: "00266961", stockCode: "035420", shareHistoryFrom: "2019-01-01",
    factsCheckedUrl: "https://navercorp.com/navercorp_/ir/businessReport/2019/2018_NAVER_Business_Report.pdf" },
] as const;

export interface KoreanSettlementCalendar {
  id: string; validFrom: string; validThrough: string; holidays: Record<string, string>;
}

/** KRX ordinary-share T+2: the first trade settling after the record date is ex-dividend. */
export function koreanExDate(recordDate: string, calendar: KoreanSettlementCalendar): string {
  if (calendar.id !== "KR" || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || !Number.isFinite(Date.parse(recordDate)) ||
      new Date(recordDate).toISOString().slice(0, 10) !== recordDate) throw Error("Invalid Korean entitlement date");
  // Narrow independently verified prior-year exception; never extrapolate the 2026 calendar backwards.
  if (recordDate === "2025-12-31") return "2025-12-29";
  if (recordDate < calendar.validFrom || recordDate > calendar.validThrough) throw Error("KRX settlement calendar does not cover record date");
  const previous = (date: string) => new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  const businessDay = (date: string) => {
    if (date < calendar.validFrom || date > calendar.validThrough) throw Error("KRX settlement calendar boundary");
    const weekday = new Date(date).getUTCDay();
    return weekday !== 0 && weekday !== 6 && !calendar.holidays[date];
  };
  let lastSettlement = recordDate;
  while (!businessDay(lastSettlement)) lastSettlement = previous(lastSettlement);
  let exDate = previous(lastSettlement);
  while (!businessDay(exDate)) exDate = previous(exDate);
  return exDate;
}

/** A corrected filing replaces its linked original, including a changed record date. */
export function resolveKoreanRevisions(candidates: readonly DartDividendCandidate[]) {
  const groups: { root: DartDividendCandidate; current: DartDividendCandidate; revisions: DartDividendCandidate[] }[] = [];
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort((a, b) => a.receipt.localeCompare(b.receipt))) {
    if (seen.has(candidate.receipt)) throw Error("Duplicate DART revision receipt");
    seen.add(candidate.receipt);
    if (!candidate.amended) {
      if (groups.some(group => group.current.corpCode === candidate.corpCode && group.current.recordDate === candidate.recordDate))
        throw Error("Multiple unrelated dividends share a record date; review required");
      groups.push({ root: candidate, current: candidate, revisions: [candidate] });
      continue;
    }
    const matches = groups.filter(group => group.root.corpCode === candidate.corpCode &&
      group.revisions.some(previous => previous.filedDate === candidate.originalFiledDate));
    if (matches.length !== 1) throw Error("DART correction link is missing or ambiguous");
    matches[0].current = candidate;
    matches[0].revisions.push(candidate);
  }
  return groups;
}

export function prepareKoreanEvents(snapshot: DartDividendSnapshot,
  company: { symbol: string; corpCode: string; stockCode: string; shareHistoryFrom: string; factsCheckedUrl: string },
  calendar: KoreanSettlementCalendar) {
  return resolveKoreanRevisions(snapshot.candidates).map(({ root, current: event, revisions }) => {
    if (event.corpCode !== company.corpCode || event.stockCode !== company.stockCode || event.shareClass !== "common")
      throw Error("DART dividend instrument mapping mismatch");
    const exDate = koreanExDate(event.recordDate, calendar);
    return {
      id: `dart:${root.receipt}:${event.stockCode}`, symbol: company.symbol, name: event.name, currency: "KRW",
      declaredDate: event.filedDate, recordDate: event.recordDate, paymentDate: event.paymentDate,
      exDate, amountPerShare: event.amountPerShare, marketTimeZone: "Asia/Seoul", status: "declared" as const,
      entitlement: "ordinary-cash" as const, shareBasis: "transaction-compatible" as const,
      shareHistoryFrom: company.shareHistoryFrom, sourceUrl: event.sourceUrl,
      issuerCountry: "KR" as const, instrument: "ordinary-share" as const, treatyEligible: false,
      withholding: null, rightsSourceUrl: event.recordDate === "2025-12-31" ? yearEnd2025Source : krxDividendRights,
      factsCheckedUrl: company.factsCheckedUrl, rightsCheckedAt: "2026-09-24",
      revisionReceipts: revisions.map(revision => revision.receipt),
    };
  });
}
