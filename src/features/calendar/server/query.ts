import { shiftMonth, validMonth } from "../model";
import { shiftDay, validDay } from "../navigation";
export interface CalendarQuery {from?:string;to?:string;series?:string;id?:string}
export function calendarQuery(params:URLSearchParams):CalendarQuery|null {
  const month=params.get("month"),week=params.get("week"),agenda=params.get("agenda"),series=params.get("series"),id=params.get("event");
  if ([month,week,agenda,series,id].filter(value=>value!==null).length!==1) return null;
  if (id) return /^[\w:-]{1,150}$/.test(id) ? {id} : null;
  if (series) return series.length<=200 && /^(te:US:|bls:US:|schedule:|earnings:).+/.test(series) ? {series} : null;
  if (agenda && validDay(agenda)) return {from:new Date(shiftDay(agenda,-7)+"T00:00:00+09:00").toISOString(),to:new Date(shiftDay(agenda,46)+"T00:00:00+09:00").toISOString()};
  if (week && validDay(week)) return {from:new Date(week+"T00:00:00+09:00").toISOString(),to:new Date(shiftDay(week,7)+"T00:00:00+09:00").toISOString()};
  if (month && validMonth(month)) return {from:new Date(month+"-01T00:00:00+09:00").toISOString(),to:new Date(shiftMonth(month,1)+"-01T00:00:00+09:00").toISOString()};
  return null;
}
