// Optional real PostgreSQL test. Runtime stays outside app dependencies under work/pg-runtime.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { portfolioSchema } from './fixtures/portfolio-schema.mjs';
import pg from '../work/pg-runtime/node_modules/pg/lib/index.js';
import { initdb, postgres, pg_ctl } from '../work/pg-runtime/node_modules/@embedded-postgres/windows-x64/dist/index.js';

const directory=resolve('work/pg-concurrency-'+randomUUID());
mkdirSync(directory,{recursive:true});
const password=randomUUID();
writeFileSync(resolve(directory,'password'),password);
const data=resolve(directory,'data');
execFileSync(initdb,['-D',data,'-U','postgres','--auth=scram-sha-256','--pwfile='+resolve(directory,'password'),'--encoding=UTF8','--locale=C'],{windowsHide:true,stdio:'pipe'});
const server=spawn(postgres,['-D',data,'-p','55439','-h','127.0.0.1'],{windowsHide:true,stdio:'ignore'});
const clients=[];
const connect=async()=>{const client=new pg.Client({host:'127.0.0.1',port:55439,user:'postgres',password,database:'postgres',connectionTimeoutMillis:1000});await client.connect();clients.push(client);return client;};
try {
 let admin;
 for(let i=0;i<40;i++){try{admin=await connect();break;}catch{await delay(100);}}
 assert.ok(admin,'Postgres did not start');
 const owner=randomUUID();
 await admin.query(portfolioSchema(owner));
 for(const table of ['portfolio_transactions','portfolio_preferences','portfolio_snapshots']) await admin.query(`alter table public.${table} enable row level security; create policy own on public.${table} for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id); grant select,insert,update,delete on public.${table} to authenticated;`);
 const migration=process.argv[2]||'supabase/migrations/20260905194009_atomic_portfolio_ledger.sql';
 await admin.query(readFileSync(migration,'utf8'));
 const [a,b]=await Promise.all([connect(),connect()]);
 for(const client of [a,b]) await client.query(`set role authenticated; set request.jwt.claim.sub='${owner}'; set statement_timeout='5s';`);
 const read=async client=>(await client.query('select public.read_portfolio_ledger() snapshot')).rows[0].snapshot;
 const initial=await read(a);
 const row={id:randomUUID(),user_id:owner,symbol:'QA',name:'QA',transaction_type:'buy',trade_date:'2026-01-01',quantity:1,price:100,fee:0,currency:'KRW',fx_rate_to_krw:1,usd_krw_rate_at_transaction:1300,created_at:'2026-01-01T00:00:00Z'};
 const request=randomUUID();
 const commit=(client,revision,id,rows)=>client.query('select public.commit_portfolio_ledger($1,$2,$3) snapshot',[revision,id,JSON.stringify(rows)]);
 await a.query('begin');
 const first=(await commit(a,initial.revision,request,[row])).rows[0].snapshot;
 let settled=false;
 const pending=commit(b,initial.revision,randomUUID(),[{...row,price:200}]).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
 // Poll the server's lock table, not a guessed scheduling delay.
 let waiting=false;
 for(let i=0;i<100;i++){const result=await admin.query("select count(*)::int n from pg_locks where locktype='advisory' and not granted");if(result.rows[0].n){waiting=true;break;}await delay(10);}
 assert.ok(waiting,'second connection never waited for the ledger lock');assert.equal(settled,false);
 await a.query('commit');
 const conflict=await pending;assert.equal(conflict.error?.code,'40001');
 assert.deepEqual(await read(b),first);
 assert.deepEqual((await commit(b,initial.revision,request,[row])).rows[0].snapshot,first,'lost response retry must be idempotent');
 const refreshed=(await commit(b,first.revision,randomUUID(),[{...row,price:200}])).rows[0].snapshot;
 assert.equal(Number(refreshed.transactions[0].price),200);
 console.log(JSON.stringify({postgres:(await admin.query('select version()')).rows[0].version,independentConnections:2,lockWaitObserved:true,staleWriteCode:conflict.error.code,idempotency:true,retryAfterRefresh:true}));
} finally {
 await Promise.allSettled(clients.map(client=>client.end()));
 execFileSync(pg_ctl,['-D',data,'stop','-m','fast'],{windowsHide:true,stdio:'pipe'});
 server.unref();
}
