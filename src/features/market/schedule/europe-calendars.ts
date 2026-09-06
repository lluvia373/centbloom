import type { ExchangeCalendar } from "./types";
import { holidays, shortened, year } from "./calendar-data";

const common = holidays([["01-01","신정"],["04-03","성금요일"],["04-06","부활절 월요일"],["05-01","노동절"],["12-25","크리스마스"]]);
const euronextSource = {label:"Euronext 2026 현물시장 일정",url:"https://www.euronext.com/en/trading/trading-hours-holidays"};
// The 2026 year-end appendix has not been published. Do not reuse 2025 half-day hours.
const yearEndPending = {
  "2026-12-24": {reason:"크리스마스 이브 단축장 · 시간 확인 중"},
  "2026-12-31": {reason:"연말 단축장 · 시간 확인 중"},
};
export const europeCalendars: ExchangeCalendar[] = [
  {
    ...year,id:"CH",name:"스위스",region:"유럽",exchange:"SIX 정규장",timeZone:"Europe/Zurich",
    windows:[{start:540,end:1050}],
    holidays:{...common,...holidays([["01-02","베르히톨트의 날"],["05-14","승천일"],["05-25","성령강림절 월요일"],["12-24","크리스마스 이브"],["12-31","연말"]])},
    overrides:{},sources:[{label:"SIX Trading Guide · 2026 달력 p.37",url:"https://www.six-group.com/dam/download/the-swiss-stock-exchange/trading/trading-provisions/regulation/trading-guides/trading-guide.pdf"}],
  },
  {
    ...year,id:"GB",name:"영국",region:"유럽",exchange:"LSE 정규장",timeZone:"Europe/London",
    windows:[{start:480,end:990}],
    holidays:holidays([["01-01","신정"],["04-03","성금요일"],["04-06","부활절 월요일"],["05-04","5월 은행휴일"],["05-25","봄 은행휴일"],["08-31","여름 은행휴일"],["12-25","크리스마스"],["12-28","박싱데이 대체휴일"]]),
    overrides:shortened(["12-24","12-31"],480,750),
    sources:[{label:"LSE 휴일·반일장",url:"https://www.londonstockexchange.com/equities-trading/business-days"}],
  },
  {
    ...year,id:"DE",name:"독일",region:"유럽",exchange:"Xetra 정규장",timeZone:"Europe/Berlin",
    windows:[{start:540,end:1050}],
    holidays:{...common,...holidays([["12-24","크리스마스 이브"],["12-26","박싱데이"],["12-31","연말"]])},overrides:{},
    sources:[{label:"Xetra 거래일·정규장 시간",url:"https://www.cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours"}],
  },
  ...([
    ["FR","프랑스","Paris","Europe/Paris",540,1050],
    ["NL","네덜란드","Amsterdam","Europe/Amsterdam",540,1050],
    ["BE","벨기에","Brussels","Europe/Brussels",540,1050],
    ["PT","포르투갈","Lisbon","Europe/Lisbon",480,990],
    ["IE","아일랜드","Dublin","Europe/Dublin",480,990],
    ["IT","이탈리아","Milan","Europe/Rome",540,1050],
    ["NO","노르웨이","Oslo","Europe/Oslo",540,980],
  ] as const).map(([id,name,exchange,timeZone,start,end]): ExchangeCalendar => ({
    ...year,id,name,region:"유럽",exchange:"Euronext "+exchange,timeZone,windows:[{start,end}],
    holidays:{...common,
      ...(id==="IE" ? holidays([["05-04","5월 은행휴일"],["12-28","성 스테파노 대체휴일"]]) : {}),
      ...(id==="IT" || id==="NO" ? holidays([["12-24","크리스마스 이브"],["12-31","연말"]]) : {}),
      ...(id==="NO" ? holidays([["04-02","성목요일"],["05-14","승천일"],["05-25","성령강림절 월요일"]]) : {}),
    },
    overrides:id==="IT" ? {} : id==="NO" ? shortened(["04-01"],540,780) : yearEndPending,
    sources:[euronextSource, ...(id==="NO" ? [{label:"Oslo 2026 부활절 단축장",url:"https://www.euronext.com/en/media/14571/download"}] : [])],
  })),
  {
    ...year,id:"ES",name:"스페인",region:"유럽",exchange:"BME 정규장",timeZone:"Europe/Madrid",
    windows:[{start:540,end:1050}],holidays:common,overrides:shortened(["12-24","12-31"],540,840),
    sources:[{label:"BME 2026 거래일·단축장",url:"https://www.bolsasymercados.es/en/bme-exchange/trading/trading-calendar.html"}],
  },
];
