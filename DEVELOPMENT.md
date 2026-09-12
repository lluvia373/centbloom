# 코드 지도와 변경 방법

코드 대조: 2026-09-12 · main `0983225`. 현재 구현·검증·배포는 [PROJECT_STATUS](./PROJECT_STATUS.md#환경별-진행-상태), 기능 의미는 [PRODUCT_SPEC](./PRODUCT_SPEC.md), 화면 기준은 [DESIGN_SYSTEM](./DESIGN_SYSTEM.md)이 소유한다. 이 문서는 **어떤 기능을 고칠 때 무엇부터 읽고 어디를 수정할지**만 관리한다.

## 작업별 시작점

기능 추가·수정 시 해당 행의 **기능 명세 → 디자인 기준 → 구현 → 검증**만 먼저 읽는다. 모든 문서·과거 검증을 매번 읽지 않는다. 공통 디자인의 [기본 방향](./DESIGN_SYSTEM.md#기본-방향)·[화면 문구](./DESIGN_SYSTEM.md#화면-문구)는 화면 작업 전체에 적용한다. 세부 기준은 아래 링크를 따른다.

```sh
npm run docs:guide -- 관심종목
npm run docs:guide -- src/features/watchlist/WatchStockButton.tsx
```

아래 표가 안내 명령과 문서 연결 검사의 **단일 원본**이다. 새 기능은 기존 행에 통합하거나 한 행을 추가하고, 새 page.tsx·route.ts는 정확한 파일 링크로 등록한다. 기능 폴더는 `src/features/<기능>` 자체를 등록한다. 이름만 있는 미구현 계획은 PRODUCT_SPEC에 남기고 존재하지 않는 코드 링크를 만들지 않는다.

| 기능 | 기능 명세 | 디자인 기준 | 구현·확장 시작점 | 검증 |
| --- | --- | --- | --- | --- |
| 공통 탐색·본문·메뉴 | [주요 메뉴](./PRODUCT_SPEC.md#주요-메뉴와-내-투자) | [공통 본문](./DESIGN_SYSTEM.md#공통-본문과-좌우-여백), [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [navigation](./src/features/navigation), [layout](./src/app/layout.tsx), [Header](./src/components/Header.tsx), [PageFrame](./src/components/PageFrame.tsx) | [메뉴](./tests/navigation.test.mjs), [본문](./tests/page-frame.test.mjs) |
| 시장 홈 | [공개 홈](./PRODUCT_SPEC.md#공개-홈과-로그인-경계) | [홈 섹션](./DESIGN_SYSTEM.md#홈-섹션-통일) | [home](./src/features/home), [홈 진입](./src/app/page.tsx), [HomeSection](./src/features/home/HomeSection.tsx) | [공개 경계](./tests/public-home.test.mjs), [홈](./tests/market-workspace.test.mjs) |
| 평소와 다른 움직임 | [변화 비교](./PRODUCT_SPEC.md#평소와-다른-움직임) | [비교 카드](./DESIGN_SYSTEM.md#변화-비교-카드) | [MarketChanges](./src/features/home/MarketChanges.tsx), [순수 계산](./src/features/market/market-changes.ts), [공유 훅](./src/features/market/use-market-changes.ts), [수집 조립](./src/features/market/server/market-changes.ts), [변화 API](./src/app/api/market-changes/route.ts) | [기준일·평균·방향 전환·부분 실패](./tests/market-changes.test.mjs), [카드 표시](./tests/market-change-cards.test.mjs) |
| 거래량·상승·하락 순위 | [순위 의미](./PRODUCT_SPEC.md#종목-순위) | [제목·목록](./DESIGN_SYSTEM.md#홈-섹션-통일) | [volume](./src/app/rankings/volume/page.tsx), [gainers](./src/app/rankings/gainers/page.tsx), [losers](./src/app/rankings/losers/page.tsx), [RankingPage](./src/features/home/RankingPage.tsx), [순위 API](./src/app/api/movers/route.ts), [순위 공유](./src/features/market/movers-store.ts) | [순위 표현](./tests/market-presentation.test.mjs), [홈 연결](./tests/market-workspace.test.mjs) |
| 주요뉴스·번역 | [뉴스·번역](./PRODUCT_SPEC.md#주요뉴스와-번역) | [제목·목록](./DESIGN_SYSTEM.md#홈-섹션-통일), [문구](./DESIGN_SYSTEM.md#화면-문구) | [MarketNews](./src/features/home/MarketNews.tsx), [뉴스 API](./src/app/api/news/route.ts), [수집](./src/features/market/server/trending-news.ts), [KV 검증](./src/features/market/server/prepared-news.ts), [읽기](./src/features/market/server/news-response.ts), [준비](./src/features/market/server/news-refresh.ts), [번역](./src/features/market/server/title-translation.ts), [정기 실행](./custom-worker.ts), [로컬 준비](./scripts/prepare-news.mjs) | [선정](./tests/trending-news.test.mjs), [번역](./tests/title-translation.test.mjs), [준비·보존](./tests/prepared-news.test.mjs) |
| 증시 캘린더·발표 상세 | [달력·수치 의미](./PRODUCT_SPEC.md#증시-캘린더와-발표-상세) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [calendar](./src/features/calendar), [달력](./src/app/calendar/page.tsx), [발표 상세](./src/app/calendar/[id]/page.tsx), [조회 API](./src/app/api/calendar/route.ts), [수집 API](./src/app/api/calendar/sync/route.ts) | [달력](./tests/economic-calendar.test.mjs), [발표](./tests/calendar-releases.test.mjs), [저장](./tests/sql-economic-calendar.test.mjs) |
| 지수 띠·장 시간표 | [지수·6개국 시간표](./PRODUCT_SPEC.md#시장-홈-상단-지수) | [장 시간표](./DESIGN_SYSTEM.md#장-일정-시간표) | [MarketTicker](./src/features/market/MarketTicker.tsx), [지표 목록](./src/features/market/ticker-instruments.ts), [장 일정](./src/features/market/schedule), [MarketSessions](./src/features/home/MarketSessions.tsx) | [지수](./tests/market-ticker.test.mjs), [시간표](./tests/market-timeline.test.mjs), [일정](./tests/market-schedule.test.mjs) |
| 시세·종목 상세·차트 | [시세·목표가](./PRODUCT_SPEC.md#시세와-목표가) | [색상](./DESIGN_SYSTEM.md#색상), [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [market](./src/features/market), [종목 진입](./src/app/stock/[symbol]/page.tsx), [StockDetail](./src/components/StockDetail.tsx), [공유 시세](./src/features/market/quote-hub.ts), [quote API](./src/app/api/quote/[symbol]/route.ts), [chart API](./src/app/api/chart/[symbol]/route.ts), [historical API](./src/app/api/historical/[symbol]/route.ts) | [API](./tests/market-api.test.mjs), [시장 자료](./tests/market-data.test.mjs), [요청](./tests/requests.test.mjs) |
| 종목 탐색·검색·최근 검색 | [검색·기록](./PRODUCT_SPEC.md#종목-탐색과-최근-검색) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [탐색](./src/app/discover/page.tsx), [StockDiscovery](./src/features/home/StockDiscovery.tsx), [최근 검색](./src/features/market/recent-searches.ts), [검색 API](./src/app/api/search/route.ts) | [최근 검색](./tests/recent-searches.test.mjs), [검색](./tests/market-data.test.mjs) |
| 로그인·계정 요청 | [로그인 경계](./PRODUCT_SPEC.md#공개-홈과-로그인-경계), [저장 복구](./PRODUCT_SPEC.md#거래-저장동기화복구) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [auth](./src/features/auth), [useAuth](./src/hooks/useAuth.tsx), [AuthGate](./src/components/AuthGate.tsx), [세션 요청](./src/features/auth/session-request.ts) | [인증](./tests/auth-loading.test.mjs), [계정 요청](./tests/session-request.test.mjs), [접근 경계](./tests/public-home.test.mjs) |
| 보유자산·거래 저장 | [자산 배치](./PRODUCT_SPEC.md#내-포트폴리오-배치), [저장·복구](./PRODUCT_SPEC.md#거래-저장동기화복구) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [portfolio](./src/features/portfolio), [보유자산](./src/app/portfolio/page.tsx), [공개 훅](./src/hooks/usePortfolio.tsx), [명령](./src/features/portfolio/model/commands.ts), [저장 큐](./src/features/portfolio/data/ledger-store.ts) | [저장](./tests/ledger-store.test.mjs), [SQL](./tests/sql-ledger.test.mjs), [백업](./tests/backup-commands.test.mjs) |
| 거래 입력·내역·수정·삭제 | [입력·날짜](./PRODUCT_SPEC.md#거래-입력과-날짜), [수정·삭제](./PRODUCT_SPEC.md#보유종목-수정과-삭제) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [입력 진입](./src/app/search/page.tsx), [내역 진입](./src/app/transactions/page.tsx), [TransactionForm](./src/components/TransactionForm.tsx), [TransactionHistory](./src/features/portfolio/ui/TransactionHistory.tsx), [TransactionEditor](./src/features/portfolio/ui/TransactionEditor.tsx) | [날짜](./tests/transaction-date.test.mjs), [보유 수정](./tests/holding-management.test.mjs), [환율 보완](./tests/enrichment.test.mjs) |
| 성과 분석·계산 | [계산 의미](./PRODUCT_SPEC.md#자산통화성과의-의미) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준), [색상](./DESIGN_SYSTEM.md#색상) | [performance](./src/features/performance), [분석 진입](./src/app/insights/page.tsx), [usePerformanceHistory](./src/hooks/usePerformanceHistory.ts), [순수 계산](./src/lib/performance.ts), [자산 계산](./src/lib/portfolio.ts) | [동등성·실측](./tests/performance.test.mjs), [서비스](./tests/performance-service.test.mjs) |
| 관심종목 | [관심종목](./PRODUCT_SPEC.md#관심종목), [개인 데이터](./PRODUCT_SPEC.md#개인-데이터) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준), [색상](./DESIGN_SYSTEM.md#색상) | [watchlist](./src/features/watchlist), [관심 진입](./src/app/watchlist/page.tsx), [useWatchlist](./src/hooks/useWatchlist.ts) | [저장 호환](./tests/branded-storage.test.mjs), [문구·실패](./tests/screen-copy.test.mjs), [격리 화면 준비](./tests/prepare-browser-qa.mjs) |
| 투자 노트 | [투자 노트](./PRODUCT_SPEC.md#투자-노트), [개인 데이터](./PRODUCT_SPEC.md#개인-데이터) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준), [문구](./DESIGN_SYSTEM.md#화면-문구) | [journal](./src/features/journal), [노트 진입](./src/app/journal/page.tsx), [useJournal](./src/hooks/useJournal.ts) | [저장 호환](./tests/branded-storage.test.mjs), [격리 화면 준비](./tests/prepare-browser-qa.mjs) |
| 계정 설정·통화·백업 | [계정 설정](./PRODUCT_SPEC.md#계정-설정), [개인 데이터](./PRODUCT_SPEC.md#개인-데이터) | [간격·공통 요소](./DESIGN_SYSTEM.md#간격과-공통-요소) | [settings](./src/features/settings), [설정 진입](./src/app/settings/page.tsx), [백업 패널](./src/components/TransactionBackupPanel.tsx) | [백업](./tests/backup-commands.test.mjs), [설정·탐색](./tests/navigation.test.mjs), [문구](./tests/screen-copy.test.mjs) |
| 공개 읽을거리 | [읽을거리](./PRODUCT_SPEC.md#공개-읽을거리) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [목록](./src/app/community/page.tsx), [본문](./src/app/read/[slug]/page.tsx), [글 자료](./src/features/home/reading.ts), [ReadingShelf](./src/features/home/ReadingShelf.tsx) | [공개 경계](./tests/public-home.test.mjs), [본문 배치](./tests/page-frame.test.mjs) |
| 광고 | [공개 광고](./PRODUCT_SPEC.md#광고-배치), [개인 광고](./PRODUCT_SPEC.md#내-포트폴리오-광고) | [광고 영역](./DESIGN_SYSTEM.md#광고-영역) | [ads](./src/features/ads), [SideRailPreview](./src/features/ads/SideRailPreview.tsx), [PortfolioAd](./src/features/ads/PortfolioAd.tsx), [PageFrame](./src/components/PageFrame.tsx) | [광고](./tests/adsense.test.mjs), [공통 배치](./tests/page-frame.test.mjs) |

표의 검증 링크는 테스트 작성·수정과 푸시 검사 시의 시작점이다. 개발 중 기본 실행하지 않으며 자동 테스트만으로 사용자 흐름 전체를 검증했다는 뜻은 아니다. 실행 환경·범위·결과·한계는 PROJECT_STATUS에 기록한다. 준비 스크립트는 테스트 통과 근거가 아니다.

## 코드 추가·수정 절차

1. 저장소 루트·로컬 main(사용자가 해당 작업에 브랜치를 명시한 경우 그 브랜치)·변경 상태를 확인한다. PC가 바뀌면 원격 main과 로컬 변경을 먼저 통합한다. [현재 상태](./PROJECT_STATUS.md#환경별-진행-상태)·[제약](./PROJECT_STATUS.md#현재-제약)·[다음 작업](./PROJECT_STATUS.md#다음-작업)을 읽고 `docs:guide` 또는 위 표에서 작업 행을 고른다.
2. **구현 전 문서 위치를 정한다.** PRODUCT_SPEC의 기존 기능 절에 사용자 흐름·화면 동작·데이터 의미·실패/빈 상태를 정리한다. 새 기능은 아래 형식의 절과 위 표 한 행을 추가한다. 제품 방향 선택은 DECISIONS, 개별 실행 범위/완료 조건은 해당 GitHub 이슈에 둔다. 기존 승인 안의 구현 선택은 직접 하고, 실제 사용자 선택이 필요한 부분만 질문한다. 이슈 등록·다른 작업 전달은 해당 승인 범위를 따른다.
3. **디자인을 먼저 연결한다.** 새 화면도 DESIGN_SYSTEM의 공통 방향과 가장 가까운 유형을 적용한다. 사용자가 다른 디자인을 확정하면 기준을 먼저 갱신하고 같은 역할의 기존 화면 영향도 확인한다. 개별 화면 설명에 글꼴·색상 값을 복사하지 않는다.
4. **기존 구조에서 구현한다.** 아래 책임과 사용 창구를 재사용하고 대체한 코드·스타일은 같은 작업에서 정리한다. 독립 기능만 `src/features/<기능>`으로 만들며 빈 계층·무의미한 전체 export를 생성하지 않는다. Next.js 작업 전에 설치된 관련 가이드를 읽는다.
5. **필요한 검증을 준비한다.** 변경에 맞는 테스트와 전후 이동·실패·모바일/키보드 확인 범위를 정리한다. 개발 중에는 오류 해결에 필요한 최소 확인만 하고 정기 검사는 푸시 직전에 모은다. 실제 사용자 자료로 CRUD 실험하지 않는다. 실행 시점·명령은 [README 검증](./README.md#검증).
6. **문서를 구현 상태로 맞춘다.** 아래 변경별 담당 문서를 갱신한다. 아직 실행하지 않은 검사는 PROJECT_STATUS에 푸시 검증 대기로 기록하고 과거 성공을 재사용하지 않는다. 문서·디자인·코드·테스트·빌드 검사는 pre-push 훅에서 실행하며, 실제 브라우저/운영 계정 검증은 별도 범위다. 커밋·푸시·배포는 해당 사용자 지시 범위에서 수행한다.

### 기능 명세 작성 형식

PRODUCT_SPEC의 기존 절을 먼저 보완한다. 새 독립 기능만 다음 구조로 추가하고 같은 설명을 다른 문서에 복제하지 않는다.

- **상태·결정:** 현재 구현 / 승인된 목표·미구현 / 제안·미확정을 구분하고 관련 결정 ID를 연결.
- **사용 흐름:** 어디서 들어와 무엇을 완료하고 어디로 돌아가는지. 공개/로그인 경계 포함.
- **화면·동작:** 목록·상세·입력·탭 등 의미와 행동. 디자인은 DESIGN_SYSTEM의 해당 유형 링크.
- **데이터 의미:** 단위·계산·저장 위치·권한·호환·갱신 조건 중 필요한 것만.
- **실패·범위:** 로딩·빈 값·부분 실패·취소·복구와 제공하지 않는 범위. 구현 결과는 PROJECT_STATUS에 연결.

모든 작은 버튼에 다섯 항목을 복제하지 않는다. 기존 절로 설명 가능한 변경은 해당 문장만 수정한다.

### 변경 유형별 연결 지점

| 바뀐 내용 | 갱신할 문서 |
| --- | --- |
| 기능·저장·계산·접근 범위 | PRODUCT_SPEC의 담당 절. 제품 방향 변경이면 DECISIONS와 사업/SEO 영향도 함께 검토 |
| 디자인 공통 규칙·문구·색상 의미 | DESIGN_SYSTEM. 수치 변경은 design-tokens.css와 함께 수정 |
| 파일 책임·사용 창구·새 페이지/API/기능 폴더 | 이 문서의 작업별 시작점·관련 책임 |
| 배포·환경 변수·운영 데이터 절차 | CLOUDFLARE. 실제 적용/검증 여부는 PROJECT_STATUS |
| 완료·미구현·미확인·검증 결과 | PROJECT_STATUS의 현재 표/제약을 직접 갱신. 날짜별 전체 보고서 추가 금지 |
| 개별 실행 범위·완료 조건·진행 | 해당 GitHub 이슈에 기준 문서 링크. 본문 전체 복제·미승인 타 작업 전달 금지 |

문서 담당 전체 목록은 [AGENTS 문서 관리 기준](./AGENTS.md#문서-관리-기준)을 따른다. 새 문서는 기존 담당 파일에 담을 수 없을 때만 만든다.

## 실행 흐름과 외부 사용 창구

```text
app/layout.tsx → AuthProvider → AuthGate → PortfolioProvider → Header/PageFrame/페이지
거래 UI → useTransactionCommands → ledger-store → commands/enrichment → local 또는 server
시장 UI → useLiveQuotes / useStockSearch → stock-api → app/api → market/server → 공급원
성과 UI → usePerformanceHistory → service → repository + request-plan + calculate/Worker
```

- 거래·설정·시장 데이터의 공개 창구는 [usePortfolio](./src/hooks/usePortfolio.tsx)의 useTransactions/useTransactionCommands/usePreferences/usePortfolioMarket다. UI에서 저장소에 직접 쓰거나 별도 거래 배열을 만들지 않는다. 보유 시세는 portfolio·insights 경로에서만 구독한다.
- 시세는 [useLiveQuotes](./src/hooks/useLiveQuotes.ts), 검색은 [useStockSearch](./src/features/market/use-stock-search.ts), 성과는 [usePerformanceHistory](./src/hooks/usePerformanceHistory.ts)를 재사용한다. 새 페이지별 폴링·캐시·저장 경로를 덧붙이지 않는다.
- 공용 계산은 `lib`의 명시적 함수로, 기능 간 연결은 공개 훅/명시적 입력·결과로 한다. state→data/model 방향을 지키고 data/model에서 React UI를 import하지 않는다. 기능 내부의 상대 import는 허용한다.
- 거래 순차 저장·revision·동일 요청 ID 재시도·계정 경계는 보존한다. 옛 브랜드 키·Web Lock·SQL migration은 호환/복구 장치이므로 미사용 UI처럼 삭제하지 않는다.

## 파일 역할

| 책임 | 소유 위치·확장 방법 |
| --- | --- |
| 화면 조립 | `app/**/page.tsx`는 배치·연결, `route.ts`는 입력 검증·응답. 계산/저장/공급자 변환을 페이지에 넣지 않음 |
| React 구독·수명 | hooks와 feature의 use-*·state. 계정 변경/해제/늦은 응답을 관리하고 필요한 데이터만 구독 |
| 순수 계산·검증 | lib와 feature의 model. 거래 필드는 타입→명령/검증→enrichment→저장 변환/백업→공개 훅→UI 순으로 영향 확인 |
| 저장·외부 요청 | feature data/repository/server. 세션 요청은 auth/session-request, 시장 공급 제한은 market/server/provider, 브라우저 요청은 lib/stock-api의 공통 경계 사용 |
| 순위·뉴스 | ranking-pages는 제목/경로, RankingPage는 순위 전환 링크, MoverTable은 홈 요약/상세 비교 목록. 관심 저장은 WatchStockButton의 compact 표현과 기존 useWatchlist를 재사용한다. mover-ranks는 직전 정상 순위 비교, movers-store는 공유 스냅샷. trending-news는 선정, server/news는 공급 변환, title-translation은 검증/캐시, translation-provider는 AI 호출/검증된 제목 KV 캐시. prepared-news는 저장 형식·유효기간 검증, news-refresh는 수집·번역·정기 준비, news-response는 첫 HTML/API 읽기와 응답 후 갱신이다. custom-worker는 OpenNext fetch를 유지하고 scheduled를 추가한다 |
| 캘린더·장 일정 | calendar의 model/navigation/release와 server가 날짜·수치·수집/저장을 분리. market/schedule이 거래소별 근거와 시간 계산을 소유. [MARKET_CALENDARS](./MARKET_CALENDARS.md)와 [CLOUDFLARE](./CLOUDFLARE.md)의 준비/운영 상태 구분 |
| 성과 계산 | performance/service·request-plan·repository·calculate·Worker. 계산 변경 시 [기준 구현](./tests/reference)과 동등성을 확인하고 기준 구현을 새 알고리즘에 맞춰 덮어쓰지 않음 |
| 미사용 UI | [WorkspaceDate](./src/components/WorkspaceDate.tsx), [MarketNotification](./src/features/market/MarketNotification.tsx)는 현재 src 소비자가 없음. 새 작업 시작점으로 사용하지 않으며 삭제 전 동적/스타일/테스트 참조 확인 |

### 스타일·자산·도구

- [design-tokens.css](./src/styles/design-tokens.css)는 공통 수치 원본, [globals.css](./src/app/globals.css)는 기본 요소/변수 연결. 전용 CSS module은 해당 기능이 소유한다. 공통 화면/모달은 [workspace.css](./src/styles/workspace.css), 개인 자산은 [portfolio.css](./src/styles/portfolio.css), 차트는 [charts.css](./src/styles/charts.css), 로그인은 [auth.css](./src/app/auth.css). 기존 선언과 소비자를 찾아 수정하고 파일 말미 덮어쓰기로 해결하지 않는다.
- PageHeading은 제목·선택 행동, [CalculationHelp](./src/components/CalculationHelp.tsx)는 사용자가 여는 계산 정의다. 가격/계산 의미·실패 조건은 관련 수치 곁에 유지한다.
- 로고·파생 자산은 [BRAND](./BRAND.md), 기업 이미지 출처는 [sources.json](./public/companies/sources.json). `public`의 모든 파일을 실제 화면 사용 자산으로 간주하지 않는다.
- 푸시 검사 실행기는 [check-push](./tests/check-push.mjs), Git 연결은 [pre-push](./.githooks/pre-push)와 [설치 명령](./tests/install-git-hooks.mjs)이 소유한다. [동작 회귀](./tests/push-check.test.mjs)는 모의 명령·임시 Git으로 중단/설치 경계를 확인한다. 설치는 검사 실행이나 푸시를 하지 않는다.
- [문서 검사](./tests/check-docs.mjs)와 [문서 회귀](./tests/documentation.test.mjs), [디자인 검사](./tests/check-design.mjs)와 [디자인 회귀](./tests/design-system.test.mjs)는 현재 명령에 연결한다. 기존 디자인 미정리 목록은 늘려 통과시키지 않는다.
- [package.json](./package.json)·lockfile이 명령/버전, [wrangler.jsonc](./wrangler.jsonc)가 배포 설정 원본이다. worker-configuration.d.ts는 직접 편집하지 않고 `npm exec wrangler -- types worker-configuration.d.ts --env-interface WorkerBindings`로 재생성한다. 이전 주소는 [legacy-worker](./legacy-worker.mjs)·[종료 설정](./wrangler.legacy.jsonc)으로 닫힌 상태를 유지한다.
- work·node_modules·.next·.open-next는 구현 원본이 아니다. 격리 검증은 원본 코드를 복사한 테스트 환경이며 실행 방법은 README를 따른다. 비밀/복구 자료·사용자 기록은 일반 생성물 정리와 분리한다.

## 탐색 비용과 한계

`docs:guide`는 전체 검사를 실행하지 않고 표에서 이름·코드 경로에 맞는 링크만 출력한다. 작업 중 문서 연결이나 사업 검토값이 미완성이어도 안내를 조회할 수 있다. `check:docs`는 링크/앵커, 기능별 명세·디자인·코드·검증 연결, 기능 폴더·페이지/API 누락을 검사한다. **기존 파일 안에 추가한 기능의 의미, 디자인 품질, 모든 문장과 코드의 일치까지 자동 판정하지 않는다.** 이를 에이전트의 완료 절차와 실제 검증으로 보완한다. 자동 검사가 문서를 대신 작성하거나 제품 방향을 임의 결정하지 않는다.

`node tests/check-import-cycles.mjs`는 정적 TS import/export의 순환을 확인하며 동적 연결·CSS·전체 아키텍처 준수를 보증하지 않는다. components/hooks/lib와 feature가 공존하는 현재 구조를 유지하고, 거래 입력·목록·분석 같은 큰 화면은 실제 책임 충돌이 있을 때 나눈다. 파일 수·줄 수만 줄이는 전면 이동은 하지 않는다. 실제 시간·토큰 절감률은 측정하지 않았다.
