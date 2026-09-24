// Build-time publication only. The website must not import the collector checkpoint.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile, link, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson, collectionLock, sha256 } from './guru-source-cache.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const MAX_PUBLISHED_FILING_BYTES = 25 * 1024 * 1024;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(resolve(root, 'src/features/gurus')).href)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(url)) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });

function publicFiling(value) {
  const scalar = ['guruId', 'accession', 'period', 'filedDate', 'acceptedAt', 'publicAt', 'source', 'tableSource',
    'kind', 'revision', 'parentAccession', 'expectedRows', 'expectedValueUsd', 'complete'];
  const filing = Object.fromEntries(scalar.map(key => [key, value[key]]));
  if (value.disclosureScope) filing.disclosureScope = { reportType: value.disclosureScope.reportType, confidentialOmitted: value.disclosureScope.confidentialOmitted };
  if (value.sourceNormalization !== undefined) {
    if (value.sourceNormalization !== 'empty-placeholder') throw Error('Unknown filing source normalization; publication stopped');
    filing.sourceNormalization = value.sourceNormalization;
  }
  filing.holdings = value.holdings.map(row => ({ rowId: row.rowId, issuer: row.issuer, shareClass: row.shareClass, cusip: row.cusip,
    valueUsd: row.valueUsd, shares: row.shares, shareType: row.shareType, option: row.option,
    mapping: row.mapping ? { symbol: row.mapping.symbol, source: row.mapping.source, validFrom: row.mapping.validFrom, validThrough: row.mapping.validThrough } : null }));
  return filing;
}
function publicSourceState(value) {
  return {
    checkedAt: typeof value?.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt)) ? value.checkedAt : null,
    // Never expose internal errors, contact addresses, provenance, or raw HTTP metadata.
    issue: value?.issue ? '일부 공시를 확인하지 못해 검증된 공시만 제공합니다.' : null,
    pendingPeriods: [...new Set(Array.isArray(value?.pendingPeriods) ? value.pendingPeriods.filter(period => typeof period === 'string' && /^\d{4}-(03-31|06-30|09-30|12-31)$/.test(period)) : [])],
  };
}
function sourceMatchesCik(source, cik) {
  const url = new URL(source);
  return url.protocol === 'https:' && url.hostname === 'www.sec.gov' && !url.username && !url.password && !url.search && !url.hash
    && url.pathname.startsWith(`/Archives/edgar/data/${Number(cik)}/`);
}
async function immutableAsset(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.pending`;
  await writeFile(temporary, content, { flag: 'wx' });
  try {
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await readFile(path, 'utf8') !== content) throw Error('Existing immutable guru asset is damaged; publication stopped');
    }
  } finally { await unlink(temporary); }
}

/** Explicit public projection; a failed publication never replaces the last directory. */
export async function publishGuruAssets(options = {}) {
  const { ingestFiling } = await import('../src/features/gurus/model.ts');
  const { summarizeGuru } = await import('../src/features/gurus/list-model.ts');
  const { guruCatalog } = await import('../src/features/gurus/catalog.ts');
  const inputPath = options.inputPath ?? resolve(root, 'src/features/gurus/prepared.json');
  const directoryPath = options.directoryPath ?? resolve(root, 'src/features/gurus/prepared-directory.json');
  const publicDirectory = options.publicDirectory ?? resolve(root, 'public');
  const lockPath = options.lockPath ?? resolve(root, 'work/guru-sec/publish.lock');
  const registry = options.registry ?? JSON.parse(await readFile(resolve(root, 'src/features/gurus/registry.json'), 'utf8'));
  const seedCatalog = options.seedCatalog ?? guruCatalog;
  const maximum = options.maxAssetBytes ?? MAX_PUBLISHED_FILING_BYTES;
  if (!Number.isInteger(maximum) || maximum <= 0 || maximum > MAX_PUBLISHED_FILING_BYTES) throw Error('Invalid static asset size limit');
  await mkdir(dirname(lockPath), { recursive: true });
  const unlock = await collectionLock(lockPath);
  try {
    const snapshot = JSON.parse(await readFile(inputPath, 'utf8'));
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.managers)) throw Error('Prepared snapshot schema mismatch; existing publication preserved');
    const identities = new Map();
    for (const identity of registry) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity.slug) || identities.has(identity.slug) || typeof identity.name !== 'string' || typeof identity.manager !== 'string'
        || (identity.status === 'mapped' && !/^\d{10}$/.test(identity.cik))) throw Error('Invalid publication registry');
      identities.set(identity.slug, identity);
    }
    const records = new Map();
    for (const record of snapshot.managers) {
      const identity = identities.get(record.slug);
      if (!identity || identity.status !== 'mapped' || identity.cik !== record.cik || records.has(record.slug) || !Array.isArray(record.archive?.versions)) throw Error('Prepared manager identity mismatch; existing publication preserved');
      if (new Set(record.archive.versions.map(filing => filing.accession)).size !== record.archive.versions.length) throw Error('Duplicate prepared accession; publication stopped');
      records.set(record.slug, record);
    }
    const directory = { schemaVersion: 1, generatedAt: new Date((options.now ?? Date.now)()).toISOString(), summaries: [], pending: [], managers: {} };
    let assets = 0, largestAssetBytes = 0;
    for (const identity of registry) {
      const prepared = records.get(identity.slug), seed = seedCatalog.find(item => item.slug === identity.slug);
      if (seed && seed.cik !== identity.cik) throw Error('Seed reporting identity differs; existing publication preserved');
      const pending = reason => directory.pending.push({ slug: identity.slug, name: identity.name, manager: identity.manager, reason });
      if (identity.status !== 'mapped') { pending(identity.status === 'non-13f' ? '별도 신고자의 보고 범위 확인 중' : '신고자 연결 확인 중'); continue; }
      let archive = { versions: [], activeAccession: null };
      const merged = new Map();
      for (const raw of [...(seed?.archive.versions ?? []), ...(prepared?.archive.versions ?? [])]) {
        const filing = publicFiling(raw), prior = merged.get(filing.accession);
        if (prior) {
          const withoutScope = row => JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'disclosureScope')));
          if (withoutScope(prior) !== withoutScope(filing) || (prior.disclosureScope && JSON.stringify(prior.disclosureScope) !== JSON.stringify(filing.disclosureScope))) throw Error('Conflicting existing accession; publication stopped');
        }
        merged.set(filing.accession, filing);
      }
      for (const filing of [...merged.values()].sort((a, b) => a.period.localeCompare(b.period) || a.revision - b.revision)) {
        if (filing.guruId !== identity.slug || !sourceMatchesCik(filing.source, identity.cik) || !sourceMatchesCik(filing.tableSource, identity.cik)) throw Error('Filing source identity differs; existing publication preserved');
        const next = ingestFiling(archive, filing);
        if (next.error) throw Error(`Invalid filing ${filing.accession}: ${next.error}`);
        archive = next.archive;
      }
      if (prepared?.archive.versions.length) {
        const active = prepared.archive.versions.find(filing => filing.accession === prepared.archive.activeAccession);
        if (!active || prepared.archive.versions.some(filing => filing.period > active.period || (filing.period === active.period && filing.revision > active.revision))) throw Error('Prepared active accession is inconsistent; publication stopped');
      } else if (prepared?.archive.activeAccession) throw Error('Prepared archive has no active filing');
      if (!archive.activeAccession) { pending('공시 검증 중'); continue; }
      const sourceState = publicSourceState(prepared?.sourceState);
      const manager = { slug: identity.slug, name: identity.name, manager: identity.manager, cik: identity.cik,
        aliases: Array.isArray(identity.aliases) ? identity.aliases.filter(value => typeof value === 'string') : [], sourceState, activeAccession: archive.activeAccession, versions: [] };
      for (const filing of archive.versions) {
        const content = JSON.stringify(filing), bytes = Buffer.byteLength(content);
        if (bytes >= maximum) throw Error(`Filing ${filing.accession} exceeds the static asset limit; existing publication preserved`);
        const hash = sha256(content), path = `/data/gurus/${identity.slug}/${filing.accession}-${hash}.json`;
        await immutableAsset(resolve(publicDirectory, path.slice(1)), content);
        manager.versions.push({ accession: filing.accession, period: filing.period, kind: filing.kind, revision: filing.revision, filedDate: filing.filedDate, path, hash });
        assets++; largestAssetBytes = Math.max(largestAssetBytes, bytes);
      }
      directory.managers[identity.slug] = manager;
      directory.summaries.push(summarizeGuru(manager, archive.versions.find(filing => filing.accession === archive.activeAccession)));
    }
    await mkdir(dirname(directoryPath), { recursive: true });
    await atomicJson(directoryPath, directory);
    return { managers: directory.summaries.length, pending: directory.pending.length, assets, largestAssetBytes, directoryBytes: Buffer.byteLength(JSON.stringify(directory, null, 2) + '\n') };
  } finally { await unlock(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishGuruAssets().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
