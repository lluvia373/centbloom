import korea from "./prepared-korea.json";
import foreign from "./prepared-foreign.json";
import etf from "./prepared-etf.json";
import type { PreparedDividends } from "./sec";
import type { DividendFeed } from "./types";

/** Legacy Apple source is adapted explicitly; other issuers never inherit US tax. */
export function appleDividendFeed(source: PreparedDividends): DividendFeed {
  return {
    version: 1, checkedAt: source.checkedAt, sourceCheckedAt: source.sourceCheckedAt,
    events: source.events.map(event => ({ ...event, issuerCountry: "US", instrument: "ordinary-share", treatyEligible: true })),
    symbols: [{ symbol: "AAPL", status: "supported", from: "2026-01-01",
      through: source.sourceCheckedAt.slice(0, 10), checkedAt: source.sourceCheckedAt, sourceUrl: source.sourcePolicyUrl }],
  };
}

/** Combines independent public sources once, never per account or portfolio. */
export function combineDividendFeeds(...sources: DividendFeed[]): DividendFeed {
  const events = new Map<string, DividendFeed["events"][number]>();
  const symbols = new Map<string, DividendFeed["symbols"][number]>();
  for (const source of sources) {
    if (source.version !== 1 || (source.sourceCheckedAt !== null && !Number.isFinite(Date.parse(source.sourceCheckedAt)))) throw Error("Invalid prepared dividend source");
    for (const coverage of source.symbols) {
      if (symbols.has(coverage.symbol)) throw Error("Overlapping dividend source coverage");
      symbols.set(coverage.symbol, coverage);
    }
    for (const event of source.events) {
      const prior = events.get(event.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(event)) throw Error("Conflicting prepared dividend event");
      if (!source.symbols.some(item => item.symbol === event.symbol && item.status !== "no-announcement")) throw Error("Dividend has no source coverage");
      events.set(event.id, event);
    }
  }
  return { version: 1, checkedAt: sources.map(source => source.checkedAt).sort().at(-1)!,
    sourceCheckedAt: sources.flatMap(source => source.sourceCheckedAt ? [source.sourceCheckedAt] : []).sort()[0] ?? null,
    events: [...events.values()], symbols: [...symbols.values()] };
}

export const dividendFeed = combineDividendFeeds(korea as DividendFeed, foreign as DividendFeed, etf as DividendFeed);
