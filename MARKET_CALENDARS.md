# 거래소 정규장 일정

현재 데이터 확인일: 2026-09-06. 적용 범위: 2026-01-01 ~ 2026-12-31.

## 책임과 표시

- `src/features/market/schedule/calendars.ts`: 기존 5시장과 지역별 데이터 조립. `international-calendars.ts`는 추가 미주/아시아/호주, `europe-calendars.ts`는 서유럽, `nordic-calendars.ts`는 Nasdaq 북유럽. `calendar-data.ts`는 검증 연도·날짜/단축장 생성만 담당한다.
- `time.ts`: IANA 시간대 변환, 현지 날짜, KST 표시. 각 시장 개장 시각을 고정 UTC 오프셋으로 계산하지 않는다.
- `session.ts`: 주말/명절·공휴일/개장 전/정규장/점심 휴장/경매/마감, 다음 구간과 휴일을 건너뛴 개장 시각. React·시세 API와 독립된 순수 계산.
- `priority.ts`: 1시간 내 장 전환 → 현재 휴일·특별/미확정 일정 → 96시간 내 다음 개장에 영향을 주는 휴일 → 거래 중 → 개장 전/점심 → 일반 휴장 순. 같은 단계에서는 다음 전환이 빠른 시장, 동률이면 calendars의 등록 순서다. 원본 달력은 변경하지 않는다.
- `presentation.ts`: priority 0~2인 모든 알림을 제한 없이 남기고, 사유·현재 상태·다음 시각·행동이 같은 시장만 묶는다. 지역 선택은 일반 시장 목록에만 적용해 다른 지역의 휴장을 숨기지 않는다. 기본 8개/더 보기로 전체 접근, 개별 설명 팝업은 제거했다.
- 공개 인터페이스 `schedule/index.ts`를 통해 `MarketSessions.tsx`가 표시한다. 서버의 최초 시각을 전달해 hydration 차이를 피하며, 보이는 탭에서 30초마다 다시 계산하고 복귀 즉시 갱신한다. 시세 API 추가 요청은 없다.
- 국가명은 대표 현물 거래소의 정규장 일정이다. 한국 NXT, 미국 시간외, 파생상품, 홍콩 점심 연장거래 대상 등은 포함하지 않는다. 브로커에서 주문할 수 있는 시간과 구분한다.
- 등록된 공표 일정에 따른 상태이며 긴급 휴장·서킷브레이커·개별 종목 거래정지를 실시간 감시하지 않는다. 화면에는 정규장 · KST와 실제 상태/시각만 표시하고, 원문·상세 범위는 이 문서와 데이터의 sources에 보관한다. 실시간 체결 가능 여부로 표현하지 않는다.

지원: 24개 대표 현물시장(미주 2, 아시아 7, 유럽 14, 오세아니아 1). 전 세계 모든 거래소·한국 증권사별 매매 가능 국가를 보장하는 목록은 아니다. 인도·태국·말레이시아·인도네시아·뉴질랜드 등은 아직 미등록이다. 홍콩 기존 마감 경매를 제외한 추가 시장은 주로 정규 연속매매 기준이며, 별도 경매/종가매매 세션 전체를 감시하지 않는다.

## 확인 출처

| 거래소 | 휴일 | 정규장/예외 |
| --- | --- | --- |
| 미국 NYSE | [2026 휴일](https://www.nyse.com/trade/hours-calendars) | 현지 09:30~16:00. 11/27·12/24 13:00 마감. 2026년 7/2는 정상장, 7/3 독립기념일 대체휴장 |
| 한국 KRX | [공식 휴장일 조회](https://open.krx.co.kr/contents/MKD/01/0110/01100305/MKD01100305.jsp), 2026 KRX 선택에서 17개 확인 | [정규장 09:00~15:30](https://regulation.krx.co.kr/contents/RGL/03/03020401/RGL03020401.jsp). 6/3 지방선거·7/17 제헌절 포함 |
| 일본 도쿄 | [JPX 2026](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html) | [09:00~11:30, 12:30~15:30](https://www.jpx.co.jp/english/equities/trading/domestic/01.html). 9/22 국민의 휴일 포함 |
| 홍콩 HKEX | [공식 2026 PDF](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf) | [09:30~12:00, 13:00~16:00 및 마감 경매](https://www.hkex.com.hk/Services/Trading-hours-and-Severe-Weather-Arrangements/Trading-Hours/Securities-Market?sc_lang=en). 2/16·12/24·12/31 오전장만. 경매는 16:08~16:10(반일장 12:08~12:10) 무작위 종료라 마지막 2분은 마감 확인 중 |
| 중국 상하이 | [상하이 2026 공식 공고](https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml) | [정규장 메커니즘](https://english.sse.com.cn/start/trading/mechanism/), 09:30~11:30, 13:00~15:00. 보충근무 토·일요일에도 거래소는 휴장. 후강통/선강통 별도 달력과 혼용하지 않음 |

| 캐나다 TSX | [2026 휴일](https://www.tsx.com/en/trading/calendars-and-trading-hours/calendar) | [09:30~16:00](https://www.tsx.com/en/trading/calendars-and-trading-hours/trading-hours), 12/24 13:00 마감. 미국의 USD 결제 휴일을 캐나다 거래 휴일로 넣지 않음 |
| 영국 LSE | [2026 휴일·반일장](https://www.londonstockexchange.com/equities-trading/business-days) | 08:00~16:30, 12/24·12/31 12:30 마감. 은행휴일은 영국 시장에만 반영 |
| 독일 Xetra | [거래일·시간](https://www.cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours) | 09:00~17:30, 12/24·12/31 휴장. 승천일·성령강림절 월요일은 거래 |
| 프랑스·네덜란드·벨기에·포르투갈·아일랜드·이탈리아·노르웨이 | [Euronext 2026](https://www.euronext.com/en/trading/trading-hours-holidays) | 대륙 09:00~17:30, 리스본/더블린 08:00~16:30 현지 시간, 오슬로 09:00~16:20. 아일랜드 5/4·12/28, 노르웨이 4/2·5/14·5/25 차이 반영. 밀라노/오슬로 12/24·12/31 휴장. [오슬로 4/1 단축장](https://www.euronext.com/en/media/14571/download) 13:00 연속매매 종료 |
| 스웨덴·핀란드·덴마크 | [Nasdaq Nordic 현물시장](https://www.nasdaq.com/da/european-market-activity/trading-hours) | 현지 Stockholm 09:00~17:30, Helsinki 10:00~18:30, Copenhagen 09:00~17:00. 스웨덴 반일장 5일만 13:00 종료. 채권 반일장과 혼용하지 않음 |
| 스위스 SIX | [Trading Guide p.37](https://www.six-group.com/dam/download/the-swiss-stock-exchange/trading/trading-provisions/regulation/trading-guides/trading-guide.pdf) | PDF 달력의 휴장 색상 직접 확인. 1/2·5/14·5/25·12/24·12/31 포함, 정규장 09:00~17:30 |
| 스페인 BME | [2026 휴일·단축장](https://www.bolsasymercados.es/en/bme-exchange/trading/trading-calendar.html) | [09:00~17:30](https://www.bolsasymercados.es/en/bme-exchange/trading/spainatmid.html), 12/24·12/31 14:00 종료 |
| 대만 TWSE | [2026 거래일/비거래일](https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=html) | [09:00~13:30](https://www.twse.com.tw/en/about/company/service.html), 2/12·2/13 결제만 가능한 날도 거래 휴장, 9/28·10/26·12/25 반영 |
| 싱가포르 SGX | [현물시장](https://www.sgx.com/securities/trading), [Longbridge 거래 안내](https://longbridge.com/en/academy/sg-stocks/blog/sgx-public-holidays-2026-singapore-market-closures-100458) | 09:00~12:00/13:00~17:00. 2/16·12/24·12/31 12:00 종료. SGX 동적 원문 휴일표는 직접 추출되지 않아 증권사 공지로 보완 |
| 베트남 HOSE | [공식 2026 공고](https://staticfile.hsx.vn/Uploads/UploadDocuments/2428610/20251209%20-%20HOSE%20-%20Notice%20of%20trading%20holiday%20schedule%20for%202026%20-%20PV.pdf) | [FPTS 거래 안내](https://www.fpts.com.vn/customer-service/securities-trading/stock-trading-guide/trading-regulations/hose-trading-regulations/). 연속매매 09:15~11:30/13:00~14:30만 표시. 8/31~9/2 휴장, 보충근무 토요일은 거래하지 않음 |
| 호주 ASX | [2026 현물 달력](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours/trading-calendar) | [약 10:00~16:00](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours), 12/24·12/31 14:10 종료. Sydney DST 별도 반영 |

KRX 원본은 공개 조회 폼의 `search_bas_yy=2026, gridTp=KRX`, `MKD/01/0110/01100305/mkd01100305_01` 응답으로 확인했다. 이 조회는 개발 시 검증에만 사용하며 사용자의 방문 때 스크래핑하지 않는다.

## 미확정·갱신 절차

1. 연말 이전 각 거래소의 다음 연도 공식 공고를 확인하고 현재 연도 데이터를 덮어쓰지 않는 방식으로 기간을 확장한다. 일반 공휴일 라이브러리만으로 증시 휴일을 추정하지 않는다.
2. `holidays`는 현지 날짜와 실제 이유를 입력한다. 임시 휴장·수능일·연초 시차·단축장 공고를 별도로 확인한다. 검증한 특별 거래일은 `overrides`의 `windows`로 기록한다.
3. 한국 1/2 연초 시각은 이번 작업에서 공고 원문을 확보하지 못했다. 11/19 수능 날짜는 [교육부 발표](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=100526&lev=0&m=0204)로 확인했지만 거래소의 해당 날짜 시간 변경 공고는 확인하지 못했다. 두 날은 `windows` 없는 override로 거래시간 확인 중을 표시한다. 전년도 관행으로 10시 개장을 단정하지 않는다. 다음 개장을 찾다가 미확정 특별일을 만나면 해당 날을 건너뛰어 잘못된 다음 날짜를 제시하지 않는다.
4. Euronext 프랑스/네덜란드/벨기에/포르투갈/아일랜드 12/24·12/31은 단축장 자체는 확정이나 2026 연말 상세 시간이 미확인이라 일반 거래시간으로 계산하지 않는다. 공식 연말 부록 확인 후 windows를 채운다.
5. 지원 연도 밖에서는 일정 확인 중을 표시하고 다음 해 개장 시각을 추정하지 않는다. 공식 일정이 바뀌면 날짜·사유·출처·확인일을 함께 갱신한다. 데이터 변경을 서비스에 반영하려면 별도 승인된 배포가 필요하다.
6. `node --test tests/market-schedule.test.mjs`로 개장·종료 경계, DST 전후, 공휴일/주말, 점심, 조기 마감, 연도 경계, 미확정 시간 회귀 검사를 실행한다. 실제 기기 시간 오차와 예정 밖 거래소 중단은 이 일정 계산 테스트로 보장하지 않는다.
