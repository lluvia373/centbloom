# 코드 지도와 변경 방법

최종 확인: 2026-09-06 · main + codex/market-index-strip의 로컬 공개 홈 개편 기준. 파일 역할·확장 위치는 이 문서, 제품 의미는 [PRODUCT_SPEC.md](./PRODUCT_SPEC.md), 실제 검증·배포 상태는 [PROJECT_STATUS.md](./PROJECT_STATUS.md)가 기준이다. 설치 버전과 실행 명령은 package.json·lockfile을 확인한다.

## 작업별 시작점

해당 행의 파일과 테스트부터 읽고 실제 호출 관계를 따라 범위를 넓힌다. 모든 소스·과거 검증 기록을 매번 읽을 필요는 없다.

| 변경할 내용 | 먼저 볼 구현 | 확인할 테스트 |
| --- | --- | --- |
| 공개 시장 홈·뉴스·일정 | [home UI/자료](./src/features/home), [뉴스](./src/features/market/server/news.ts), [공개 경로](./src/features/auth/public-routes.ts) | public-home, market-ticker, market-workspace, requests |
| 거래 추가·수정·삭제·복구 | [명령](./src/features/portfolio/model/commands.ts) → [저장 큐](./src/features/portfolio/data/ledger-store.ts) → [거래 상태 연결](./src/features/portfolio/state/ledger.tsx) | ledger-store, backup-commands, sql-ledger |
| 거래 입력 항목·날짜 | [TransactionForm](./src/components/TransactionForm.tsx), [TransactionEditor](./src/features/portfolio/ui/TransactionEditor.tsx), [거래 시장 조회](./src/features/market/use-trade-market.ts) | transaction-date, enrichment, backup-commands |
| 보유량·원가·수익률 | [portfolio](./src/lib/portfolio.ts), [performance](./src/lib/performance.ts), [요약](./src/features/portfolio/model/summary.ts) | performance, market-data |
| 성과 이력 조회·저장 | [공유 훅](./src/hooks/usePerformanceHistory.ts) → [실행 서비스](./src/features/performance/service.ts) → [저장소](./src/features/performance/repository.ts) | performance-service, requests, sql-ledger |
| 시세·검색·국가/통화 지원 | [클라이언트 API](./src/lib/stock-api.ts), [시장 분류](./src/lib/markets.ts), [서버 서비스](./src/features/market/server) | market-api, market-data, enrichment, requests |
| 관심종목·노트 | [useWatchlist](./src/hooks/useWatchlist.ts), [useJournal](./src/hooks/useJournal.ts), 각각의 features UI | 격리 브라우저 CRUD, branded-storage |
| 디자인·배치·로고 | 해당 app 페이지 → components/features UI → 아래 스타일·자산 소유 위치 | 격리 브라우저 데스크톱·모바일 비교 |
| 로그인·공개 페이지 | [useAuth](./src/hooks/useAuth.tsx), [AuthGate](./src/components/AuthGate.tsx), [layout](./src/app/layout.tsx) | 계정 전환·공개/개인 접근 분리, 아래 배포 절차 |
| 새 독립 기능 | 아래 확장 절차; 같은 성격의 기존 feature와 해당 PRODUCT_SPEC 절 | 기능의 순수 로직·실패·권한·UI 흐름 |

테스트 이름은 `tests/<이름>.test.mjs`다. 실행 방법·브라우저 준비는 [README 검증](./README.md#검증). 구조 점검은 `node tests/check-import-cycles.mjs`.

## 실행 흐름과 외부 사용 창구

```text
app/layout.tsx → AuthProvider → AuthGate → PortfolioProvider → WorkspaceProvider → 페이지
거래 UI → useTransactionCommands → ledger-store → commands/enrichment → local 또는 server 저장소
시장 UI → useLiveQuotes / useStockSearch → stock-api → app/api → market/server → Yahoo
성과 UI → usePerformanceHistory → service → repository + request-plan + calculate → performance
```

UI에서 거래를 읽고 쓰는 창구는 [hooks/usePortfolio.tsx](./src/hooks/usePortfolio.tsx)의 `useTransactions`, `useTransactionCommands`, `usePreferences`, `usePortfolioMarket`다. 필요한 구독만 선택한다. `useWorkspace`는 샘플 모드 선택, `useWorkspaceSummary`는 샘플/실제 자산 요약이다. 실시간 시세는 `useLiveQuotes`, 종목 검색은 `features/market/use-stock-search.ts`의 `useStockSearch`, 성과는 `usePerformanceHistory`를 사용한다.

새 UI에서 repository·컨텍스트 내부를 직접 가져오거나 별도 거래 배열을 저장하지 않는다. 여러 기능이 쓰는 순수 타입·계산·API는 현재 `lib`의 명시적 export를 사용한다. 같은 기능 내부의 상대 import와 페이지의 기능 UI import는 허용한다. 서버 공급자 모듈을 클라이언트 UI에 import하지 않는다. 이 경계는 현재 작성 규칙이며 ESLint가 전부 강제하는 것은 아니다.

## 파일 역할

아래는 수정 단위를 찾기 위한 지도다. 개별 함수의 계약·인자는 해당 export/type을 확인하며 문서에 구현 전체를 복제하지 않는다.

| 위치 | 역할 |
| --- | --- |
| [app/layout.tsx](./src/app/layout.tsx) | 글꼴·메타데이터·Provider 순서·공통 프레임 |
| [app](./src/app)의 page.tsx | `/` 공개 시장 홈, `/portfolio` 개인 자산/차트/보유/거래, `/insights` 분석, `/watchlist` 관심, `/journal` 노트, `/settings` 설정의 배치·연결. `/search` 거래 입력, `/discover` 공개 검색, `/stock/[symbol]` 공개 상세, `/read/[slug]` 읽을거리 진입점 |
| [app/community/page.tsx](./src/app/community/page.tsx) | 기존 주소를 유지하는 공개 리서치 가이드. 첫 버전 토론 제외, 준비 홍보 제거 |
| [app/api](./src/app/api)의 route.ts | quote/chart/historical/search/news 입력 검증·서비스 호출·HTTP 응답 |
| [hooks/useAuth.tsx](./src/hooks/useAuth.tsx), [lib/supabase.ts](./src/lib/supabase.ts) | 로그인 세션과 Google 로그인/로그아웃; 공개 설정·브라우저 클라이언트 생성 |
| [hooks/usePortfolio.tsx](./src/hooks/usePortfolio.tsx), [hooks/useWorkspace.tsx](./src/hooks/useWorkspace.tsx) | 거래/설정/시장 Provider 조립·공개 훅; 샘플/개인 모드와 표시 요약 |
| [features/home](./src/features/home) | `StockDiscovery`: 공유 검색 훅으로 결과/상세 연결. `MarketMovers`/`MoverTable`: 미국 세 종류 순위·모바일 탭. `MarketSessions`: 대표 지수별 공급원 장 상태. `ResearchDesk`: 비공개 관심/노트/자산 진입. `MarketNews`: 뉴스 조회 상태/원문 목록. `MarketCalendar`/`calendar`: 공식 일정과 만료 필터. `ReadingShelf`/`reading`: 직접 작성한 읽을거리. `HomeWatchlist`: 로그인/로컬 모드의 저장 목록만 표시. `home.module.css`: 이 기능의 전용 스타일 |
| [features/auth/public-routes.ts](./src/features/auth/public-routes.ts) | AuthGate의 공개 읽기 경로 허용 목록. 새 공개 경로는 여기와 접근 경계 테스트를 함께 수정 |
| [features/market/schedule](./src/features/market/schedule), [MARKET_CALENDARS.md](./MARKET_CALENDARS.md) | calendars는 출처가 있는 연도별 휴일·특별시간, time은 시간대/DST, session은 상태·다음 개장 계산, index는 공개 창구. MarketSessions는 타이머·표시만 담당하며 전용 CSS 모듈 사용. 일반 공휴일과 거래소 휴일을 혼동하지 않음 |
| [features/market/MarketHeader.module.css](./src/features/market/MarketHeader.module.css), [MarketTicker.tsx](./src/features/market/MarketTicker.tsx) | 메인 전용 상단 배치(데스크톱 60px/모바일 두 행), 7개 지수 공유 구독·기준 시각 안내. Header는 메인에서만 기존 경로·알림/도움말 대신 이 지수 영역을 조립한다. 다른 페이지 상단은 유지 |
| [features/market/movers-model.ts](./src/features/market/movers-model.ts), [movers-store.ts](./src/features/market/movers-store.ts), [use-market-movers.ts](./src/features/market/use-market-movers.ts) | 순위 검증/변환, 공유 상태·구독·폴링 해제, React 연결. server/movers는 Yahoo screener 호출. `/api/movers`는 종류 검증·서비스 호출·응답만 담당. schedule 공개 인터페이스는 거래소 일정 기반 장 상태·휴장 사유·다음 개장을 제공 |
| [features/market/news-model.ts](./src/features/market/news-model.ts), [use-market-news.ts](./src/features/market/use-market-news.ts) | 뉴스 타입·링크/시각 검증과 React 요청 수명. server/news는 기존 Yahoo 클라이언트/요청 풀 사용 |
| [WatchStockButton](./src/features/watchlist/WatchStockButton.tsx) | 종목 상세의 기존 관심종목 저장 명령 연결과 로그인 안내. 별도 저장소를 만들지 않음 |
| [features/portfolio/model](./src/features/portfolio/model) | `types.ts`: 명령·입력·저장소 계약. `commands.ts`: 최신 거래에 명령 적용·검증/병합. `enrichment.ts`: 거래 통화/환율 보완. `summary.ts`: 현재 보유 자산 요약 |
| [features/portfolio/data](./src/features/portfolio/data) | `ledger-store.ts`: 초기화·직렬 명령·재시도·상태 발행·폐기. `local.ts`: 로컬 revision·복구/outbox 사본. `server.ts`: RPC read/commit. `rows.ts`: DB 행↔Transaction. `preferences.ts`: 표시 설정 저장 |
| [features/portfolio/state](./src/features/portfolio/state) | `ledger.tsx`: 계정별 저장소 수명·Web Locks·명령 훅. `preferences.tsx`: 설정 구독. `market.tsx`: 필요한 경로의 보유 시세/환율 구독과 요약 |
| [features/portfolio/ui](./src/features/portfolio/ui) | `TradeStockPicker.tsx`: 입력 종목 선택. `TransactionEditor.tsx`: 기존 거래 편집. `BackupPreview.tsx`: 검증한 백업 미리보기 |
| [features/market](./src/features/market) | `quote-hub.ts`: 종목별 공유 폴링·구독 해제. `use-stock-search.ts`: 취소/debounce 검색. `use-trade-market.ts`: 거래일 환율/시장 조회. `MarketNotification.tsx`: Header 시장 알림. `MarketTicker.tsx`/`MarketTicker.module.css`: 대시보드 상단 지수·환율과 전용 반응형 스타일. 기존 useLiveQuotes를 소비 |
| [features/market/server](./src/features/market/server) | `provider.ts`: Yahoo 클라이언트·제한 큐·공급자 오류. `quote.ts`, `chart.ts`, `historical.ts`, `search.ts`: 종류별 조회/변환. `http.ts`: HTTP 오류 변환 |
| [hooks/useLiveQuotes.ts](./src/hooks/useLiveQuotes.ts), [lib/stock-api.ts](./src/lib/stock-api.ts) | React 종목 구독; API URL·요청 키·캐시 수명·환율 조회·응답 검증 |
| [features/performance](./src/features/performance) | `service.ts`: 저장 이력 재사용·필요 기간 조회·계산/저장 흐름. `request-plan.ts`: 기간별 필요한 종목/환율. `repository.ts`: 로컬/서버 성과 저장. `calculate.ts`: 직접/Worker 실행 선택. `performance.worker.ts`: Worker 메시지 진입점 |
| [hooks/usePerformanceHistory.ts](./src/hooks/usePerformanceHistory.ts) | 사용자·거래 revision·KST 날짜별 공유 결과 구독. 화면마다 서비스 인스턴스를 만들지 않음 |
| [features/performance](./src/features/performance)의 UI/훅 | `Charts.tsx`, `Controls.tsx`: 분석 차트/선택 UI. `use-performance-range.ts`: 표시 기간. `use-benchmark-series.ts`: 벤치마크 조회 |
| [features/journal](./src/features/journal), [hooks/useJournal.ts](./src/hooks/useJournal.ts) | controller: 검색·필터·편집 상태, Editor/Card: UI. useJournal: 계정별 로컬 CRUD·저장 오류 |
| [features/watchlist](./src/features/watchlist), [hooks/useWatchlist.ts](./src/hooks/useWatchlist.ts) | Search/Row/TargetEditor: 검색·행·목표가 UI. useWatchlist: 계정별 로컬 CRUD·시세 구독, quoteLimit으로 미리보기 조회 제한 |
| [components](./src/components)의 거래 UI | `TransactionForm`: 새 거래 입력. `TransactionList`: 목록/필터·편집 연결. `HoldingManagement`: 종목별 거래 수정/개별 삭제·되돌리기·별도 전체 삭제. `TransactionBackupPanel`: 파일 읽기/검증·내보내기·복구 명령 연결 |
| [components](./src/components)의 자산 UI | `HoldingsTable`, `PortfolioMetrics`: 보유 목록/지표. `WealthChart`, `AllocationChart`, `PerformanceAnalytics`: 자산 흐름·배분·상세 분석 조립 |
| [components](./src/components)의 시장 UI | `StockDetail`, `StockChart`: 독립 시세/차트 상태. `LiveMarkets`: 세계 주식. `WatchlistPreview`: 관심 3개. `MarketPicker`, `QuoteStatus`, `PriceChange`: 선택·시세 상태/변동 표시 |
| [components](./src/components)의 공통 UI | `Header`: 탐색/검색/통화. `AuthGate`: 로그인 진입. `StorageNotice`: 저장 오류/재시도. `WorkspaceDate`: 날짜. `BrandMark`: 앱 로고. `AssetAvatar`: 종목 마크/실패 대체 |
| [lib/portfolio.ts](./src/lib/portfolio.ts), [lib/performance.ts](./src/lib/performance.ts) | 순수 보유 상태·원가·거래 이력 검증; KST 날짜·일별 성과·수익률 계산 |
| [lib/transaction-backup.ts](./src/lib/transaction-backup.ts), [lib/portfolio-storage.ts](./src/lib/portfolio-storage.ts), [lib/branded-storage.ts](./src/lib/branded-storage.ts) | 백업 형식/검증/직렬화; 기존 거래 저장 키·이전 보유 데이터 보완; 이전 브랜드 키 읽기 호환. 이름에 stock이 남은 저장 키를 임의 변경하지 않음 |
| [lib](./src/lib)의 공통 자료 | `types.ts`: 거래/시세/차트 계약. `currency.ts`: 통화 정규화/환산. `markets.ts`: 시장·코드·별칭. `format.ts`: 표시 포맷. `utils.ts`: class 조합. `demo.ts`: 샘플. `company-logos.ts`: 검증 원본/Yahoo/Elbstream 이미지 후보·URL 검증(거래소 접미사 유지). `AssetAvatar`는 실패 시 다음 후보와 공통 아이콘, layout 하단은 필수 공급원 출처 표시. 신규 종목에 별도 quote 호출을 추가하지 않음 |
| [shared/async](./src/shared/async), [shared/react/use-operation-scope.ts](./src/shared/react/use-operation-scope.ts) | `pool.ts`: 동시 실행 제한. `request-cache.ts`: 공유 요청·취소/TTL/timeout. `shared-resource.ts`: 공유 결과·수명/폴링. operation scope: 화면/계정 해제 후 UI 반영 차단 |
| [supabase/migrations](./supabase/migrations), [supabase/rollback](./supabase/rollback) | 기존 DB의 거래 CAS·원자적 교체/성과 저장 증분 SQL과 복구 SQL. 새 DB의 전체 초기 스키마는 아님 |

### 스타일·자산·도구

| 위치 | 소유 범위 |
| --- | --- |
| [app/globals.css](./src/app/globals.css) | 토큰·기본 요소·접근성 |
| [styles/workspace.css](./src/styles/workspace.css) | 공통 프레임·탐색·화면/패널/모달·반응형 |
| [styles/portfolio.css](./src/styles/portfolio.css), [styles/charts.css](./src/styles/charts.css) | 자산/거래 UI; 차트/분석 UI |
| [app/auth.css](./src/app/auth.css) | AuthGate 로그인 화면. components의 Tailwind 클래스도 실제 스타일 일부 |
| [public](./public), [BRAND.md](./BRAND.md) | 로고 원본·파생 자산은 BRAND의 경로/출처 기준. `public/companies/sources.json`은 종목 이미지 출처. app의 icon/apple-icon/favicon은 브라우저 아이콘 |
| [tests](./tests) | `.test.mjs`: 회귀 검사. `reference`: 동등성 비교용 이전 계산. `fixtures`: 격리 입력/SQL 스키마/실측. `load-typescript.mjs`: TS 검사 로더. `prepare-browser-qa.mjs`: 별도 QA 앱. `postgres-concurrency.mjs`: 실제 두 연결 검사 |
| [설정 파일](./package.json) | package/lock: 명령·버전. tsconfig: TS·`@/` 별칭. eslint.config: 린트. next.config: Next 설정. open-next.config·wrangler.jsonc: Workers 빌드/배포. postcss.config: CSS 처리 |
| [.gitignore](./.gitignore), [.env.example](./.env.example) | 비밀/생성물 제외·환경 변수 예시. work·node_modules·.next·.open-next는 구현 기준이 아니며 work는 커밋하지 않음 |

## 코드 추가·수정 절차

1. `git status --short`로 다른 변경을 확인하고, README → PROJECT_STATUS의 현재 상태/제약 → 위 작업별 시작점 → 해당 PRODUCT_SPEC 절 순으로 읽는다. 승인 없는 명세 변경은 구현 완료로 간주하지 않는다.
2. 기존 기능이면 해당 소유 모듈을 수정한다. 독립 기능은 `src/features/<기능>/`에 두되 실제 필요한 UI·state·data·model만 만든다. 빈 계층·모든 것을 모으는 service·전체 export를 다시 내보내는 index는 일괄 생성하지 않는다. 공통화는 실제 두 소비자의 같은 책임을 확인한 뒤 한다.
3. 페이지는 UI 배치·기능 연결, 훅은 React 구독/수명, model/lib는 순수 계산, repository는 저장/변환을 맡긴다. state→data/model 방향을 유지하고 data/model에서 페이지·React UI를 import하지 않는다. 기능 간에는 위 사용 창구 또는 명시적 입력/결과 타입으로 연결한다.
4. Next.js 파일을 수정하기 전 설치된 `node_modules/next/dist/docs/`의 관련 항목을 읽는다. 구조는 `01-app/01-getting-started/02-project-structure.md`, 서버/클라이언트 경계는 `05-server-and-client-components.md`, API는 `15-route-handlers.md`가 시작점이다. 상태/이벤트가 필요한 경계에만 `use client`를 둔다. 현재 Next/OpenNext 버전을 자동 업그레이드하지 않는다.
5. 아래 변경 유형의 연결 지점을 확인하고 기존 구현을 직접 수정한다. 대체된 함수·export·스타일을 제거하고 소비자를 찾아 이관한다. 재현 가능한 실패 검사를 붙인 뒤 영향 범위 테스트를 실행한다.
6. README의 린트·TS·관련 테스트와 필요 시 전체/Workers 빌드를 실행한다. UI는 격리 QA에서 해당 흐름·데스크톱/모바일, 저장 변경은 실패·겹침·계정 전환을 확인한다. 실제 사용자 기록으로 CRUD 검증하지 않는다.
7. 파일 책임/경로/사용 창구가 바뀌면 이 문서의 해당 행, 기능 의미는 PRODUCT_SPEC, 결과/제약은 PROJECT_STATUS를 갱신한다. 커밋·main 병합·공개 반영은 사용자의 해당 지시와 [CLOUDFLARE](./CLOUDFLARE.md) 순서를 따른다.

### 변경 유형별 연결 지점

- **거래 필드/명령**: lib/types와 model/types → commands/검증 → 필요한 enrichment → rows·local/server·백업 호환 → 공개 명령 훅 → 입력/편집 UI 순서로 확인한다. 모든 변경이 모든 파일의 수정을 뜻하지 않는다. UI에서 직접 upsert/delete를 추가하지 않는다. 명령의 오류 반환 규약을 읽고 성공 문구를 표시한다.
- **저장 형식/DB**: 기존 데이터·이전 키·백업 호환과 원자적 RPC·RLS·revision을 함께 확인한다. 마이그레이션은 현재 운영 이력을 대조해 준비하고, 파일 생성/로컬 테스트를 운영 적용으로 표시하지 않는다. DB 적용 여부는 PROJECT_STATUS를 확인한다.
- **시세/API**: stock-api의 요청 키에 결과를 바꾸는 모든 인자를 넣고 기존 캐시/취소 정책을 사용한다. route는 검증/응답, 시장별 변환은 server 서비스에 둔다. 새 화면 폴링은 useLiveQuotes로 필요한 종목만 구독한다. 보유 요약이 필요한 새 경로는 state/market.tsx의 활성 경로도 확인한다.
- **성과 계산**: lib 계산의 고정 입력 동등성, service의 필요한 기간, 저장 revision과 Worker 직렬화 계약을 확인한다. 단순 표시 기간 변경은 range 훅부터 시작한다. 기존 의미 유지 리팩터링에서는 reference를 새 알고리즘에 맞춰 덮어쓰지 않는다.
- **CSS**: 클래스 사용처와 기존 소유 파일을 `rg`로 찾고 해당 선언을 수정한다. layout의 import 순서와 Tailwind까지 확인한다. 파일 말미 override 추가만으로 해결하지 않는다.
- **공개 커뮤니티**: 현재 redirect와 루트 AuthGate가 출발점이다. PRODUCT_SPEC의 비로그인 공개 읽기와 개인 영역 보호가 함께 작동하도록 접근 경계를 설계한다. 기존 투자 노트의 로컬 저장을 공개 글 저장소로 재사용하지 않는다.

## 탐색 비용과 한계

이 구조는 작업별 진입점·책임·검증 위치를 미리 제공해 반복 검색 범위를 좁힌다. 코드가 feature 단위로 나뉘었다는 이유만으로 실제 토큰 사용량이 감소했다고 단정할 수는 없다. 동일 작업·동일 모델의 전후 측정은 하지 않았다.

- 빠른 탐색: `rg --files src/features/portfolio`, `rg -n 'useTransactionCommands' src`, `rg -n 'selector-name' src/styles src/components`처럼 관련 경로에 한정하고 import를 따라 확장한다. 생성물·이미지·원시 fixture는 해당 문제일 때만 읽는다.
- 현재 `components`, `hooks`, `lib`와 feature 폴더가 공존한다. 전부 기능 폴더로 이동한 상태는 아니며 기존 공개 경로를 재사용한다. 파일 지도를 위해 무의미한 이동을 추가하지 않는다.
- TransactionForm/TransactionList/PerformanceAnalytics·일부 페이지와 workspace.css는 여전히 읽을 양이 있다. 새 책임을 붙이기 전 기존 하위 모듈로 분리할 수 있는지 확인한다. 줄 수만으로 다시 쪼개지 않는다.
- 순환 검사 범위는 src의 정적 TS import/export다. 동적 import·CSS 연결·아키텍처 경계를 모두 보증하지 않는다. 지도는 자동 생성물이 아니므로 경로를 바꾸는 작업에서 함께 갱신한다.
