import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const registry=JSON.parse(readFileSync('src/features/gurus/registry.json','utf8'));
const { resolveGuruCatalog } = loadTypescript('src/features/gurus/repository.ts', { './prepared.json': {default: {schemaVersion:1,managers:[]}}, './registry.json':{default:registry} });
const { guruCatalog } = loadTypescript('src/features/gurus/catalog.ts');
const record = {...structuredClone(guruCatalog[0]), sourceState:{checkedAt:'2026-09-24T00:00:00Z',issue:null}};

test('prepared source is validated and refresh failure does not erase the last good portfolio',()=>{
  const snapshot={schemaVersion:1,managers:[record]};
  assert.equal(resolveGuruCatalog(snapshot)[0].sourceState.checkedAt,record.sourceState.checkedAt);
  const failed=structuredClone(snapshot); failed.managers[0].sourceState.issue='수집 제한';
  assert.equal(resolveGuruCatalog(failed)[0].archive.activeAccession,record.archive.activeAccession);
  assert.equal(resolveGuruCatalog(failed)[0].sourceState.issue,'수집 제한');
  for(const corrupt of [null, {schemaVersion:2,managers:[record]}, {schemaVersion:1,managers:[{...record,archive:{...record.archive,activeAccession:'invalid'}}]}, {schemaVersion:1,managers:[{...record,archive:{...record.archive,versions:[{}]}}]}]) {
    const result=resolveGuruCatalog(corrupt);
    assert.equal(result[0].archive.activeAccession,record.archive.activeAccession);
    assert.equal(result[0].sourceState.checkedAt,null);
  }
});

test('older valid prepared subset cannot roll back the verified active quarter or erase history',()=>{
  const older=structuredClone(record);older.archive.versions=older.archive.versions.slice(0,1);older.archive.activeAccession=older.archive.versions[0].accession;
  const result=resolveGuruCatalog({schemaVersion:1,managers:[older]})[0];
  assert.equal(result.archive.activeAccession,record.archive.activeAccession);
  assert.equal(result.archive.versions.length,record.archive.versions.length);
});

test('a changed reporting entity cannot borrow the same slug or mix source records',()=>{
 for(const mutate of [row=>{row.cik='0001067983'},row=>{row.archive.versions[1].source=row.archive.versions[1].source.replace('/1336528/','/1067983/')},row=>{row.slug='not-in-registry';row.archive.versions.forEach(filing=>filing.guruId=row.slug)}]){
   const incoming=structuredClone(record);mutate(incoming);
   const result=resolveGuruCatalog({schemaVersion:1,managers:[incoming]});
   assert.equal(result.length,1);assert.equal(result[0].cik,record.cik);
   assert.equal(result[0].sourceState.checkedAt,null);
 }
});

test('verified disclosure metadata may enrich historical positions but cannot change their content',()=>{
  const incoming=structuredClone(record);
  incoming.archive.versions.at(-1).disclosureScope={reportType:'holdings',confidentialOmitted:true};
  assert.equal(resolveGuruCatalog({schemaVersion:1,managers:[incoming]})[0].archive.versions.at(-1).disclosureScope.confidentialOmitted,true);
  incoming.archive.versions.at(-1).holdings[0].issuer='Conflict';
  assert.equal(resolveGuruCatalog({schemaVersion:1,managers:[incoming]})[0].archive.versions.at(-1).disclosureScope,undefined);
});

test('committed prepared sources reconcile and preserve source hashes without fabricating public times',()=>{
 const snapshot=JSON.parse(readFileSync('src/features/gurus/prepared.json','utf8'));
 const visible=resolveGuruCatalog(snapshot);
 for(const manager of snapshot.managers){
   if(!manager.archive.activeAccession)continue;
   assert.equal(visible.find(g=>g.slug===manager.slug)?.archive.activeAccession,manager.archive.activeAccession);
   for(const filing of manager.archive.versions){
     assert.equal(filing.publicAt,null);
     assert.equal(filing.holdings.reduce((sum,row)=>sum+row.valueUsd,0),filing.expectedValueUsd);
     const source=manager.provenance.find(item=>item.accession===filing.accession);
     assert.match(source.coverSha256,/^[a-f0-9]{64}$/);assert.match(source.tableSha256,/^[a-f0-9]{64}$/);
   }
 }
});

test('published filing assets preserve every verified position, source normalization and manifest hash',()=>{
 const snapshot=JSON.parse(readFileSync('src/features/gurus/prepared.json','utf8'));
 const directory=JSON.parse(readFileSync('src/features/gurus/prepared-directory.json','utf8'));
 const {validateFiling}=loadTypescript('src/features/gurus/model.ts');
 const {summarizeGuru}=loadTypescript('src/features/gurus/list-model.ts');
 const expected=resolveGuruCatalog(snapshot);
 const scalar=['guruId','accession','period','filedDate','acceptedAt','publicAt','source','tableSource','kind','revision','parentAccession','expectedRows','expectedValueUsd','complete','sourceNormalization'];
 let checked=0;
 assert.equal(directory.summaries.length,expected.length);
 assert.equal(directory.summaries.length+directory.pending.length,registry.length);
 for(const manager of Object.values(directory.managers)){
   const original=expected.find(guru=>guru.slug===manager.slug);
   assert.ok(original,manager.slug);assert.equal(manager.cik,original.cik);
   assert.equal(manager.versions.length,original.archive.versions.length);
   for(const version of manager.versions){
     assert.equal(version.path,`/data/gurus/${manager.slug}/${version.accession}-${version.hash}.json`);
     const bytes=readFileSync(`public${version.path}`);
     assert.equal(createHash('sha256').update(bytes).digest('hex'),version.hash,version.accession);
     const filing=JSON.parse(bytes),verified=original.archive.versions.find(row=>row.accession===version.accession);
     assert.ok(verified,version.accession);assert.equal(validateFiling(filing),null,version.accession);
     for(const key of scalar)assert.equal(filing[key],verified[key],`${version.accession}: ${key}`);
     assert.equal(JSON.stringify(filing.disclosureScope),JSON.stringify(verified.disclosureScope),`${version.accession}: disclosure scope`);
     assert.equal(JSON.stringify(filing.holdings),JSON.stringify(verified.holdings),`${version.accession}: every position`);
     assert.equal(filing.holdings.length,filing.expectedRows);
     assert.equal(filing.holdings.reduce((sum,row)=>sum+row.valueUsd,0),filing.expectedValueUsd);
     assert.equal(filing.publicAt,null);
     checked++;
   }
   const active=original.archive.versions.find(filing=>filing.accession===manager.activeAccession);
   const summary=summarizeGuru(manager,active);
   assert.equal(JSON.stringify(directory.summaries.find(row=>row.slug===manager.slug)),JSON.stringify(summary),`${manager.slug}: directory summary`);
 }
 assert.equal(checked,expected.reduce((sum,guru)=>sum+guru.archive.versions.length,0));
});
