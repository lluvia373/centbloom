export type MarketId = "US" | "KR" | "JP" | "HK" | "CN";
export interface TradingWindow { start: number; end: number; auction?: boolean; }
export interface DayOverride { reason: string; windows?: TradingWindow[]; }
export interface ExchangeCalendar {
  id: MarketId;
  name: string;
  exchange: string;
  timeZone: string;
  validFrom: string;
  validThrough: string;
  holidays: Record<string, string>;
  overrides: Record<string, DayOverride>;
  windows: TradingWindow[];
  sources: { label: string; url: string }[];
}
