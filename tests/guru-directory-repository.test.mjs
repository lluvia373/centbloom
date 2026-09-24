import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTypescript } from './load-typescript.mjs';

const registry = JSON.parse(readFileSync('src/features/gurus/registry.json', 'utf8'));
const empty = { schemaVersion: 1, generatedAt: null, summaries: [], pending: [], managers: {} };
const { resolvePreparedDirectory } = loadTypescript('src/features/gurus/directory-repository.ts', {
  './prepared-directory.json': { default: empty }, './registry.json': { default: registry },
});
const identity = registry.find(entry => entry.slug === 'pershing-square');
const accession = '0001172661-25-003509';
const hash = 'a'.repeat(64);
const baseSummary = { slug: identity.slug, name: 'Untrusted label', manager: 'Untrusted person', aliases: ['Untrusted alias'],
  period: '2025-06-30', valueUsd: 1000, holdingsCount: 2, topHoldings: [{ name: 'ISSUER A', valueUsd: 600 }, { name: 'ISSUER B', valueUsd: 400 }], limitedScope: false, pendingCorrection: false };
const baseManager = { ...identity, activeAccession: accession, sourceState: { checkedAt: '2026-09-24T00:00:00Z', issue: null, pendingPeriods: [] },
  versions: [{ accession, period: '2025-06-30', kind: 'original', revision: 0, filedDate: '2025-08-14', hash,
    path: `/data/gurus/${identity.slug}/${accession}-${hash}.json` }] };
const snapshot = () => structuredClone({ ...empty, generatedAt: '2026-09-24T00:00:00Z', summaries: [baseSummary], managers: { [identity.slug]: baseManager } });

test('empty or invalid directory schemas preserve honest coverage without inventing portfolios', () => {
  for (const input of [null, [], {}, empty, { ...empty, schemaVersion: 2 }, { ...empty, summaries: 'invalid' }, { ...empty, managers: [] }]) {
    const result = resolvePreparedDirectory(input);
    assert.equal(result.summaries.length, 0);
    assert.equal(result.pending.length, registry.length);
    assert.ok(result.pending.every(row => typeof row.reason === 'string'));
  }
});

test('valid summaries use registered CIK identity and project only client display fields', () => {
  const input = snapshot();
  input.summaries[0].archive = { holdings: Array(1000).fill({ unused: true }) };
  input.managers[identity.slug].internal = 'not public';
  const result = resolvePreparedDirectory(input);
  assert.equal(result.summaries.length, 1);
  assert.equal(result.summaries[0].name, identity.name);
  assert.equal(result.summaries[0].manager, identity.manager);
  assert.deepEqual(Array.from(result.summaries[0].aliases), identity.aliases);
  assert.equal('archive' in result.summaries[0], false);
  assert.equal('internal' in result.managers[identity.slug], false);
  assert.equal('mappingEvidence' in result.managers[identity.slug], false);
  assert.equal(result.pending.length, registry.length - 1);
  assert.ok(!result.pending.some(row => row.slug === identity.slug));
  assert.equal(JSON.stringify(input.summaries[0].archive).length > 1000, true, 'input is never mutated');
});

test('invalid financial summaries fail closed while other prepared identity metadata remains usable', () => {
  for (const mutate of [
    row => { row.valueUsd = -1; }, row => { row.valueUsd = NaN; }, row => { row.holdingsCount = 1.5; },
    row => { row.period = '2025-03-31'; }, row => { row.topHoldings[0].valueUsd = 1001; },
    row => { row.topHoldings.push(...row.topHoldings); }, row => { row.topHoldings[1].name = row.topHoldings[0].name; },
    row => { delete row.limitedScope; }, row => { row.pendingCorrection = true; },
  ]) {
    const input = snapshot(); mutate(input.summaries[0]);
    const result = resolvePreparedDirectory(input);
    assert.equal(result.summaries.length, 0);
    assert.ok(result.managers[identity.slug]);
    assert.ok(result.pending.some(row => row.slug === identity.slug));
  }
  const duplicate = snapshot(); duplicate.summaries.push(duplicate.summaries[0]);
  assert.equal(resolvePreparedDirectory(duplicate).summaries.length, 0);
});

test('mismatched CIK, unsafe asset references and malformed source state cannot activate a manager', () => {
  for (const mutate of [
    row => { row.cik = '0001067983'; }, row => { row.slug = 'berkshire-hathaway'; },
    row => { row.versions[0].path = 'https://untrusted.example/data.json'; },
    row => { row.versions[0].hash = 'b'.repeat(64); }, row => { row.versions[0].kind = 'addition'; },
    row => { row.versions[0].filedDate = '2025-02-30'; }, row => { row.activeAccession = 'missing'; },
    row => { row.versions.push(row.versions[0]); }, row => { row.sourceState.pendingPeriods = ['unknown']; },
  ]) {
    const input = snapshot(); mutate(input.managers[identity.slug]);
    const result = resolvePreparedDirectory(input);
    assert.equal(result.summaries.length, 0);
    assert.equal(result.managers[identity.slug], undefined);
  }
  const correction = snapshot(); correction.summaries[0].pendingCorrection = true;
  correction.managers[identity.slug].sourceState.pendingPeriods = ['2025-06-30'];
  assert.equal(resolvePreparedDirectory(correction).summaries[0].pendingCorrection, true);
});

test('directory imports never pull the full archive or filing validator into the page', () => {
  const page = readFileSync('src/app/gurus/page.tsx', 'utf8');
  assert.match(page, /getPreparedDirectory/);
  assert.doesNotMatch(page, /getGuruCatalog|summarizeGuru|prepared\.json|\/gurus\/repository["']/);
  for (const file of ['src/features/gurus/directory-repository.ts', 'src/features/gurus/list-model.ts']) {
    const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    assert.doesNotMatch(output, /(?:from\s*|import\s*\()["']\.\/(?:model|repository|catalog|prepared\.json)["']/);
  }
});

test('published directory keeps the actual client payload small and excludes version metadata', () => {
  const source = readFileSync('src/features/gurus/prepared-directory.json', 'utf8');
  const input = JSON.parse(source);
  const result = resolvePreparedDirectory(input);
  assert.equal(result.summaries.length, input.summaries.length, 'publisher and reader contract must agree');
  assert.equal(result.summaries.length + result.pending.length, registry.length);
  const props = JSON.stringify({ gurus: result.summaries, pending: result.pending });
  assert.ok(Buffer.byteLength(props) < 128 * 1024, '71 compact cards must not carry the full archive');
  assert.ok(Buffer.byteLength(source) < 1024 * 1024, 'metadata index remains bounded');
  assert.doesNotMatch(source, /"(?:archive|holdings|provenance|mappingEvidence)":/);
  assert.doesNotMatch(props, /"(?:archive|versions|sourceState|provenance|managers|mappingEvidence)":/);
});
