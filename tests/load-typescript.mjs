import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

export function loadTypescript(path, overrides={}, cache=new Map()) {
  const absolute=resolve(path);
  if(cache.has(absolute)) return cache.get(absolute);
  const exports={}; cache.set(absolute,exports);
  const require=createRequire(absolute);
  const source=readFileSync(absolute,'utf8');
  const {outputText}=ts.transpileModule(source,{fileName:absolute,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
  const localRequire=(name)=> {
    if(name in overrides)return overrides[name];
    if(!name.startsWith('.')&&!name.startsWith('@/'))return require(name);
    const base=name.startsWith('@/')?resolve('src',name.slice(2)):resolve(dirname(absolute),name);
    const file=['', '.ts','.tsx','/index.ts'].map(s=>base+s).find(existsSync);
    if(!file)throw new Error(`Cannot resolve ${name} from ${absolute}`);
    return loadTypescript(file,overrides,cache);
  };
  runInNewContext(outputText,{exports,require:localRequire,console,Date,Intl,Map,Set,Promise,JSON,Number,Object,Array,Math,Error,TypeError,DOMException,AbortController,AbortSignal,URLSearchParams,structuredClone,crypto:globalThis.crypto,setTimeout,clearTimeout,setInterval,clearInterval,fetch:(...args)=>globalThis.fetch(...args)}, {filename:absolute});
  return exports;
}
