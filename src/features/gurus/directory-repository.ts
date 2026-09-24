import prepared from "./prepared-directory.json";
import registry from "./registry.json";
import type { GuruSummary } from "./list-model";

export interface GuruPending { slug: string; name: string; manager: string; reason: string }
export interface GuruManifestVersion {
  accession: string;
  period: string;
  kind: "original" | "restatement";
  revision: number;
  filedDate: string;
  path: string;
  hash: string;
}
export interface GuruManifestManager {
  slug: string;
  name: string;
  manager: string;
  cik: string;
  aliases: string[];
  sourceState: { checkedAt: string | null; issue: string | null; pendingPeriods: string[] };
  activeAccession: string;
  versions: GuruManifestVersion[];
}
export interface GuruPreparedDirectory {
  schemaVersion: 1;
  generatedAt: string | null;
  summaries: GuruSummary[];
  pending: GuruPending[];
  managers: Record<string, GuruManifestManager>;
}

const identities = new Map(registry.map(entry => [entry.slug, entry]));
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum = 300): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const day = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const period = (value: unknown): value is string => day(value) && /^\d{4}-(03-31|06-30|09-30|12-31)$/.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

function parseVersion(value: unknown, slug: string): GuruManifestVersion | null {
  if (!isRecord(value) || typeof value.accession !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(value.accession)
    || !period(value.period) || !day(value.filedDate) || value.filedDate < value.period
    || !count(value.revision) || (value.kind !== "original" && value.kind !== "restatement")
    || (value.kind === "original" ? value.revision !== 0 : value.revision === 0)
    || typeof value.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.hash)
    || value.path !== `/data/gurus/${slug}/${value.accession}-${value.hash}.json`) return null;
  return { accession: value.accession, period: value.period, kind: value.kind, revision: value.revision,
    filedDate: value.filedDate, path: value.path, hash: value.hash };
}

function parseManager(value: unknown, slug: string): GuruManifestManager | null {
  const identity = identities.get(slug);
  if (!identity || identity.status !== "mapped" || !identity.cik || !isRecord(value)
    || value.slug !== slug || value.cik !== identity.cik || !text(value.activeAccession)
    || !Array.isArray(value.versions) || !value.versions.length || value.versions.length > 256
    || !isRecord(value.sourceState)) return null;
  const state = value.sourceState;
  if ((state.checkedAt !== null && !timestamp(state.checkedAt)) || (state.issue !== null && !text(state.issue, 1000))
    || !Array.isArray(state.pendingPeriods) || state.pendingPeriods.length > 256 || !state.pendingPeriods.every(period)) return null;
  const versions: GuruManifestVersion[] = [];
  const accessions = new Set<string>();
  for (const input of value.versions) {
    const version = parseVersion(input, slug);
    if (!version || accessions.has(version.accession)) return null;
    accessions.add(version.accession);
    versions.push(version);
  }
  if (!accessions.has(value.activeAccession)) return null;
  return { slug, name: identity.name, manager: identity.manager, cik: identity.cik, aliases: [...identity.aliases],
    activeAccession: value.activeAccession, versions,
    sourceState: { checkedAt: state.checkedAt, issue: state.issue, pendingPeriods: [...new Set(state.pendingPeriods)] } };
}

function parseSummary(value: unknown, managers: Record<string, GuruManifestManager>): GuruSummary | null {
  if (!isRecord(value) || !text(value.slug) || !Object.hasOwn(managers, value.slug)) return null;
  const manager = managers[value.slug];
  const active = manager.versions.find(version => version.accession === manager.activeAccession)!;
  if (value.period !== active.period || !count(value.valueUsd) || !count(value.holdingsCount)
    || typeof value.limitedScope !== "boolean" || typeof value.pendingCorrection !== "boolean"
    || value.pendingCorrection !== manager.sourceState.pendingPeriods.includes(active.period)
    || !Array.isArray(value.topHoldings) || value.topHoldings.length > 3 || value.topHoldings.length > value.holdingsCount) return null;
  const topHoldings: GuruSummary["topHoldings"] = [];
  const names = new Set<string>();
  let total = 0;
  for (const holding of value.topHoldings) {
    if (!isRecord(holding) || !text(holding.name) || names.has(holding.name) || !count(holding.valueUsd)) return null;
    names.add(holding.name);
    total += holding.valueUsd;
    topHoldings.push({ name: holding.name, valueUsd: holding.valueUsd });
  }
  if (!Number.isSafeInteger(total) || total > value.valueUsd) return null;
  return { slug: manager.slug, name: manager.name, manager: manager.manager, aliases: [...manager.aliases],
    period: active.period, valueUsd: value.valueUsd, holdingsCount: value.holdingsCount, topHoldings,
    limitedScope: value.limitedScope, pendingCorrection: value.pendingCorrection };
}

const pendingReason = (entry: typeof registry[number]) => entry.status === "non-13f"
  ? "별도 신고자의 보고 범위 확인 중" : entry.cik === null ? "신고자 연결 확인 중" : "공시 검증 중";

/** Read only the published index; neither the historical archive nor its validator is loaded here. */
export function resolvePreparedDirectory(snapshot: unknown): GuruPreparedDirectory {
  const result: GuruPreparedDirectory = { schemaVersion: 1, generatedAt: null, summaries: [], pending: [], managers: {} };
  if (isRecord(snapshot) && snapshot.schemaVersion === 1 && Array.isArray(snapshot.summaries)
    && snapshot.summaries.length <= registry.length && Array.isArray(snapshot.pending) && snapshot.pending.length <= registry.length
    && isRecord(snapshot.managers) && Object.keys(snapshot.managers).length <= registry.length) {
    result.generatedAt = timestamp(snapshot.generatedAt) ? snapshot.generatedAt : null;
    for (const [slug, input] of Object.entries(snapshot.managers)) {
      const manager = parseManager(input, slug);
      if (manager) result.managers[slug] = manager;
    }
    const duplicateSlugs = new Set<string>();
    const seenSlugs = new Set<string>();
    for (const input of snapshot.summaries) {
      if (isRecord(input) && typeof input.slug === "string") {
        if (seenSlugs.has(input.slug)) duplicateSlugs.add(input.slug);
        seenSlugs.add(input.slug);
      }
    }
    for (const input of snapshot.summaries) {
      const summary = parseSummary(input, result.managers);
      if (summary && !duplicateSlugs.has(summary.slug)) result.summaries.push(summary);
    }
  }
  // Invalid or missing summaries remain visible as coverage gaps, never as empty portfolios.
  const ready = new Set(result.summaries.map(summary => summary.slug));
  result.pending = registry.filter(entry => !ready.has(entry.slug)).map(entry => ({
    slug: entry.slug, name: entry.name, manager: entry.manager, reason: pendingReason(entry),
  }));
  return result;
}

let directorySnapshot: GuruPreparedDirectory | undefined;
export function getPreparedDirectory(): GuruPreparedDirectory {
  return directorySnapshot ??= resolvePreparedDirectory(prepared);
}
