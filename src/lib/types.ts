export type TransactionType = "buy" | "sell";
export type DisplayCurrency = "KRW" | "USD";

export interface Transaction {
  id: string;
  symbol: string;
  name: string;
  type: TransactionType;
  date: string;
  quantity: number;
  price: number;
  fee: number;
  currency?: string;
  fxRateToKRW?: number;
  usdKrwRateAtTransaction?: number;
  createdAt: string;
}

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currency?: string;
  costBasisKRW?: number;
  costBasisUSD?: number;
  addedAt: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketCap?: number;
  volume?: number;
  dayHigh?: number;
  dayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  previousClose?: number;
  exchange?: string;
  marketState?: string;
  quotedAt?: string;
  fetchedAt?: string;
  delayMinutes?: number;
  source?: string;
  logoUrl?: string;
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface ChartPoint {
  date: string;
  close: number;
  adjustedClose?: number;
}

export type DividendDataStatus =
  | "confirmed_amount"
  | "confirmed_zero"
  | "unavailable";

export interface DividendEvent {
  date: string;
  amount: number;
}

export interface ChartSeries {
  symbol: string;
  points: ChartPoint[];
  dividendStatus: DividendDataStatus;
  dividends: DividendEvent[];
}

export interface PortfolioPerformancePoint {
  date: string;
  cutoffAt: string;
  assetValueKRW: number;
  twrIndex: number;
  netFlowKRW: number;
  cumulativeNetFlowKRW: number;
  cumulativeProfitKRW: number;
  active: boolean;
  final: boolean;
}

export interface DayOHLC {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  currency: string;
}

export interface HoldingWithQuote extends Holding {
  quote?: StockQuote;
  marketValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPercent: number;
  marketValueKRW: number;
  resolvedCostBasisKRW: number;
  gainLossKRW: number;
  gainLossPercentKRW: number;
  marketValueUSD: number;
  resolvedCostBasisUSD: number;
  gainLossUSD: number;
  gainLossPercentUSD: number;
  displayMarketValue: number;
  displayCostBasis: number;
  displayGainLoss: number;
  displayGainLossPercent: number;
  acquisitionFxRateToKRW?: number;
  currentFxRateToKRW?: number;
  stockPriceImpactKRW: number;
  fxImpactKRW: number;
}

export interface PortfolioSummary {
  baseCurrency: DisplayCurrency;
  totalAssets: number;
  investmentAssets: number;
  cashAssets: number;
  investmentGainLoss: number;
  investmentGainLossPercent: number;
  stockPriceImpactKRW: number;
  fxImpactKRW: number;
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  holdings: HoldingWithQuote[];
}
