import type { ExchangeCalendar } from "./types";
import { holidays, shortened, year } from "./calendar-data";

const nordic = holidays([["01-01","신정"],["01-06","주현절"],["04-03","성금요일"],["04-06","부활절 월요일"],["05-01","노동절"],["05-14","승천일"],["06-19","한여름 전야"],["12-24","크리스마스 이브"],["12-25","크리스마스"],["12-31","연말"]]);
const sources=[{label:"Nasdaq Nordic 2026 현물시장 시간·휴일",url:"https://www.nasdaq.com/da/european-market-activity/trading-hours"}];
export const nordicCalendars: ExchangeCalendar[] = [
  {
    ...year,id:"SE",name:"스웨덴",region:"유럽",exchange:"Nasdaq Stockholm",timeZone:"Europe/Stockholm",
    windows:[{start:540,end:1050}],holidays:nordic,
    overrides:shortened(["01-05","04-02","04-30","05-13","10-30"],540,780),sources,
  },
  {
    ...year,id:"FI",name:"핀란드",region:"유럽",exchange:"Nasdaq Helsinki",timeZone:"Europe/Helsinki",
    windows:[{start:600,end:1110}],holidays:nordic,overrides:{},sources,
  },
  {
    ...year,id:"DK",name:"덴마크",region:"유럽",exchange:"Nasdaq Copenhagen",timeZone:"Europe/Copenhagen",
    windows:[{start:540,end:1020}],
    holidays:holidays([["01-01","신정"],["04-02","성목요일"],["04-03","성금요일"],["04-06","부활절 월요일"],["05-14","승천일"],["05-15","승천일 다음 날"],["05-25","성령강림절 월요일"],["06-05","헌법기념일"],["12-24","크리스마스 이브"],["12-25","크리스마스"],["12-31","연말"]]),
    overrides:{},sources,
  },
];
