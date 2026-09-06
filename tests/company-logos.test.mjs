import test from "node:test";
import assert from "node:assert/strict";
import {loadTypescript} from "./load-typescript.mjs";
const {companyLogoSources}=loadTypescript("src/lib/company-logos.ts");
const sources=(...args)=>Array.from(companyLogoSources(...args));

test("verified originals precede supplied Yahoo logos and automatic symbol lookup",()=>{
  const result=sources(" aapl ", "https://s.yimg.com/logo.png");
  assert.equal(result[0],"/companies/aapl.png");
  assert.equal(result[1],"https://s.yimg.com/logo.png");
  assert.match(result[2],/logos\/symbol\/AAPL\?format=png&size=64$/);
  assert.equal(sources("TSLA").length,1);
});
test("international identifiers and share classes retain their exchange and class",()=>{
  for(const symbol of ["035720.KS","9984.T","3690.HK","601318.SS","002594.SZ","BRK-B"]) {
    const url=new URL(sources(symbol).at(-1));
    assert.equal(url.pathname,"/logos/symbol/"+symbol);
  }
});
test("untrusted URLs cannot bypass the source allowlist or disable the fallback",()=>{
  for(const url of ["oops","http://s.yimg.com/logo","https://s.yimg.com.evil.test/logo","https://user:password@s.yimg.com/logo","https://s.yimg.com:444/logo","data:image/svg+xml,x"]) {
    assert.equal(sources("TSLA",url).length,1);
    assert.equal(new URL(sources("TSLA",url)[0]).hostname,"api.elbstream.com");
  }
});
test("non-company identifiers and malformed input do not request another company's mark",()=>{
  for(const symbol of ["^GSPC","KRW=X","GC=F","","../logo","A/B","A?token=x","A".repeat(41)]) {
    assert.equal(sources(symbol).length,0);
  }
  assert.ok(sources("constructor").every(url=>!url.startsWith("/companies/")));
});
