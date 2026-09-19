import type { StockSearchResult } from "./types";

export const MARKETS = [
  { id: "kr", label: "한국", example: "005930.KS", delay: 20 },
  { id: "us", label: "미국", example: "AAPL", delay: null },
  { id: "jp", label: "일본", example: "7203.T", delay: 20 },
  { id: "hk", label: "홍콩", example: "0700.HK", delay: 15 },
  { id: "cn", label: "중국", example: "600519.SS · 000001.SZ", delay: 30 },
] as const;
export type MarketId = (typeof MARKETS)[number]["id"];
export type MarketFilter = MarketId | "all";

// Exchange suffixes identify the listing, not the company's nationality.
export function marketForSymbol(symbol: string): MarketId | "other" {
  const upper = symbol.toUpperCase();
  if (/\.(KS|KQ)$/.test(upper)) return "kr";
  if (upper.endsWith(".T")) return "jp";
  if (upper.endsWith(".HK")) return "hk";
  if (/\.(SS|SZ)$/.test(upper)) return "cn";
  if (/^[A-Z]+(?:-[A-Z])?$/.test(upper)) return "us";
  return "other";
}

export function marketLabel(symbol: string) {
  return MARKETS.find((market) => market.id === marketForSymbol(symbol))?.label ?? "기타 시장";
}

// Yahoo's published delay table, checked 2026-09-06. Its quote metadata can
// report zero even for delayed exchanges, so never advertise those as live.
// https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html
export function knownMarketDelay(symbol: string): number | null {
  return MARKETS.find((market) => market.id === marketForSymbol(symbol))?.delay ?? null;
}

type DiscoveryStock = StockSearchResult & { aliases: string };
export const DISCOVERY_STOCKS: DiscoveryStock[] = [
  { symbol: "005930.KS", name: "Samsung Electronics Co., Ltd.", exchange: "KOSPI", type: "EQUITY", aliases: "삼성전자 SamsungElec" },
  { symbol: "000660.KS", name: "SK hynix Inc.", exchange: "KOSPI", type: "EQUITY", aliases: "SK하이닉스" },
  { symbol: "035420.KS", name: "NAVER Corporation", exchange: "KOSPI", type: "EQUITY", aliases: "네이버" },
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "EQUITY", aliases: "애플" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", type: "EQUITY", aliases: "엔비디아" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", type: "EQUITY", aliases: "마이크로소프트" },
  { symbol: "7203.T", name: "Toyota Motor Corporation", exchange: "Tokyo", type: "EQUITY", aliases: "토요타 トヨタ 도요타" },
  { symbol: "6758.T", name: "Sony Group Corporation", exchange: "Tokyo", type: "EQUITY", aliases: "소니 그룹 ソニー" },
  { symbol: "7974.T", name: "Nintendo Co., Ltd.", exchange: "Tokyo", type: "EQUITY", aliases: "닌텐도 任天堂" },
  { symbol: "0700.HK", name: "Tencent Holdings Limited", exchange: "HKEX", type: "EQUITY", aliases: "텐센트 騰訊 腾讯" },
  { symbol: "9988.HK", name: "Alibaba Group Holding Limited", exchange: "HKEX", type: "EQUITY", aliases: "알리바바 阿里巴巴 BABA-W" },
  { symbol: "1810.HK", name: "Xiaomi Corporation", exchange: "HKEX", type: "EQUITY", aliases: "샤오미 小米" },
  { symbol: "600519.SS", name: "Kweichow Moutai Co., Ltd.", exchange: "Shanghai", type: "EQUITY", aliases: "귀주모태 贵州茅台 구이저우 마오타이" },
  { symbol: "000001.SZ", name: "Ping An Bank Co., Ltd.", exchange: "Shenzhen", type: "EQUITY", aliases: "핑안은행 平安银行 평안은행" },
  { symbol: "300750.SZ", name: "Contemporary Amperex Technology Co., Limited", exchange: "Shenzhen", type: "EQUITY", aliases: "CATL 닝더스다이 宁德时代" },
];

// English long names above were checked against the quote provider on 2026-09-19.
// Resolve display text without rewriting saved transactions or inventing legal names.
export function stockDisplayName(symbol: string, longName?: unknown, fallbackName?: unknown): string {
  const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const fullName = clean(longName);
  if (fullName && fullName.toUpperCase() !== symbol.trim().toUpperCase()) return fullName;
  return DISCOVERY_STOCKS.find((stock) => stock.symbol === symbol.trim().toUpperCase())?.name
    || clean(fallbackName) || symbol;
}

export function matchesStockQuery(query: string, symbol: string, ...names: string[]): boolean {
  const aliases = DISCOVERY_STOCKS.find((stock) => stock.symbol === symbol.toUpperCase())?.aliases ?? "";
  return [symbol, ...names, aliases].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function discoveryStocks(market: MarketFilter) {
  return DISCOVERY_STOCKS.filter((stock) => market === "all" || marketForSymbol(stock.symbol) === market);
}

export function matchingStocks(query: string, market: MarketFilter): StockSearchResult[] {
  return discoveryStocks(market)
    .filter((stock) => matchesStockQuery(query, stock.symbol, stock.name))
    .map(({ symbol, name, exchange, type }) => ({ symbol, name, exchange, type }));
}

export function marketSearchSymbols(query: string, market: MarketFilter): string[] {
  const value = query.trim().toUpperCase();
  if (market === "jp" && /^\d[0-9A-Z]{3}$/.test(value)) return [`${value}.T`];
  if (market === "hk" && /^\d{1,5}$/.test(value)) return [`${Number(value).toString().padStart(4, "0")}.HK`];
  if (/^\d{6}$/.test(value)) {
    if (market === "kr") return [`${value}.KS`, `${value}.KQ`];
    if (market === "cn" && /^[036]/.test(value)) return [`${value}.${value.startsWith("6") ? "SS" : "SZ"}`];
  }
  return [value];
}
