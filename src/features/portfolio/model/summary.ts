import {
  BASE_CURRENCY,
  krwToDisplayCurrency,
  normalizeCurrency,
  toKRW,
} from "@/lib/currency";
import type {
  DisplayCurrency,
  Holding,
  HoldingWithQuote,
  PortfolioSummary,
  StockQuote,
} from "@/lib/types";

export function buildSummary(
  holdings: Holding[],
  quotes: Record<string, StockQuote>,
  fxRatesToKRW: Record<string, number>,
  displayCurrency: DisplayCurrency,
): PortfolioSummary {
  const currentUsdKrwRate = fxRatesToKRW.USD ?? 0;

  const enriched: HoldingWithQuote[] = holdings.map((h) => {
    const quote = quotes[h.symbol];
    const currency = quote?.currency ?? h.currency ?? "USD";
    const normalizedCurrency = normalizeCurrency(currency);
    const fxRate =
      normalizedCurrency === BASE_CURRENCY
        ? 1
        : (fxRatesToKRW[normalizedCurrency] ?? 0);

    const marketValue = quote ? quote.price * h.quantity : 0;
    const costBasis = h.avgCost * h.quantity;
    const gainLoss = marketValue - costBasis;
    const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

    const marketValueKRW =
      fxRate > 0 ? toKRW(marketValue, currency, fxRate) : 0;
    const resolvedCostBasisKRW =
      h.costBasisKRW ?? (fxRate > 0 ? toKRW(costBasis, currency, fxRate) : 0);
    const gainLossKRW = marketValueKRW - resolvedCostBasisKRW;
    const gainLossPercentKRW =
      resolvedCostBasisKRW > 0 ? (gainLossKRW / resolvedCostBasisKRW) * 100 : 0;

    const nativeCostBasisKRWAtUnitRate = toKRW(costBasis, currency, 1);
    const acquisitionFxRateToKRW =
      normalizedCurrency !== BASE_CURRENCY && nativeCostBasisKRWAtUnitRate > 0
        ? resolvedCostBasisKRW / nativeCostBasisKRWAtUnitRate
        : undefined;
    const currentFxRateToKRW = fxRate;
    const marketValueAtAcquisitionFxKRW =
      acquisitionFxRateToKRW != null
        ? toKRW(marketValue, currency, acquisitionFxRateToKRW)
        : marketValueKRW;
    const stockPriceImpactKRW =
      marketValueAtAcquisitionFxKRW - resolvedCostBasisKRW;
    const fxImpactKRW =
      normalizedCurrency === BASE_CURRENCY
        ? 0
        : marketValueKRW - marketValueAtAcquisitionFxKRW;

    const marketValueUSD = krwToDisplayCurrency(
      marketValueKRW,
      "USD",
      currentUsdKrwRate,
    );
    const resolvedCostBasisUSD =
      h.costBasisUSD ??
      krwToDisplayCurrency(resolvedCostBasisKRW, "USD", currentUsdKrwRate);
    const gainLossUSD = marketValueUSD - resolvedCostBasisUSD;
    const gainLossPercentUSD =
      resolvedCostBasisUSD > 0 ? (gainLossUSD / resolvedCostBasisUSD) * 100 : 0;

    const displayMarketValue =
      displayCurrency === "KRW" ? marketValueKRW : marketValueUSD;
    const displayCostBasis =
      displayCurrency === "KRW" ? resolvedCostBasisKRW : resolvedCostBasisUSD;
    const displayGainLoss =
      displayCurrency === "KRW" ? gainLossKRW : gainLossUSD;
    const displayGainLossPercent =
      displayCurrency === "KRW" ? gainLossPercentKRW : gainLossPercentUSD;

    return {
      ...h,
      currency,
      quote,
      marketValue,
      costBasis,
      gainLoss,
      gainLossPercent,
      marketValueKRW,
      resolvedCostBasisKRW,
      gainLossKRW,
      gainLossPercentKRW,
      marketValueUSD,
      resolvedCostBasisUSD,
      gainLossUSD,
      gainLossPercentUSD,
      displayMarketValue,
      displayCostBasis,
      displayGainLoss,
      displayGainLossPercent,
      acquisitionFxRateToKRW,
      currentFxRateToKRW,
      stockPriceImpactKRW,
      fxImpactKRW,
    };
  });

  const totalValue = enriched.reduce((s, h) => s + h.displayMarketValue, 0);
  const totalCost = enriched.reduce((s, h) => s + h.displayCostBasis, 0);
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent =
    totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const stockPriceImpactKRW = enriched.reduce(
    (sum, holding) => sum + holding.stockPriceImpactKRW,
    0,
  );
  const fxImpactKRW = enriched.reduce(
    (sum, holding) => sum + holding.fxImpactKRW,
    0,
  );

  return {
    baseCurrency: displayCurrency,
    totalAssets: totalValue,
    investmentAssets: totalValue,
    cashAssets: 0,
    investmentGainLoss: totalGainLoss,
    investmentGainLossPercent: totalGainLossPercent,
    stockPriceImpactKRW,
    fxImpactKRW,
    totalValue,
    totalCost,
    totalGainLoss,
    totalGainLossPercent,
    holdings: enriched,
  };
}
