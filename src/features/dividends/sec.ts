/** SEC facts only. A newly discovered event is a candidate until its rights are checked. */
export interface SecDividendCandidate {
  id: string;
  symbol: string;
  name: string;
  declaredDate: string;
  recordDate: string;
  paymentDate: string;
  amountPerShare: number;
  sourceUrl: string;
}

export const SEC_DIVIDEND_REUSE = "https://www.sec.gov/about/webmaster-frequently-asked-questions";
export const AAPL_CIK = "0000320193";
export const COLLECTION_FROM = "2026-01-01";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function validSource(value: string) {
  return /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/\d{18}\/[a-zA-Z0-9_.-]+\.htm$/.test(value);
}

function parseDate(text: string): string {
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/.exec(text);
  if (!match) throw Error("Unrecognized dividend date");
  const month = ["January","February","March","April","May","June","July","August","September","October","November","December"].indexOf(match[1]) + 1;
  const date = `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  if (!validDate(date)) throw Error("Invalid dividend date");
  return date;
}

export function parseAppleDividend(html: string, sourceUrl: string, declaredDate: string): SecDividendCandidate {
  if (!validSource(sourceUrl) || !validDate(declaredDate))
    throw Error("Unverified issuer or source");
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : " ")
    .replace(/&nbsp;|&#xA0;/gi, " ").replace(/\s+/g, " ");
  const matches = [...text.matchAll(/Apple[’']s board of directors has declared a cash dividend of \$([\d.]+) per share of the Company[’']s common stock(?:, an increase of [\d.]+ percent)?\. The dividend is payable on ([A-Za-z]+ \d{1,2}, \d{4}), to shareholders of record as of the close of business on ([A-Za-z]+ \d{1,2}, \d{4})\./g)];
  if (matches.length !== 1) throw Error("Expected one unambiguous ordinary cash dividend statement");
  const [, rawAmount, rawPayment, rawRecord] = matches[0];
  const amountPerShare = Number(rawAmount), paymentDate = parseDate(rawPayment), recordDate = parseDate(rawRecord);
  if (!Number.isFinite(amountPerShare) || amountPerShare <= 0 || recordDate <= declaredDate || paymentDate < recordDate)
    throw Error("Inconsistent dividend facts");
  return { id: `AAPL:${recordDate}`, symbol: "AAPL", name: "Apple Inc.", declaredDate, recordDate, paymentDate, amountPerShare, sourceUrl };
}

// Initial facts checked against issuer IR on 2026-09-24. This is NOT the product's
// intended coverage limit. Unreviewed future events never inherit these rights.
const reviewed: Record<string, { paymentDate: string; amount: number; declaredDate: string }> = {
  "2026-02-09": { paymentDate: "2026-02-12", amount: 0.26, declaredDate: "2026-01-29" },
  "2026-05-11": { paymentDate: "2026-05-14", amount: 0.27, declaredDate: "2026-04-30" },
  "2026-08-10": { paymentDate: "2026-08-13", amount: 0.27, declaredDate: "2026-07-30" },
};

export function reviewAppleDividend(candidate: SecDividendCandidate) {
  const reference = reviewed[candidate.recordDate];
  if (!reference || !validSource(candidate.sourceUrl) || candidate.id !== `AAPL:${candidate.recordDate}` || candidate.symbol !== "AAPL" || reference.paymentDate !== candidate.paymentDate ||
      reference.amount !== candidate.amountPerShare || reference.declaredDate !== candidate.declaredDate) return null;
  return {
    ...candidate, currency: "USD", exDate: candidate.recordDate, marketTimeZone: "America/New_York",
    status: "declared" as const, entitlement: "ordinary-cash" as const,
    shareBasis: "transaction-compatible" as const,
    // Raw per-share amount. Transactions before the latest split are not compatible.
    shareHistoryFrom: "2020-08-31", withholding: null,
    rightsSourceUrl: "https://listingcenter.nasdaq.com/rulebook/nasdaq/rules/nasdaq-equity-11",
    factsCheckedUrl: "https://investor.apple.com/dividend-history/default.aspx",
    rightsCheckedAt: "2026-09-24",
  };
}

export interface PreparedDividends {
  version: 1;
  checkedAt: string;
  sourceCheckedAt: string;
  coverage: "partial";
  sourcePolicyUrl: string;
  events: NonNullable<ReturnType<typeof reviewAppleDividend>>[];
  pending: SecDividendCandidate[];
}

/** Fail closed: a partial refresh, cancellation or changed amount needs review, not deletion. */
export function prepareDividendSnapshot(candidates: SecDividendCandidate[], previous: PreparedDividends | null, checkedAt: string, sourceCheckedAt = checkedAt): PreparedDividends {
  if (!Number.isFinite(Date.parse(checkedAt)) || !Number.isFinite(Date.parse(sourceCheckedAt)) || sourceCheckedAt > checkedAt || !candidates.length) throw Error("Incomplete dividend collection");
  if (previous && (previous.version !== 1 || !Array.isArray(previous.events) || !Array.isArray(previous.pending) ||
      !Number.isFinite(Date.parse(previous.checkedAt)) || Date.parse(checkedAt) < Date.parse(previous.checkedAt)))
    throw Error("Invalid or older dividend snapshot");
  const ids = new Set<string>();
  const events: PreparedDividends["events"] = [], pending: SecDividendCandidate[] = [];
  for (const candidate of candidates) {
    if (!validSource(candidate.sourceUrl) || !validDate(candidate.declaredDate) || !validDate(candidate.recordDate) ||
        !validDate(candidate.paymentDate) || candidate.declaredDate > checkedAt.slice(0, 10) ||
        candidate.recordDate <= candidate.declaredDate || candidate.paymentDate < candidate.recordDate ||
        candidate.symbol !== "AAPL" || candidate.id !== `AAPL:${candidate.recordDate}` ||
        !Number.isFinite(candidate.amountPerShare) || candidate.amountPerShare <= 0) throw Error("Invalid dividend candidate");
    if (ids.has(candidate.id)) throw Error("Duplicate dividend event; inspect amendment");
    ids.add(candidate.id);
    const event = reviewAppleDividend(candidate);
    if (event) events.push(event); else pending.push(candidate);
  }
  const expected = Object.keys(reviewed).filter(date => date <= checkedAt.slice(0, 10));
  if (expected.some(date => !events.some(event => event.recordDate === date))) throw Error("Reviewed dividend missing or changed; retain prior snapshot");
  if (previous?.events.some(old => !events.some(event => event.id === old.id && event.amountPerShare === old.amountPerShare && event.paymentDate === old.paymentDate)))
    throw Error("Dividend revision requires review; retain prior snapshot");
  return { version: 1, checkedAt, sourceCheckedAt, coverage: "partial", sourcePolicyUrl: SEC_DIVIDEND_REUSE,
    events: events.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)), pending };
}
