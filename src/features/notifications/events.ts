import type { GuruFiling } from "@/features/gurus/model";
import { validateFiling } from "@/features/gurus/model";
import { changeObservation, type MarketChange } from "@/features/market/market-changes";

export interface VerifiedEvent {
  event_id:string;kind:"guru_filing"|"guru_amendment"|"watch_change";
  subject_id:string;title:string;source_url:string;occurred_at:string;evidence:Record<string,unknown>;
}
/** Historical imports with unknown public availability never emit a new-filing alert. */
export function filingEvent(filing:GuruFiling,now=Date.now()):VerifiedEvent|null{
  if(validateFiling(filing)||!filing.publicAt||filing.kind==="addition")return null;
  const time=Date.parse(filing.publicAt);
  if(!Number.isFinite(time)||time>now)return null;
  return {event_id:`sec:${filing.accession}`,kind:filing.kind==="original"?"guru_filing":"guru_amendment",subject_id:filing.guruId,
    title:`${filing.period} 기준 ${filing.kind==="original"?"새 보유 공시":"보유 공시 정정"}`,source_url:filing.source,occurred_at:filing.publicAt,
    evidence:{accession:filing.accession,period:filing.period,publicAt:filing.publicAt}};
}
/** Input is an already verified server observation. No client event submission endpoint. */
export function watchedEvent(change:MarketChange,source:string,now=Date.now()):VerifiedEvent|null{
  const at=change.quote.quotedAt,time=Date.parse(at??"");
  if(!at||!Number.isFinite(time)||time>now||now-time>86400_000||!/^https:\/\//.test(source)||!change.signals.length
    ||change.signals.some(s=>![s.value,s.baseline,s.ratio].every(Number.isFinite)||s.baseline<=0||s.ratio<=0))return null;
  const kinds=[...new Set(change.signals.map(s=>s.kind))].sort().join("+");
  return {event_id:`watch:${change.quote.symbol}:${change.sessionDate}:${kinds}`,kind:"watch_change",subject_id:change.quote.symbol,
    title:`${change.quote.name} · ${changeObservation(change).headline}`,source_url:source,occurred_at:at,
    evidence:{sessionDate:change.sessionDate,quotedAt:at,signals:change.signals}};
}
