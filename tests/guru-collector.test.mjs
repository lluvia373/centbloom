import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSecClient, prepareGurus, parseCollectorArgs, requestedPeriods, discoverAllFilings } from '../scripts/prepare-gurus.mjs';
import { createSourceCache } from '../scripts/guru-source-cache.mjs';
const agent='Centbloom operator@example.org';
test('SEC client requires explicit identity and rejects other hosts/redirects; accesses paced',async()=>{
  assert.throws(()=>createSecClient('Centbloom'));
  const calls=[];const waits=[];
  const request=createSecClient(agent,{wait:async ms=>waits.push(ms),now:()=>0,request:async(url,options)=>{calls.push({url,options});return new Response('{}');}});
  await assert.rejects(request('https://evil.example/x'));
  await request('https://data.sec.gov/submissions/CIK0001336528.json');
  await request('https://www.sec.gov/Archives/edgar/data/1336528/000117266125003509/index.json');
  assert.deepEqual(waits,[0,1000]);assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers['User-Agent'],agent);
});

const instant=Date.parse('2026-09-24T00:00:00Z');
const identities=[{slug:'test-one',name:'Public manager one',manager:'Manager one',cik:'0000000001',status:'mapped'},
 {slug:'test-two',name:'Public manager two',manager:'Manager two',cik:'0000000002',status:'mapped'}];
const columnKeys=['accessionNumber','form','reportDate','filingDate','acceptanceDateTime','primaryDocument'];
const columns=rows=>Object.fromEntries(columnKeys.map(key=>[key,rows.map(row=>row[key])]));
const report=(identity,period='2026-06-30',sequence=1)=>{
 const accession=`${identity.cik}-26-${String(sequence).padStart(6,'0')}`;
 const filed=period==='2026-06-30'?'2026-08-14':'2026-05-15';
 return {accessionNumber:accession,form:'13F-HR',reportDate:period,filingDate:filed,acceptanceDateTime:`${filed}T20:00:00Z`,primaryDocument:'primary.xml'};
};
function sourceFiles(identity,metadata){
 const base=`https://www.sec.gov/Archives/edgar/data/${Number(identity.cik)}/${metadata.accessionNumber.replaceAll('-','')}/`;
 const cover=`<edgarSubmission xmlns="http://www.sec.gov/edgar/thirteenffiler"><headerData><submissionType>13F-HR</submissionType><filerInfo><filer><credentials><cik>${identity.cik}</cik></credentials></filer><periodOfReport>${metadata.reportDate}</periodOfReport></filerInfo></headerData><formData><coverPage><reportCalendarOrQuarter>${metadata.reportDate}</reportCalendarOrQuarter><isAmendment>false</isAmendment><filingManager><name>${identity.name}</name></filingManager><reportType>13F HOLDINGS REPORT</reportType></coverPage><summaryPage><tableEntryTotal>1</tableEntryTotal><tableValueTotal>100</tableValueTotal><isConfidentialOmitted>false</isConfidentialOmitted></summaryPage></formData></edgarSubmission>`;
 const table='<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable"><infoTable><nameOfIssuer>PUBLIC TEST COMPANY</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>02079K107</cusip><value>100</value><shrsOrPrnAmt><sshPrnamt>10</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable></informationTable>';
 return [[base+'primary.xml',cover],[base+'index.json',JSON.stringify({directory:{name:new URL(base).pathname.slice(0,-1),item:[{name:'primary.xml'},{name:'table.xml'}]}})],[base+'table.xml',table]];
}
async function harness(t,{registry=identities,history=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'centbloom-collector-test-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const destination=join(dir,'prepared.json'),storage=join(dir,'raw');await mkdir(storage);
 await writeFile(destination,JSON.stringify({schemaVersion:1,managers:[]}));
 const sources=new Map(),calls=[],checkpoints=[];
 for(const identity of registry.filter(item=>item.cik)){
  const recent=report(identity),older=report(identity,'2026-03-31',2);
  const files=history?[{name:`CIK${identity.cik}-submissions-001.json`,filingTo:'2026-06-01'}]:[];
  sources.set(`https://data.sec.gov/submissions/CIK${identity.cik}.json`,JSON.stringify({cik:Number(identity.cik),filings:{recent:columns([recent]),files}}));
  for(const [url,text] of sourceFiles(identity,recent))sources.set(url,text);
  if(history){sources.set(`https://data.sec.gov/submissions/${files[0].name}`,JSON.stringify(columns([older])));for(const [url,text] of sourceFiles(identity,older))sources.set(url,text);}
 }
 const services={registry,destination,storage,seedCatalog:[],now:()=>instant,wait:async()=>{},logger:{log(){},error(){}},
  request:async url=>{calls.push(url);if(!sources.has(url))throw Error(`Unexpected test request: ${url}`);const source=sources.get(url);return typeof source==='number'?new Response('',{status:source}):new Response(source);},
  onCheckpoint:snapshot=>checkpoints.push(snapshot),
 };
 return {services,sources,calls,checkpoints,read:async()=>JSON.parse(await readFile(destination,'utf8'))};
}

test('collector arguments are explicit, default registry scope is unlimited and quarter window crosses years',()=>{
 assert.deepEqual(parseCollectorArgs(['--only=test-one,test-two','--quarters=8','--limit=2','--resume','--latest-only','--requests-per-second=3']),
  {only:['test-one','test-two'],quarters:8,limit:2,resume:true,latestOnly:true,requestsPerSecond:3});
 assert.equal(parseCollectorArgs([]).limit,undefined);
 assert.deepEqual(requestedPeriods(2,Date.parse('2026-01-02')),['2025-12-31','2025-09-30']);
 for(const option of ['--quarters=0','--limit=0','--only=','--requests-per-second=10','--force'])assert.throws(()=>parseCollectorArgs([option]));
});
test('all registered latest reports are checkpointed before advertised historical submissions are fetched',async t=>{
 const state=await harness(t,{history:true});
 const result=await prepareGurus({userAgent:agent,quarters:2},state.services);
 assert.equal(result.coverage.requested,2);assert.equal(result.coverage.ready,2);assert.equal(result.coverage.failed,0);assert.equal(result.coverage.pending,0);
 const secondLatest=state.calls.indexOf(`https://data.sec.gov/submissions/CIK${identities[1].cik}.json`);
 assert.ok(secondLatest<state.calls.findIndex(url=>url.includes('-submissions-001.json')));
 const snapshot=await state.read();assert.ok(snapshot.managers.every(manager=>manager.archive.versions.length===2));
 assert.ok(state.checkpoints.some(snapshot=>snapshot.managers.length===2&&snapshot.managers.every(manager=>manager.archive.versions.length===1)));
 assert.ok(state.checkpoints.some(snapshot=>snapshot.coverage.phase==='history'&&snapshot.coverage.ready===0&&snapshot.coverage.pending===2));
 assert.ok(snapshot.managers.every(manager=>manager.provenance.every(source=>source.parserFingerprint&&source.coverSha256&&source.tableSha256)));
});
test('latest-only preserves unresolved historical amendments and a bundled filing missing from a prepared subset',async t=>{
 const state=await harness(t,{registry:identities.slice(0,1),history:true});
 await prepareGurus({userAgent:agent,quarters:2},state.services);
 const saved=await state.read(),manager=saved.managers[0],older=manager.archive.versions.find(filing=>filing.period==='2026-03-31');
 state.services.seedCatalog=[structuredClone(manager)];
 manager.archive.versions=manager.archive.versions.filter(filing=>filing!==older);
 manager.sourceState.pendingPeriods=['2026-03-31'];
 manager.sourceState.pendingAccessions=[{accession:'0000000001-26-000003',period:'2026-03-31',reason:'Additional holdings not reconciled'}];
 manager.sourceState.checkedAt='2026-09-20T00:00:00.000Z';
 await writeFile(state.services.destination,JSON.stringify(saved));
 await prepareGurus({userAgent:agent,quarters:2,latestOnly:true,resume:true},state.services);
 const after=(await state.read()).managers[0];
 assert.equal(after.archive.versions.length,2);
 assert.deepEqual(after.sourceState.pendingPeriods,['2026-03-31']);
 assert.equal(after.sourceState.pendingAccessions.length,1);
 assert.equal(after.sourceState.checkedAt,'2026-09-20T00:00:00.000Z');
 assert.ok(after.sourceState.issue);
});
test('discovery scans every advertised row even when hundreds of other forms precede a 13F',async()=>{
 const {discoverSecFilings}=await import('../src/features/gurus/sec.ts');
 const rows=Array.from({length:650},(_,index)=>({...report(identities[0],'2026-06-30',index+10),form:'4'}));
 rows.push(report(identities[0]));
 const found=discoverAllFilings({cik:1,filings:{recent:columns(rows)}},identities[0].cik,'2026-03-31',discoverSecFilings);
 assert.equal(found.length,1);assert.equal(found[0].accession,report(identities[0]).accessionNumber);
});
test('a cover reporting another CIK fails without merging identities or activating its table',async t=>{
 const state=await harness(t,{registry:identities.slice(0,1)});
 const coverUrl=[...state.sources.keys()].find(url=>url.endsWith('primary.xml'));
 state.sources.set(coverUrl,state.sources.get(coverUrl).replace('<cik>0000000001</cik>','<cik>0000000002</cik>'));
 const result=await prepareGurus({userAgent:agent,latestOnly:true},state.services);
 assert.equal(result.coverage.failed,1);const manager=(await state.read()).managers[0];
 assert.equal(manager.archive.versions.length,0);assert.equal(manager.sourceState.checkedAt,null);
 assert.equal(manager.sourceState.pendingAccessions.length,1);
});
test('resume uses healthy archives and cached sources; parser changes reparse old raw XML without redownload',async t=>{
 const state=await harness(t,{registry:identities.slice(0,1),history:true});
 await prepareGurus({userAgent:agent,quarters:2},state.services);
 const before=await state.read();state.calls.length=0;
 const resumed=await prepareGurus({userAgent:agent,quarters:2,resume:true},state.services);
 assert.equal(resumed.coverage.ready,1);assert.equal(state.calls.length,0);
 state.services.parserFingerprint='test-new-parser';
 await prepareGurus({userAgent:agent,quarters:2,resume:true},state.services);
 assert.equal(state.calls.length,0);const after=await state.read();
 assert.equal(after.managers[0].sourceState.checkedAt,before.managers[0].sourceState.checkedAt);
 assert.ok(after.managers[0].provenance.every(item=>item.parserFingerprint==='test-new-parser'));
 const normalized=archive=>({...archive,versions:archive.versions.toSorted((a,b)=>a.accession.localeCompare(b.accession))});
 assert.deepEqual(normalized(after.managers[0].archive),normalized(before.managers[0].archive));
});
test('403 stops the whole run and persisted Retry-After blocks a new collector without network retries',async t=>{
 const state=await harness(t);state.sources.set(`https://data.sec.gov/submissions/CIK${identities[0].cik}.json`,403);
 const result=await prepareGurus({userAgent:agent,latestOnly:true},state.services);
 assert.equal(result.stopped,true);assert.equal(result.coverage.failed,1);assert.equal(result.coverage.pending,1);assert.equal(state.calls.length,1);
 await prepareGurus({userAgent:agent,latestOnly:true,resume:true},state.services);
 assert.equal(state.calls.length,1);
});
test('unknown mappings stay pending, only/limit select managers, and new records are never invented',async t=>{
 const missing={slug:'unmapped',name:'Unmapped',manager:'Unmapped',cik:null,status:'mapping-pending',reason:'Identity unverified'};
 const state=await harness(t,{registry:[...identities,missing]});
 const result=await prepareGurus({userAgent:agent,latestOnly:true,only:['test-two','unmapped']},state.services);
 assert.equal(result.coverage.requested,2);assert.equal(result.coverage.ready,1);assert.equal(result.coverage.pending,1);
 assert.deepEqual((await state.read()).managers.map(manager=>manager.slug),['test-two']);
 assert.ok(state.calls.every(url=>!url.includes(identities[0].cik)));
 await assert.rejects(prepareGurus({userAgent:agent,only:['unknown']},state.services),/Unknown manager/);
});
test('a known non-13f CIK stays pending without requesting submissions or inventing holdings',async t=>{
 const state=await harness(t,{registry:[{...identities[0],status:'non-13f',reason:'Another manager reports the holdings'}]});
 const result=await prepareGurus({userAgent:agent,latestOnly:true},state.services);
 assert.equal(result.coverage.pending,1);assert.equal(result.coverage.ready,0);assert.equal(state.calls.length,0);
 assert.equal((await state.read()).managers.length,0);
});
test('latest discovery follows advertised history to the last real report even outside the current eight quarters',async t=>{
 const state=await harness(t,{registry:identities.slice(0,1)}),identity=identities[0];
 const metadata={...report(identity,'2020-12-31',9),accessionNumber:`${identity.cik}-21-000009`,filingDate:'2021-02-14',acceptanceDateTime:'2021-02-14T20:00:00Z'};
 const name=`CIK${identity.cik}-submissions-099.json`;
 state.sources.set(`https://data.sec.gov/submissions/CIK${identity.cik}.json`,JSON.stringify({cik:1,filings:{recent:columns([{...report(identity),form:'4'}]),files:[{name,filingTo:'2021-02-14'}]}}));
 state.sources.set(`https://data.sec.gov/submissions/${name}`,JSON.stringify(columns([metadata])));
 for(const [url,source] of sourceFiles(identity,metadata))state.sources.set(url,source);
 const result=await prepareGurus({userAgent:agent,latestOnly:true},state.services);
 assert.equal(result.coverage.ready,1,JSON.stringify((await state.read()).managers[0]?.sourceState));assert.equal(result.coverage.managers[0].availableQuarters,0);
 assert.equal(result.coverage.managers[0].latestPeriod,'2020-12-31');
 assert.equal((await state.read()).managers[0].archive.versions[0].period,'2020-12-31');
});
test('latest metadata selection does not parse unrelated legacy text filings',async()=>{
 const {discoverSecFilings}=await import('../src/features/gurus/sec.ts');
 const rows=[report(identities[0]),{...report(identities[0],'2010-12-31',9),primaryDocument:'legacy.txt'}];
 const found=discoverAllFilings({cik:1,filings:{recent:columns(rows)}},identities[0].cik,'1900-01-01',discoverSecFilings,{latestOnly:true});
 assert.equal(found.length,1);assert.equal(found[0].reportDate,'2026-06-30');
});
test('a changed registry CIK cannot merge an existing same-slug archive',async t=>{
 const state=await harness(t,{registry:identities.slice(0,1)});
 await prepareGurus({userAgent:agent,latestOnly:true},state.services);
 const before=await state.read();state.calls.length=0;
 state.services.registry=[{...identities[0],cik:identities[1].cik}];
 await assert.rejects(prepareGurus({userAgent:agent,latestOnly:true},state.services),/CIK changed/);
 assert.deepEqual(await state.read(),before);assert.equal(state.calls.length,0);
});
test('a crash after a verified unit preserves its checkpoint and leaves no false completed source state',async t=>{
 const state=await harness(t);
 state.services.onCheckpoint=async snapshot=>{if(snapshot.managers[0]?.archive.versions.length)throw Error('simulated process loss');};
 await assert.rejects(prepareGurus({userAgent:agent,latestOnly:true},state.services),/simulated process loss/);
 const saved=await state.read();assert.equal(saved.managers[0].archive.versions.length,1);assert.equal(saved.managers[0].provenance.length,1);
 assert.equal(saved.managers[0].sourceState.checkedAt,null);assert.equal(saved.coverage.ready,0);
 state.services.onCheckpoint=undefined;state.calls.length=0;
 await prepareGurus({userAgent:agent,latestOnly:true,resume:true},state.services);
 assert.equal((await state.read()).coverage.ready,2);
 assert.ok(!state.calls.some(url=>url.includes('/data/1/')),'verified first manager XML must not download again');
});
test('cache TTL retains the actual fetch timestamp and expires submission snapshots without changing raw files',async t=>{
 const state=await harness(t,{registry:identities.slice(0,1)});let clock=instant,calls=0;
 const cache=createSourceCache(state.services.storage,async()=>{calls++;return '{}';},{now:()=>clock});
 const url=`https://data.sec.gov/submissions/CIK${identities[0].cik}.json`;
 const first=await cache.get(url,{ttl:100});clock+=50;
 const second=await cache.get(url,{ttl:100});assert.equal(calls,1);assert.equal(second.fetchedAt,first.fetchedAt);
 clock+=100;const third=await cache.get(url,{ttl:100});assert.equal(calls,2);assert.equal(third.hash,first.hash);assert.equal(third.fetchedAt,clock);
});
test('SEC access limits stop collection without retries; oversized replies rejected',async()=>{
  for(const status of [403,429]) {
    let calls=0;const request=createSecClient(agent,{wait:async()=>{},request:async()=>{calls++;return new Response('',{status});}});
    await assert.rejects(request('https://data.sec.gov/submissions/CIK0001336528.json'),error=>error.stopCollection===true);
    assert.equal(calls,1);
  }
  const request=createSecClient(agent,{wait:async()=>{},request:async()=>new Response('x',{headers:{'content-length':'13000000'}})});
  await assert.rejects(request('https://data.sec.gov/submissions/CIK0001336528.json'),/too large/);
});
test('SEC archive XML accepts the 32 MiB boundary while JSON remains capped at 12 MiB',async()=>{
  const xmlUrl='https://www.sec.gov/Archives/edgar/data/1336528/000117266125003509/table.xml';
  const maximum=32*1024*1024;
  const request=createSecClient(agent,{wait:async()=>{},request:async()=>new Response('x'.repeat(maximum))});
  assert.equal((await request(xmlUrl)).length,maximum);
  for(const url of ['https://data.sec.gov/submissions/CIK0001336528.json','https://www.sec.gov/Archives/edgar/data/1336528/000117266125003509/index.json']) {
    const json=createSecClient(agent,{wait:async()=>{},request:async()=>new Response('x'.repeat(12*1024*1024+1))});
    await assert.rejects(json(url),/too large/);
  }
});
test('SEC XML rejects both advertised and streamed responses above 32 MiB and cancels their bodies',async()=>{
  const url='https://www.sec.gov/Archives/edgar/data/1336528/000117266125003509/table.xml';
  const maximum=32*1024*1024;
  for(const advertised of [true,false]) {
    let canceled=false;
    const body=new ReadableStream({start(controller){if(!advertised)controller.enqueue(new Uint8Array(maximum+1));},cancel(){canceled=true;}});
    const request=createSecClient(agent,{wait:async()=>{},request:async()=>new Response(body,advertised?{headers:{'content-length':String(maximum+1)}}:{})});
    await assert.rejects(request(url),/too large/);assert.equal(canceled,true);
  }
});
