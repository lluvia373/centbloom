// Original image sources and hashes: public/companies/sources.json.
const COMPANY_LOGOS: Record<string, string> = {
  AAPL: "aapl.png", MSFT: "msft.png", NVDA: "nvda.png", AMZN: "amzn.png",
  "005930.KS": "005930-ks.ico", "000660.KS": "000660-ks.ico", "035420.KS": "035420-ks.ico",
  "7203.T": "7203-t.png", "6758.T": "6758-t.ico", "7974.T": "7974-t.png",
  "0700.HK": "0700-hk.png", "9988.HK": "9988-hk.ico", "1810.HK": "1810-hk.png",
  "600519.SS": "600519-ss.ico", "300750.SZ": "300750-sz.svg",
};

export function companyLogo(symbol: string, providerUrl?: string): string | null {
  const local = COMPANY_LOGOS[symbol.toUpperCase()];
  if (local) return `/companies/${local}`;
  if (providerUrl) {
    try {
      const url = new URL(providerUrl);
      if (url.protocol === "https:" && url.hostname === "s.yimg.com") return url.href;
    } catch { /* A missing or malformed logo leaves the ticker visible. */ }
  }
  return null;
}
