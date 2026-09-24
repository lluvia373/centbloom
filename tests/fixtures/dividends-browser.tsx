// Isolated test cases only: no account, persistent storage or network collection.
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { DividendSchedule } from '../../src/features/dividends/DividendSchedule';
import { SharedDividendSchedule } from '../../src/features/dividends/SharedDividendSchedule';
import { sharedDividends } from '../../src/features/dividends/repository';
import { dividendFeed } from '../../src/features/dividends/feed';
import type { Transaction } from '../../src/lib/types';

const trade = (id: string, date: string, quantity = 10): Transaction => ({
  id, portfolioId:'test', date, quantity, symbol:'AAPL', name:'Apple Inc.', type:'buy', price:100, fee:0, currency:'USD', createdAt:`${date}T00:00:00Z`,
});
const cases: Record<string, Transaction[]> = {
  shared:[{...trade('common-msft','2026-01-02'),symbol:'MSFT',name:'Microsoft'}, {...trade('common-sk','2026-01-02'),symbol:'000660.KS',name:'SK하이닉스'}],
  mixed:dividendFeed.symbols.map((item,i)=>({...trade(`mixed-${i}`,'2024-01-02'),symbol:item.symbol,name:item.symbol})),
  normal:[trade('normal','2026-01-02')],
  boundary:[trade('normal','2026-01-02'),trade('boundary','2026-08-10',1)],
  empty:[],
  unsupported:[{...trade('unknown','2026-01-02'),symbol:'UNSUPPORTED'}],
  large:Array.from({length:1000},(_,i)=>trade(`large-${i}`,'2026-01-02',0.01)),
};
const initialStarted=performance.now();
function TestPage() {
  const [mode,setMode]=useState('shared');
  const sharedFeed=useSyncExternalStore(sharedDividends.subscribe,sharedDividends.getSnapshot,sharedDividends.getServerSnapshot);
  const started=useRef(initialStarted);
  const result=useRef<HTMLOutputElement>(null);
  useLayoutEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      if(!result.current)return;
      if(mode==='shared'&&!['MSFT','000660.KS'].every(symbol=>sharedFeed.events.some(event=>event.symbol===symbol))){result.current.textContent='공통 자료 확인 중';return;}
      const resources=performance.getEntriesByType('resource').filter(row=>row.name.includes('/data/dividends/'));
      result.current.textContent=`실제 배당 표시 완료 ${Math.round(performance.now()-started.current)}ms · 공통 자료 요청 ${resources.length}회`;
    });
    return ()=>cancelAnimationFrame(frame);
  },[mode,sharedFeed]);
  return <main>
    <p>격리 검사 화면 · 실제 계정에는 저장하지 않습니다.</p>
    <label>검사 상태 <select value={mode} onChange={event=>{started.current=performance.now();setMode(event.target.value);}}>
      <option value="shared">새 기업 공통 자료</option>
      <option value="mixed">여러 종목</option><option value="normal">정상 10주</option><option value="boundary">경계일 매매</option><option value="empty">거래 없음</option><option value="unsupported">미지원 종목</option><option value="large">거래 1,000개</option>
    </select></label>
    <output ref={result} aria-live="polite" />
    <div className="card">{mode==='shared' ? <SharedDividendSchedule key={mode} transactions={cases[mode]} portfolioId="test" /> : <DividendSchedule key={mode} transactions={cases[mode]} portfolioId="test" feed={dividendFeed} asOfDate="2026-09-24" />}</div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<TestPage/>);
