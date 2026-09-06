# 거래소 정규장 일정

현재 데이터 확인일: 2026-09-06. 적용 범위: 2026-01-01 ~ 2026-12-31.

## 책임과 표시

- `src/features/market/schedule/calendars.ts`: 거래소 현지 시간대, 연도별 휴일 사유, 정규장 구간, 단축·미확정 특별일.
- `time.ts`: IANA 시간대 변환, 현지 날짜, 한국시간 표시. 미국 개장 시각을 고정 UTC 오프셋으로 계산하지 않는다.
- `session.ts`: 주말/명절·공휴일/개장 전/정규장/점심 휴장/경매/마감, 다음 구간과 휴일을 건너뛴 개장 시각. React·시세 API와 독립된 순수 계산.
- 공개 인터페이스 `schedule/index.ts`를 통해 `MarketSessions.tsx`가 표시한다. 서버의 최초 시각을 전달해 hydration 차이를 피하며, 보이는 탭에서 30초마다 다시 계산하고 복귀 즉시 갱신한다. 시세 API 추가 요청은 없다.
- 국가명은 대표 현물 거래소의 정규장 일정이다. 한국 NXT, 미국 시간외, 파생상품, 홍콩 점심 연장거래 대상 등은 포함하지 않는다. 브로커에서 주문할 수 있는 시간과 구분한다.
- 등록된 공표 일정에 따른 상태이며 긴급 휴장·서킷브레이커·개별 종목 거래정지를 실시간 감시하지 않는다. 상세 설명에 범위와 원문 링크를 표시한다. 실시간 체결 가능 여부로 표현하지 않는다.

## 확인 출처

| 거래소 | 휴일 | 정규장/예외 |
| --- | --- | --- |
| 미국 NYSE | [2026 휴일](https://www.nyse.com/trade/hours-calendars) | 현지 09:30~16:00. 11/27·12/24 13:00 마감. 2026년 7/2는 정상장, 7/3 독립기념일 대체휴장 |
| 한국 KRX | [공식 휴장일 조회](https://open.krx.co.kr/contents/MKD/01/0110/01100305/MKD01100305.jsp), 2026 KRX 선택에서 17개 확인 | [정규장 09:00~15:30](https://regulation.krx.co.kr/contents/RGL/03/03020401/RGL03020401.jsp). 6/3 지방선거·7/17 제헌절 포함 |
| 일본 도쿄 | [JPX 2026](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html) | [09:00~11:30, 12:30~15:30](https://www.jpx.co.jp/english/equities/trading/domestic/01.html). 9/22 국민의 휴일 포함 |
| 홍콩 HKEX | [공식 2026 PDF](https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf) | [09:30~12:00, 13:00~16:00 및 마감 경매](https://www.hkex.com.hk/Services/Trading-hours-and-Severe-Weather-Arrangements/Trading-Hours/Securities-Market?sc_lang=en). 2/16·12/24·12/31 오전장만. 경매는 16:08~16:10(반일장 12:08~12:10) 무작위 종료라 마지막 2분은 마감 확인 중 |
| 중국 상하이 | [상하이 2026 공식 공고](https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml) | [정규장 메커니즘](https://english.sse.com.cn/start/trading/mechanism/), 09:30~11:30, 13:00~15:00. 보충근무 토·일요일에도 거래소는 휴장. 후강통/선강통 별도 달력과 혼용하지 않음 |

KRX 원본은 공개 조회 폼의 `search_bas_yy=2026, gridTp=KRX`, `MKD/01/0110/01100305/mkd01100305_01` 응답으로 확인했다. 이 조회는 개발 시 검증에만 사용하며 사용자의 방문 때 스크래핑하지 않는다.

## 미확정·갱신 절차

1. 연말 이전 각 거래소의 다음 연도 공식 공고를 확인하고 현재 연도 데이터를 덮어쓰지 않는 방식으로 기간을 확장한다. 일반 공휴일 라이브러리만으로 증시 휴일을 추정하지 않는다.
2. `holidays`는 현지 날짜와 실제 이유를 입력한다. 임시 휴장·수능일·연초 시차·단축장 공고를 별도로 확인한다. 검증한 특별 거래일은 `overrides`의 `windows`로 기록한다.
3. 한국 1/2 연초 시각은 이번 작업에서 공고 원문을 확보하지 못했다. 11/19 수능 날짜는 [교육부 발표](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=100526&lev=0&m=0204)로 확인했지만 거래소의 해당 날짜 시간 변경 공고는 확인하지 못했다. 두 날은 `windows` 없는 override로 거래시간 확인 중을 표시한다. 전년도 관행으로 10시 개장을 단정하지 않는다. 다음 개장을 찾다가 미확정 특별일을 만나면 해당 날을 건너뛰어 잘못된 다음 날짜를 제시하지 않는다.
4. 지원 연도 밖에서는 일정 확인 중을 표시하고 다음 해 개장 시각을 추정하지 않는다. 공식 일정이 바뀌면 날짜·사유·출처·확인일을 함께 갱신한다. 데이터 변경을 서비스에 반영하려면 별도 승인된 배포가 필요하다.
5. `node --test tests/market-schedule.test.mjs`로 개장·종료 경계, DST 전후, 공휴일/주말, 점심, 조기 마감, 연도 경계, 미확정 시간 회귀 검사를 실행한다. 실제 기기 시간 오차와 예정 밖 거래소 중단은 이 일정 계산 테스트로 보장하지 않는다.
