export type MarketId = "US" | "KR" | "JP" | "HK" | "CN" | "CA" | "TW" | "SG" | "VN" | "AU" | "GB" | "DE" | "FR" | "NL" | "BE" | "PT" | "IE" | "IT" | "NO" | "ES" | "SE" | "FI" | "DK" | "CH";
export interface TradingWindow { start: number; end: number; auction?: boolean; }
export interface DayOverride { reason: string; windows?: TradingWindow[]; }
export interface ExchangeCalendar {
  id: MarketId;
  name: string;
  region: "미주" | "아시아" | "유럽" | "오세아니아";
  exchange: string;
  timeZone: string;
  validFrom: string;
  validThrough: string;
  holidays: Record<string, string>;
  overrides: Record<string, DayOverride>;
  windows: TradingWindow[];
  sources: { label: string; url: string }[];
}
