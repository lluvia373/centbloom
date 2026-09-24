/** Estimated withholding, not a final tax return or a confirmed brokerage deposit. */
export function dividendWithholding(input: {
  residence: "KR" | "unknown";
  account: "general" | "tax-advantaged" | "unknown";
  issuerCountry: "KR" | "US" | "unknown";
  instrument: "ordinary-share" | "other";
  distribution: "ordinary-cash" | "other";
  treatyEligible: boolean;
}) {
  if (input.residence !== "KR" || input.account !== "general" ||
      input.instrument !== "ordinary-share" || input.distribution !== "ordinary-cash") return null;
  if (input.issuerCountry === "KR") return {
    rate: 0.154, sourceUrl: "https://securities.miraeasset.com/hki/hki3032/n50.do",
  };
  if (input.issuerCountry === "US" && input.treatyEligible) return {
    rate: 0.15, sourceUrl: "https://securities.miraeasset.com/imf/600/imf301.do",
  };
  // A ticker suffix, exchange or payment currency is not the issuer's tax domicile.
  return null;
}
