import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { atomicJson, collectionLock, createSecClient, createSourceCache, sha256 } from './guru-source-cache.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const PARSER_VERSION = 3;
const SUBMISSIONS_TTL = 6 * 60 * 60_000, HISTORY_TTL = 24 * 60 * 60_000, INDEX_TTL = 7 * 24 * 60 * 60_000;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(resolve(root, 'src/features/gurus')).href)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(url)) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });

export function parseCollectorArgs(args) {
  const options = { quarters: 8, resume: false, latestOnly: false, requestsPerSecond: 1 };
  for (const arg of args) {
    if (arg === '--resume') options.resume = true;
    else if (arg === '--latest-only') options.latestOnly = true;
    else if (arg.startsWith('--only=')) options.only = arg.slice(7).split(',');
    else if (arg.startsWith('--quarters=')) options.quarters = Number(arg.slice(11));
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice(8));
    else if (arg.startsWith('--requests-per-second=')) options.requestsPerSecond = Number(arg.slice(22));
    else throw Error(`Unknown collector option: ${arg}`);
  }
  validateOptions(options); return options;
}
function validateOptions({ quarters = 8, only, limit, requestsPerSecond = 1 }) {
  if (!Number.isInteger(quarters) || quarters < 1 || quarters > 120) throw Error('quarters must be an integer from 1 to 120');
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw Error('limit must be a positive manager count');
  if (![1, 2, 3].includes(requestsPerSecond)) throw Error('requests-per-second must be 1, 2 or 3');
  if (only && (!Array.isArray(only) || !only.length || only.some(slug => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))) throw Error('only must contain comma-separated registry slugs');
}
export function requestedPeriods(quarters, time) {
  const date = new Date(time), currentQuarter = Math.floor(date.getUTCMonth() / 3) * 3;
  return Array.from({ length: quarters }, (_, index) => new Date(Date.UTC(date.getUTCFullYear(), currentQuarter - index * 3, 0)).toISOString().slice(0, 10));
}
function validateRegistry(registry) {
  if (!Array.isArray(registry) || !registry.length) throw Error('A non-empty verified manager registry is required');
  const slugs = new Set(), ciks = new Set();
  for (const item of registry) {
    if (!item || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || typeof item.name !== 'string' || !item.name.trim() || typeof item.manager !== 'string' || !item.manager.trim() || slugs.has(item.slug)) throw Error('Invalid or duplicate registry identity');
    if (item.cik !== null && (!/^\d{10}$/.test(item.cik) || Number(item.cik) === 0 || ciks.has(item.cik))) throw Error('Invalid or duplicate registry CIK');
    if (item.cik === null && !['mapping-pending', 'non-13f'].includes(item.status)) throw Error('Unmapped registry identity needs an explicit status');
    slugs.add(item.slug); if (item.cik) ciks.add(item.cik);
  }
}
/** Chunk original rows so large numbers of other institutional forms never hide 13F filings. */
export function discoverAllFilings(submission, cik, cutoff, discoverSecFilings, { latestOnly = false } = {}) {
  let recent = submission.filings?.recent ?? submission;
  const keys = ['accessionNumber', 'form', 'reportDate', 'filingDate', 'acceptanceDateTime', 'primaryDocument'];
  if (!Array.isArray(recent.form) || keys.some(key => !Array.isArray(recent[key]) || recent[key].length !== recent.form.length)) throw Error('SEC submissions columns do not agree');
  if (latestOnly) {
    const reportDates = recent.reportDate.filter((date, index) => ['13F-HR', '13F-HR/A'].includes(recent.form[index]));
    const latest = reportDates.sort().at(-1);
    const indexes = recent.form.flatMap((form, index) => ['13F-HR', '13F-HR/A'].includes(form) && recent.reportDate[index] === latest ? [index] : []);
    recent = Object.fromEntries(keys.map(key => [key, indexes.map(index => recent[key][index])]));
  }
  if (!recent.form.length) return discoverSecFilings({ ...submission, filings: { recent } }, cik, { limit: 200, after: cutoff });
  const found = new Map();
  for (let offset = 0; offset < recent.form.length; offset += 200) {
    const part = { ...submission, filings: { recent: Object.fromEntries(keys.map(key => [key, recent[key].slice(offset, offset + 200)])) } };
    for (const metadata of discoverSecFilings(part, cik, { limit: 200, after: cutoff })) {
      const previous = found.get(metadata.accession);
      if (previous && JSON.stringify(previous) !== JSON.stringify(metadata)) throw Error('Conflicting SEC discovery metadata');
      found.set(metadata.accession, metadata);
    }
  }
  return [...found.values()];
}

export async function prepareGurus(options = {}, services = {}) {
  const { userAgent = process.env.SEC_USER_AGENT, only, quarters = 8, limit, resume = false, latestOnly = false, requestsPerSecond = 1 } = options;
  validateOptions({ only, quarters, limit, requestsPerSecond });
  const { discoverSecFilings, discoverInformationTables, parseSecFiling } = await import('../src/features/gurus/sec.ts');
  const { ingestFiling } = await import('../src/features/gurus/model.ts');
  const { guruCatalog } = await import('../src/features/gurus/catalog.ts');
  const registry = services.registry ?? JSON.parse(await readFile(resolve(root, 'src/features/gurus/registry.json'), 'utf8'));
  validateRegistry(registry);
  if (only?.some(slug => !registry.some(item => item.slug === slug))) throw Error('Unknown manager slug; existing data preserved');
  let managers = registry.filter(item => !only || only.includes(item.slug));
  if (limit !== undefined) managers = managers.slice(0, limit);
  const destination = services.destination ?? resolve(root, 'src/features/gurus/prepared.json'), storage = services.storage ?? resolve(root, 'work/guru-sec');
  const now = services.now ?? Date.now, logger = services.logger ?? console;
  const request = createSecClient(userAgent, { request: services.request, wait: services.wait, now, requestsPerSecond });
  const parserFingerprint = services.parserFingerprint ?? sha256((await Promise.all(['sec.ts', 'model.ts'].map(file => readFile(resolve(root, 'src/features/gurus', file), 'utf8')))).join('\n'));
  const periods = requestedPeriods(quarters, now()), cutoff = periods.at(-1);
  await mkdir(storage, { recursive: true });
  const unlock = await collectionLock(resolve(storage, 'prepare.lock'));
  try {
    const snapshot = JSON.parse(await readFile(destination, 'utf8'));
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.managers)) throw Error('Prepared schema mismatch; existing file preserved');
    const cache = createSourceCache(storage, request, { now });
    const states = new Map(managers.map(item => [item.slug, { slug: item.slug, status: 'pending', requestedQuarters: quarters, availableQuarters: 0, missingPeriods: [...periods] }]));
    let phase = 'latest';
    const coverage = () => ({ phase, requested: managers.length, ready: [...states.values()].filter(state => state.status === 'ready').length,
      failed: [...states.values()].filter(state => state.status === 'failed').length, pending: [...states.values()].filter(state => state.status === 'pending').length,
      quarters, managers: [...states.values()] });
    const checkpoint = async record => {
      if (record) { const index = snapshot.managers.findIndex(item => item.slug === record.slug); if (index < 0) snapshot.managers.push(record); else snapshot.managers[index] = record; }
      snapshot.coverage = coverage(); snapshot.generatedAt = new Date(now()).toISOString();
      try { await atomicJson(destination, snapshot); await services.onCheckpoint?.(structuredClone(snapshot)); }
      catch (error) { error.fatalCollection = true; throw error; }
    };
    if (resume) managers = managers.toSorted((a, b) => Number(Boolean(snapshot.managers.find(item => item.slug === a.slug)?.archive?.activeAccession)) - Number(Boolean(snapshot.managers.find(item => item.slug === b.slug)?.archive?.activeAccession)));
    let stopped = false;
    for (phase of latestOnly ? ['latest'] : ['latest', 'history']) {
      if (phase === 'history') {
        for (const state of states.values()) state.status = 'pending';
        await checkpoint();
      }
      for (const identity of managers) {
        if (stopped) break;
        if (!identity.cik || identity.status !== 'mapped') { states.get(identity.slug).reason = identity.reason ?? identity.status; continue; }
        const previous = snapshot.managers.find(item => item.slug === identity.slug), fallback = (services.seedCatalog ?? guruCatalog).find(item => item.slug === identity.slug);
        if ([previous, fallback].some(record => record?.cik && record.cik !== identity.cik)) throw Error(`Registry CIK changed for ${identity.slug}; existing archive preserved for identity review`);
        let archive = { versions: [], activeAccession: null };
        // A partial prepared file must never erase a valid bundled historical filing.
        const preserved = new Map([...(fallback?.archive.versions ?? []), ...(previous?.archive?.versions ?? [])].map(filing => [filing.accession, filing]));
        for (const filing of [...preserved.values()].sort((a, b) => a.period.localeCompare(b.period) || a.revision - b.revision)) {
          if ([filing.source, filing.tableSource].some(source => new URL(source).pathname.split('/')[4] !== String(Number(identity.cik)))) throw Error(`Existing archive CIK differs for ${identity.slug}; identity review required`);
          const next = ingestFiling(archive, filing);
          if (next.error || filing.guruId !== identity.slug) throw Error(`Existing archive requires recovery: ${identity.slug}`);
          archive = next.archive;
        }
        const provenance = [...(previous?.provenance ?? [])], submissionsSources = [];
        let issue = null, discoveryAt = null, managerFailed = false, latestPeriod = null;
        const pendingAccessions = new Map((previous?.sourceState?.pendingAccessions ?? []).map(item => [item.accession, item]));
        const pendingPeriods = new Set(previous?.sourceState?.pendingPeriods ?? []), inspectedPeriods = new Set(), failedPeriods = new Set();
        const updateState = status => {
          const available = new Set(archive.versions.map(filing => filing.period));
          states.set(identity.slug, { slug: identity.slug, status, requestedQuarters: quarters, availableQuarters: periods.filter(period => available.has(period)).length,
            missingPeriods: periods.filter(period => !available.has(period)), pendingPeriods: [...pendingPeriods], latestPeriod });
        };
        const makeRecord = () => ({ ...identity, archive, provenance, submissionsSources,
          submissionsSha256: submissionsSources[0]?.sha256 ?? previous?.submissionsSha256 ?? null,
          sourceState: { checkedAt: issue || discoveryAt === null ? previous?.sourceState?.checkedAt ?? null : new Date(discoveryAt).toISOString(), issue,
            pendingPeriods: [...pendingPeriods], pendingAccessions: [...pendingAccessions.values()], coverage: states.get(identity.slug), lastAttemptAt: new Date(now()).toISOString() } });
        try {
          const discoveryCutoff = phase === 'latest' ? '1900-01-01' : cutoff;
          const base = await cache.get(`https://data.sec.gov/submissions/CIK${identity.cik}.json`, { ttl: SUBMISSIONS_TTL });
          const submission = JSON.parse(base.text); discoveryAt = base.fetchedAt;
          submissionsSources.push({ url: base.url, sha256: base.hash, fetchedAt: new Date(base.fetchedAt).toISOString() });
          const discovered = new Map(discoverAllFilings(submission, identity.cik, discoveryCutoff, discoverSecFilings, { latestOnly: phase === 'latest' }).map(item => [item.accession, item]));
          const enough = () => phase === 'latest' ? discovered.size > 0 && [...discovered.values()].some(item => item.reportDate === [...discovered.values()].map(row => row.reportDate).sort().at(-1) && item.form === '13F-HR')
            : periods.every(period => [...discovered.values()].some(item => item.reportDate === period));
          if (!enough()) {
            const files = submission.filings?.files ?? [];
            if (!Array.isArray(files)) throw Error('SEC advertised history list is invalid');
            for (const file of files.toSorted((a, b) => String(b.filingTo).localeCompare(String(a.filingTo)))) {
              if (enough()) break;
              if (!new RegExp(`^CIK${identity.cik}-submissions-\\d+\\.json$`).test(file.name ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(file.filingTo ?? '')) throw Error('SEC advertised history filename is invalid');
              if (file.filingTo < discoveryCutoff) continue;
              const response = await cache.get(`https://data.sec.gov/submissions/${file.name}`, { ttl: HISTORY_TTL });
              submissionsSources.push({ url: response.url, sha256: response.hash, fetchedAt: new Date(response.fetchedAt).toISOString() });
              for (const metadata of discoverAllFilings(JSON.parse(response.text), identity.cik, discoveryCutoff, discoverSecFilings, { latestOnly: phase === 'latest' })) {
                const existing = discovered.get(metadata.accession);
                if (existing && JSON.stringify(existing) !== JSON.stringify(metadata)) throw Error('Conflicting SEC history metadata');
                discovered.set(metadata.accession, metadata);
              }
            }
          }
          if (!discovered.size) throw Error('No filings discovered in the requested range; source coverage unverified');
          latestPeriod = [...discovered.values()].map(item => item.reportDate).sort().at(-1);
          const ordered = [...discovered.values()].filter(item => phase !== 'latest' || item.reportDate === latestPeriod)
            .sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.acceptanceDateTime.localeCompare(b.acceptanceDateTime));
          issue = '요청한 공시 확인이 아직 끝나지 않았습니다.'; updateState('pending'); await checkpoint(makeRecord());
          for (const metadata of ordered) {
            inspectedPeriods.add(metadata.reportDate);
            try {
              const known = archive.versions.find(filing => filing.accession === metadata.accession), proof = provenance.find(item => item.accession === metadata.accession);
              let coverXml = await cache.raw(proof?.coverSha256), informationXml = await cache.raw(proof?.tableSha256);
              if (known?.disclosureScope && proof?.parserVersion === PARSER_VERSION && proof.parserFingerprint === parserFingerprint && coverXml !== null && informationXml !== null) {
                pendingAccessions.delete(metadata.accession); continue;
              }
              coverXml ??= (await cache.get(metadata.primaryDocumentUrl)).text;
              const knownSource = proof?.tableUrl ?? known?.tableSource?.replace(/\/xslForm13F_X0[12]\//, '/');
              const candidates = informationXml !== null && knownSource ? [knownSource]
                : discoverInformationTables(JSON.parse((await cache.get(metadata.directoryIndexUrl, { ttl: INDEX_TTL })).text), metadata);
              const parent = known?.parentAccession ? archive.versions.find(filing => filing.accession === known.parentAccession)
                : archive.versions.filter(filing => filing.period === metadata.reportDate && filing.accession !== metadata.accession && filing.filedDate <= metadata.filingDate).sort((a, b) => b.revision - a.revision)[0];
              let filing, tableUrl, parseError;
              for (const candidate of candidates) {
                const xml = informationXml !== null && candidate === knownSource ? informationXml : (await cache.get(candidate)).text;
                try { filing = parseSecFiling({ guruId: identity.slug, cik: identity.cik, metadata, coverXml, informationXml: xml, informationTableUrl: candidate, parent }); informationXml = xml; tableUrl = candidate; break; }
                catch (error) { parseError = error; }
              }
              if (!filing) throw parseError ?? Error('No verified information table');
              let nextArchive;
              if (known) {
                const content = rows => JSON.stringify(rows.map(row => [row.issuer, row.shareClass, row.cusip, row.valueUsd, row.shares, row.shareType, row.option, row.mapping]));
                if (known.expectedValueUsd !== filing.expectedValueUsd || known.expectedRows !== filing.expectedRows || content(known.holdings) !== content(filing.holdings)) throw Error('Existing accession content conflict');
                if (known.disclosureScope && JSON.stringify(known.disclosureScope) !== JSON.stringify(filing.disclosureScope)) throw Error('Existing accession disclosure scope conflict');
                nextArchive = { ...archive, versions: archive.versions.map(row => row.accession === known.accession ? { ...row, disclosureScope: filing.disclosureScope } : row) };
              } else { const next = ingestFiling(archive, filing); if (next.error) throw Error(next.error); nextArchive = next.archive; }
              const source = { accession: filing.accession, coverSha256: await cache.store(coverXml), tableSha256: await cache.store(informationXml), coverUrl: metadata.primaryDocumentUrl, tableUrl,
                firstObservedAt: proof?.firstObservedAt ?? new Date(now()).toISOString(), parserVersion: PARSER_VERSION, parserFingerprint };
              archive = nextArchive;
              const sourceIndex = provenance.findIndex(item => item.accession === filing.accession);
              if (sourceIndex < 0) provenance.push(source); else provenance[sourceIndex] = source;
              pendingAccessions.delete(metadata.accession);
              updateState('pending'); await checkpoint(makeRecord());
            } catch (error) {
              if (error.stopCollection || error.fatalCollection) throw error;
              managerFailed = true; pendingPeriods.add(metadata.reportDate); failedPeriods.add(metadata.reportDate);
              pendingAccessions.set(metadata.accession, { accession: metadata.accession, period: metadata.reportDate, reason: error.message });
              logger.error(`${identity.slug} ${metadata.accession}: ${error.message}`);
            }
          }
          for (const period of inspectedPeriods) {
            if (!failedPeriods.has(period) && ![...pendingAccessions.values()].some(item => item.period === period)) pendingPeriods.delete(period);
          }
          updateState(managerFailed ? 'failed' : 'ready');
          const missing = states.get(identity.slug).missingPeriods;
          issue = managerFailed || pendingPeriods.size ? '일부 공시를 확인하지 못해 검증된 공시만 제공합니다.' : phase === 'history' && missing.length ? '요청한 일부 분기의 공시를 확인하지 못했습니다.' : null;
          if (phase === 'history' && missing.length && !managerFailed) updateState('pending');
        } catch (error) {
          if (error.fatalCollection) throw error;
          stopped = Boolean(error.stopCollection); managerFailed = true;
          for (const period of previous?.sourceState?.pendingPeriods ?? []) pendingPeriods.add(period);
          issue = stopped ? 'SEC 자료 수집이 제한되어 마지막 확인 자료를 유지합니다.' : '일부 공시를 확인하지 못해 마지막 정상 자료를 유지합니다.';
          updateState('failed'); logger.error(`${identity.slug}: ${error.message}`);
        }
        await checkpoint(makeRecord());
        logger.log(`${identity.slug}: ${archive.versions.length} verified filings; ${states.get(identity.slug).availableQuarters}/${quarters} requested quarters; ${phase} ${states.get(identity.slug).status}`);
      }
      if (stopped) break;
    }
    await checkpoint(); return { failures: coverage().failed, stopped, coverage: coverage() };
  } finally { await unlock(); }
}
