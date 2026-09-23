import { calendars, getLastMarketClose, getMarketSession } from "./schedule";
import type { MarketSession } from "./schedule/session";
import type { MarketId } from "./schedule/types";
import { tickerInstruments } from "./ticker-instruments";

// Keep countries and instruments in their existing relative order, never by returns.
const stockMarkets = [
  { id: "US", label: "미국", symbols: ["^GSPC", "^IXIC", "^NDX", "^DJI", "^RUT", "^SOX"] },
  { id: "KR", label: "한국", symbols: ["^KS11", "^KQ11"] },
  { id: "JP", label: "일본", symbols: ["^N225"] },
  { id: "HK", label: "홍콩", symbols: ["^HSI"] },
  { id: "CN", label: "중국", symbols: ["000001.SS"] },
  { id: "DE", label: "독일", symbols: ["^GDAXI"] },
  { id: "GB", label: "영국", symbols: ["^FTSE"] },
] satisfies { id: MarketId; label: string; symbols: string[] }[];

export interface MarketOverviewGroup {
  id: MarketId | "REFERENCE";
  label: string;
  instruments: typeof tickerInstruments;
  state?: MarketSession;
  lastClosedAt?: number;
}
export interface MarketOverview {
  mode: "open" | "recent-close" | "default";
  featuredTitle: string;
  featured: MarketOverviewGroup[];
  remaining: MarketOverviewGroup[];
}
export interface MarketPanelItem {
  instrument: (typeof tickerInstruments)[number];
  group: MarketOverviewGroup;
}
export interface MarketPanelTab {
  id: "featured" | "us" | "asia" | "europe" | "reference";
  label: string;
  items: MarketPanelItem[];
}
export interface MarketPanelPage {
  items: MarketPanelItem[];
  page: number;
  pageCount: number;
}

const panelRegions = [
  { id: "us", label: "미국", markets: ["US"] },
  { id: "asia", label: "아시아", markets: ["KR", "JP", "HK", "CN"] },
  { id: "europe", label: "유럽", markets: ["DE", "GB"] },
  { id: "reference", label: "기타", markets: ["REFERENCE"] },
] satisfies { id: Exclude<MarketPanelTab["id"], "featured">; label: string; markets: MarketOverviewGroup["id"][] }[];

function getPanelItems(groups: MarketOverviewGroup[]): MarketPanelItem[] {
  const seen = new Set<string>();
  return groups.flatMap(group => group.instruments.flatMap(instrument => {
    if (seen.has(instrument.symbol)) return [];
    seen.add(instrument.symbol);
    return [{ instrument, group }];
  }));
}

/** Featured follows the schedule; regional tabs retain their original country and instrument order. */
export function getMarketPanelTabs(overview: MarketOverview): MarketPanelTab[] {
  const groups = [...overview.featured, ...overview.remaining];
  const featuredLabel = { open: "장중", "recent-close": "최근 마감", default: "대표" }[overview.mode];
  return [
    { id: "featured", label: featuredLabel, items: getPanelItems(overview.featured) },
    ...panelRegions.map(({ id, label, markets }) => ({
      id, label,
      items: getPanelItems(markets.flatMap(market => groups.filter(group => group.id === market))),
    })),
  ];
}

/** Page indices are zero-based, with at most two instruments per page. */
export function getMarketPanelPage(tab: MarketPanelTab, page: number): MarketPanelPage {
  const pageCount = Math.max(1, Math.ceil(tab.items.length / 2));
  const currentPage = Math.min(pageCount - 1, Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0));
  return { items: tab.items.slice(currentPage * 2, currentPage * 2 + 2), page: currentPage, pageCount };
}

/** Calendar priority only. Quote availability, age and failures remain the quote consumer's responsibility. */
export function getMarketOverview(now: number): MarketOverview {
  const mapped = new Set(stockMarkets.flatMap(market => market.symbols));
  const groups: MarketOverviewGroup[] = stockMarkets.map(({ id, label, symbols }) => {
    const calendar = calendars.find(calendar => calendar.id === id)!;
    return {
      id, label,
      instruments: tickerInstruments.filter(instrument => symbols.includes(instrument.symbol)),
      state: getMarketSession(calendar, now),
      lastClosedAt: getLastMarketClose(calendar, now),
    };
  });
  // VIX, the cross-market Euro Stoxx index, yields, DXY and FX do not inherit a cash-equity calendar.
  groups.push({ id: "REFERENCE", label: "참고 지표", instruments: tickerInstruments.filter(instrument => !mapped.has(instrument.symbol)) });

  let mode: MarketOverview["mode"] = "open";
  let featuredTitle = "현재 장중";
  let featured = groups.filter(group => group.state?.status === "open");
  if (!featured.length) {
    const lastClosedAt = groups.some(group => group.state?.status === "unknown") ? -Infinity
      : Math.max(...groups.map(group => group.lastClosedAt ?? -Infinity));
    if (Number.isFinite(lastClosedAt)) {
      mode = "recent-close";
      featuredTitle = "최근 마감";
      featured = groups.filter(group => group.lastClosedAt === lastClosedAt);
    } else {
      mode = "default";
      featuredTitle = "기본 대표 지수";
      featured = groups.filter(group => group.id === "US");
    }
  }
  const featuredIds = new Set(featured.map(group => group.id));
  return { mode, featuredTitle, featured, remaining: groups.filter(group => !featuredIds.has(group.id)) };
}
