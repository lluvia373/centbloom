import type { CompanyDataset, CompanyObservation, CompanyRow, DataIssue } from "../company-data";

function calendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

const endpoints: Record<CompanyDataset, string> = {
  profile: "profile", quote: "quote", history: "historical-price-eod/full", dividends: "dividends", earnings: "earnings",
};
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const positive = (value: unknown) => { const n = number(value); return n !== null && n > 0 ? n : null; };
const text = (value: unknown) => typeof value === "string" && value.length <= 240 ? value : null;

/** Keep unknown currency/dates as unknown; never replace them with quote currency or today. */
export function normalizeFmp(dataset: CompanyDataset, symbol: string, input: unknown, observedAt: string): CompanyRow[] {
  if (!Array.isArray(input) || input.length > 20_000) throw Error("Invalid FMP payload");
  const seen = new Set<string>();
  return input.map(item => {
    if (!item || typeof item !== "object" || item.symbol !== symbol) throw Error("FMP symbol mismatch");
    const row = item as Record<string, unknown>;
    let result: CompanyRow;
    if (dataset === "profile") {
      if (!text(row.companyName) || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) || !text(row.exchange)) throw Error("Missing FMP identity");
      result = { symbol, name: text(row.companyName), currency: row.currency, exchange: text(row.exchange), country: text(row.country), isin: text(row.isin) };
    } else if (dataset === "quote") {
      const timestamp = positive(row.timestamp);
      if (positive(row.price) === null || timestamp === null || timestamp * 1000 > Date.parse(observedAt) + 60_000 || timestamp < 946684800) throw Error("Invalid FMP quote");
      result = { symbol, price: positive(row.price), change: number(row.change), changePercent: number(row.changePercentage),
        quotedAt: new Date(timestamp * 1000).toISOString(), previousClose: positive(row.previousClose), volume: number(row.volume) };
    } else {
      const date = calendarDate(row.date);
      if (!date) throw Error("Missing FMP date");
      if (dataset === "history") {
        if (date > observedAt.slice(0, 10) || [row.open, row.high, row.low, row.close].some(n => positive(n) === null) ||
          Number(row.high) < Math.max(Number(row.open), Number(row.close)) || Number(row.low) > Math.min(Number(row.open), Number(row.close))) throw Error("Invalid FMP price bar");
        result = { symbol, date, open: positive(row.open), high: positive(row.high), low: positive(row.low), close: positive(row.close), volume: number(row.volume) };
      } else if (dataset === "dividends") {
        if (number(row.dividend) === null || Number(row.dividend) < 0) throw Error("Missing FMP dividend amount");
        for (const key of ["recordDate", "paymentDate", "declarationDate"]) {
          if (row[key] !== undefined && row[key] !== null && row[key] !== "" && !calendarDate(row[key])) throw Error("Invalid FMP dividend date");
        }
        result = { symbol, date, amount: number(row.dividend), adjustedAmount: number(row.adjDividend),
          currency: typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null,
          recordDate: calendarDate(row.recordDate), paymentDate: calendarDate(row.paymentDate), declarationDate: calendarDate(row.declarationDate), frequency: text(row.frequency) };
      } else {
        const values = ["epsActual", "epsEstimated", "revenueActual", "revenueEstimated"] as const;
        for (const key of values) if (row[key] !== undefined && row[key] !== null && number(row[key]) === null) throw Error("Invalid FMP earnings amount");
        if (date > observedAt.slice(0, 10) && (row.epsActual != null || row.revenueActual != null)) throw Error("Future earnings cannot be actual results");
        result = { symbol, date, epsActual: number(row.epsActual), epsEstimated: number(row.epsEstimated), revenueActual: number(row.revenueActual), revenueEstimated: number(row.revenueEstimated),
          lastUpdated: calendarDate(row.lastUpdated), currency: typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : null };
      }
    }
    const id = String(result.date ?? symbol);
    if (seen.has(id)) throw Error("Ambiguous duplicate FMP row");
    seen.add(id); return result;
  }).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

/** Server/collector only. Explicit evaluation, fixed origin, no redirects, no automatic retries. */
export function createFmpClient(options: {
  apiKey?: string; enabled: boolean; request?: typeof fetch; now?: () => number;
  reserveRequest: () => Promise<boolean>;
}) {
  let stopped: DataIssue | null = null;
  const request = options.request ?? fetch, now = options.now ?? Date.now;
  return async (dataset: CompanyDataset, rawSymbol: string): Promise<CompanyObservation> => {
    const symbol = rawSymbol.trim().toUpperCase(), attemptedAt = new Date(now()).toISOString();
    if (!/^[A-Z0-9][A-Z0-9.-]{0,29}$/.test(symbol) || symbol.includes("..")) throw Error("Invalid company symbol");
    const failure = (issue: DataIssue): CompanyObservation => ({ status: "failed", attemptedAt, receivedAt: null, rows: [], issue, completeness: "unverified" });
    if (!options.enabled) return failure("disabled");
    if (!options.apiKey?.trim()) return failure("missing-key");
    if (stopped) return failure(stopped);
    if (!await options.reserveRequest()) return failure("request-budget");
    const url = new URL("https://financialmodelingprep.com/stable/" + endpoints[dataset]);
    url.searchParams.set("symbol", symbol); url.searchParams.set("apikey", options.apiKey.trim());
    // The actual free account explicitly allows limit 0–5. Do not depend on an
    // omitted limit returning more rows than that stated evaluation allowance.
    const windowSize = dataset === "dividends" || dataset === "earnings" ? 5 : undefined;
    if (windowSize) url.searchParams.set("limit", String(windowSize));
    try {
      const response = await request(url, { signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store" });
      if (!response.ok) {
        const issue: DataIssue = response.status === 429 ? "rate-limited" : [401, 402, 403].includes(response.status) ? "access-denied" : "request-failed";
        if (response.status === 401 || response.status === 429) stopped = issue;
        await response.body?.cancel(); return failure(issue);
      }
      if (Number(response.headers.get("content-length")) > 8_000_000 || !response.body) { await response.body?.cancel(); return failure("invalid-response"); }
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength; if (size > 8_000_000) return failure("invalid-response"); chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let rows: CompanyRow[];
      try { rows = normalizeFmp(dataset, symbol, JSON.parse(new TextDecoder().decode(bytes)), attemptedAt); }
      catch { return failure("invalid-response"); }
      if (windowSize && rows.length > windowSize) return failure("invalid-response");
      return { status: rows.length ? "received" : "empty-unverified", attemptedAt, receivedAt: new Date(now()).toISOString(), rows, issue: null, completeness: "unverified", ...(windowSize ? { windowSize } : {}) };
    } catch { return failure("request-failed"); } // Do not expose URLs, credentials, or upstream bodies.
  };
}
