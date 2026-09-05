import type {
  DisplayCurrency,
  HoldingWithQuote,
  PortfolioSummary,
  Transaction,
} from "./types";

// Deliberately fictional, isolated fixtures. Never saved to the user's portfolio.
export const DEMO_FX = 1370;
export const ASSET_COLORS = [
  "#276c50",
  "#79a689",
  "#bdcdb2",
  "#d8b66b",
  "#a5b5c9",
  "#d6dfda",
];
const positions = [
  {
    symbol: "AAPL",
    name: "애플",
    quantity: 70,
    price: 228.4,
    cost: 190.4,
    change: 1.28,
    currency: "USD",
  },
  {
    symbol: "NVDA",
    name: "엔비디아",
    quantity: 90,
    price: 142.87,
    cost: 110.2,
    change: 2.34,
    currency: "USD",
  },
  {
    symbol: "MSFT",
    name: "마이크로소프트",
    quantity: 25,
    price: 441.85,
    cost: 402.8,
    change: -0.42,
    currency: "USD",
  },
  {
    symbol: "005930.KS",
    name: "삼성전자",
    quantity: 180,
    price: 72400,
    cost: 68100,
    change: 0.84,
    currency: "KRW",
  },
  {
    symbol: "VOO",
    name: "Vanguard S&P 500 ETF",
    quantity: 15,
    price: 524.6,
    cost: 472.3,
    change: 0.62,
    currency: "USD",
  },
  {
    symbol: "035420.KS",
    name: "NAVER",
    quantity: 30,
    price: 214500,
    cost: 221000,
    change: -1.15,
    currency: "KRW",
  },
];

export function demoSummary(
  displayCurrency: DisplayCurrency,
): PortfolioSummary {
  const holdings: HoldingWithQuote[] = positions.map((p, i) => {
    const fx = p.currency === "KRW" ? 1 : DEMO_FX;
    const acquiredFx = p.currency === "KRW" ? 1 : 1350;
    const marketValue = p.quantity * p.price;
    const costBasis = p.quantity * p.cost;
    const marketValueKRW = marketValue * fx;
    const resolvedCostBasisKRW = costBasis * acquiredFx;
    const gainLossKRW = marketValueKRW - resolvedCostBasisKRW;
    const gainLossUSD =
      marketValue / (p.currency === "USD" ? 1 : DEMO_FX) -
      resolvedCostBasisKRW / 1350;
    const marketValueUSD = marketValueKRW / DEMO_FX;
    const resolvedCostBasisUSD = resolvedCostBasisKRW / 1350;
    return {
      id: `sample-${i}`,
      symbol: p.symbol,
      name: p.name,
      quantity: p.quantity,
      avgCost: p.cost,
      currency: p.currency,
      addedAt: "2026-03-09T00:00:00.000Z",
      quote: {
        symbol: p.symbol,
        name: p.name,
        price: p.price,
        change: p.price - p.price / (1 + p.change / 100),
        changePercent: p.change,
        currency: p.currency,
      },
      marketValue,
      costBasis,
      gainLoss: marketValue - costBasis,
      gainLossPercent: (marketValue / costBasis - 1) * 100,
      marketValueKRW,
      resolvedCostBasisKRW,
      gainLossKRW,
      gainLossPercentKRW: (gainLossKRW / resolvedCostBasisKRW) * 100,
      marketValueUSD,
      resolvedCostBasisUSD,
      gainLossUSD,
      gainLossPercentUSD: (gainLossUSD / resolvedCostBasisUSD) * 100,
      displayMarketValue:
        displayCurrency === "KRW" ? marketValueKRW : marketValueUSD,
      displayCostBasis:
        displayCurrency === "KRW" ? resolvedCostBasisKRW : resolvedCostBasisUSD,
      displayGainLoss: displayCurrency === "KRW" ? gainLossKRW : gainLossUSD,
      displayGainLossPercent:
        displayCurrency === "KRW"
          ? (gainLossKRW / resolvedCostBasisKRW) * 100
          : (gainLossUSD / resolvedCostBasisUSD) * 100,
      acquisitionFxRateToKRW: acquiredFx,
      currentFxRateToKRW: fx,
      stockPriceImpactKRW: (marketValue - costBasis) * acquiredFx,
      fxImpactKRW: marketValue * (fx - acquiredFx),
    };
  });
  const sum = (
    key:
      | "displayMarketValue"
      | "displayCostBasis"
      | "stockPriceImpactKRW"
      | "fxImpactKRW",
  ) => holdings.reduce((n, h) => n + h[key], 0);
  const totalValue = sum("displayMarketValue");
  const totalCost = sum("displayCostBasis");
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent = (totalGainLoss / totalCost) * 100;
  return {
    baseCurrency: displayCurrency,
    holdings,
    totalAssets: totalValue,
    investmentAssets: totalValue,
    cashAssets: 0,
    investmentGainLoss: totalGainLoss,
    investmentGainLossPercent: totalGainLossPercent,
    stockPriceImpactKRW: sum("stockPriceImpactKRW"),
    fxImpactKRW: sum("fxImpactKRW"),
    totalValue,
    totalCost,
    totalGainLoss,
    totalGainLossPercent,
  };
}

export const DEMO_TRANSACTIONS: Transaction[] = positions.map((p, i) => ({
  id: `sample-${i}`,
  symbol: p.symbol,
  name: p.name,
  type: "buy",
  date: "2026-03-09",
  quantity: p.quantity,
  price: p.cost,
  fee: 0,
  currency: p.currency,
  fxRateToKRW: p.currency === "USD" ? 1350 : 1,
  usdKrwRateAtTransaction: 1350,
  createdAt: "2026-03-09T00:00:00.000Z",
}));

export function demoHistory() {
  const summary = demoSummary("KRW");
  return Array.from({ length: 181 }, (_, i) => {
    const t = i / 180;
    const date = new Date(Date.UTC(2026, 2, 9 + i)).toISOString().slice(0, 10);
    const trend =
      t +
      Math.sin(t * 20) * 0.065 +
      Math.sin(t * 67) * 0.025 +
      Math.cos(t * 131) * 0.018;
    const movement =
      (summary.totalValue - summary.totalCost) *
      (i === 180 ? 1 : i === 0 ? 0 : trend);
    return {
      date,
      value: summary.totalCost + movement,
      cost: summary.totalCost,
      return: (movement / summary.totalCost) * 100,
    };
  });
}
