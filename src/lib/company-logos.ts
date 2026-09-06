// Original image sources and hashes: public/companies/sources.json.
const COMPANY_LOGOS: Record<string, string> = {
  AAPL: "aapl.png", MSFT: "msft.png", NVDA: "nvda.png", AMZN: "amzn.png",
  "005930.KS": "005930-ks.ico", "000660.KS": "000660-ks.ico", "035420.KS": "035420-ks.ico",
  "7203.T": "7203-t.png", "6758.T": "6758-t.ico", "7974.T": "7974-t.png",
  "0700.HK": "0700-hk.png", "9988.HK": "9988-hk.ico", "1810.HK": "1810-hk.png",
  "600519.SS": "600519-ss.ico", "300750.SZ": "300750-sz.svg",
};

// Direct CDN delivery: free use requires the visible attribution in RootLayout.
// Keep exchange suffixes intact: stripping .KS/.T/.HK can identify another company.
export function companyLogoSources(symbol: string, providerUrl?: string): string[] {
  const sources: string[] = [];
  const normalized = symbol.trim().toUpperCase();
  if (Object.hasOwn(COMPANY_LOGOS, normalized)) {
    sources.push(`/companies/${COMPANY_LOGOS[normalized]}`);
  }
  if (providerUrl) {
    try {
      const url = new URL(providerUrl);
      if (url.protocol === "https:" && url.hostname === "s.yimg.com" &&
          !url.username && !url.password && !url.port) sources.push(url.href);
    } catch { /* Invalid provider URLs do not prevent the next source. */ }
  }
  // Stock/ETF identifiers only. FX, indices and futures must not become company logos.
  if (/^[A-Z0-9][A-Z0-9.-]{0,39}$/.test(normalized)) {
    sources.push(`https://api.elbstream.com/logos/symbol/${encodeURIComponent(normalized)}?format=png&size=64`);
  }
  return sources;
}
