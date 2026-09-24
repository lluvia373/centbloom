import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync('src/features/gurus/registry.json', 'utf8'));
// Public directory identifiers checked on 2026-09-24; no holdings or rankings copied.
const referenceProfiles = `warren-buffett cathie-wood himalaya-capital ray-dalio bill-ackman charlie-munger
situational-awareness michael-burry blackrock ken-fisher ken-griffin primecap-management baillie-gifford
first-eagle-investments jim-simons ron-baron-funds steven-cohen chris-hohn jeremy-grantham joel-greenblatt
tom-russo ako-capital pzena-investment viking-global-investors bill-gates sands-capital tiger-global
tudor-investment chris-davis tom-gayner charles-brandes terry-smith polen-capital steve-mandel chuck-royce
al-gore jefferies-financial-group mario-gabelli carl-icahn john-rogers yacktman george-soros pat-dorsey
david-tepper jeffrey-ubben chuck-akre seth-klarman david-abrams altarock-partners broad-run glenn-greenberg
stanley-druckenmiller daniel-loeb howard-marks prem-watsa john-paulson david-einhorn cliff-sosin bruce-berkowitz
tweedy-browne ensemble-capital third-avenue-management guy-spier bill-miller mohnish-pabrai robert-bruce
julian-robertson jim-chanos michael-price makaira-partners melvin-capital`.split(/\s+/);

test('guru registry represents every checked directory profile exactly once and preserves existing routes', () => {
  assert.equal(registry.length, 71);
  assert.equal(new Set(registry.map(row => row.slug)).size, registry.length);
  assert.deepEqual(registry.map(row => row.referenceUrl).sort(), referenceProfiles.map(slug => `https://stockcircle.com/portfolio/${slug}`).sort());
  assert.equal(registry.find(row => row.slug === 'pershing-square').cik, '0001336528');
  assert.equal(registry.find(row => row.slug === 'berkshire-hathaway').cik, '0001067983');
});

test('directory identity separates the reporting entity from searchable Korean and English person aliases', () => {
  for (const row of registry) {
    assert.match(row.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(row.name.trim()); assert.ok(row.manager.trim());
    assert.ok(row.aliases.includes(row.manager));
    assert.ok(row.aliases.some(alias => /[가-힣]/.test(alias)));
    assert.equal(new Set(row.aliases).size, row.aliases.length);
    assert.ok(row.aliases.every(alias => typeof alias === 'string' && alias.trim()));
    assert.equal(Object.hasOwn(row, 'holdings'), false);
    assert.equal(Object.hasOwn(row, 'popularity'), false);
    assert.equal(Object.hasOwn(row, 'followers'), false);
    assert.equal(Object.hasOwn(row, 'performance'), false);
  }
  assert.equal(registry.find(row => row.slug === 'pershing-square').name, 'Pershing Square');
  assert.equal(registry.find(row => row.slug === 'pershing-square').manager, 'Bill Ackman');
});

test('SEC-backed identities distinguish 70 collectible mappings from one holdings-free notice', () => {
  const mapped = registry.filter(row => row.status === 'mapped');
  assert.equal(mapped.length, 70);
  assert.equal(new Set(registry.map(row => row.cik)).size, registry.length);
  for (const row of registry) {
    assert.match(row.cik, /^\d{10}$/);
    assert.equal(row.secSource, `https://data.sec.gov/submissions/CIK${row.cik}.json`);
    assert.equal(row.reportingEntity, row.mappingEvidence.filerName);
    assert.match(row.mappingEvidence.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    const evidence = new URL(row.mappingEvidence.url);
    assert.equal(evidence.protocol, 'https:');
    assert.ok(['www.sec.gov', 'data.sec.gov'].includes(evidence.hostname));
    if (evidence.pathname.includes('/full-index/')) assert.match(row.mappingEvidence.accession, /^\d{10}-\d{2}-\d{6}$/);
    else if (evidence.hostname === 'data.sec.gov') assert.equal(row.mappingEvidence.url, row.secSource);
    else assert.ok(evidence.pathname.startsWith(`/Archives/edgar/data/${Number(row.cik)}/`));
  }
  const excluded = registry.filter(row => row.status !== 'mapped');
  assert.deepEqual(excluded.map(row => row.slug), ['mfp-investors']);
  assert.equal(excluded[0].status, 'non-13f');
  assert.ok(excluded[0].reason.trim());
});

test('Aquamarine uses the company-backed Guy Spier filer and MFP does not adopt another reporter', () => {
  const aquamarine = registry.find(row => row.slug === 'aquamarine');
  assert.equal(aquamarine.status, 'mapped');
  assert.equal(aquamarine.cik, '0001953324');
  assert.equal(aquamarine.reportingEntity, 'Aquamarine Zurich AG');
  assert.equal(aquamarine.mappingEvidence.accession, '0001953324-26-000003');
  assert.equal(aquamarine.mappingEvidence.identityUrl, 'https://www.prnewswire.com/news-releases/aquamarine-zurich-ag-appoints-new-chairman-and-new-board-member-301317423.html');
  const mfp = registry.find(row => row.slug === 'mfp-investors');
  assert.equal(mfp.cik, '0001105685');
  assert.equal(mfp.reportingEntity, 'MFP INVESTORS LLC');
  assert.equal(mfp.status, 'non-13f');
  assert.equal(mfp.mappingEvidence.accession, '0001105685-24-000001');
  assert.match(mfp.reason, /13F-NT.*0001930102.*자동 연결하지/);
  assert.match(mfp.mappingEvidence.note, /과거 원본.*별도 범위 검증/);
});

test('separate filers and historical labels are not silently presented as one current personal portfolio', () => {
  assert.match(registry.find(row => row.slug === 'pershing-square').mappingEvidence.note, /0002026053/);
  assert.match(registry.find(row => row.slug === 'greenlight-capital').mappingEvidence.note, /0001489933/);
  assert.match(registry.find(row => row.slug === 'scion-asset-management').mappingEvidence.note, /2025-09-30/);
  for (const slug of ['daily-journal', 'renaissance-technologies', 'bridgewater', 'valueact', 'tiger-management'])
    assert.match(registry.find(row => row.slug === slug).mappingEvidence.note, /현재 운용 담당자나 개인 전체 자산/);
});
