import test from 'node:test';import assert from 'node:assert/strict';import {loadTypescript} from './load-typescript.mjs';
const {parseTransactionBackup,serializeTransactionBackup}=loadTypescript('src/lib/transaction-backup.ts');
const {applyCommand}=loadTypescript('src/features/portfolio/model/commands.ts');
const tx={id:'legacy-id',symbol:'AAPL',name:'Apple',type:'buy',date:'2020-01-01',quantity:5,price:100,fee:1,createdAt:'2020-01-01T00:00:00Z'};
test('legacy backup without FX remains importable; roundtrip preserves amounts and merge deduplicates IDs',()=> {
 const legacy={format:'stockfolio-transactions',version:1,exportedAt:'2020-01-01T00:00:00Z',transactions:[tx]};const result=parseTransactionBackup(legacy);assert.equal(result.ok,true);
 assert.equal(parseTransactionBackup(JSON.parse(serializeTransactionBackup(result.backup.transactions))).ok,true);
 const merged=applyCommand([tx],{type:'import',mode:'merge',records:[tx,{...tx,id:'new'}]});assert.equal(merged.skippedCount,1);assert.equal(merged.transactions.length,2);assert.equal(merged.transactions[0].fee,1);
});
test('malformed backup and chronologically invalid edits/deletes fail before replacing anything',()=> {
 const original=[tx,{...tx,id:'sale',type:'sell',date:'2020-01-02',quantity:4}];
 assert.throws(()=>applyCommand(original,{type:'update',id:tx.id,changes:{quantity:3}}),/초과/);
 assert.throws(()=>applyCommand(original,{type:'delete',id:tx.id}),/초과/);
 assert.throws(()=>applyCommand(original,{type:'import',mode:'replace',records:[{...tx,price:NaN}]}));assert.equal(original.length,2);assert.equal(original[0].quantity,5);
});

test('Centifolio backup amounts survive import and export uses the Centbloom format',()=>{
 const original={format:'centifolio-transactions',version:1,exportedAt:'2020-01-01T00:00:00Z',transactions:[tx]};
 const parsed=parseTransactionBackup(original);assert.equal(parsed.ok,true);
 const exported=JSON.parse(serializeTransactionBackup(parsed.backup.transactions));
 assert.equal(exported.format,'centbloom-transactions');assert.equal(exported.transactions[0].quantity,5);assert.equal(exported.transactions[0].price,100);assert.equal(exported.transactions[0].fee,1);
 assert.equal(original.format,'centifolio-transactions');
});
