import type { ExchangeCalendar } from "./types";
import { holidays, holidayRanges, shortened, year } from "./calendar-data";

export const internationalCalendars: ExchangeCalendar[] = [
  {
    ...year,id:"CA",name:"캐나다",region:"미주",exchange:"TSX 정규장",timeZone:"America/Toronto",
    windows:[{start:570,end:960}],
    holidays:holidays([["01-01","신정"],["02-16","가족의 날"],["04-03","성금요일"],["05-18","빅토리아 데이"],["07-01","캐나다 데이"],["08-03","시민의 날"],["09-07","노동절"],["10-12","추수감사절"],["12-25","크리스마스"],["12-28","박싱데이 대체휴일"]]),
    overrides:shortened(["12-24"],570,780),
    sources:[{label:"TSX 2026 휴일",url:"https://www.tsx.com/en/trading/calendars-and-trading-hours/calendar"},{label:"TSX 정규장 시간",url:"https://www.tsx.com/en/trading/calendars-and-trading-hours/trading-hours"}],
  },
  {
    ...year,id:"TW",name:"대만",region:"아시아",exchange:"TWSE 정규장",timeZone:"Asia/Taipei",
    windows:[{start:540,end:810}],
    holidays:{...holidayRanges([["02-12","02-20","춘절"],["04-03","04-06","어린이날·청명절"]]),
      ...holidays([["01-01","신정"],["02-27","평화기념일 대체휴일"],["02-28","평화기념일"],["05-01","노동절"],["06-19","단오절"],["09-25","중추절"],["09-28","스승의 날"],["10-09","국경일 대체휴일"],["10-10","국경일"],["10-25","광복절"],["10-26","광복절 대체휴일"],["12-25","헌법기념일"]])},
    overrides:{},
    sources:[{label:"TWSE 2026 휴장일",url:"https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=html"},{label:"TWSE 거래시간",url:"https://www.twse.com.tw/en/about/company/service.html"}],
  },
  {
    ...year,id:"SG",name:"싱가포르",region:"아시아",exchange:"SGX 정규장",timeZone:"Asia/Singapore",
    windows:[{start:540,end:720},{start:780,end:1020}],
    holidays:holidays([["01-01","신정"],["02-17","춘절"],["02-18","춘절"],["03-21","하리 라야 푸아사"],["04-03","성금요일"],["05-01","노동절"],["05-27","하리 라야 하지"],["05-31","베삭 데이"],["06-01","베삭 데이 대체휴일"],["08-09","독립기념일"],["08-10","독립기념일 대체휴일"],["11-08","디파발리"],["11-09","디파발리 대체휴일"],["12-25","크리스마스"]]),
    overrides:shortened(["02-16","12-24","12-31"],540,720),
    sources:[{label:"SGX 현물시장",url:"https://www.sgx.com/securities/trading"},{label:"Longbridge 2026 SGX 거래일 안내",url:"https://longbridge.com/en/academy/sg-stocks/blog/sgx-public-holidays-2026-singapore-market-closures-100458"}],
  },
  {
    ...year,id:"VN",name:"베트남",region:"아시아",exchange:"HOSE 연속매매",timeZone:"Asia/Ho_Chi_Minh",
    windows:[{start:555,end:690},{start:780,end:870}],
    holidays:{...holidayRanges([["01-01","01-02","신정"],["02-16","02-20","설날"],["08-31","09-02","독립기념일"]]),...holidays([["04-27","훙왕 기념일"],["04-30","통일절"],["05-01","노동절"]])},
    overrides:{},
    sources:[{label:"HOSE 2026 휴장 공지",url:"https://staticfile.hsx.vn/Uploads/UploadDocuments/2428610/20251209%20-%20HOSE%20-%20Notice%20of%20trading%20holiday%20schedule%20for%202026%20-%20PV.pdf"},{label:"FPTS HOSE 거래시간",url:"https://www.fpts.com.vn/customer-service/securities-trading/stock-trading-guide/trading-regulations/hose-trading-regulations/"}],
  },
  {
    ...year,id:"AU",name:"호주",region:"오세아니아",exchange:"ASX 정규장",timeZone:"Australia/Sydney",
    windows:[{start:600,end:960}],
    holidays:holidays([["01-01","신정"],["01-26","호주의 날"],["04-03","성금요일"],["04-06","부활절 월요일"],["04-25","안작 데이"],["06-08","국왕 탄생일"],["12-25","크리스마스"],["12-28","박싱데이 대체휴일"]]),
    overrides:shortened(["12-24","12-31"],600,850),
    sources:[{label:"ASX 2026 현물시장 달력",url:"https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours/trading-calendar"},{label:"ASX 거래시간",url:"https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours"}],
  },
];
