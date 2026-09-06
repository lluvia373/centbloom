import type { EconomicEvent } from "./model";
export interface MetricValues { actual:string|null; forecast:string|null; previous:string|null }
export interface Release extends EconomicEvent {
  /** Missing kind in older archives means economic. */
  kind?: "economic" | "earnings";
  earnings?: {symbol:string;currency:string;eps:MetricValues;revenue:MetricValues};
  seriesKey: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  previousOriginal: string | null;
  unit: string;
  updatedAt: string | null;
  timingEstimated: boolean;
}
export interface CalendarFeed {
  events: Release[];
  connected: boolean;
  earningsConnected?:boolean;
  asOf?: number;
}
export function scheduleRelease(event: EconomicEvent): Release {
  return {...event,kind:"economic",seriesKey:"schedule:"+event.title,actual:null,forecast:null,
    previous:null,previousOriginal:null,unit:"",updatedAt:null,timingEstimated:false};
}
const received = (value:string|null|undefined) => value != null && value.trim() !== "";
export function hasActual(event:Release) {
  return event.kind === "earnings" ? received(event.earnings?.eps.actual) || received(event.earnings?.revenue.actual) : received(event.actual);
}
export function releaseStatus(event:Release,now:number) {
  if (event.kind === "earnings" && hasActual(event)) {
    return received(event.earnings?.eps.actual) && received(event.earnings?.revenue.actual) ? "발표 완료" : "일부 결과 수신";
  }
  if (hasActual(event)) return "발표 완료";
  return Date.parse(event.at)>now ? "발표 예정" : "결과 대기";
}
export function displayValue(value:string|null,unit="") {
  if (!received(value)) return "—";
  return unit && !value!.includes(unit) ? value+" "+unit : value!;
}
export function releaseMetrics(event:Release) {
  const missing:MetricValues = {actual:null,forecast:null,previous:null};
  return event.kind === "earnings" ? [
    {key:"eps",label:"주당순이익 (EPS)",unit:event.earnings?.currency ?? "",...(event.earnings?.eps ?? missing)},
    {key:"revenue",label:"매출",unit:event.earnings?.currency ?? "",...(event.earnings?.revenue ?? missing)},
  ] : [{key:"economic",label:"발표 수치",unit:event.unit,actual:event.actual,forecast:event.forecast,previous:event.previous}];
}
/** Only numeric values in a consistent unit can share a chart. Missing values remain gaps. */
export function numericValue(value:string|null,unit:string) {
  if (!received(value)) return null;
  const cleaned = (unit ? value!.replace(unit,"") : value!).trim().replaceAll(",","");
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned) && Number.isFinite(Number(cleaned)) ? Number(cleaned) : null;
}
export function trendPoints(records:Release[],event:Release,metricKey:string) {
  const target = releaseMetrics(event).find(metric=>metric.key===metricKey);
  if (!target) return [];
  return records.filter(record=>record.seriesKey===event.seriesKey)
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))
    .map(record=>{
      const metric=releaseMetrics(record).find(item=>item.key===metricKey);
      return {at:record.at,actual:metric?.unit===target.unit ? numericValue(metric.actual,metric.unit) : null,
        forecast:metric?.unit===target.unit ? numericValue(metric.forecast,metric.unit) : null};
    });
}
