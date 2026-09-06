import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const release=(id="te:1",updatedAt="2026-09-01T00:00:00Z",actual=null)=>({id,seriesKey:"te:US:CPIYOY",at:"2026-09-11T12:30:00Z",updatedAt,actual,forecast:"2.5%",previous:"2.4%",previousOriginal:null,title:"CPI YoY",detail:"AUG",unit:"%",source:{label:"BLS",url:"https://bls.gov"},timingEstimated:false});
test("archive transaction preserves release history, rejects stale overwrites and protects public writes",async()=>{
 const db=new PGlite();
 try {
  await db.exec("create role anon;create role authenticated;create role service_role;");
  await db.exec(readFileSync("supabase/migrations/20260906140000_economic_calendar.sql","utf8"));
  await db.exec("set role service_role");
  const ingest=items=>db.query("select public.ingest_economic_releases($1::jsonb)",[JSON.stringify(items)]);
  const read=async()=> (await db.query("select payload from economic_releases where id='te:1'")).rows[0].payload;
  await ingest([release()]);
  const published=release("te:1","2026-09-11T12:30:01Z","0");
  await ingest([published]);await ingest([published]);
  assert.equal((await read()).actual,"0");
  assert.equal((await db.query("select count(*)::int n from economic_release_versions")).rows[0].n,2);
  await ingest([release("te:1","2026-09-02T00:00:00Z","9%")]);assert.equal((await read()).actual,"0");
  await ingest([release("te:1","2026-09-12T00:00:00Z",null)]);assert.equal((await read()).actual,"0");
  await assert.rejects(ingest([release("te:2"),{...release("te:3"),updatedAt:"invalid"}]));
  assert.equal((await db.query("select count(*)::int n from economic_releases")).rows[0].n,1);
  await assert.rejects(ingest([{...release(),seriesKey:"te:US:DIFFERENT"}]),/identity/);
  await db.exec("reset role;set role anon");
  assert.equal((await db.query("select count(*)::int n from economic_releases")).rows[0].n,1);
  await assert.rejects(ingest([published]),/permission denied/);
  await assert.rejects(db.query("delete from economic_releases"),/permission denied/);
  await assert.rejects(db.query("select * from economic_release_versions"),/permission denied/);
  await db.exec("reset role");
  await db.exec(readFileSync("supabase/rollback/economic_calendar.sql","utf8"));
  assert.equal((await db.query("select count(*)::int n from economic_releases")).rows[0].n,1);
 } finally { await db.close(); }
});
