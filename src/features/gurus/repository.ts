import { guruCatalog } from "./catalog";
import { ingestFiling, type FilingArchive, type GuruFiling } from "./model";
import registry from "./registry.json";

export interface GuruRecord {
  slug: string;
  name: string;
  manager: string;
  cik: string;
  aliases?: string[];
  archive: FilingArchive;
  sourceState: { checkedAt: string | null; issue: string | null; pendingPeriods?: string[] };
}

/** Offline archive reconciliation; web routes use the lightweight directory and per-filing assets. */
export function resolveGuruCatalog(snapshot: unknown): GuruRecord[] {
  const result: GuruRecord[] = guruCatalog.map(guru => ({ ...guru, sourceState: { checkedAt: null, issue: null } }));
  if (!snapshot || typeof snapshot !== "object" || !("schemaVersion" in snapshot) || snapshot.schemaVersion !== 1
    || !("managers" in snapshot) || !Array.isArray(snapshot.managers)) return result;
  for (const item of snapshot.managers) {
    if (!item || typeof item !== "object" || !/^[a-z0-9-]+$/.test(item.slug) || !/^\d{10}$/.test(item.cik)
      || typeof item.name !== "string" || typeof item.manager !== "string" || !Array.isArray(item.archive?.versions)) continue;
    const registered = registry.find(entry => entry.slug === item.slug);
    if (!registered || registered.cik !== item.cik || registered.status !== "mapped") continue;
    try {
      let archive: FilingArchive = { versions: [], activeAccession: null };
      for (const filing of item.archive.versions as GuruFiling[]) {
        const sourcePrefix = `https://www.sec.gov/Archives/edgar/data/${Number(item.cik)}/`;
        if (filing.guruId !== item.slug || !filing.source?.startsWith(sourcePrefix) || !filing.tableSource?.startsWith(sourcePrefix)) throw Error("Mismatched manager");
        const next = ingestFiling(archive, filing);
        if (next.error) throw Error(next.error);
        archive = next.archive;
      }
      if (!archive.activeAccession || archive.activeAccession !== item.archive.activeAccession) continue;
      const existing = result.find(guru => guru.slug === item.slug);
      if (existing) {
        if (existing.cik !== item.cik) continue;
        let merged = existing.archive;
        for (const filing of archive.versions) {
          const original = merged.versions.find(row => row.accession === filing.accession);
          if (original && !original.disclosureScope && filing.disclosureScope) {
            // Verified source may clarify disclosure scope without rewriting original positions.
            const withoutScope = (value: GuruFiling) => JSON.stringify(Object.entries(value).filter(([key]) => key !== "disclosureScope"));
            if (withoutScope(original) !== withoutScope(filing)) throw Error("Original report conflict");
            merged = { ...merged, versions: merged.versions.map(row => row.accession === filing.accession ? filing : row) };
            continue;
          }
          const next = ingestFiling(merged, filing);
          if (next.error) throw Error(next.error);
          merged = next.archive;
        }
        archive = merged;
      }
      const sourceState = {
        checkedAt: typeof item.sourceState?.checkedAt === "string" && Number.isFinite(Date.parse(item.sourceState.checkedAt)) ? item.sourceState.checkedAt : null,
        issue: typeof item.sourceState?.issue === "string" ? item.sourceState.issue : null,
        pendingPeriods: Array.isArray(item.sourceState?.pendingPeriods) ? item.sourceState.pendingPeriods.filter((period: unknown) => typeof period === "string" && /^\d{4}-(03-31|06-30|09-30|12-31)$/.test(period)) : [],
      };
      const record = { slug: item.slug, name: item.name, manager: item.manager, cik: item.cik, archive, sourceState };
      const index = result.findIndex(guru => guru.slug === record.slug);
      if (index < 0) result.push(record); else result[index] = record;
    } catch { /* A damaged prepared file must not replace the independently checked source. */ }
  }
  return result;
}
