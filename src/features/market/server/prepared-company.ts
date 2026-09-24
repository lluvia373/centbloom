import { isCompanySnapshot, companySymbol, type CompanySnapshot } from "../company-data";

/** Read pre-collected public company facts only. Never fetch a provider during page rendering. */
export async function readPreparedCompany(rawSymbol: string): Promise<CompanySnapshot | null> {
  // Evaluation data is never included in public assets or served by a production build.
  if (process.env.NODE_ENV !== "development" || process.env.FMP_EVALUATION_ENABLED !== "true") return null;
  try {
    const symbol = companySymbol(rawSymbol);
    const { readFile, stat } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const path = resolve(process.cwd(), "work/company-data/fmp", symbol + ".json");
    if ((await stat(path)).size > 8_000_000) return null;
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isCompanySnapshot(value, symbol)) return null;
    return value;
  } catch { return null; } // Collector coverage.json owns the actionable diagnostic, not a new UI banner.
}
