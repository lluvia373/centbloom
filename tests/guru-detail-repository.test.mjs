import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadTypescript } from './load-typescript.mjs';

const directory=JSON.parse(readFileSync('src/features/gurus/prepared-directory.json','utf8'));
const {readVerifiedFiling,getGuruDetail}=loadTypescript('src/features/gurus/detail-repository.ts',{
 './directory-repository':{getPreparedDirectory:()=>directory},
 '@opennextjs/cloudflare':{getCloudflareContext:()=>{throw Error('unmocked asset binding')}},
});
const readAsset=async path=>readFileSync(`public${path}`,'utf8');
const manager=directory.managers['berkshire-hathaway'];
const active=manager.versions.find(row=>row.accession===manager.activeAccession);

test('detail reads only the selected and closest preceding quarter, never other funds',async()=>{
 const reads=[];
 const detail=await getGuruDetail(manager.slug,undefined,async path=>{reads.push(path);return readAsset(path)});
 assert.equal(reads.length,2);assert.ok(reads.every(path=>path.startsWith(`/data/gurus/${manager.slug}/`)));
 assert.equal(detail.filing.accession,active.accession);
 assert.ok(detail.previous.period<detail.filing.period);
 const earliest=[...manager.versions].sort((a,b)=>a.period.localeCompare(b.period)||b.revision-a.revision)[0];
 reads.length=0;
 const old=await getGuruDetail(manager.slug,earliest.accession,async path=>{reads.push(path);return readAsset(path)});
 assert.equal(reads.length,1);assert.equal(old.previous,undefined);
 assert.equal(await getGuruDetail('unknown',undefined,readAsset),null);
 assert.equal(await getGuruDetail(manager.slug,'unknown',readAsset),null);
});

test('asset path, content hash, reporting owner and filing metadata cannot be substituted',async()=>{
 const raw=await readAsset(active.path);
 assert.equal((await readVerifiedFiling(manager,active,async()=>raw)).accession,active.accession);
 await assert.rejects(readVerifiedFiling(manager,{...active,path:'/data/../secret'},async()=>raw),/경로/);
 await assert.rejects(readVerifiedFiling(manager,active,async()=>`${raw} `),/원본 확인/);
 for(const mutate of [filing=>{filing.guruId='pershing-square'},filing=>{filing.source=filing.source.replace('/1067983/','/1336528/')},filing=>{filing.period='2000-03-31'},filing=>{filing.holdings[0].valueUsd+=1}]){
  const filing=JSON.parse(raw);mutate(filing);const changed=JSON.stringify(filing);
  const hash=createHash('sha256').update(changed).digest('hex');
  const version={...active,hash,path:`/data/gurus/${manager.slug}/${active.accession}-${hash}.json`};
  await assert.rejects(readVerifiedFiling(manager,version,async()=>changed),/신고자·내용/);
 }
});

test('web detail entry has no full archive import and preserves static asset-only reads',()=>{
 const source=readFileSync('src/features/gurus/detail-repository.ts','utf8');
 const page=readFileSync('src/app/gurus/[slug]/page.tsx','utf8');
 assert.doesNotMatch(source+page,/import .*?(?:prepared\.json|["'].*\/catalog["']|getGuruCatalog)/);
 assert.match(source,/assets\.fetch/);assert.doesNotMatch(source,/fetch\(["']https:\/\/.*sec\.gov/);
 assert.match(page,/holdingsQuery=\{query.holdingQuery\}/);
});
