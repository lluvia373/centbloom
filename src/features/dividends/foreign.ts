/** Strict issuer adapters for public SEC filings, not a quote-provider dividend yield. */
export interface ForeignIssuer {
  symbol: string;
  cik: number;
  name: string;
  shareHistoryFrom: string;
  kind: "us-common" | "alibaba" | "nonpayer" | "discovered";
}

export const foreignIssuers: ForeignIssuer[] = [
  { symbol: "AAPL", cik: 320193, name: "Apple Inc.", shareHistoryFrom: "2020-08-31", kind: "us-common" },
  { symbol: "GOOGL", cik: 1652044, name: "Alphabet Inc.", shareHistoryFrom: "2022-07-18", kind: "us-common" },
  { symbol: "SBUX", cik: 829224, name: "Starbucks Corporation", shareHistoryFrom: "2015-04-09", kind: "us-common" },
  { symbol: "BAC", cik: 70858, name: "Bank of America Corporation", shareHistoryFrom: "2004-08-30", kind: "us-common" },
  { symbol: "OXY", cik: 797468, name: "Occidental Petroleum Corporation", shareHistoryFrom: "2006-08-16", kind: "us-common" },
  { symbol: "BABA", cik: 1577552, name: "Alibaba Group Holding Limited", shareHistoryFrom: "2019-07-30", kind: "alibaba" },
  { symbol: "NU", cik: 1691493, name: "Nu Holdings Ltd.", shareHistoryFrom: "2021-12-09", kind: "nonpayer" },
  { symbol: "GRAB", cik: 1855612, name: "Grab Holdings Limited", shareHistoryFrom: "2021-12-02", kind: "nonpayer" },
  { symbol: "SOC", cik: 1831481, name: "Sable Offshore Corp.", shareHistoryFrom: "2024-02-15", kind: "nonpayer" },
];

export interface ForeignCandidate {
  symbol: string;
  amountPerShare: number;
  declaredDate: string;
  declarationDateBasis: "issuer-date" | "filing-date";
  recordDate: string;
  paymentDate: string | null;
  sourceUrl: string;
}

const datePattern = "(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4}";
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function validForeignDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function englishDividendDate(value: string): string {
  const match = /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(value.trim());
  if (!match || !months.includes(match[1])) throw Error("Unrecognized dividend date");
  const result = `${match[3]}-${String(months.indexOf(match[1]) + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  if (!validForeignDate(result)) throw Error("Invalid dividend date");
  return result;
}
export function dividendDocumentText(html: string): string {
  if (html.length > 12 * 1024 * 1024 || html.includes("\uFFFD")) throw Error("Unusable SEC dividend document");
  return html.replace(/<(script|style|ix:hidden)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&#(?:x([a-f\d]+)|(\d+));/gi, (_, hex, decimal) => {
      const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&rsquo;|&apos;/gi, "'")
    .replace(/\s+/g, " ").trim();
}

/** Recognizes complete common-share statements only; preferred and cumulative totals never qualify. */
export function parseForeignDividends(html: string, issuer: ForeignIssuer, sourceUrl: string, filingDate: string): ForeignCandidate[] {
  if (!new RegExp(`^https://www\\.sec\\.gov/Archives/edgar/data/${issuer.cik}/\\d{18}/[\\w.-]+\\.html?$`).test(sourceUrl) || !validForeignDate(filingDate)) throw Error("Unverified SEC issuer source");
  const text = dividendDocumentText(html), found: ForeignCandidate[] = [];
  const add = (amount: string, payment: string | null, record: string, statement: string, declared?: string) => {
    if (/special|extraordinary|in.kind|cancelled|canceled|suspended/i.test(statement)) throw Error("Non-ordinary or revised dividend needs review");
    const amountPerShare = Number(amount), recordDate = englishDividendDate(record), paymentDate = payment ? englishDividendDate(payment) : null;
    const declaredDate = declared ? englishDividendDate(declared) : filingDate;
    if (!(Number.isFinite(amountPerShare) && amountPerShare > 0 && amountPerShare <= 100_000) || declaredDate > recordDate || paymentDate && paymentDate < recordDate) throw Error("Inconsistent ordinary dividend");
    found.push({ symbol: issuer.symbol, amountPerShare, recordDate, paymentDate, declaredDate,
      declarationDateBasis: declared ? "issuer-date" : "filing-date", sourceUrl });
  };
  if (issuer.symbol === "AAPL") {
    const expression = new RegExp(`Apple[’']s board of directors has declared a cash dividend of \\$([\\d.]+) per share of the Company[’']s common stock(?:, an increase of [\\d.]+ percent)?\\. The dividend is payable on (${datePattern}), to shareholders of record as of the close of business on (${datePattern})\\.`, "gi");
    for (const match of text.matchAll(expression)) add(match[1], match[2], match[3], match[0]);
  } else if (issuer.symbol === "GOOGL") {
    for (const match of text.matchAll(/(?:quarterly )?cash dividend(?: on common stock)? of \$\s*([\d.]+)\b/gi)) {
      const statement = text.slice(match.index, match.index + 1100);
      const beforePayment = statement.split(/payable/i)[0];
      if (/preferred/i.test(beforePayment) && !/per share on our Class A, Class B, and Class C stock/i.test(statement.slice(0, 160))) continue;
      const details = new RegExp(`(?:common stock dividend is |[Tt]he dividend is )?payable on (${datePattern}) to stockholders of record for each of the [Cc]ompany[’']s Class A, Class B, and Class C shares as of (${datePattern})`).exec(statement);
      if (!details) continue;
      const before = text.slice(Math.max(0, match.index - 170), match.index);
      const declared = new RegExp(`On (${datePattern}), Alphabet[’']s Board of Directors declared a $`).exec(before)?.[1];
      add(match[1], details[1], details[2], statement.slice(0, details.index + details[0].length), declared);
    }
  } else if (issuer.symbol === "SBUX") {
    const expression = new RegExp(`(?:approved a quarterly cash dividend to shareholders of|declared a cash dividend of) \\$\\s*([\\d.]+) per share(?:, payable on| to be paid on) (${datePattern}),? to shareholders of record(?: as of the close of business)? on (${datePattern})`, "gi");
    for (const match of text.matchAll(expression)) add(match[1], match[2], match[3], match[0]);
  } else if (issuer.symbol === "BAC") {
    // SEC 10-Q / 10-K tables include all declaration dates, including quarters without a separate 8-K.
    for (const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
      const value = dividendDocumentText(table[0]);
      if (!/Declaration Date Record Date Payment Date Dividend Per Share/i.test(value)) continue;
      const expression = new RegExp(`(${datePattern})\\s+(${datePattern})\\s+(${datePattern})\\s*\\$?\\s*([\\d.]+)`, "g");
      for (const match of value.matchAll(expression)) add(match[4], match[3], match[2], match[0], match[1]);
    }
    const expression = new RegExp(`declared a regular quarterly cash dividend on Bank of America common stock of \\$([\\d.]+) per share[\\s\\S]{0,130}?\\. The dividend is payable on (${datePattern}) to shareholders of record as of (${datePattern})`, "gi");
    for (const match of text.matchAll(expression)) add(match[1], match[2], match[3], match[0]);
  } else if (issuer.symbol === "OXY") {
    const expressions = [
      new RegExp(`(?:quarterly dividend|dividend on (?:its|the company's) common stock)[^.]{0,100}?(?:to|of) \\$\\s*([\\d.]+) per share,? (?:which will be )?payable (?:on )?(${datePattern}),? to (?:stockholders|shareholders) of record as of (${datePattern})`, "gi"),
    ];
    for (const expression of expressions) for (const match of text.matchAll(expression)) add(match[1], match[2], match[3], match[0]);
  } else if (issuer.symbol === "BABA") {
    const expression = /(?:declared|approved) an annual regular cash dividend[^.]{0,100}?US\$([\d.]+) per ordinary share or US\$([\d.]+) per ADS/gi;
    for (const match of text.matchAll(expression)) {
      const after = text.slice(match.index, match.index + 3200);
      const record = new RegExp(`(?:close of business on|record as of) (${datePattern}),? (?:Hong Kong [Tt]ime|New York [Tt]ime)`).exec(after)?.[1];
      if (!record) continue;
      const payments = new RegExp(`payment date is expected to be on or around (${datePattern}) for holders of ordinary shares and on or around (${datePattern}) for holders of ADSs`, "i").exec(after);
      const declared = new RegExp(`As we announced on (${datePattern}),`).exec(text.slice(Math.max(0, match.index - 190), match.index))?.[1];
      if (Math.abs(Number(match[1]) * 8 - Number(match[2])) > 1e-8) throw Error("Alibaba ADS ratio changed");
      add(match[2], payments?.[2] ?? null, record, match[0], declared);
      const adr = found.at(-1)!;
      found.push({ ...adr, symbol: "9988.HK", amountPerShare: Number(match[1]), paymentDate: payments ? englishDividendDate(payments[1]) : null });
    }
  } else if (issuer.kind === "discovered") {
    found.push(...parseCommonDividendStatements(text, issuer.symbol, sourceUrl, filingDate));
    // A single mapped security plus an explicit per-common-share disclosure is required.
    // Read per-share amounts from dated rows, never the adjacent million-dollar total.
    if (/cash dividends declared per common share/i.test(text)) {
      for (const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
        const value = dividendDocumentText(table[0]);
        const before = dividendDocumentText(html.slice(Math.max(0, table.index - 2000), table.index));
        if (!/^Declaration Date Record Date Payment Date Dividend Per Share(?: Amount)?\b/i.test(value) ||
            !/(?:Board of Directors|we) (?:has |have )?declared the following dividends[^.]*:?$/i.test(before) ||
            /preferred|special|depositary|Class [A-Z]/i.test(value + before.slice(-300))) continue;
        const rows = new RegExp(`(${datePattern})\\s+(${datePattern})\\s+(${datePattern})\\s*\\$?\\s*(\\d+(?:\\.\\d+)?)`, "g");
        for (const row of value.matchAll(rows)) add(row[4], row[3], row[2], row[0], row[1]);
      }
    }
  }
  const unique = new Map<string, ForeignCandidate>();
  for (const candidate of found) {
    const key = `${candidate.symbol}:${candidate.recordDate}`, before = unique.get(key);
    if (before && (before.amountPerShare !== candidate.amountPerShare || before.paymentDate !== candidate.paymentDate)) throw Error("Conflicting dividend facts");
    if (!before) unique.set(key, candidate);
  }
  return [...unique.values()];
}

/** Issuer-independent ordinary common-share announcements. Ambiguous classes/units stay unparsed. */
export function parseCommonDividendStatements(text: string, symbol: string, sourceUrl: string, filingDate: string): ForeignCandidate[] {
  const result: ForeignCandidate[] = [];
  const expression = /(?:declared|approved)\s+(?:a\s+)?(?:(?:regular|quarterly|cash)\s+)*dividend\s+(?:of\s+)?\$\s*(\d+(?:\.\d+)?)\s+per\s+(?:common\s+)?share\b/gi;
  for (const match of text.matchAll(expression)) {
    // End before another dividend or paragraph-sized passage; never borrow a preferred record date.
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 650);
    const payment = new RegExp(`payable(?: on)? (${datePattern})`, "i").exec(after);
    const record = new RegExp(`(?:shareholders|stockholders) of record(?: as of)?(?: the close of business)?(?: on)? (${datePattern})`, "i").exec(after);
    if (!payment || !record) continue;
    const end = Math.max(payment.index + payment[0].length, record.index + record[0].length);
    const statement = match[0] + after.slice(0, end);
    const prefix = text.slice(Math.max(0, match.index - 160), match.index);
    if (!/common (?:stock|shares?)|per common share/i.test(statement + prefix) ||
        /preferred|depositary|ADS\b|ADR\b|special|extraordinary|return of capital|Class [A-Z]|\b(?:EUR|CAD|HKD)\b/i.test(statement + prefix) ||
        /\b(?:declared|approved)\b/i.test(after.slice(0, end))) continue;
    const amountPerShare = Number(match[1]), recordDate = englishDividendDate(record[1]), paymentDate = englishDividendDate(payment[1]);
    if (!Number.isFinite(amountPerShare) || amountPerShare <= 0 || amountPerShare > 100_000 ||
        recordDate < filingDate || paymentDate < recordDate) throw Error("Invalid common dividend statement");
    result.push({ symbol, amountPerShare, recordDate, paymentDate, declaredDate: filingDate,
      declarationDateBasis: "filing-date", sourceUrl });
  }
  return result;
}

export interface DividendCalendar {
  id: string;
  validFrom: string;
  validThrough: string;
  holidays: Record<string, string>;
  overrides?: Record<string, unknown>;
}
/** Current regular-cash T+1/T+2 rules. Calendar coverage is required, never assumed. */
export function ordinaryExDate(recordDate: string, market: "US" | "HK", calendars: DividendCalendar[]): string {
  const calendar = calendars.find(item => item.id === market);
  if (!calendar || !validForeignDate(recordDate) || recordDate < calendar.validFrom || recordDate > calendar.validThrough) throw Error("Dividend exchange calendar coverage missing");
  let date = recordDate;
  const back = () => { date = new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10); if (date < calendar.validFrom) throw Error("Dividend exchange calendar coverage missing"); };
  const business = () => {
    // HK half-day trading and settlement days are not identical. The shared
    // trading calendar alone cannot certify special settlement timetables.
    if (market === "HK" && calendar.overrides?.[date]) throw Error("HK special settlement calendar needs verification");
    return ![0, 6].includes(new Date(date).getUTCDay()) && !calendar.holidays[date];
  };
  while (!business()) back();
  if (market === "HK") { back(); while (!business()) back(); }
  return date;
}
