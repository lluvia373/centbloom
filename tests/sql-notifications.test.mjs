import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
test('notification SQL: account isolation, no-baseline/no-data silence, follows, dedup, read, late delivery, retry and pagination',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.query('insert into auth.users values($1),($2)',[a,b]);
 await db.exec(readFileSync('supabase/migrations/20260912112710_account_watchlists.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20260923030710_guru_notifications.sql','utf8'));
 const account=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const rpc=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
 const visit=async(id=crypto.randomUUID())=>rpc('select public.visit_notifications($1) value',[id]);
 const list=async(before=null,id=null)=>rpc('select public.read_notifications($1,$2) value',[before,id]);
 const follow=async(active,id=crypto.randomUUID())=>rpc("select public.set_guru_follow($1,'pershing-square',$2) value",[id,active]);
 const event=async(id,kind='guru_filing',subject='pershing-square',time=new Date().toISOString())=>{
  await db.exec('reset role;set role service_role');
  const payload={event_id:id,kind,subject_id:subject,title:'Verified event',source_url:'https://www.sec.gov/Archives/edgar/example',occurred_at:time,evidence:{sourceId:id}};
  await rpc('select public.record_notification_event($1) value',[JSON.stringify(payload)]);return payload;
 };
 await event('historical','guru_filing','pershing-square','2025-01-01T00:00:00Z');
 await account(a);await follow(true);const firstId=crypto.randomUUID();const first=await visit(firstId);
 assert.equal(first.since,null);assert.deepEqual(await list(),[]);assert.deepEqual(await visit(firstId),first);
 await visit();assert.deepEqual(await list(),[]);
 await event('new');await account(a);assert.deepEqual(await visit(firstId),first);let rows=await list();assert.equal(rows.length,1);assert.equal(rows[0].read_at,null);
 await visit();assert.equal((await list()).length,1);
 await rpc('select public.mark_notification_read($1) value',['new']);const readAt=(await list())[0].read_at;
 await rpc('select public.mark_notification_read($1) value',['new']);assert.equal((await list())[0].read_at,readAt);
 await account(b);await visit();assert.deepEqual(await list(),[]);
 assert.equal((await db.query('select count(*)::int n from public.account_notifications')).rows[0].n,0);
 await assert.rejects(db.exec("insert into public.notification_events(event_id) values('fake')"),/permission denied/);
 await assert.rejects(rpc('select public.record_notification_event($1) value',['{}']),/permission denied/);
 await rpc('select public.mark_notification_read($1) value',['new']);
 await account(a);const oldRequest=crypto.randomUUID();await follow(false,oldRequest);await follow(true);await follow(false,oldRequest);
 assert.equal((await db.query('select active from public.guru_follows')).rows[0].active,true);
 await assert.rejects(follow(true,oldRequest),/Request ID reused/);
 await rpc("select public.commit_watchlist($1,'add',$2) value",[crypto.randomUUID(),JSON.stringify({symbol:'AAPL',name:'Apple',targetPrice:null,targetCurrency:null,addedAt:new Date().toISOString()})]);
 await event('watched','watch_change','AAPL');await event('not-watched','watch_change','MSFT');
 await account(a);await visit();rows=await list();assert.ok(rows.some(r=>r.event_id==='watched'));assert.ok(!rows.some(r=>r.event_id==='not-watched'));
 const lateTime=new Date().toISOString();await visit();await event('late','guru_amendment','pershing-square',lateTime);await account(a);await visit();assert.ok((await list()).some(r=>r.event_id==='late'));
 const same=await event('dedup');await db.query('select public.record_notification_event($1)',[JSON.stringify(same)]);
 await assert.rejects(db.query('select public.record_notification_event($1)',[JSON.stringify({...same,title:'changed'})]),/identity conflict/);
 for(let i=0;i<51;i++)await event('many-'+i);
 await account(a);await visit();const page=await list();assert.equal(page.length,50);const rest=await list(page.at(-1).delivered_at,page.at(-1).event_id);assert.ok(rest.length>0);assert.ok(rest.every(r=>!page.some(p=>p.event_id===r.event_id)));
 // The header badge asks for existence across every delivery, not this page.
 for(const item of page)await rpc('select public.mark_notification_read($1) value',[item.event_id]);
 assert.ok((await list()).every(item=>item.read_at));
 const unread=async userId=>(await db.query('select event_id from public.account_notifications where user_id=$1 and read_at is null limit 1',[userId])).rows;
 assert.equal((await unread(a)).length,1,'an unread event beyond the first 50 still lights the badge');
 await account(b);assert.equal((await unread(a)).length,0,'RLS rejects another account even with its explicit user ID');
 assert.equal((await unread(b)).length,0);
 await db.exec('reset role;set role anon');await assert.rejects(visit(),/permission denied/);await assert.rejects(list(),/permission denied/);
 }finally{await db.close();}
});
