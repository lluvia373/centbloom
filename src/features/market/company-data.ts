/** Provider facts shared by every account. No positions, tax estimates or personal totals. */
export type CompanyDataset = "profile" | "quote" | "history" | "dividends" | "earnings";
export const companyDatasets: CompanyDataset[] = ["profile", "quote", "history", "dividends", "earnings"];
export type DataIssue = "missing-key" | "disabled" | "access-denied" | "rate-limited" | "request-budget" | "request-failed" | "invalid-response";
export type CompanyRow = Record<string, string | number | null>;
export interface CompanyObservation {
  status: "received" | "empty-unverified" | "failed";
  attemptedAt: string;
  receivedAt: string | null;
  issue: DataIssue | null;
  rows: CompanyRow[];
  /** An HTTP 200 is not proof of full history, redistribution rights or realtime. */
  completeness: "unverified";
  /** A declared latest-N window is not a full replacement for previously received history. */
  windowSize?: number;
}
export interface CompanySnapshot {
  version: 1;
  provider: "fmp";
  symbol: string;
  updatedAt: string;
  usage: "local-evaluation";
  realtimeVerified: false;
  datasets: Record<CompanyDataset, CompanyObservation>;
}
export function companySymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.-]{0,29}$/.test(symbol) || symbol.includes("..")) throw Error("Invalid company symbol");
  return symbol;
}
/** Disk content is untrusted too: malformed snapshots must not crash a stock page. */
export function isCompanySnapshot(value: unknown, symbol: string): value is CompanySnapshot {
  const record = (item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item);
  const timestamp = (item: unknown) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item) && Number.isFinite(Date.parse(item));
  const day = (item: unknown) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item) &&
    Number.isFinite(Date.parse(item)) && new Date(item).toISOString().slice(0, 10) === item;
  if (!record(value) || value.version !== 1 || value.provider !== "fmp" || value.usage !== "local-evaluation" ||
    value.symbol !== symbol || value.realtimeVerified !== false || !timestamp(value.updatedAt) || !record(value.datasets)) return false;
  const datasets = value.datasets;
  return companyDatasets.every(name => {
    const observation = datasets[name];
    if (!record(observation) || !["received", "empty-unverified", "failed"].includes(String(observation.status)) ||
      observation.completeness !== "unverified" || !timestamp(observation.attemptedAt) ||
      observation.receivedAt !== null && !timestamp(observation.receivedAt) ||
      !Array.isArray(observation.rows) || observation.rows.length > 20_000 ||
      observation.rows.length > 0 && observation.receivedAt === null ||
      observation.status === "received" && observation.rows.length === 0) return false;
    if (observation.windowSize !== undefined && (!Number.isSafeInteger(observation.windowSize) || Number(observation.windowSize) < 1)) return false;
    const seen = new Set();
    return observation.rows.every(row => {
      if (!record(row) || row.symbol !== symbol || Object.values(row).some(item =>
        item !== null && typeof item !== "string" && !(typeof item === "number" && Number.isFinite(item)))) return false;
      const key = name === "quote" || name === "profile" ? symbol : row.date;
      if (seen.has(key) || key !== symbol && !day(key)) return false;
      seen.add(key);
      if (name === "quote") return timestamp(row.quotedAt) && typeof row.price === "number" && row.price > 0;
      if (name === "dividends") return typeof row.amount === "number" && row.amount >= 0 &&
        (row.currency === null || typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency)) &&
        [row.paymentDate, row.recordDate, row.declarationDate].every(item => item === null || day(item));
      if (name === "earnings") return [row.epsActual, row.epsEstimated, row.revenueActual, row.revenueEstimated].every(item =>
        item === null || typeof item === "number") && (row.currency === null || typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency));
      return true;
    });
  });
}
/** Reject ambiguous corrections rather than silently deleting or replacing older facts. */
export function mergeCompanyObservation(previous: CompanyObservation | undefined, next: CompanyObservation, dataset: CompanyDataset): CompanyObservation {
  if (previous && previous.attemptedAt > next.attemptedAt) return previous;
  if (!previous?.rows.length) return next;
  if (next.status !== "received") return { ...next, rows: previous.rows, receivedAt: previous.receivedAt };
  if (dataset === "quote" && String(next.rows[0]?.quotedAt ?? "") < String(previous.rows[0]?.quotedAt ?? ""))
    return { ...next, status: "failed", issue: "invalid-response", rows: previous.rows, receivedAt: previous.receivedAt };
  if (dataset === "history" || dataset === "dividends" || dataset === "earnings") {
    const byDate = new Map(next.rows.map(row => [row.date, row]));
    const recentWindow = (dataset === "dividends" || dataset === "earnings") && next.windowSize === next.rows.length;
    const oldest = next.rows.reduce((date, row) => String(row.date) < date ? String(row.date) : date, "9999-12-31");
    const conflict = previous.rows.some(row => {
      const update = byDate.get(row.date);
      if (!update) return !(recentWindow && String(row.date) < oldest);
      return dataset !== "history" && Object.entries(row).some(([key, value]) =>
        key !== "lastUpdated" && value !== null && update[key] !== value);
    });
    if (conflict) return { ...next, status: "failed", issue: "invalid-response", rows: previous.rows, receivedAt: previous.receivedAt };
    if (recentWindow) return { ...next, rows: [...new Map([...previous.rows, ...next.rows].map(row => [row.date, row])).values()]
      .sort((a, b) => String(b.date).localeCompare(String(a.date))) };
  }
  return next;
}

/** Quality report counts failed refreshes separately from last-good rows retained on disk. */
export function companyCoverage(snapshots: readonly CompanySnapshot[]) {
  return {
    checkedSymbols: snapshots.length,
    allStocksVerified: false,
    realtimeVerified: false,
    datasets: Object.fromEntries(companyDatasets.map(dataset => [dataset, {
      received: snapshots.filter(item => item.datasets[dataset].status === "received").length,
      emptyUnverified: snapshots.filter(item => item.datasets[dataset].status === "empty-unverified").length,
      failed: snapshots.filter(item => item.datasets[dataset].status === "failed").length,
    }])),
  };
}
