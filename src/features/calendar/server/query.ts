import { shiftMonth, validMonth } from "../model";
import { shiftDay, validDay } from "../navigation";
export interface CalendarQuery {from?:string;to?:string;series?:string;id?:string}
export function calendarQuery(params:URLSearchParams):CalendarQuery|null {
  const month=params.get("month"),week=params.get("week"),series=params.get("series"),id=params.get("event");
  if ([month,week,series,id].filter(value=>value!==null).length!==1) return null;
  if (id) return /^[\w:-]{1,150}$/.test(id) ? {id} : null;
  if (series) return series.length<=200 && /^(te:US:|schedule:|earnings:).+/.test(series) ? {series} : null;
  if (week && validDay(week)) return {from:new Date(week+"T00:00:00+09:00").toISOString(),to:new Date(shiftDay(week,7)+"T00:00:00+09:00").toISOString()};
  if (month && validMonth(month)) return {from:new Date(month+"-01T00:00:00+09:00").toISOString(),to:new Date(shiftMonth(month,1)+"-01T00:00:00+09:00").toISOString()};
  return null;
}
