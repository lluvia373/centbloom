import type { FxEvidence } from "./fx";
/** Public market data only. Position quantities and account data never enter this response. */
export interface MidnightBaseline {
  symbol: string;
  /** Calendar date in Asia/Seoul. */
  date: string;
  baselineAt: string;
  currency: string | null;
  price: number | null;
  status: "available" | "unavailable";
  /** A minute bar is not an exact second-level trade at midnight. */
  precision: "minute" | "session-close" | "daily-reference" | null;
  source: "yahoo-chart" | "ecb-reference";
  fx?: FxEvidence;
  /** Candle timestamp, or start of the reference's dated interval; not retrieval time. */
  sourceAt: string | null;
  /** Minute/session end; daily reference uses a conservative availability bound, not a quote time. */
  sourceEndAt: string | null;
  /** Midnight minus sourceEndAt. A completed market session can legitimately be older. */
  cutoffLagSeconds: number | null;
  marketClosed: boolean | null;
  fetchedAt: string;
  reason?:
    | "missing-price"
    | "stale-price"
    | "unsupported-resolution"
    | "unknown-session"
    | "missing-currency";
}
