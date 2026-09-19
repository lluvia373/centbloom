import {
  BASE_CURRENCY,
  currencyUnitScale,
  krwToDisplayCurrency,
  normalizeCurrency,
  toKRW,
} from "@/lib/currency";
import { stockDisplayName } from "@/lib/markets";
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
    const currency = h.currency ?? quote?.currency ?? "USD";
    const quoteCurrency = quote?.currency ?? currency;
    const normalizedCurrency = normalizeCurrency(quoteCurrency);
    const normalizedCostCurrency = normalizeCurrency(currency);
    const matchingCurrency = normalizedCurrency === normalizedCostCurrency;
    const fxRate =
      normalizedCurrency === BASE_CURRENCY
        ? 1
        : (fxRatesToKRW[normalizedCurrency] ?? 0);
    const valuationAvailable = !!quote && Number.isFinite(quote.price) && quote.price > 0 &&
      ((displayCurrency === "USD" && normalizedCurrency === "USD") ||
        (Number.isFinite(fxRate) && fxRate > 0 &&
          (displayCurrency === "KRW" || (Number.isFinite(currentUsdKrwRate) && currentUsdKrwRate > 0))));
    const costFxRate = normalizedCostCurrency === BASE_CURRENCY
      ? 1 : (fxRatesToKRW[normalizedCostCurrency] ?? 0);
    const gainAvailable = valuationAvailable && matchingCurrency && (displayCurrency === "KRW"
      ? normalizedCostCurrency === "KRW" || h.costBasisKRW != null
      : normalizedCostCurrency === "USD" || h.costBasisUSD != null);

    const marketValue = quote ? quote.price * h.quantity : 0;
    const costBasis = h.avgCost * h.quantity;
    const marketValueInCostUnits = matchingCurrency
      ? marketValue * currencyUnitScale(quoteCurrency) / currencyUnitScale(currency)
      : 0;
    const gainLoss = matchingCurrency ? marketValueInCostUnits - costBasis : 0;
    const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

    const marketValueKRW =
      fxRate > 0 ? toKRW(marketValue, quoteCurrency, fxRate) : 0;
    const resolvedCostBasisKRW =
      h.costBasisKRW ?? (costFxRate > 0 ? toKRW(costBasis, currency, costFxRate) : 0);
    const gainLossKRW = marketValueKRW - resolvedCostBasisKRW;
    const gainLossPercentKRW =
      resolvedCostBasisKRW > 0 ? (gainLossKRW / resolvedCostBasisKRW) * 100 : 0;

    const nativeCostBasisKRWAtUnitRate = toKRW(costBasis, currency, 1);
    const acquisitionFxRateToKRW =
      matchingCurrency && normalizedCostCurrency !== BASE_CURRENCY && nativeCostBasisKRWAtUnitRate > 0
        ? resolvedCostBasisKRW / nativeCostBasisKRWAtUnitRate
        : undefined;
    const currentFxRateToKRW = fxRate;
    const marketValueAtAcquisitionFxKRW =
      acquisitionFxRateToKRW != null
        ? toKRW(marketValue, quoteCurrency, acquisitionFxRateToKRW)
        : marketValueKRW;
    const stockPriceImpactKRW =
      matchingCurrency ? marketValueAtAcquisitionFxKRW - resolvedCostBasisKRW : 0;
    const fxImpactKRW =
      !matchingCurrency || normalizedCurrency === BASE_CURRENCY
        ? 0
        : marketValueKRW - marketValueAtAcquisitionFxKRW;

    const marketValueUSD = normalizedCurrency === "USD" ? marketValue * currencyUnitScale(quoteCurrency) : krwToDisplayCurrency(
      marketValueKRW,
      "USD",
      currentUsdKrwRate,
    );
    const resolvedCostBasisUSD = normalizedCostCurrency === "USD" ? costBasis * currencyUnitScale(currency) :
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
      name: stockDisplayName(h.symbol, quote?.name, h.name),
      currency,
      quote,
      valuationAvailable,
      gainAvailable,
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
