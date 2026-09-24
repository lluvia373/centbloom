import { koreanExDate, krxDividendRights } from "./korea";
import type { KoreanSettlementCalendar } from "./korea";
import type { DividendFeed, PreparedDividendEvent } from "./types";

export const kodexDividendSource = "https://www.samsungfund.com/api/v1/kodex/divid-info.do?id=2ETFJ8";
export const kodexProductSource = "https://www.samsungfund.com/api/v1/kodex/product/2ETFJ8.do";
export const kodexProductPage = "https://www.samsungfund.com/etf/product/view.do?id=2ETFJ8";

type Distribution = { basicD: string; dividA: string; payD: string; taxDividA: string };
export interface KodexNotice { month: string; declaredDate: string; sourceUrl: string }
interface KodexData { dividList: Distribution[]; dividInfo: { fId: string; fNm: string }; lastleDivid: Distribution }
interface KodexProduct { info: { stkCd: string; product: { fId: string; stkTicker: string; fNm: string; listD: string; gijunYMD: string }; divideList: { BASIC_D: string; DIVID_A: number; PAY_D: string; TAX_DIVID_A: number }[] } }

function date(raw: string): string {
  if (!/^\d{8}$/.test(raw ?? "")) throw Error("Invalid Kodex date");
  const value = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw Error("Invalid Kodex date");
  return value;
}

/** Public announcement dates, never reconstructed from an assumed monthly payment rule. */
export function parseKodexNotices(html: string): { count: number; notices: KodexNotice[] } {
  const items = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  if (html.trim() && !items.length) throw Error("Invalid Kodex notice list");
  const notices: KodexNotice[] = [];
  for (const [, item] of items) {
    const title = item.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? "";
    const month = title.match(/26\.(\d{1,2})월_월말배당/);
    if (!month) continue;
    const id = item.match(/notice-view\.do\?no=(\d+)/)?.[1];
    const published = item.match(/class="[^"]*\bdate\b[^"]*"[^>]*>\s*(\d{4})\.(\d{2})\.(\d{2})\s*<\//);
    if (!id || !published || Number(month[1]) < 1 || Number(month[1]) > 12) throw Error("Incomplete Kodex notice");
    notices.push({ month: `2026-${month[1].padStart(2, "0")}`, declaredDate: date(published[1] + published[2] + published[3]),
      sourceUrl: `https://www.samsungfund.com/etf/lounge/notice-view.do?no=${id}` });
  }
  return { count: items.length, notices };
}

/** Reject a mismatched bulletin rather than borrow another ETF's amount or dates. */
export function verifyKodexNotice(html: string, amount: number): void {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) =>
    [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, cell]) => cell.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()));
  const matches = rows.filter(row => row[0] === "459580");
  if (matches.length !== 1 || !matches[0][1].includes("CD금리액티브") || Number(matches[0].at(-1)?.replaceAll(",", "")) !== amount)
    throw Error("Kodex notice amount or instrument mismatch");
}

/** One reviewed ETF's actual cash distributions; no inferred future distributions. */
export function prepareKodexDividends(distributions: unknown, product: unknown, notices: KodexNotice[],
  calendar: KoreanSettlementCalendar, checkedAt: string, previous: DividendFeed | null = null): DividendFeed {
  const data = distributions as KodexData, info = (product as KodexProduct)?.info;
  if (!Number.isFinite(Date.parse(checkedAt)) || data?.dividInfo?.fId !== "2ETFJ8" ||
      info?.product?.fId !== "2ETFJ8" || info.product.stkTicker !== "459580" || info.stkCd !== "KR7459580007" ||
      data.dividInfo.fNm !== info.product.fNm || !Array.isArray(data.dividList) || !Array.isArray(info.divideList))
    throw Error("Kodex instrument mapping mismatch");
  const from = "2026-01-01", through = date(info.product.gijunYMD);
  if (through < from || through > checkedAt.slice(0, 10) || through > calendar.validThrough ||
      (previous && ((previous.sourceCheckedAt !== null && previous.sourceCheckedAt > checkedAt) || previous.symbols[0]?.through > through))) throw Error("Kodex date coverage regression");
  const relevant = data.dividList.filter(row => date(row.basicD) >= from && date(row.basicD) <= through);
  if (!relevant.length || data.lastleDivid.basicD !== data.dividList[0]?.basicD) throw Error("Incomplete Kodex distribution history");
  const keys = new Set<string>();
  const events = relevant.map<PreparedDividendEvent>(row => {
    const recordDate = date(row.basicD), paymentDate = date(row.payD);
    const amount = Number(row.dividA), taxAmount = Number(row.taxDividA);
    const match = info.divideList.filter(other => other.BASIC_D === row.basicD);
    const announcement = notices.filter(notice => notice.month === recordDate.slice(0, 7));
    if (keys.has(recordDate) || !/^\d+$/.test(row.dividA) || !Number.isSafeInteger(amount) || amount <= 0 ||
        !/^\d+$/.test(row.taxDividA) || taxAmount > amount || paymentDate < recordDate ||
        match.length !== 1 || match[0].DIVID_A !== amount || match[0].PAY_D !== row.payD || match[0].TAX_DIVID_A !== taxAmount ||
        announcement.length !== 1 || announcement[0].declaredDate > recordDate)
      throw Error("Incomplete or conflicting Kodex distribution");
    keys.add(recordDate);
    return { id: `kodex:459580:${recordDate}`, symbol: "459580.KS", name: info.product.fNm, currency: "KRW",
      declaredDate: announcement[0].declaredDate, recordDate, paymentDate, exDate: koreanExDate(recordDate, calendar),
      amountPerShare: amount, marketTimeZone: "Asia/Seoul", sourceUrl: announcement[0].sourceUrl,
      status: "declared", entitlement: "ordinary-cash", shareBasis: "transaction-compatible",
      shareHistoryFrom: date(info.product.listD), issuerCountry: "KR", instrument: "other", treatyEligible: false,
      // Tax depends on the investor's holding-period tax-base increase, not just the public taxDividA.
      withholding: null, rightsSourceUrl: krxDividendRights, factsCheckedUrl: kodexProductPage,
      rightsCheckedAt: checkedAt.slice(0, 10) };
  }).sort((a, b) => a.recordDate.localeCompare(b.recordDate));
  // This product pays monthly. The source must contain all completed 2026 months,
  // not merely the latest row. This check does not invent amounts for missing months.
  const completeMonths = Number(through.slice(5, 7)) - 1;
  for (let month = 1; month <= completeMonths; month++) {
    if (!events.some(event => event.recordDate.startsWith(`2026-${String(month).padStart(2, "0")}-`)))
      throw Error("Kodex monthly distribution history is incomplete");
  }
  for (const event of previous?.events ?? []) {
    const next = events.find(row => row.id === event.id);
    if (!next || ["recordDate", "paymentDate", "amountPerShare", "exDate", "declaredDate"].some(key =>
      next[key as keyof PreparedDividendEvent] !== event[key as keyof PreparedDividendEvent]))
      throw Error("Kodex prior distribution changed or disappeared; review required");
  }
  return { version: 1, checkedAt, sourceCheckedAt: checkedAt, events,
    symbols: [{ symbol: "459580.KS", status: "supported", from, through, checkedAt, sourceUrl: kodexProductPage }] };
}
