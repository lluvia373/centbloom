import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishGuruAssets, MAX_PUBLISHED_FILING_BYTES } from '../scripts/publish-guru-assets.mjs';
import { sha256 } from '../scripts/guru-source-cache.mjs';
const { guruCatalog } = await import('../src/features/gurus/catalog.ts');

async function harness(t) {
  const directory = await mkdtemp(join(tmpdir(), 'centbloom-guru-publisher-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const guru = structuredClone(guruCatalog[0]);
  const registry = [{ slug: guru.slug, name: guru.name, manager: guru.manager, cik: guru.cik, aliases: ['Ackman'], status: 'mapped' },
    { slug: 'notice-only', name: 'Notice filer', manager: 'Other reporter', cik: '0000000002', status: 'non-13f' }];
  const inputPath = join(directory, 'prepared.json'), directoryPath = join(directory, 'prepared-directory.json');
  const snapshot = { schemaVersion: 1, managers: [{ ...guru, sourceState: { checkedAt: '2026-09-24T00:00:00.000Z', issue: null, pendingPeriods: [] } }] };
  await writeFile(inputPath, JSON.stringify(snapshot));
  await writeFile(directoryPath, '{"previousPublication":true}');
  const options = { inputPath, directoryPath, publicDirectory: join(directory, 'public'), lockPath: join(directory, 'publish.lock'), registry, seedCatalog: [], now: () => Date.parse('2026-09-24') };
  return { options, snapshot, save: () => writeFile(inputPath, JSON.stringify(snapshot)), read: async () => JSON.parse(await readFile(directoryPath, 'utf8')),
    asset: path => join(options.publicDirectory, path.slice(1)) };
}

test('publisher emits compact immutable filing assets and a small directory without internal or contact fields', async t => {
  const state = await harness(t), manager = state.snapshot.managers[0];
  state.snapshot.operatorEmail = 'private@secret.example';
  manager.provenance = [{ contact: 'private@secret.example', coverSha256: 'private-source-hash' }];
  manager.sourceState.issue = 'Internal fetch failed for private@secret.example';
  manager.archive.versions[0].internalContact = 'private@secret.example';
  manager.archive.versions[0].holdings[0].internalContact = 'private@secret.example';
  await state.save();
  const result = await publishGuruAssets(state.options), directory = await state.read();
  assert.equal(result.managers, 1); assert.equal(result.pending, 1); assert.equal(result.assets, 2);
  assert.equal(result.directoryBytes, (await stat(state.options.directoryPath)).size);
  assert.ok(!JSON.stringify(directory).includes('holdings"')); assert.ok(!JSON.stringify(directory).includes('secret.example'));
  assert.equal(directory.pending[0].reason, '별도 신고자의 보고 범위 확인 중');
  const summary = directory.summaries[0], manifest = directory.managers['pershing-square'];
  assert.equal(summary.valueUsd, manager.archive.versions.at(-1).expectedValueUsd); assert.equal(summary.topHoldings.length, 3);
  assert.equal(summary.period, manifest.versions.find(filing => filing.accession === manifest.activeAccession).period);
  for (const version of manifest.versions) {
    const content = await readFile(state.asset(version.path), 'utf8');
    assert.equal(sha256(content), version.hash); assert.ok(version.path.endsWith(`-${version.hash}.json`));
    assert.ok(!content.includes('\n')); assert.ok(!content.includes('secret.example')); assert.ok(!content.includes('provenance'));
    assert.equal(JSON.parse(content).accession, version.accession); assert.ok(Buffer.byteLength(content) < MAX_PUBLISHED_FILING_BYTES);
  }
});

test('publisher reuses an identical asset and preserves older immutable assets when a new hash is published', async t => {
  const state = await harness(t); await publishGuruAssets(state.options);
  const before = await state.read(), version = before.managers['pershing-square'].versions[0], path = state.asset(version.path), initial = await stat(path);
  await publishGuruAssets(state.options); assert.equal((await stat(path)).mtimeMs, initial.mtimeMs);
  state.snapshot.managers[0].archive.versions[0].holdings[0].shares += 1; await state.save();
  await publishGuruAssets(state.options);
  const after = await state.read(); assert.notEqual(after.managers['pershing-square'].versions[0].hash, version.hash);
  assert.equal((await stat(path)).mtimeMs, initial.mtimeMs);
});

test('invalid holdings, active identifiers, reporting identities or duplicate accessions never replace the directory', async t => {
  for (const mutate of [
    manager => { manager.archive.versions[0].holdings[0].valueUsd++; },
    manager => { manager.archive.activeAccession = 'missing'; },
    manager => { manager.cik = '0000000002'; },
    manager => { manager.archive.versions[0].source = manager.archive.versions[0].source.replace('/1336528/', '/2/'); },
    manager => { manager.archive.versions.push(structuredClone(manager.archive.versions[0])); },
  ]) {
    const state = await harness(t); mutate(state.snapshot.managers[0]); await state.save();
    await assert.rejects(publishGuruAssets(state.options)); assert.deepEqual(await state.read(), { previousPublication: true });
  }
});

test('an oversized or damaged immutable asset fails closed and leaves the previous directory intact', async t => {
  assert.equal(MAX_PUBLISHED_FILING_BYTES, 25 * 1024 * 1024);
  const limited = await harness(t);
  await assert.rejects(publishGuruAssets({ ...limited.options, maxAssetBytes: 1000 }), /asset limit/);
  assert.deepEqual(await limited.read(), { previousPublication: true });
  const state = await harness(t); await publishGuruAssets(state.options);
  const before = await state.read(), version = before.managers['pershing-square'].versions[0];
  await writeFile(state.asset(version.path), 'damaged');
  await assert.rejects(publishGuruAssets(state.options), /immutable guru asset is damaged/);
  assert.deepEqual(await state.read(), before);
});

test('a verified seed preserves history absent from a prepared subset without replacing enriched disclosure scope', async t => {
  const state = await harness(t), manager = state.snapshot.managers[0];
  state.options.seedCatalog = structuredClone(state.snapshot.managers);
  manager.archive.versions = manager.archive.versions.slice(0, 1); manager.archive.activeAccession = manager.archive.versions[0].accession;
  manager.archive.versions[0].disclosureScope = { reportType: 'holdings', confidentialOmitted: true }; await state.save();
  await publishGuruAssets(state.options); const directory = await state.read();
  assert.equal(directory.managers['pershing-square'].versions.length, 2);
  assert.equal(directory.summaries[0].period, '2025-06-30');
  const first = directory.managers['pershing-square'].versions[0];
  assert.equal(JSON.parse(await readFile(state.asset(first.path), 'utf8')).disclosureScope.confidentialOmitted, true);
});

test('empty-placeholder normalization is preserved only for a valid empty report', async t => {
  const state = await harness(t), filing = state.snapshot.managers[0].archive.versions[0];
  filing.sourceNormalization = 'empty-placeholder'; filing.expectedRows = 0; filing.expectedValueUsd = 0; filing.holdings = [];
  await state.save(); await publishGuruAssets(state.options);
  const before = await state.read(), version = before.managers['pershing-square'].versions[0];
  assert.equal(JSON.parse(await readFile(state.asset(version.path), 'utf8')).sourceNormalization, 'empty-placeholder');
  for (const [normalization, value] of [['unverified', 0], ['empty-placeholder', 1]]) {
    filing.sourceNormalization = normalization; filing.expectedValueUsd = value; await state.save();
    await assert.rejects(publishGuruAssets(state.options)); assert.deepEqual(await state.read(), before);
  }
});
