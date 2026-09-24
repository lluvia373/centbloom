import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { parseDartDividend, prepareDartSnapshot } from '../src/features/dividends/dart.ts';
import { collectDartDividends, collectKoreanDividendFeed, createDartClient, decodeDartDocument, readPreviousKoreanState } from '../scripts/prepare-dart-dividends.mjs';
import { koreanExDate, prepareKoreanEvents, resolveKoreanRevisions } from '../src/features/dividends/korea.ts';
import { loadTypescript } from './load-typescript.mjs';
const calendar = loadTypescript('src/features/market/schedule/calendars.ts').calendars.find(item => item.id === 'KR');

// Reduced real disclosed facts, not a user ledger. Full source was read on 2026-09-24:
// https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260707900405
// Company and stock codes also verified against the authenticated Open DART list.
const filing={rcept_no:'20260707900405',corp_code:'01806951',stock_code:'472850',corp_name:'폰드그룹',rcept_dt:'20260707',report_nm:'[기재정정]현금ㆍ현물배당결정 (분기배당)',corp_cls:'K'};
const row=(...cells)=>`<tr>${cells.map(cell=>`<td><span>${cell}</span></td>`).join('')}</tr>`;
const html=`<table>${row('2. 정정관련 공시서류제출일','2026-06-12')}${row('정정항목','정정전','정정후')}${row('5. 배당금총액(원)','2,012,533,915','2,007,423,915')}</table>
<table>${row('1. 배당구분','분기배당')}${row('2. 배당종류','현금배당')}${row('3. 1주당 배당금(원)','보통주식','35')}${row('종류주식','-')}${row('6. 배당기준일','2026-06-30')}${row('7. 배당금지급 예정일자','2026-07-15')}${row('10. 이사회결의일(결정일)','2026-06-12')}</table>`;
const parse=(doc=html,patch={})=>parseDartDividend(doc,{...filing,...patch});

test('final common-share table wins over correction totals and retains the original date',()=>{
  const result=parse();
  assert.equal(result.amountPerShare,35);assert.equal(result.recordDate,'2026-06-30');
  assert.equal(result.paymentDate,'2026-07-15');assert.equal(result.originalFiledDate,'2026-06-12');
  assert.equal(result.amended,true);assert.equal(result.shareClass,'common');
  assert.equal('exDate' in result,false);
});
test('unknown payment date stays unknown; noncash, missing amounts, repeated tables and broken text reject',()=>{
  assert.equal(parse(html.replace('2026-07-15','-')).paymentDate,null);
  for(const doc of [html.replace('현금배당','현물배당'),html.replace('>35<','>-<'),html+html,html.replace('2026-06-30','2026-02-30'),html+'\ufffd',html.replace('2026-06-12','-')]) assert.throws(()=>parse(doc));
  for(const patch of [{report_nm:'사업보고서'},{report_nm:'[철회]현금ㆍ현물배당결정'},{stock_code:''},{corp_code:'wrong'}]) assert.throws(()=>parse(html,patch));
});
test('archive extraction supports declared encoding and rejects nonzip or oversized documents',()=>{
  const bytes=zipSync({'document.xml':strToU8(html),'ignore.png':new Uint8Array([1])});
  assert.equal(decodeDartDocument(bytes),html);
  assert.throws(()=>decodeDartDocument(strToU8('<result><status>010</status></result>')));
  assert.throws(()=>decodeDartDocument(zipSync({'huge.xml':new Uint8Array(8*1024*1024+1)})));
});
test('UTF-8 API bytes override stale EUC-KR metadata without accepting malformed text',()=>{
  const header='<meta content="text/html; charset=euc-kr" http-equiv="Content-Type">';
  assert.equal(decodeDartDocument(zipSync({'document.xml':strToU8(header+html)})),header+html);
  const legacy=Buffer.concat([Buffer.from(header),Buffer.from([0xb0,0xa1])]);
  assert.equal(decodeDartDocument(zipSync({'document.xml':legacy})),header+'가');
  assert.throws(()=>decodeDartDocument(zipSync({'document.xml':Buffer.from([0xff])})),/encoding/);
  assert.throws(()=>decodeDartDocument(zipSync({'document.xml':Buffer.concat([Buffer.from(header),Buffer.from([0xff])])})));
});
test('source regressions, missing receipts and changed facts cannot replace a normal snapshot',()=>{
  const event=parse(), time='2026-09-24T10:00:00Z';
  const first=prepareDartSnapshot([event],null,time,'2026-01-01','2026-09-23');
  const before=JSON.stringify(first);
  assert.throws(()=>prepareDartSnapshot([],first,time,first.from,first.through));
  assert.throws(()=>prepareDartSnapshot([{...event,amountPerShare:99}],first,time,first.from,first.through));
  assert.throws(()=>prepareDartSnapshot([event,event],null,time,first.from,first.through));
  assert.throws(()=>prepareDartSnapshot([event],first,'2026-09-20',first.from,first.through));
  assert.equal(JSON.stringify(first),before);
});
test('client keeps keys out of cache URLs/errors, stops on limits, and does not follow redirects',async()=>{
  const key='a'.repeat(40);let options;
  const client=createDartClient(key,{wait:async()=>{},request:async(url,opts)=>{
    assert.equal(new URL(url).searchParams.get('crtfc_key'),key);options=opts;
    return new Response(JSON.stringify({status:'020',message:key}),{status:200});
  }});
  await assert.rejects(client('https://opendart.fss.or.kr/api/list.json?page_no=1'),error=>error.message==='DART list status 020'&&!error.message.includes(key));
  assert.equal(options.redirect,'error');
  await assert.rejects(client('https://example.com/api/list.json'),/URL rejected/);
  assert.throws(()=>createDartClient(''),/required/);
  const failed=createDartClient(key,{wait:async()=>{},request:async()=>{throw Error(key);}});
  await assert.rejects(failed('https://opendart.fss.or.kr/api/list.json'),error=>!error.message.includes(key));
});
test('collector paginates all monthly results, fetches only dividend documents and keeps no account data',async()=>{
  const calls=[];
  const other={...filing,rcept_no:'20260707900406',report_nm:'주요경영사항'};
  const source={get:async(url)=>{
    calls.push(url);const target=new URL(url),page=Number(target.searchParams.get('page_no'));
    return {text:target.pathname.endsWith('document.xml')?html:JSON.stringify({status:'000',page_no:page,total_count:2,total_page:2,list:page===1?[filing]:[other]})};
  }};
  const result=await collectDartDividends({source,from:'2026-07-01',through:'2026-07-31',now:()=> '2026-09-24T10:00:00Z'});
  assert.equal(result.candidates.length,1);assert.equal(calls.length,3);
  assert.ok(calls.every(url=>!url.includes('crtfc_key')));
  await assert.rejects(collectDartDividends({source:{get:async()=>({text:JSON.stringify({status:'000',page_no:1,total_count:3,total_page:1,list:[filing]})})},from:'2026-07-01',through:'2026-07-31'}),/rows missing/);
});

test('domestic T+2 uses existing KRX holidays, weekends and a verified year-end exception',()=>{
  assert.equal(koreanExDate('2026-03-31',calendar),'2026-03-30');
  assert.equal(koreanExDate('2026-06-30',calendar),'2026-06-29');
  assert.equal(koreanExDate('2026-02-27',calendar),'2026-02-26');
  assert.equal(koreanExDate('2026-03-02',calendar),'2026-02-26');
  assert.equal(koreanExDate('2026-09-27',calendar),'2026-09-22');
  assert.equal(koreanExDate('2025-12-31',calendar),'2025-12-29');
  assert.throws(()=>koreanExDate('2025-06-30',calendar),/cover/);
  assert.throws(()=>koreanExDate('2026-02-30',calendar),/Invalid/);
});

test('linked corrections replace one dividend, including changed record date, without double counting',()=>{
  const correction=parse(), original={...correction,receipt:'20260612900100',filedDate:'2026-06-12',
    recordDate:'2026-06-29',amountPerShare:30,amended:false,originalFiledDate:null};
  const groups=resolveKoreanRevisions([correction,original]);
  assert.equal(groups.length,1);assert.equal(groups[0].current.amountPerShare,35);
  const events=prepareKoreanEvents({candidates:[correction,original]},
    {symbol:'472850.KQ',corpCode:filing.corp_code,stockCode:filing.stock_code,shareHistoryFrom:'2026-01-01',factsCheckedUrl:correction.sourceUrl},calendar);
  assert.equal(events.length,1);assert.equal(events[0].id,`dart:${original.receipt}:472850`);
  assert.equal(events[0].recordDate,'2026-06-30');assert.equal(events[0].exDate,'2026-06-29');
  assert.equal(events[0].issuerCountry,'KR');assert.equal(events[0].instrument,'ordinary-share');
  assert.throws(()=>resolveKoreanRevisions([correction]),/missing/);
  assert.throws(()=>resolveKoreanRevisions([original,original]),/Duplicate/);
});

test('company collection is scoped, promotes real parsed facts, and preserves a good company after partial failure',async()=>{
  const company={symbol:'472850.KQ',corpCode:filing.corp_code,stockCode:filing.stock_code,shareHistoryFrom:'2026-01-01',factsCheckedUrl:'https://example.com/review'};
  const originalFiling={...filing,report_nm:'현금ㆍ현물배당결정'};
  const now=()=> '2026-09-24T10:00:00Z',fetchedAt=Date.parse('2026-09-24T09:00:00Z');
  let failure=false, listCalls=0;
  const source={get:async raw=>{
    const url=new URL(raw);
    if(failure)throw Error('DART HTTP 503');
    if(url.pathname.endsWith('company.json'))return {fetchedAt,text:JSON.stringify({status:'000',...filing})};
    if(url.pathname.endsWith('document.xml'))return {fetchedAt,text:html};
    assert.equal(url.searchParams.get('corp_code'),company.corpCode);listCalls++;
    return {fetchedAt,text:JSON.stringify({status:'000',page_no:1,total_count:1,total_page:1,list:[originalFiling]})};
  }};
  const first=await collectKoreanDividendFeed({source,calendar,companies:[company],through:'2026-09-23',now});
  assert.equal(listCalls,1);assert.equal(first.events.length,1);assert.equal(first.events[0].amountPerShare,35);
  assert.equal(first.symbols[0].status,'supported');assert.equal(first.sourceCheckedAt,'2026-09-24T09:00:00.000Z');
  failure=true;
  const next=await collectKoreanDividendFeed({source,calendar,companies:[company],through:'2026-09-23',previous:first,now});
  assert.equal(next.symbols[0].status,'failed');assert.deepEqual(next.events,first.events);
  assert.equal(next.symbols[0].checkedAt,first.symbols[0].checkedAt);
  assert.deepEqual(next.snapshots,first.snapshots);
});

test('missing source observations and mismatched company identities cannot become new data',async()=>{
  const company={symbol:'472850.KQ',corpCode:filing.corp_code,stockCode:filing.stock_code,shareHistoryFrom:'2026-01-01',factsCheckedUrl:'https://example.com/review'};
  for(const response of [{text:'{}'},{fetchedAt:Date.now(),text:JSON.stringify({status:'000',...filing,stock_code:'005930'})}]){
    const result=await collectKoreanDividendFeed({source:{get:async()=>response},calendar,companies:[company],through:'2026-09-23'});
    assert.equal(result.symbols[0].status,'failed');assert.equal(result.events.length,0);
  }
});

test('a fresh checkout falls back to published facts and cannot erase them after a missing or failed source',async()=>{
  const company={symbol:'472850.KQ',corpCode:filing.corp_code,stockCode:filing.stock_code,shareHistoryFrom:'2026-01-01',factsCheckedUrl:'https://example.com/review'};
  const original={...parse(),amended:false,originalFiledDate:null};
  const published={version:1,checkedAt:'2026-09-24T08:00:00Z',sourceCheckedAt:'2026-09-24T08:00:00Z',
    events:prepareKoreanEvents({candidates:[original]},company,calendar),
    symbols:[{symbol:company.symbol,status:'supported',from:'2026-01-01',through:'2026-09-23',checkedAt:'2026-09-24T08:00:00Z'}]};
  const read=async path=>{if(path==='private')throw Object.assign(Error('missing'),{code:'ENOENT'});return JSON.stringify(published);};
  const previous=await readPreviousKoreanState('private','public',read);
  assert.deepEqual(previous,published);assert.equal(previous.snapshots,undefined);
  const source={get:async raw=>({fetchedAt:Date.parse('2026-09-24T09:00:00Z'),text:JSON.stringify(
    new URL(raw).pathname.endsWith('company.json')?{status:'000',...filing}:{status:'013'})})};
  const result=await collectKoreanDividendFeed({source,calendar,previous,companies:[company],through:'2026-09-23'});
  assert.equal(result.symbols[0].status,'failed');assert.deepEqual(result.events,published.events);
  assert.equal(result.symbols[0].checkedAt,published.symbols[0].checkedAt);
  await assert.rejects(readPreviousKoreanState('private','public',async()=>'{broken'),SyntaxError);
});
