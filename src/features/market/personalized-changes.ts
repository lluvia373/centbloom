import type { ResearchedMarketChange } from "./change-research";
import { selectMarketChanges, type ChangeKind } from "./market-changes";
import type { WatchedStockReport } from "./watched-report";

/** Public stock facts can be shared; account choices only change this browser's ordering. */
export function mergeWatchedChanges(publicItems: ResearchedMarketChange[], symbols: string[], reports: Record<string, WatchedStockReport>) {
  const merged = new Map(publicItems.map(item => [item.quote.symbol, item]));
  for (const symbol of symbols) {
    const report = reports[symbol];
    if (!report) continue;
    const prior = merged.get(symbol);
    if (prior && Date.parse(prior.quote.quotedAt ?? "") > Date.parse(report.quote.quotedAt ?? "")) continue;
    // A newer quiet observation must retire an older anomaly for the same stock.
    merged.delete(symbol);
    if (report.change && report.story) merged.set(symbol, { ...report.change, story: report.story });
  }
  return [...merged.values()];
}

/** Two watched candidates followed by one public discovery when both are available. */
export function selectPersonalizedChanges(items: ResearchedMarketChange[], symbols: string[], kind?: ChangeKind, limit = 9) {
  const watched = new Set(symbols);
  if (!watched.size) return selectMarketChanges(items, kind, limit);
  const personal = selectMarketChanges(items.filter(item => watched.has(item.quote.symbol)), kind, limit);
  const discovery = selectMarketChanges(items.filter(item => !watched.has(item.quote.symbol)), kind, limit);
  const result: ResearchedMarketChange[] = [];
  while (result.length < limit && (personal.length || discovery.length)) {
    for (let count = 0; count < 2 && result.length < limit && personal.length; count++) result.push(personal.shift()!);
    if (result.length < limit && discovery.length) result.push(discovery.shift()!);
  }
  return result;
}
