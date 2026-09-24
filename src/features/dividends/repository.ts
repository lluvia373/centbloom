import { dividendFeed } from "./feed";
import type { DividendFeed } from "./types";

type Entry = { path: string; status: string };
type Manifest = { version: 1; generatedAt: string; symbols: Record<string, Entry> };
const symbolPattern = /^[A-Z0-9][A-Z0-9.^=-]{0,29}$/;
const states = ["supported", "partial", "no-announcement", "unsupported", "failed"];
const day = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function parseDividendManifest(value: unknown): Manifest {
  const data = value as Manifest;
  if (!data || data.version !== 1 || !Number.isFinite(Date.parse(data.generatedAt)) || !data.symbols ||
      typeof data.symbols !== "object" || Array.isArray(data.symbols) || Object.keys(data.symbols).length > 100_000)
    throw Error("Invalid dividend manifest");
  const paths = new Set<string>();
  for (const [symbol, item] of Object.entries(data.symbols)) {
    if (!symbolPattern.test(symbol) || !item || !/^\/data\/dividends\/[a-f0-9]{64}\.json$/.test(item.path) || !states.includes(item.status) || paths.has(item.path))
      throw Error("Invalid dividend asset path");
    paths.add(item.path);
  }
  return data;
}

export function parseCompanyDividendFeed(value: unknown, symbol: string): DividendFeed {
  const feed = value as DividendFeed;
  if (!feed || feed.version !== 1 || !Number.isFinite(Date.parse(feed.checkedAt)) ||
      feed.sourceCheckedAt !== null && !Number.isFinite(Date.parse(feed.sourceCheckedAt)) ||
      !Array.isArray(feed.symbols) || feed.symbols.length !== 1 || feed.symbols[0].symbol !== symbol ||
      !states.includes(feed.symbols[0].status) || !day(feed.symbols[0].from) || !day(feed.symbols[0].through) ||
      !Array.isArray(feed.events) || feed.events.length > 2000) throw Error("Invalid company dividend feed");
  const ids = new Set<string>();
  for (const event of feed.events) {
    if (!event || typeof event.id !== "string" || ids.has(event.id) || event.symbol !== symbol ||
        typeof event.name !== "string" || !event.name || !/^[A-Z]{3}$/.test(event.currency) ||
        ![event.declaredDate, event.recordDate, event.exDate, event.shareHistoryFrom, event.rightsCheckedAt].every(day) ||
        event.paymentDate !== null && !day(event.paymentDate) ||
        event.amountPerShare !== null && (!Number.isFinite(event.amountPerShare) || event.amountPerShare < 0) ||
        !["declared", "cancelled"].includes(event.status) || !["ordinary-cash", "unsupported"].includes(event.entitlement) ||
        !["transaction-compatible", "unverified"].includes(event.shareBasis) ||
        !["KR", "US", "unknown"].includes(event.issuerCountry) || !["ordinary-share", "adr", "other"].includes(event.instrument) ||
        typeof event.treatyEligible !== "boolean" || typeof event.marketTimeZone !== "string" ||
        !/^https:\/\/(?:www\.sec\.gov|dart\.fss\.or\.kr|www\.samsungfund\.com)\//.test(event.sourceUrl))
      throw Error("Invalid company dividend facts");
    if (event.withholding !== null && (!Number.isFinite(event.withholding?.rate) || event.withholding.rate < 0 || event.withholding.rate > 1))
      throw Error("Invalid dividend withholding");
    ids.add(event.id);
  }
  if (feed.events.length && feed.symbols[0].status === "no-announcement") throw Error("Conflicting dividend coverage");
  return feed;
}

/** Public facts only. Shared across screens/accounts; personal results never enter this cache. */
export function createDividendRepository(seed = dividendFeed, request: typeof fetch = fetch, now = Date.now) {
  let snapshot = seed, manifest: Manifest | null = null, observedAt = 0, manifestFlight: Promise<Manifest> | null = null;
  const listeners = new Set<() => void>(), loaded = new Map<string, string>(), applied = new Map<string, string>(), flights = new Map<string, Promise<DividendFeed>>();
  const read = async (path: string) => {
    const response = await request(path, { credentials: "omit", signal: AbortSignal.timeout(8000), cache: "no-cache" });
    if (!response.ok) throw Error("Prepared dividend data unavailable");
    return response.json();
  };
  const getManifest = () => {
    if (manifest && now() - observedAt < 300_000) return Promise.resolve(manifest);
    if (!manifestFlight) manifestFlight = read("/data/dividends/manifest.json").then(parseDividendManifest).then(next => {
      if (manifest && next.generatedAt < manifest.generatedAt) throw Error("Older dividend publication");
      manifest = next; observedAt = now(); return next;
    }).finally(() => { manifestFlight = null; });
    return manifestFlight;
  };
  const load = async (symbols: readonly string[]) => {
    const selected = [...new Set(symbols)].filter(symbol => symbolPattern.test(symbol));
    if (!selected.length) return;
    const index = await getManifest();
    const results = await Promise.allSettled(selected.map(async symbol => {
      const entry = index.symbols[symbol];
      if (!entry || loaded.get(symbol) === entry.path) return null;
      let flight = flights.get(entry.path);
      if (!flight) {
        flight = read(entry.path).then(async value => {
          const bytes = new TextEncoder().encode(JSON.stringify(value));
          const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
          if (entry.path !== `/data/dividends/${hash}.json`) throw Error("Dividend content hash mismatch");
          const feed = parseCompanyDividendFeed(value, symbol);
          if (feed.symbols[0].status !== entry.status) throw Error("Dividend manifest status mismatch");
          return feed;
        }).finally(() => { flights.delete(entry.path); });
        flights.set(entry.path, flight);
      }
      const feed = await flight;
      return { symbol, path: entry.path, feed };
    }));
    let changed = false;
    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const { symbol, path, feed } = result.value;
      if ((applied.get(symbol) ?? "") > index.generatedAt) continue;
      const old = snapshot.symbols.find(row => row.symbol === symbol);
      if (old?.checkedAt && feed.symbols[0].checkedAt && old.checkedAt > feed.symbols[0].checkedAt) continue;
      snapshot = { version: 1, checkedAt: [snapshot.checkedAt, feed.checkedAt].sort().at(-1)!,
        sourceCheckedAt: feed.sourceCheckedAt,
        symbols: [...snapshot.symbols.filter(row => row.symbol !== symbol), ...feed.symbols],
        events: [...snapshot.events.filter(row => row.symbol !== symbol), ...feed.events] };
      loaded.set(symbol, path); applied.set(symbol, index.generatedAt); changed = true;
    }
    if (changed) listeners.forEach(listener => listener());
    if (results.some(result => result.status === "rejected")) throw Error("Some prepared dividends could not be loaded");
  };
  return { load, getSnapshot: () => snapshot, getServerSnapshot: () => seed,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}

export const sharedDividends = createDividendRepository();
