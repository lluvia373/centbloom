import type { MarketChange } from "./market-changes";
import type { MoverQuote } from "./movers-model";
import type { MarketStory } from "./news-model";

/** Public stock research; saved-account selections never belong in this payload. */
export interface WatchedStockReport {
  quote: MoverQuote;
  change: MarketChange | null;
  story: MarketStory | null;
  previous: WatchedSessionSnapshot | null;
  expiresAt: number;
}

/** Last recorded quote in the actual prior trading session; not necessarily its close. */
export interface WatchedSessionSnapshot {
  sessionDate: string;
  price: number;
  changePercent: number;
}
