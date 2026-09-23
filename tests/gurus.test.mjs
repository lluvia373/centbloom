import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const {guruCatalog}=loadTypescript('src/features/gurus/catalog.ts');
const {validateFiling,ingestFiling,reportedChanges}=loadTypescript('src/features/gurus/model.ts');
const {filingEvent,watchedEvent}=loadTypescript('src/features/notifications/events.ts');
const filing=guruCatalog[0].archive.versions.at(-1);
test('real SEC report: all 11 rows reconcile to cover page, share classes preserved, no guessed mapping or price',()=>{
 assert.equal(validateFiling(filing),null);assert.equal(filing.holdings.length,11);
 assert.equal(filing.holdings.reduce((s,r)=>s+r.valueUsd,0),13729120533);
 assert.equal(filing.holdings.filter(r=>r.issuer==='ALPHABET INC').length,2);
 assert.ok(filing.holdings.every(r=>r.mapping===null));assert.equal(filingEvent(filing),null);
});
test('activation preserves originals on partial, total mismatch, delayed older quarter and ambiguous additions',()=>{
 const base={versions:[filing],activeAccession:filing.accession};
 for(const bad of [{...filing,complete:false},{...filing,expectedValueUsd:1},{...filing,holdings:filing.holdings.slice(1)},{...filing,source:'https://evil.test/a'}]){
  const result=ingestFiling(base,bad);assert.ok(result.error);assert.equal(result.archive,base);
 }
 assert.equal(ingestFiling(base,structuredClone(filing)).archive,base);
 assert.ok(ingestFiling(base,{...filing,acceptedAt:'different'}).error);
 const older={...filing,accession:'0001172661-25-000001',period:'2025-03-31'};
 const late=ingestFiling(base,older);assert.equal(late.error,null);assert.equal(late.archive.activeAccession,filing.accession);assert.equal(late.archive.versions.length,2);
 const amended={...filing,accession:'0001172661-25-003510',kind:'restatement',revision:1,parentAccession:filing.accession};
 const corrected=ingestFiling(base,amended);assert.equal(corrected.error,null);assert.equal(corrected.archive.activeAccession,amended.accession);assert.equal(base.versions.length,1);
 assert.ok(ingestFiling(base,{...amended,kind:'addition'}).error);
 assert.ok(ingestFiling(base,{...amended,parentAccession:'missing'}).error);
 assert.ok(ingestFiling(base,{...amended,guruId:'another'}).error);
 assert.ok(ingestFiling(corrected.archive,{...amended,accession:'0001172661-25-003511',revision:2,parentAccession:filing.accession}).error);
 assert.ok(validateFiling({...filing,period:'2025-02-30'}));
});
test('reported changes are quantities, absent rows remain unknown rather than sold; events need availability/evidence',()=>{
 const prior={...filing,period:'2025-03-31'};
 assert.equal(reportedChanges({...prior,period:'2024-12-31'},filing),null);
 const next={...filing,holdings:filing.holdings.slice(1),expectedRows:10,expectedValueUsd:filing.expectedValueUsd-filing.holdings[0].valueUsd};
 const diff=reportedChanges(prior,next);assert.equal(diff.length,1);assert.equal(diff[0].current,null);
 const now=Date.parse('2026-09-22T00:00:00Z');
 assert.equal(filingEvent({...filing,publicAt:'2027-01-01T00:00:00Z'},now),null);
 const event=filingEvent({...filing,publicAt:'2025-08-14T21:00:00Z'},now);assert.equal(event.event_id,'sec:'+filing.accession);
 const change={quote:{symbol:'TEST',name:'Test',quotedAt:'2026-09-21T22:00:00Z',changePercent:1},sessionDate:'2026-09-21',signals:[]};
 assert.equal(watchedEvent(change,'https://example.com',now),null);
 assert.ok(watchedEvent({...change,signals:[{kind:'volume',value:200,baseline:100,ratio:2}]},'https://example.com',now));
});
