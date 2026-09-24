import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { discoverSecFilings, discoverInformationTables, parseSecFiling, secArchiveUrl, normalizeSecCik } =
  loadTypescript('src/features/gurus/sec.ts');
const { validateFiling, reportedChanges } = loadTypescript('src/features/gurus/model.ts');
const cik = '0001336528';
const coverNs = 'http://www.sec.gov/edgar/thirteenffiler';
const tableNs = 'http://www.sec.gov/edgar/document/thirteenf/informationtable';
const row = (changes = {}) => ({ accessionNumber: '0001172661-25-003509', form: '13F-HR', reportDate: '2025-06-30',
  filingDate: '2025-08-14', acceptanceDateTime: '2025-08-14T20:31:59.000Z', primaryDocument: 'primary_doc.xml', ...changes });
const columns = rows => Object.fromEntries(Object.keys(row()).map(key => [key, rows.map(item => item[key])]));
const metadata = changes => discoverSecFilings({ cik: 1336528, filings: { recent: columns([row(changes)]) } }, cik)[0];
const cover = ({ period = '06-30-2025', cikValue = cik, form = '13F-HR', amendment = false, revision = 1,
  amendmentType = 'RESTATEMENT', rows = 2, total = 300, reportType = '13F HOLDINGS REPORT', confidential = false } = {}) =>
  `<?xml version="1.0" encoding="UTF-8"?><edgarSubmission xmlns="${coverNs}">
    <headerData><submissionType>${form}</submissionType><filerInfo><filer><credentials><cik>${cikValue}</cik></credentials></filer>
      <periodOfReport>${period}</periodOfReport></filerInfo></headerData>
    <formData><coverPage><reportCalendarOrQuarter>${period}</reportCalendarOrQuarter><isAmendment>${amendment}</isAmendment>
      ${amendment ? `<amendmentNo>${revision}</amendmentNo><amendmentInfo><amendmentType>${amendmentType}</amendmentType></amendmentInfo>` : ''}
      <filingManager><name>PUBLIC MANAGER</name></filingManager><reportType>${reportType}</reportType></coverPage>
      <summaryPage><tableEntryTotal>${rows}</tableEntryTotal><tableValueTotal>${total}</tableValueTotal>
        <isConfidentialOmitted>${confidential}</isConfidentialOmitted></summaryPage></formData></edgarSubmission>`;
const infoRow = ({ issuer = 'ALPHA &amp; COMPANY', shareClass = 'COM', cusip = '02079K107', value = 100, shares = '12.5',
  shareType = 'SH', option } = {}) => `<infoTable><nameOfIssuer>${issuer}</nameOfIssuer><titleOfClass>${shareClass}</titleOfClass>
  <cusip>${cusip}</cusip><value>${value}</value><shrsOrPrnAmt><sshPrnamt>${shares}</sshPrnamt><sshPrnamtType>${shareType}</sshPrnamtType></shrsOrPrnAmt>
  ${option ? `<putCall>${option}</putCall>` : ''}<investmentDiscretion>DFND</investmentDiscretion><otherManager>1,2</otherManager>
  <votingAuthority><Sole>0</Sole><Shared>0</Shared><None>0</None></votingAuthority></infoTable>`;
const table = (rows = [infoRow(), infoRow({ issuer: 'ALPHA CLASS B', shareClass: 'CL B', cusip: '02079K305', value: 200, option: 'Call' })]) =>
  `<?xml version="1.0"?><informationTable xmlns="${tableNs}">${rows.join('')}</informationTable>`;
const input = (changes = {}) => {
  const m = changes.metadata ?? metadata();
  return { guruId: 'pershing-square', cik, metadata: m, coverXml: cover(), informationXml: table(),
    informationTableUrl: secArchiveUrl(cik, m.accession, 'infotable.xml'), ...changes };
};

test('submissions discovery validates owner, parallel columns, dates and SEC filenames, then bounds recent reports', () => {
  const older = row({ accessionNumber: '0001172661-25-002315', reportDate: '2025-03-31', filingDate: '2025-05-15', acceptanceDateTime: '2025-05-15T20:03:24Z' });
  const recent = columns([older, row({ form: '8-K' }), row()]);
  const found = discoverSecFilings({ cik: 1336528, filings: { recent } }, cik, { limit: 1 });
  assert.equal(found.length, 1); assert.equal(found[0].accession, row().accessionNumber);
  assert.equal(found[0].primaryDocumentUrl, 'https://www.sec.gov/Archives/edgar/data/1336528/000117266125003509/primary_doc.xml');
  for (const prefix of ['xslForm13F_X01/', 'xslForm13F_X02/']) {
    const styled = metadata({ primaryDocument: prefix + 'primary_doc.xml' });
    assert.equal(styled.primaryDocument, 'primary_doc.xml'); assert.equal(styled.primaryDocumentUrl, found[0].primaryDocumentUrl);
  }
  assert.equal(discoverSecFilings(columns([row(), { ...older, primaryDocument: 'legacy.txt' }]), cik, { limit: 1 }).length, 1);
  assert.equal(discoverSecFilings(recent, cik, { after: '2025-06-30' }).length, 1);
  assert.equal(normalizeSecCik(1336528), cik);
  assert.throws(() => discoverSecFilings({ cik: 99, filings: { recent } }, cik), /운용사/);
  assert.throws(() => discoverSecFilings({ ...recent, reportDate: [] }, cik), /열 길이/);
  for (const bad of [{ reportDate: '2025-02-30' }, { filingDate: '2025-01-01' }, { accessionNumber: 'bad' },
    { primaryDocument: '../evil.xml' }, { primaryDocument: 'https://evil.test/a.xml' }, { primaryDocument: 'a%2f.xml' },
    { primaryDocument: 'xslForm13F_X02/../evil.xml' }, { primaryDocument: 'unknown/a.xml' },
    { acceptanceDateTime: 'yesterday' }]) assert.throws(() => metadata(bad));
  assert.throws(() => discoverSecFilings(recent, cik, { limit: 201 }), /1~200/);
  assert.throws(() => discoverSecFilings(columns([row(), row({ primaryDocument: 'different.xml' })]), cik), /충돌/);
});

test('directory discovery accepts only same-accession raw XML candidates and no traversal or remote URLs', () => {
  const m = metadata(), path = new URL(m.directoryIndexUrl).pathname.replace('/index.json', '');
  const candidates = discoverInformationTables({ directory: { name: path, item: [
    { name: 'primary_doc.xml' }, { name: 'infotable.xml' }, { name: 'infotable.xml' }, { name: 'other.htm' },
  ] } }, m);
  assert.deepEqual(Array.from(candidates), [secArchiveUrl(cik, m.accession, 'infotable.xml')]);
  for (const name of ['../other.xml', 'https://evil.test/info.xml', 'info%2f.xml'])
    assert.throws(() => discoverInformationTables({ directory: { item: [{ name }] } }, m));
  assert.throws(() => discoverInformationTables({ directory: { name: '/other', item: [] } }, m), /경로/);
  assert.throws(() => discoverInformationTables({ directory: { item: [] } }, { ...m, source: 'https://evil.test/a' }), /경로/);
});

test('raw SEC XML produces reconciled source holdings, decodes XML and preserves options without inventing mapping/public time', () => {
  const parsed = parseSecFiling(input());
  assert.equal(validateFiling(parsed), null);
  assert.equal(parsed.expectedValueUsd, 300); assert.equal(parsed.holdings.length, 2);
  assert.equal(parsed.holdings[0].issuer, 'ALPHA & COMPANY'); assert.equal(parsed.holdings[0].shares, 12.5);
  assert.equal(parsed.holdings[1].option, 'CALL'); assert.equal(parsed.holdings[1].shareClass, 'CL B');
  assert.ok(parsed.holdings.every(item => item.mapping === null));
  assert.equal(parsed.publicAt, null); assert.equal(parsed.acceptedAt, row().acceptanceDateTime);
  const withAddress = cover().replace('<name>PUBLIC MANAGER</name>',
    '<name>PUBLIC MANAGER</name><address xmlns:c="http://www.sec.gov/edgar/common"><c:city>NEW YORK</c:city></address>');
  assert.equal(parseSecFiling(input({ coverXml: withAddress })).holdings.length, 2);
  const prefixed = table().replace(`<informationTable xmlns="${tableNs}">`, `<n:informationTable xmlns:n="${tableNs}">`)
    .replace('</informationTable>', '</n:informationTable>')
    .replace(/<(\/?)(?!\?)([A-Za-z][A-Za-z0-9]*)(?=[ >])/g, '<$1n:$2');
  assert.equal(parseSecFiling(input({ informationXml: prefixed })).holdings.length, 2);
});

test('cover identity, report scope, complete rows, numerical safety and total mismatches fail closed', () => {
  for (const bad of [cover({ cikValue: '0000000001' }), cover({ period: '03-31-2025' }), cover({ form: '13F-HR/A' }),
    cover({ reportType: '13F NOTICE' }), cover({ rows: 1 }), cover({ total: 301 }),
    cover({ total: '9007199254740992' }), cover({ rows: 50001 }), cover().replace('<cik>', '<cik>1</cik><cik>')])
    assert.throws(() => parseSecFiling(input({ coverXml: bad })));
  for (const bad of [infoRow({ value: '-1' }), infoRow({ value: '1e2' }), infoRow({ shares: 'Infinity' }),
    infoRow({ shares: '9007199254740992' }), infoRow({ shareType: 'OTHER' }), infoRow({ option: 'SELL' }), infoRow({ cusip: 'bad' })])
    assert.throws(() => parseSecFiling(input({ informationXml: table([bad]), coverXml: cover({ rows: 1, total: 100 }) })));
  assert.throws(() => parseSecFiling(input({ informationTableUrl: 'https://www.sec.gov.evil.test/infotable.xml' })), /경로/);
  assert.throws(() => parseSecFiling(input({ informationTableUrl: metadata().primaryDocumentUrl })), /경로/);
});

test('original Berkshire-style covers may omit the amendment flag without relaxing amendment validation', () => {
  // SEC 0000950123-25-005701 omits isAmendment entirely on its original 13F-HR cover.
  const withoutFlag = cover().replace('<isAmendment>false</isAmendment>', '');
  const original = parseSecFiling(input({ coverXml: withoutFlag }));
  assert.equal(original.kind, 'original'); assert.equal(original.revision, 0);
  assert.equal(original.parentAccession, null); assert.equal(original.holdings.length, 2);
  for (const extra of ['<amendmentNo>1</amendmentNo>', '<amendmentInfo><amendmentType>RESTATEMENT</amendmentType></amendmentInfo>'])
    assert.throws(() => parseSecFiling(input({ coverXml: withoutFlag.replace('</coverPage>', extra + '</coverPage>') })), /정정 정보/);
  assert.throws(() => parseSecFiling(input({ coverXml: cover().replace('<isAmendment>false</isAmendment>',
    '<isAmendment>false</isAmendment><isAmendment>false</isAmendment>') })), /중복/);
  const amendedMeta = metadata({ form: '13F-HR/A' });
  const amendedCover = cover({ form: '13F-HR/A', amendment: true }).replace('<isAmendment>true</isAmendment>', '');
  assert.throws(() => parseSecFiling(input({ metadata: amendedMeta, coverXml: amendedCover })), /정정 표시/);
});

test('complete public tables preserve limited disclosure and cannot produce misleading quarter comparisons', () => {
  const original = parseSecFiling(input());
  const previous = { ...original, period: '2025-03-31' };
  assert.ok(reportedChanges(previous, original));
  for (const options of [{ confidential: true }, { reportType: '13F COMBINATION REPORT' }]) {
    const limited = parseSecFiling(input({ coverXml: cover(options) }));
    assert.equal(validateFiling(limited), null); assert.equal(limited.complete, true);
    assert.equal(limited.disclosureScope.confidentialOmitted, options.confidential ?? false);
    assert.equal(limited.disclosureScope.reportType, options.reportType ? 'combination' : 'holdings');
    assert.equal(limited.holdings.length, 2);
    assert.equal(reportedChanges(previous, limited), null);
    assert.equal(reportedChanges({ ...limited, period: '2025-03-31' }, original), null);
  }
  assert.ok(validateFiling({ ...original, disclosureScope: { reportType: 'full-assets', confidentialOmitted: false } }));
  assert.ok(validateFiling({ ...original, disclosureScope: { reportType: 'holdings', confidentialOmitted: 'false' } }));
});

test('strict XML rejects malformed input, DTD/entities, wrong namespaces, duplicates, trailing roots and excessive depth', () => {
  const badTables = [table().replace('</value>', '</wrong>'), table() + '<extra/>',
    table().replace('ALPHA &amp; COMPANY', 'ALPHA &undefined; COMPANY'),
    table().replace('<?xml version="1.0"?>', '<!DOCTYPE informationTable [<!ENTITY secret SYSTEM "file:///etc/passwd">]>'),
    table().replace(tableNs, 'https://evil.test/schema'), table().replace('<value>100</value>', '<value>100</value><value>100</value>'),
    `<informationTable xmlns="${tableNs}">${'<nested>'.repeat(33)}${'</nested>'.repeat(33)}</informationTable>`,
    '<informationTable ' + ' '.repeat(8 * 1024 * 1024) + '/>',
  ];
  for (const xml of badTables) assert.throws(() => parseSecFiling(input({ informationXml: xml })));
});

test('large institutional public tables retain every row and still enforce bounded input',()=>{
 const rows=Array.from({length:15001},()=>infoRow({value:1}));
 const parsed=parseSecFiling(input({coverXml:cover({rows:rows.length,total:rows.length}),informationXml:table(rows)}));
 assert.equal(parsed.holdings.length,15001);assert.equal(parsed.expectedValueUsd,15001);
 assert.equal(parsed.holdings.at(-1).rowId,'15001');assert.equal(validateFiling(parsed),null);
 assert.throws(()=>parseSecFiling(input({informationXml:'x'.repeat(32*1024*1024+1)})),/32MB/);
 assert.throws(()=>parseSecFiling(input({coverXml:cover({rows:50001})})),/50,000행/);
});

test('reported lowercase ASCII CUSIPs normalize without dropping rows or changing amounts',()=>{
 const parsed=parseSecFiling(input({coverXml:cover({rows:1,total:100}),informationXml:table([infoRow({cusip:'42704l104'})])}));
 assert.equal(parsed.holdings[0].cusip,'42704L104');assert.equal(parsed.holdings[0].valueUsd,100);
 for(const cusip of ['４2704l104','42704l10!','42704l10','42704l1040'])assert.throws(()=>parseSecFiling(input({coverXml:cover({rows:1,total:100}),informationXml:table([infoRow({cusip})])})),/식별자/);
});

test('an explicitly empty cover accepts only its exact zero NONE marker, not arbitrary zero positions',()=>{
 const marker=infoRow({issuer:'NONE',shareClass:'NONE',cusip:'000000000',value:0,shares:'0'});
 const parsed=parseSecFiling(input({coverXml:cover({rows:0,total:0}),informationXml:table([marker])}));
 assert.equal(parsed.sourceNormalization,'empty-placeholder');assert.equal(parsed.holdings.length,0);
 assert.equal(parsed.expectedRows,0);assert.equal(parsed.expectedValueUsd,0);
 assert.equal(validateFiling(parsed),null);
 for(const wrong of [marker.replace('NONE','REAL COMPANY'),marker.replace('<value>0','<value>1'),marker.replace('<Sole>0','<Sole>1')])assert.throws(()=>parseSecFiling(input({coverXml:cover({rows:0,total:0}),informationXml:table([wrong])})));
 assert.ok(validateFiling({...parsed,expectedValueUsd:1}));
});

test('2023 dollar transition uses submission date including restatements of older quarters; additions and missing lineage stay blocked', () => {
  const oldMeta = metadata({ accessionNumber: '0001172661-22-000001', reportDate: '2022-09-30', filingDate: '2022-11-14',
    acceptanceDateTime: '2022-11-14T20:00:00Z' });
  const prior = parseSecFiling(input({ metadata: oldMeta, coverXml: cover({ period: '09-30-2022' }) }));
  assert.equal(prior.expectedValueUsd, 300000); assert.equal(prior.holdings[0].valueUsd, 100000);
  const amendment = metadata({ accessionNumber: '0001172661-23-000001', form: '13F-HR/A', reportDate: '2022-09-30',
    filingDate: '2023-01-03', acceptanceDateTime: '2023-01-03T20:00:00Z' });
  const amendedInput = input({ metadata: amendment, parent: prior, coverXml: cover({ period: '09-30-2022', form: '13F-HR/A', amendment: true }) });
  const corrected = parseSecFiling(amendedInput);
  assert.equal(corrected.expectedValueUsd, 300); assert.equal(corrected.kind, 'restatement');
  assert.equal(corrected.revision, 1); assert.equal(corrected.parentAccession, prior.accession); assert.equal(corrected.publicAt, null);
  assert.throws(() => parseSecFiling({ ...amendedInput, parent: undefined }), /원본과 순서/);
  assert.throws(() => parseSecFiling({ ...amendedInput, parent: { ...prior, guruId: 'another-manager' } }), /원본과 순서/);
  assert.throws(() => parseSecFiling({ ...amendedInput, coverXml: amendedInput.coverXml.replace('RESTATEMENT', 'NEW HOLDINGS') }), /추가형/);
  assert.throws(() => parseSecFiling({ ...amendedInput, coverXml: amendedInput.coverXml.replace('<amendmentNo>1', '<amendmentNo>2') }), /원본과 순서/);
});
