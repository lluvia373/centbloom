import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const {parseCalendarInput,shiftCalendarDate,shiftCalendarMonth,calendarWeeks,clampCalendarDate}=loadTypescript('src/features/performance/date-picker.ts');

test('calendar input accepts local date formats and rejects impossible dates',()=>{
 for(const input of ['2026.09.21','2026-09-21','2026/9/21','2026. 09. 21.','20260921'])assert.equal(parseCalendarInput(input),'2026-09-21');
 for(const input of ['2026.02.29','2026.04.31','2026.13.01','','2026.09','2026.00.12'])assert.equal(parseCalendarInput(input),null);
 assert.equal(parseCalendarInput('2024.02.29'),'2024-02-29');
});

test('calendar arrows preserve real month boundaries, leap days and allowed dates',()=>{
 assert.equal(shiftCalendarDate('2026-12-31',1),'2027-01-01');
 assert.equal(shiftCalendarMonth('2024-01-31',1),'2024-02-29');
 assert.equal(shiftCalendarMonth('2024-02-29',12),'2025-02-28');
 assert.equal(shiftCalendarMonth('2026-03-31',-1),'2026-02-28');
 assert.equal(clampCalendarDate('2026-09-01','2026-09-05','2026-09-21'),'2026-09-05');
 assert.equal(clampCalendarDate('2026-09-25','2026-09-05','2026-09-21'),'2026-09-21');
});

test('calendar grid is six seven-day rows aligned from Sunday without missing dates',()=>{
 const rows=calendarWeeks('2026-09');
 assert.equal(rows.length,6);assert.ok(rows.every(row=>row.length===7));
 assert.equal(rows[0][0],'2026-08-30');assert.equal(rows[5][6],'2026-10-10');
 const dates=Array.from(rows).flat();assert.equal(new Set(dates).size,42);
 assert.equal(dates.filter(d=>d.startsWith('2026-09')).length,30);
});
