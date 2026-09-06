import type { ExchangeCalendar } from "./types";

// Reviewed 2026-09-06. Sources and annual update steps: MARKET_CALENDARS.md.
// An omitted day is a normal session ONLY inside the explicitly verified year.
function holidays(entries: [string, string][]): Record<string, string> {
  return Object.fromEntries(entries.map(([date, reason]) => ["2026-" + date, reason]));
}
function holidayRanges(entries: [string, string, string][]) {
  const result: Record<string, string> = {};
  for (const [start, end, reason] of entries) {
    for (let day = Date.parse("2026-" + start + "T00:00:00Z"); day <= Date.parse("2026-" + end + "T00:00:00Z"); day += 86400000)
      result[new Date(day).toISOString().slice(0, 10)] = reason;
  }
  return result;
}
const year = { validFrom: "2026-01-01", validThrough: "2026-12-31" };
export const calendars: ExchangeCalendar[] = [
  {
    ...year, id: "US", name: "미국", exchange: "NYSE 정규장", timeZone: "America/New_York",
    windows: [{ start: 570, end: 960 }],
    holidays: holidays([
      ["01-01","신정"],["01-19","마틴 루터 킹 데이"],["02-16","대통령의 날"],
      ["04-03","성금요일"],["05-25","메모리얼 데이"],["06-19","준틴스"],
      ["07-03","독립기념일 대체휴일"],["09-07","노동절"],["11-26","추수감사절"],["12-25","크리스마스"],
    ]),
    overrides: {
      "2026-11-27": { reason: "추수감사절 다음 날 조기 마감", windows: [{start:570,end:780}] },
      "2026-12-24": { reason: "크리스마스 이브 조기 마감", windows: [{start:570,end:780}] },
    },
    sources: [{label:"NYSE 휴일·거래시간",url:"https://www.nyse.com/trade/hours-calendars"}],
  },
  {
    ...year, id: "KR", name: "한국", exchange: "KRX 정규장", timeZone: "Asia/Seoul",
    windows: [{start:540,end:930}],
    holidays: holidays([
      ["01-01","신정"],["02-16","설날"],["02-17","설날"],["02-18","설날"],
      ["03-02","삼일절 대체휴일"],["05-01","근로자의 날"],["05-05","어린이날"],
      ["05-25","부처님오신날 대체휴일"],["06-03","지방선거일"],["07-17","제헌절"],
      ["08-17","광복절 대체휴일"],["09-24","추석"],["09-25","추석"],
      ["10-05","개천절 대체휴일"],["10-09","한글날"],["12-25","성탄절"],["12-31","연말"],
    ]),
    // Do not infer special hours from a past year's notice.
    overrides: {
      "2026-01-02": {reason:"연초 개장시간 확인 필요"},
      "2026-11-19": {reason:"수능일 거래시간 공지 확인 필요"},
    },
    sources: [
      {label:"KRX 휴장일",url:"https://open.krx.co.kr/contents/MKD/01/0110/01100305/MKD01100305.jsp"},
      {label:"KRX 정규장 시간",url:"https://regulation.krx.co.kr/contents/RGL/03/03020401/RGL03020401.jsp"},
    ],
  },
  {
    ...year, id:"JP", name:"일본", exchange:"도쿄 현물 정규장", timeZone:"Asia/Tokyo",
    windows:[{start:540,end:690},{start:750,end:930}],
    holidays:holidays([
      ["01-01","신정"],["01-02","연초"],["01-03","연초"],["01-12","성인의 날"],
      ["02-11","건국기념일"],["02-23","천황탄생일"],["03-20","춘분의 날"],
      ["04-29","쇼와의 날"],["05-03","헌법기념일"],["05-04","녹색의 날"],["05-05","어린이날"],
      ["05-06","헌법기념일 대체휴일"],["07-20","바다의 날"],["08-11","산의 날"],
      ["09-21","경로의 날"],["09-22","국민의 휴일"],["09-23","추분의 날"],
      ["10-12","스포츠의 날"],["11-03","문화의 날"],["11-23","근로감사의 날"],["12-31","연말"],
    ]),
    overrides:{},
    sources:[
      {label:"JPX 휴장일",url:"https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html"},
      {label:"도쿄 거래시간",url:"https://www.jpx.co.jp/english/equities/trading/domestic/01.html"},
    ],
  },
  {
    ...year,id:"HK",name:"홍콩",exchange:"HKEX 현물 정규장",timeZone:"Asia/Hong_Kong",
    // Ordinary equities; extended-morning-session instruments are excluded.
    windows:[{start:570,end:720},{start:780,end:960},{start:960,end:970,auction:true}],
    holidays:holidays([
      ["01-01","신정"],["02-17","춘절"],["02-18","춘절"],["02-19","춘절"],
      ["04-03","성금요일"],["04-06","청명절 대체휴일"],["04-07","부활절 대체휴일"],
      ["05-01","노동절"],["05-25","부처님오신날 대체휴일"],["06-19","단오절"],
      ["07-01","홍콩 반환 기념일"],["10-01","국경절"],["10-19","중양절 대체휴일"],["12-25","크리스마스"],
    ]),
    overrides:Object.fromEntries([
      ["2026-02-16","춘절 전날"],["2026-12-24","크리스마스 이브"],["2026-12-31","연말"],
    ].map(([date,reason])=>[date,{reason:reason+" 조기 마감",windows:[{start:570,end:720},{start:720,end:730,auction:true}]}])),
    sources:[
      {label:"HKEX 2026 휴일·반일장",url:"https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf"},
      {label:"HKEX 거래시간",url:"https://www.hkex.com.hk/Services/Trading-hours-and-Severe-Weather-Arrangements/Trading-Hours/Securities-Market?sc_lang=en"},
    ],
  },
  {
    ...year,id:"CN",name:"중국",exchange:"상하이 A주 정규장",timeZone:"Asia/Shanghai",
    windows:[{start:570,end:690},{start:780,end:900}],
    holidays:holidayRanges([
      ["01-01","01-03","신정"],["02-15","02-23","춘절"],["04-04","04-06","청명절"],
      ["05-01","05-05","노동절"],["06-19","06-21","단오절"],
      ["09-25","09-27","중추절"],["10-01","10-07","국경절"],
    ]),
    overrides:{},
    sources:[
      {label:"상하이 2026 휴장일",url:"https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml"},
      {label:"상하이 거래시간",url:"https://english.sse.com.cn/start/trading/mechanism/"},
    ],
  },
];
