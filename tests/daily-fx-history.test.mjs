import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const fx = loadTypescript('src/features/market/fx-history.ts');
const { normalizeCurrency, toKRW } = loadTypescript('src/lib/currency.ts');
const now = Date.parse('2026-09-22T01:00:00Z');
const rates = { USD: 1.1, JPY: 140, GBP: 0.8, CNY: 7, KRW: 1400 };
const dayXml = (date, values = rates) => `<Cube time="${date}">${Object.entries(values).map(([currency, rate]) => `<Cube currency="${currency}" rate="${rate}"/>`).join('')}</Cube>`;
const document = (...days) => `<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube>${days.join('')}</Cube></gesmes:Envelope>`;
const parsed = (...days) => fx.parseDailyFxReferences(document(...days));
const build = (currency, start, end, days, asOf = now) => fx.buildDailyFxSeries(currency, start, end, days, asOf);

test('one ECB publication converts every supported currency to KRW per one unit, including JPY and EUR', () => {
  const [row] = parsed(dayXml('2026-09-18'));
  assert.equal(row.date, '2026-09-18'); assert.equal(row.rates.KRW, 1);
  assert.equal(row.rates.CNY, 200); assert.equal(row.rates.JPY, 10); assert.equal(row.rates.EUR, 1400);
  assert.equal(row.rates.GBP, 1750); assert.equal(row.rates.USD, 1400 / 1.1);
  const jpy = build('JPY', '2026-09-18', '2026-09-18', [row]);
  assert.equal(jpy.points[0].close, 10); assert.equal(toKRW(100, 'JPY', jpy.points[0].close), 1000);
  assert.equal(jpy.baseCurrency, 'KRW'); assert.equal(jpy.method, 'daily-reference'); assert.equal(jpy.source, 'ecb-reference');
});

test('parsing sorts source dates, never mixes publication legs and keeps missing KRW as an explicit empty day', () => {
  const result = parsed(dayXml('2026-09-21', { CNY: 8 }), dayXml('2026-09-18'), dayXml('2026-09-17', { ...rates, KRW: 700 }));
  assert.deepEqual(Array.from(result, row => row.date), ['2026-09-17', '2026-09-18', '2026-09-21']);
  assert.equal(result[0].rates.CNY, 100); assert.equal(result[1].rates.CNY, 200);
  assert.deepEqual(Object.keys(result[2].rates), []);
  assert.throws(() => build('CNY', '2026-09-21', '2026-09-21', result), /2026-09-21 CNY→KRW.*필요 자료: 2026-09-21/);
});

test('truncated or foreign XML, duplicate publication dates and impossible dates fail closed', () => {
  for (const xml of ['', '<html>offline</html>', document(), document(dayXml('2026-09-18')).replace('</gesmes:Envelope>', ''),
    document(dayXml('2026-09-18')).replace('http://www.ecb.int/vocabulary/2002-08-01/eurofxref', 'https://example.test/fx'),
    document(dayXml('2026-09-18'), dayXml('2026-09-18')), document(dayXml('2026-02-30')), document(dayXml('1999-01-03'))])
    assert.throws(() => fx.parseDailyFxReferences(xml));
});

test('zero, negative, non-finite and duplicate currency rates are rejected rather than carried', () => {
  for (const value of [0, -1, 'NaN', 'Infinity', 'not-a-rate', ''])
    assert.throws(() => fx.parseDailyFxReferences(document(dayXml('2026-09-18', { ...rates, CNY: value }))), `rate=${JSON.stringify(value)}`);
  const duplicate = dayXml('2026-09-18').replace('</Cube>', '<Cube currency="CNY" rate="8"/></Cube>');
  assert.throws(() => fx.parseDailyFxReferences(document(duplicate)));
  assert.throws(() => fx.parseDailyFxReferences(document(dayXml('2026-09-18', { ...rates, EUR: 1 }))));
});

// Historical rules: ECB pr990715_1.en.html, pr000525_2.en.html, pr001214_4.en.html.
test('TARGET calendars include the 1999 and 2001 exceptions without adding UK-style substitute days', () => {
  for (const date of ['1999-12-31', '2001-12-31', '2000-04-21', '2000-04-24', '2026-04-03', '2026-04-06',
    '2026-01-01', '2026-05-01', '2026-12-25', '2026-12-26', '2026-09-19', '2026-09-20'])
    assert.equal(fx.isFxReferenceHoliday(date), true, date);
  for (const date of ['1999-04-02', '1999-04-05', '2002-12-31', '2021-12-27', '2021-12-28', '2022-01-03', '2026-09-18'])
    assert.equal(fx.isFxReferenceHoliday(date), false, date);
});

test('weekend rows retain the source Friday date and do not change the stored publication days', () => {
  const days = parsed(dayXml('2026-09-18'), dayXml('2026-09-21', { ...rates, CNY: 8 }));
  const before = JSON.stringify(days);
  const result = build('CNY', '2026-09-18', '2026-09-21', days);
  assert.deepEqual(Array.from(result.points, p => [p.date, p.close, p.referenceDate, p.carried]), [
    ['2026-09-18', 200, '2026-09-18', false], ['2026-09-19', 200, '2026-09-18', true],
    ['2026-09-20', 200, '2026-09-18', true], ['2026-09-21', 175, '2026-09-21', false],
  ]);
  assert.equal(JSON.stringify(days), before);
});

test('Easter and the millennium special closure carry the last required publication date', () => {
  const easter = build('USD', '2026-04-03', '2026-04-06', parsed(dayXml('2026-04-02')));
  assert.equal(easter.points.length, 4); assert.ok(easter.points.every(p => p.referenceDate === '2026-04-02' && p.carried));
  const millennium = build('USD', '1999-12-31', '2000-01-02', parsed(dayXml('1999-12-30')));
  assert.ok(millennium.points.every(p => p.referenceDate === '1999-12-30' && p.carried));
  const special = build('USD', '2001-12-31', '2002-01-01', parsed(dayXml('2001-12-28')));
  assert.ok(special.points.every(p => p.referenceDate === '2001-12-28' && p.carried));
});

test('a missing required Friday or weekday blocks carrying an older rate across the gap', () => {
  const days = parsed(dayXml('2026-09-17'));
  assert.throws(() => build('CNY', '2026-09-20', '2026-09-20', days), /2026-09-20 CNY→KRW.*필요 자료: 2026-09-18/);
  assert.throws(() => build('CNY', '2026-09-18', '2026-09-18', days), /필요 자료: 2026-09-18/);
  assert.throws(() => build('CNY', '2026-09-21', '2026-09-21', days), /필요 자료: 2026-09-21/);
  assert.throws(() => build('USD', '2021-12-27', '2021-12-27', parsed(dayXml('2021-12-24'))), /필요 자료: 2021-12-27/);
});

test('a publication with one missing currency is not replaced by an earlier publication for that currency', () => {
  const days = parsed(dayXml('2026-09-17'), dayXml('2026-09-18', { USD: 1.1, KRW: 1400 }));
  assert.equal(build('USD', '2026-09-20', '2026-09-20', days).points[0].referenceDate, '2026-09-18');
  for (const date of ['2026-09-18', '2026-09-19', '2026-09-20'])
    assert.throws(() => build('CNY', date, date, days), /CNY→KRW.*필요 자료: 2026-09-18/);
});

test('currency introduction, discontinued currencies and CNY/CNH remain distinct coverage boundaries', () => {
  const beforeCny = parsed(dayXml('2005-03-31', { USD: 1.1, KRW: 1400 }), dayXml('2005-04-01'));
  assert.throws(() => build('CNY', '2005-03-31', '2005-03-31', beforeCny), /필요 자료: 2005-03-31/);
  assert.equal(build('CNY', '2005-04-01', '2005-04-01', beforeCny).points[0].close, 200);
  assert.throws(() => build('CNH', '2005-04-01', '2005-04-01', beforeCny), /CNH→KRW/);
  const rub = parsed(dayXml('2022-03-01', { ...rates, RUB: 120 }), dayXml('2022-03-02'));
  assert.throws(() => build('RUB', '2022-03-02', '2022-03-02', rub), /RUB→KRW.*필요 자료: 2022-03-02/);
});

test('today remains a carried provisional row even if a same-day publication is already present', () => {
  const mondayMorning = Date.parse('2026-09-21T01:00:00Z');
  const days = parsed(dayXml('2026-09-18'), dayXml('2026-09-21', { ...rates, KRW: 7000 }));
  const result = build('CNY', '2026-09-20', '2026-09-21', days, mondayMorning);
  assert.equal(result.points[1].date, '2026-09-21'); assert.equal(result.points[1].close, 200);
  assert.equal(result.points[1].referenceDate, '2026-09-18'); assert.equal(result.points[1].carried, true);
  assert.equal(build('CNY', '2026-09-21', '2026-09-21', days, now).points[0].close, 1000);
  assert.throws(() => build('CNY', '2026-09-22', '2026-09-22', parsed(dayXml('2026-09-18')), now), /필요 자료: 2026-09-21/);
});

test('calendar dates use KST midnight, validate leap days and reject future or pre-archive ranges', () => {
  assert.equal(fx.fxToday(Date.parse('2026-09-20T14:59:59Z')), '2026-09-20');
  assert.equal(fx.fxToday(Date.parse('2026-09-20T15:00:00Z')), '2026-09-21');
  assert.equal(fx.validFxDate('2024-02-29'), true); assert.equal(fx.validFxDate('2026-02-29'), false);
  assert.equal(fx.shiftFxDate('2024-02-28', 1), '2024-02-29'); assert.equal(fx.shiftFxDate('2026-01-01', -1), '2025-12-31');
  for (const [start, end] of [['1999-01-03', '1999-01-04'], ['2026-09-23', '2026-09-23'], ['2026-09-20', '2026-09-19'],
    ['2026-02-30', '2026-03-01'], ['2026-9-18', '2026-09-18']])
    assert.throws(() => build('KRW', start, end, []));
});

test('the seven-day policy never rescues over-age observations or skips missing business days', () => {
  assert.equal(fx.FX_HISTORY_MAX_CARRY_DAYS, 7);
  const ancient = parsed(dayXml('2026-09-11'));
  assert.throws(() => build('CNY', '2026-09-20', '2026-09-20', ancient), /필요 자료: 2026-09-18/);
  // Requiring the nearest business day is stricter than the absolute seven-day cap.
  assert.throws(() => build('CNY', '2026-09-18', '2026-09-18', ancient), /필요 자료: 2026-09-18/);
});

test('callers normalize lowercase and pence currencies; the shared store itself only accepts canonical currencies', () => {
  const days = parsed(dayXml('2026-09-18'));
  for (const value of ['gbp', 'GBp', 'GBX', 'krw', 'US', 'USD=X'])
    assert.throws(() => build(value, '2026-09-18', '2026-09-18', days));
  for (const input of ['gbp', 'GBp', 'GBX']) {
    const rate = build(normalizeCurrency(input), '2026-09-18', '2026-09-18', days).points[0].close;
    assert.equal(rate, 1750);
    assert.equal(toKRW(input === 'gbp' ? 1 : 100, input, rate), 1750);
  }
});

test('KRW is the identity without external data and invalid stored values do not pass selection', () => {
  const result = build('KRW', '2026-09-20', '2026-09-22', []);
  assert.ok(result.points.every(p => p.close === 1 && !p.carried && p.referenceDate === p.date));
  for (const value of [0, -1, NaN, Infinity, undefined])
    assert.throws(() => build('CNY', '2026-09-18', '2026-09-18', [{ date: '2026-09-18', rates: { CNY: value } }]));
});
