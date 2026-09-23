# 코드 지도와 변경 방법

현재 구현·검증·배포는 [PROJECT_STATUS](./PROJECT_STATUS.md#환경별-진행-상태), 기능 의미는 [PRODUCT_SPEC](./PRODUCT_SPEC.md), 화면 기준은 [DESIGN_SYSTEM](./DESIGN_SYSTEM.md)이 소유한다. 이 문서는 **어떤 기능을 고칠 때 무엇부터 읽고 어디를 수정할지**만 관리한다. 경로·책임이 바뀌면 기존 행을 최신화하며 작업 경위나 과거 코드 지도를 누적하지 않는다.

## 작업별 시작점

기능 추가·수정 시 해당 행의 **기능 명세 → 디자인 기준 → 구현 → 검증**만 먼저 읽는다. 모든 문서·과거 검증을 매번 읽지 않는다. 공통 디자인의 [기본 방향](./DESIGN_SYSTEM.md#기본-방향)·[화면 문구](./DESIGN_SYSTEM.md#화면-문구)는 화면 작업 전체에 적용한다. 세부 기준은 아래 링크를 따른다.

```sh
npm run docs:guide -- 관심종목
npm run docs:guide -- src/features/performance/Controls.tsx
```

아래 표가 안내 명령과 문서 연결 검사의 **단일 원본**이다. 새 기능은 기존 행에 통합하거나 한 행을 추가하고, 새 page.tsx·route.ts는 정확한 파일 링크로 등록한다. 기능 폴더는 `src/features/<기능>` 자체를 등록한다. 이름만 있는 미구현 계획은 PRODUCT_SPEC에 남기고 존재하지 않는 코드 링크를 만들지 않는다.

| 기능 | 기능 명세 | 디자인 기준 | 구현·확장 시작점 | 검증 |
| --- | --- | --- | --- | --- |
| 월별·연도별 투자 성과 | [기간별 집계 의미](./PRODUCT_SPEC.md#월별연도별-투자-성과) | [투자 성과 표](./DESIGN_SYSTEM.md#월별연도별-투자-성과-표) | [달력 집계](./src/features/performance/period-summary.ts), [표·전환·페이지](./src/features/performance/PerformanceTable.tsx), [전체 이력·실패 연결](./src/features/performance/InvestmentHistory.tsx), [스타일](./src/styles/portfolio.css) | [월/연도·매도·미운용·환율](./tests/performance-period-summary.test.mjs), [표·전환·전체 이력 연결](./tests/performance-table.test.mjs), [공유 이력·계정 격리·조회 실패](./tests/investment-history-view.test.mjs) |
| 공통 탐색·본문·메뉴 | [주요 메뉴](./PRODUCT_SPEC.md#주요-메뉴와-내-투자) | [공통 본문](./DESIGN_SYSTEM.md#공통-본문과-좌우-여백), [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [navigation](./src/features/navigation), [layout](./src/app/layout.tsx), [Header](./src/components/Header.tsx), [PageFrame](./src/components/PageFrame.tsx), [공통 스타일](./src/styles/workspace.css), [기업 아이콘·빈 보유 화면](./src/components/AssetAvatar.tsx), [아이콘·빈 상태 스타일](./src/components/AssetAvatar.module.css) | [메뉴](./tests/navigation.test.mjs), [본문](./tests/page-frame.test.mjs), [스타일 소유 경계](./tests/style-ownership.test.mjs) |
| 시장 홈 | [공개 홈](./PRODUCT_SPEC.md#공개-홈과-로그인-경계) | [홈 섹션](./DESIGN_SYSTEM.md#홈-섹션-통일) | [home](./src/features/home), [홈 진입](./src/app/page.tsx), [HomeSection](./src/features/home/HomeSection.tsx) | [공개 경계](./tests/public-home.test.mjs), [홈](./tests/market-workspace.test.mjs) |
| 평소와 다른 움직임 | [변화 비교](./PRODUCT_SPEC.md#평소와-다른-움직임) | [비교 카드](./DESIGN_SYSTEM.md#변화-비교-카드) | [MarketChanges](./src/features/home/MarketChanges.tsx), [전용 스타일](./src/features/home/market-changes.module.css), [순수 계산](./src/features/market/market-changes.ts), [공유 훅](./src/features/market/use-market-changes.ts), [수치 수집](./src/features/market/server/market-changes.ts), [기사 선별](./src/features/market/change-research.ts), [회사별 검색](./src/features/market/server/news.ts), [조사·저장](./src/features/market/server/changes-refresh.ts), [저장 검증](./src/features/market/server/prepared-changes.ts), [서버 읽기](./src/features/market/server/changes-response.ts), [준비 대기](./src/shared/async/prepared-feed.ts), [변화 API](./src/app/api/market-changes/route.ts), [개인별 선택](./src/features/market/personalized-changes.ts), [관심 자료 구독](./src/features/market/use-watched-reports.ts), [종목 묶음 형식](./src/features/market/watched-report.ts), [종목 시세](./src/features/market/server/watched-report-quote.ts), [종목 저장 검증](./src/features/market/server/watched-report-store.ts), [종목 준비](./src/features/market/server/watched-report-refresh.ts), [종목 읽기](./src/features/market/server/watched-report-response.ts), [종목 자료 API](./src/app/api/stock-report/route.ts) | [기준일·평균·방향 전환·부분 실패](./tests/market-changes.test.mjs), [종목 연결·기사 선별·저장·실패·상시 비교/분할 표시](./tests/change-research.test.mjs), [관심 종목 준비·이전 거래일·지원 범위](./tests/watched-report.test.mjs), [카드 표시](./tests/market-change-cards.test.mjs), [관심/공개 혼합·이전 변화 제거](./tests/personalized-changes.test.mjs) |
| 거래량·상승·하락 순위 | [순위 의미](./PRODUCT_SPEC.md#종목-순위) | [제목·목록](./DESIGN_SYSTEM.md#홈-섹션-통일) | [volume](./src/app/rankings/volume/page.tsx), [gainers](./src/app/rankings/gainers/page.tsx), [losers](./src/app/rankings/losers/page.tsx), [RankingPage](./src/features/home/RankingPage.tsx), [순위 API](./src/app/api/movers/route.ts), [순위 공유](./src/features/market/movers-store.ts) | [순위 표현](./tests/market-presentation.test.mjs), [홈 연결](./tests/market-workspace.test.mjs) |
| 주요뉴스·번역 | [뉴스·번역](./PRODUCT_SPEC.md#주요뉴스와-번역) | [제목·목록](./DESIGN_SYSTEM.md#홈-섹션-통일), [문구](./DESIGN_SYSTEM.md#화면-문구) | [MarketNews](./src/features/home/MarketNews.tsx), [뉴스 API](./src/app/api/news/route.ts), [수집](./src/features/market/server/trending-news.ts), [KV 검증](./src/features/market/server/prepared-news.ts), [읽기](./src/features/market/server/news-response.ts), [준비](./src/features/market/server/news-refresh.ts), [번역](./src/features/market/server/title-translation.ts), [수량·통화 검증](./src/features/market/server/translation-numbers.ts), [번역 저장·재시도](./src/features/market/server/translation-provider.ts), [정기 실행](./custom-worker.ts), [로컬 준비](./scripts/prepare-news.mjs) | [선정](./tests/trending-news.test.mjs), [번역](./tests/title-translation.test.mjs), [캐시·재시도·호출 한도](./tests/translation-provider.test.mjs), [준비·보존](./tests/prepared-news.test.mjs) |
| 증시 캘린더·다가오는 일정·발표 상세 | [달력·수치 의미](./PRODUCT_SPEC.md#증시-캘린더와-발표-상세) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [calendar](./src/features/calendar), [달력](./src/app/calendar/page.tsx), [발표 상세](./src/app/calendar/[id]/page.tsx), [조회 API](./src/app/api/calendar/route.ts), [수집 API](./src/app/api/calendar/sync/route.ts) | [달력](./tests/economic-calendar.test.mjs), [홈 일정](./tests/calendar-agenda.test.mjs), [발표](./tests/calendar-releases.test.mjs), [저장](./tests/sql-economic-calendar.test.mjs) |
| 지수 띠·장 시간표 | [지수·6개국 시간표](./PRODUCT_SPEC.md#시장-홈-상단-지수) | [장 시간표](./DESIGN_SYSTEM.md#장-일정-시간표) | [MarketTicker](./src/features/market/MarketTicker.tsx), [지표 목록](./src/features/market/ticker-instruments.ts), [장 일정](./src/features/market/schedule), [MarketSessions](./src/features/home/MarketSessions.tsx) | [지수](./tests/market-ticker.test.mjs), [시간표](./tests/market-timeline.test.mjs), [일정](./tests/market-schedule.test.mjs) |
| 시세·종목 상세·차트 | [시세·목표가](./PRODUCT_SPEC.md#시세와-목표가), [응답 완료](./PRODUCT_SPEC.md#화면-응답-완료-기준) | [색상](./DESIGN_SYSTEM.md#색상), [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [market](./src/features/market), [종목 진입](./src/app/stock/[symbol]/page.tsx), [StockDetail](./src/components/StockDetail.tsx), [공유 시세](./src/features/market/quote-hub.ts), [묶음 전송](./src/features/market/quote-batch.ts), [공통 종목명·검색 별칭](./src/lib/markets.ts), [quote API](./src/app/api/quote/[symbol]/route.ts), [quotes API](./src/app/api/quotes/route.ts), [chart API](./src/app/api/chart/[symbol]/route.ts), [historical API](./src/app/api/historical/[symbol]/route.ts) | [API](./tests/market-api.test.mjs), [묶음·취소·부분 실패](./tests/quote-batch.test.mjs), [묶음 서버·오류 진단](./tests/quote-batch-server.test.mjs), [시장 자료](./tests/market-data.test.mjs), [요청](./tests/requests.test.mjs) |
| 종목 탐색·검색·최근 검색 | [검색·기록](./PRODUCT_SPEC.md#종목-탐색과-최근-검색) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [탐색](./src/app/discover/page.tsx), [StockDiscovery](./src/features/home/StockDiscovery.tsx), [검색 스타일](./src/features/home/stock-discovery.module.css), [최근 검색](./src/features/market/recent-searches.ts), [검색 API](./src/app/api/search/route.ts) | [최근 검색](./tests/recent-searches.test.mjs), [검색](./tests/market-data.test.mjs) |
| 로그인·계정 요청 | [로그인 경계](./PRODUCT_SPEC.md#공개-홈과-로그인-경계), [저장 복구](./PRODUCT_SPEC.md#거래-저장동기화복구) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [auth](./src/features/auth), [useAuth](./src/hooks/useAuth.tsx), [AuthGate](./src/components/AuthGate.tsx), [세션 요청](./src/features/auth/session-request.ts) | [인증](./tests/auth-loading.test.mjs), [계정 요청](./tests/session-request.test.mjs), [접근 경계](./tests/public-home.test.mjs) |
| 보유자산·거래 저장 | [자산 배치](./PRODUCT_SPEC.md#내-포트폴리오-배치), [저장·복구](./PRODUCT_SPEC.md#거래-저장동기화복구) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [portfolio](./src/features/portfolio), [보유자산](./src/app/portfolio/page.tsx), [자산 요약](./src/components/PortfolioMetrics.tsx), [오늘 손익 표시 반올림](./src/features/portfolio/ui/daily-breakdown-presentation.ts), [상세 탭](./src/features/portfolio/ui/PortfolioDetails.tsx), [탭 스타일](./src/features/portfolio/ui/PortfolioDetails.module.css), [구성 계산](./src/features/portfolio/model/holding-allocation.ts), [전체 구성 도넛](./src/features/portfolio/ui/HoldingsComposition.tsx), [보유 표](./src/components/HoldingsTable.tsx), [공개 훅](./src/hooks/usePortfolio.tsx), [명령](./src/features/portfolio/model/commands.ts), [저장 큐](./src/features/portfolio/data/ledger-store.ts) | [저장](./tests/ledger-store.test.mjs), [SQL](./tests/sql-ledger.test.mjs), [백업](./tests/backup-commands.test.mjs), [빈 상태·문구](./tests/screen-copy.test.mjs), [탭·키보드·상태 보존](./tests/portfolio-details-tabs.test.mjs), [컴팩트 내장 배치](./tests/portfolio-compact-layout.test.mjs), [손익 표시 합계](./tests/daily-breakdown-presentation.test.mjs), [현금 미추적·전량매도 경계](./tests/cashless-portfolio.test.mjs), [전체 구성·표 연결·추가 표시·동률 정렬](./tests/portfolio-holdings-ui.test.mjs), [손익 통화·단위](./tests/summary-currency.test.mjs) |
| 자정 기준 투자 변동 | [자정·환율·현재 범위](./PRODUCT_SPEC.md#보유자산-개선-검토) | [보유자산 유형](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [순수 계산](./src/features/portfolio/model/daily-change.ts), [공유 자료 구독](./src/features/portfolio/state/use-daily-change.ts), [기준 자료 형식](./src/features/market/baseline.ts), [가격 선택·조회](./src/features/market/server/midnight-price.ts), [환율 시간·별칭](./src/features/market/fx.ts), [실측·달러 교차](./src/features/market/server/fx-market.ts), [공식 참고값](./src/features/market/server/fx-reference.ts), [실제 공표 확인](./src/features/market/server/fx-reference-release.ts), [적용 날짜 문구](./src/features/portfolio/model/daily-reference-label.ts), [자정 API](./src/app/api/baseline/[symbol]/route.ts), [공유 KST 날짜](./src/shared/time/use-kst-date.ts) | [계산·환율·가용성](./tests/portfolio-daily-change.test.mjs), [자정 시세·공급 누락](./tests/midnight-price.test.mjs), [환율 휴장·교차·최종 관측](./tests/fx-market.test.mjs), [ECB 실제 발표](./tests/fx-reference-release.test.mjs) |
| 거래 입력·내역·수정·삭제 | [입력·날짜](./PRODUCT_SPEC.md#거래-입력과-날짜), [수정·삭제](./PRODUCT_SPEC.md#보유종목-수정과-삭제) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [입력 진입](./src/app/search/page.tsx), [내역 진입](./src/app/transactions/page.tsx), [입력 표시](./src/components/TransactionForm.tsx), [입력·검증·저장 수명](./src/features/portfolio/ui/use-transaction-entry.ts), [TransactionHistory](./src/features/portfolio/ui/TransactionHistory.tsx), [TransactionEditor](./src/features/portfolio/ui/TransactionEditor.tsx) | [입력·계정·중복 제출·표시 동등성](./tests/transaction-entry.test.mjs), [날짜](./tests/transaction-date.test.mjs), [보유 수정](./tests/holding-management.test.mjs), [환율 보완](./tests/enrichment.test.mjs) |
| 성과 분석·계산·조회 연결 | [계산 의미](./PRODUCT_SPEC.md#자산통화성과의-의미) | [배치](./DESIGN_SYSTEM.md#기간-성과-배치), [손익 요약](./DESIGN_SYSTEM.md#기간-성과-손익-요약), [결측·실패](./DESIGN_SYSTEM.md#기간-성과-결측과-실패) | [performance](./src/features/performance), [조회 계획](./src/features/performance/request-plan.ts), [일별 환율 형식·달력](./src/features/market/fx-history.ts), [공통 수집·보관](./src/features/market/server/fx-history-store.ts), [환율 API](./src/app/api/fx-history/route.ts), [통합 화면](./src/app/portfolio/page.tsx), [옛 주소 연결](./src/app/insights/page.tsx), [기간 성과](./src/components/PerformanceAnalytics.tsx), [usePerformanceHistory](./src/hooks/usePerformanceHistory.ts), [순수 계산](./src/lib/performance.ts), [자산 계산](./src/lib/portfolio.ts) | [동등성·실측](./tests/performance.test.mjs), [단일 수익률·요약/차트 일치](./tests/performance-return.test.mjs), [펜스 단위 정답](./tests/pence-performance.test.mjs), [서비스](./tests/performance-service.test.mjs), [개별 시세 복구](./tests/market-recovery.test.mjs), [갱신·입력 격리](./tests/performance-refresh.test.mjs), [일별 환율](./tests/daily-fx-history.test.mjs), [영구 저장·실패 보존](./tests/fx-history-store.test.mjs), [응답 검증](./tests/fx-history-client.test.mjs), [화면 통합·통화](./tests/screen-copy.test.mjs), [옛 주소 연결](./tests/navigation.test.mjs) |
| 성과 날짜 조작·기간 선택 | [성과 의미](./PRODUCT_SPEC.md#자산통화성과의-의미) | [날짜 조작](./DESIGN_SYSTEM.md#기간-성과-날짜-조작), [모바일·크기](./DESIGN_SYSTEM.md#기간-성과-모바일과-크기) | [기간 조작·손익 요약](./src/features/performance/Controls.tsx), [날짜 입력·달력](./src/features/performance/DateField.tsx), [날짜 해석·이동](./src/features/performance/date-picker.ts), [기간 선택·파생값](./src/features/performance/use-performance-range.ts) | [날짜 입력 경계](./tests/performance-date-picker.test.mjs), [성과 표시·조작](./tests/performance-fx-ui.test.mjs)의 날짜/기간 선택 사례 |
| 성과 차트·눈금·비교 목록 | [성과 의미](./PRODUCT_SPEC.md#자산통화성과의-의미) | [차트 선](./DESIGN_SYSTEM.md#기간-성과-차트-선과-값), [축·단위](./DESIGN_SYSTEM.md#기간-성과-차트-축과-단위), [비교 목록](./DESIGN_SYSTEM.md#기간-성과-비교-목록) | [차트](./src/features/performance/Charts.tsx), [차트 눈금·단위](./src/features/performance/chart-presentation.ts), [비교 목록·강조](./src/features/performance/ComparisonList.tsx), [비교 종목 구독](./src/features/performance/use-benchmark-series.ts), [비교 기준가·시계열](./src/features/performance/benchmark-data.ts), [비교 공통 구독](./src/features/performance/comparison-store.ts), [보유자산·성과 스타일](./src/styles/portfolio.css) | [차트 눈금 경계](./tests/performance-chart-presentation.test.mjs), [다중 비교·요청 수명](./tests/performance-benchmarks.test.mjs), [표시·전환](./tests/performance-fx-ui.test.mjs)의 해당 사례 |
| 1일·5일 시간별 성과 | [분자료 의미·한계](./PRODUCT_SPEC.md#1일5일-시간별-자산-그래프) | [축·단위](./DESIGN_SYSTEM.md#기간-성과-차트-축과-단위), [결측·실패](./DESIGN_SYSTEM.md#기간-성과-결측과-실패) | [시간별 형식](./src/features/market/intraday.ts), [분자료 API](./src/app/api/chart/[symbol]/route.ts), [분자료 검증](./src/features/market/server/intraday.ts), [시간별 계산](./src/features/performance/intraday-performance.ts), [개인 분자료 구독](./src/features/performance/use-intraday-performance.ts), [시간별 화면](./src/features/performance/IntradayAnalytics.tsx), [시간별 비교](./src/features/performance/use-intraday-benchmarks.ts) | [완료 분봉·휴장](./tests/market-intraday.test.mjs), [분 합산·격리·화면](./tests/intraday-performance.test.mjs), [분 비교 수명](./tests/intraday-benchmarks.test.mjs) |
| 관심종목 | [관심종목](./PRODUCT_SPEC.md#관심종목), [개인 데이터](./PRODUCT_SPEC.md#개인-데이터) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준), [색상](./DESIGN_SYSTEM.md#색상) | [watchlist](./src/features/watchlist), [관심 진입](./src/app/watchlist/page.tsx), [useWatchlist](./src/hooks/useWatchlist.ts), [관심 형식](./src/features/watchlist/model.ts), [계정 저장 요청](./src/features/watchlist/repository.ts), [저장 수명](./src/features/watchlist/store.ts), [브라우저 구독](./src/features/watchlist/browser-store.ts), [홈 관심 미리보기](./src/components/WatchlistPreview.tsx), [계정 저장 SQL](./supabase/migrations/20260912112710_account_watchlists.sql) | [저장·계정 경계](./tests/watchlist.test.mjs), [RLS·삭제 보존·한도](./tests/sql-watchlist.test.mjs), [저장 호환](./tests/branded-storage.test.mjs), [문구·실패](./tests/screen-copy.test.mjs), [격리 화면 준비](./tests/prepare-browser-qa.mjs), [빈 상태·추가 검색](./tests/watchlist-empty-ui.test.mjs) |
| 투자 노트 | [투자 노트](./PRODUCT_SPEC.md#투자-노트), [개인 데이터](./PRODUCT_SPEC.md#개인-데이터) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준), [문구](./DESIGN_SYSTEM.md#화면-문구) | [journal](./src/features/journal), [노트 진입](./src/app/journal/page.tsx), [목록 조작·좁은 화면 스타일](./src/app/journal/JournalPage.module.css), [useJournal](./src/hooks/useJournal.ts) | [저장 호환](./tests/branded-storage.test.mjs), [격리 화면 준비](./tests/prepare-browser-qa.mjs), [빈 상태·목록 도구](./tests/journal-empty-ui.test.mjs) |
| 계정 설정·통화·백업 | [계정 설정](./PRODUCT_SPEC.md#계정-설정), [개인 데이터](./PRODUCT_SPEC.md#개인-데이터) | [간격·공통 요소](./DESIGN_SYSTEM.md#간격과-공통-요소) | [settings](./src/features/settings), [설정 진입](./src/app/settings/page.tsx), [백업 패널](./src/components/TransactionBackupPanel.tsx) | [백업](./tests/backup-commands.test.mjs), [설정·탐색](./tests/navigation.test.mjs), [문구](./tests/screen-copy.test.mjs) |
| 공개 읽을거리 | [읽을거리](./PRODUCT_SPEC.md#공개-읽을거리) | [유형별 화면](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [목록](./src/app/community/page.tsx), [본문](./src/app/read/[slug]/page.tsx), [글 자료](./src/features/home/reading.ts), [ReadingShelf](./src/features/home/ReadingShelf.tsx), [목록·본문 스타일](./src/features/home/reading.module.css) | [공개 경계](./tests/public-home.test.mjs), [본문 배치](./tests/page-frame.test.mjs), [목록/섹션·공통 검색](./tests/reading-shelf-ui.test.mjs) |
| 광고 | [공개 광고](./PRODUCT_SPEC.md#광고-배치), [개인 광고](./PRODUCT_SPEC.md#내-포트폴리오-광고) | [광고 영역](./DESIGN_SYSTEM.md#광고-영역) | [ads](./src/features/ads), [SideRailPreview](./src/features/ads/SideRailPreview.tsx), [PortfolioAd](./src/features/ads/PortfolioAd.tsx), [PageFrame](./src/components/PageFrame.tsx) | [광고](./tests/adsense.test.mjs), [공통 배치](./tests/page-frame.test.mjs) |

표의 검증 링크는 테스트 작성·수정과 대상 선택의 시작점이다. 개발 중에는 변경 부분에 직접 연결된 좁고 빠른 검사만 선택하며, 한 행의 검사를 전부 실행하라는 뜻이 아니다. 전체·중복 검사를 미루는 기준은 [AGENTS 검사 원칙](./AGENTS.md#작업응답-원칙)을 따른다. 자동 테스트만으로 사용자 흐름 전체를 검증했다는 뜻은 아니다. 실행 환경·범위·결과·한계는 PROJECT_STATUS에 기록한다. 준비 스크립트는 테스트 통과 근거가 아니다.

### 로그인 복귀·구루·알림의 시작점

| 기능 | 기능 명세 | 디자인 기준 | 구현·확장 시작점 | 검증 |
| --- | --- | --- | --- | --- |
| 로그인 원래 작업 복귀 | [로그인 경계](./PRODUCT_SPEC.md#공개-홈과-로그인-경계) | [입력·빈 상태](./DESIGN_SYSTEM.md#기능-유형별-화면-기준) | [복귀 허용 목록](./src/features/auth/login-return.ts), [관심 저장 진입](./src/app/save-interest/[symbol]/page.tsx), [저장 확인](./src/features/watchlist/SaveInterest.tsx), useAuth·AuthGate·기존 거래/관심 저장소 | [복귀](./tests/login-return.test.mjs), [인증](./tests/auth-loading.test.mjs), [계정 요청](./tests/session-request.test.mjs)의 해당 사례 |
| 공개 구루 자료 | [구루 목표/현재 범위](./PRODUCT_SPEC.md#구루-포트폴리오--계획) | [구루/알림](./DESIGN_SYSTEM.md#구루와-앱-안-알림) | [gurus](./src/features/gurus), [목록](./src/app/gurus/page.tsx), [상세](./src/app/gurus/[slug]/page.tsx). model은 공시 검증·불변 버전 승인, catalog는 직접 확인한 과거 SEC 자료만 소유 | [원문/부분/정정/늦은 공시](./tests/gurus.test.mjs), [공개/개인 경계·화면 출력](./tests/guru-notifications-ui.test.mjs) |
| 앱 안 알림 | [알림/방문](./PRODUCT_SPEC.md#앱-안-알림과-방문-요약) | [구루/알림](./DESIGN_SYSTEM.md#구루와-앱-안-알림) | [notifications](./src/features/notifications), [알림 경로](./src/app/notifications/page.tsx), [SQL](./supabase/migrations/20260923030710_guru_notifications.sql). NotificationProvider는 계정 수명·방문 창·공유 목록, repository는 계정 고정 요청/요약 선택, events는 검증된 관찰의 사건 변환, Notifications/FollowGuru는 조작·표시. layout은 Provider 연결만 수행 | [SQL/RLS/읽음/중복](./tests/sql-notifications.test.mjs), [목록/요약 출력](./tests/guru-notifications-ui.test.mjs). 운영 수집 연결·실계정 검증은 별도 |

## 코드 추가·수정 절차

1. 저장소 루트·로컬 main(사용자가 해당 작업에 브랜치를 명시한 경우 그 브랜치)·변경 상태를 확인한다. PC가 바뀌면 원격 main과 로컬 변경을 먼저 통합한다. [현재 상태](./PROJECT_STATUS.md#환경별-진행-상태)·[제약](./PROJECT_STATUS.md#현재-제약)·[다음 작업](./PROJECT_STATUS.md#다음-작업)을 읽고 `docs:guide` 또는 위 표에서 작업 행을 고른다.
2. **구현 전 문서 위치를 정한다.** PRODUCT_SPEC의 기존 기능 절에 사용자 흐름·화면 동작·데이터 의미·실패/빈 상태를 정리한다. 새 기능은 아래 형식의 절과 위 표 한 행을 추가한다. 제품 방향 선택은 DECISIONS, 개별 실행 범위/완료 조건은 해당 GitHub 이슈에 둔다. 기존 승인 안의 구현 선택은 직접 하고, 실제 사용자 선택이 필요한 부분만 질문한다. 이슈 등록·다른 작업 전달은 해당 승인 범위를 따른다.
3. **디자인을 먼저 연결한다.** 새 화면도 DESIGN_SYSTEM의 공통 방향과 가장 가까운 유형을 적용한다. 사용자가 다른 디자인을 확정하면 기준을 먼저 갱신하고 같은 역할의 기존 화면 영향도 확인한다. 개별 화면 설명에 글꼴·색상 값을 복사하지 않는다.
4. **기존 구조에서 구현한다.** 아래 책임과 사용 창구를 재사용하고 대체한 코드·스타일은 같은 작업에서 정리한다. 독립 기능만 `src/features/<기능>`으로 만들며 빈 계층·무의미한 전체 export를 생성하지 않는다. Next.js 작업 전에 설치된 관련 가이드를 읽는다.
5. **변경 부분을 빠르게 확인하고 전체 검증은 준비만 한다.** 변경에 맞는 테스트와 전후 이동·실패·모바일/키보드 확인 범위를 정리한다. 개발 중에는 변경 부분의 좁고 빠른 검사만 실행하며 관련 변경 없이 통과한 검사를 반복하지 않는다. 전체 검사는 푸시 직전에 모은다. 실제 사용자 자료로 CRUD 실험하지 않는다. 실행 시점·명령은 [README 검증](./README.md#검증).
6. **담당 문서의 기존 항목을 최신화한다.** 아래 표에서 바뀐 내용의 소유 문서만 갱신하고 대체된 설명·중복은 제거한다. 다른 문서에는 상세를 복사하지 말고 링크한다. 변경 이력·날짜별 작업 문단을 추가하지 않는다. 아직 실행하지 않은 검사는 PROJECT_STATUS의 해당 행에 대기로 표시한다. 전체 검사는 pre-push 훅에서 실행하며 실제 브라우저/운영 계정 검증은 별도다. 사용자의 `커밋`, `푸시`, `배포` 중 하나의 지시는 의도한 변경 커밋 → GitHub 푸시 → Cloudflare 자동 배포·공개 응답 확인까지의 같은 승인으로 수행하되, 사용자가 범위를 명시적으로 제한하면 그 지시를 우선한다.

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
| 기능·저장·계산·접근 범위 | PRODUCT_SPEC의 담당 절. 큰 제품 방향·출시 범위가 바뀔 때만 DECISIONS의 현재 결정도 갱신 |
| 디자인 공통 규칙·문구·색상 의미 | DESIGN_SYSTEM. 수치 변경은 design-tokens.css와 함께 수정 |
| 수익·비용·제품 중심 방향·출시 기한·측정 | 영향이 있는 사업/SEO 항목만 갱신. 작은 화면 수정이나 사업 영향 없음 보고를 복제하지 않음 |
| 파일 책임·사용 창구·새 페이지/API/기능 폴더 | 이 문서의 작업별 시작점·관련 책임 |
| 배포·환경 변수·운영 데이터 절차 | CLOUDFLARE. 실제 적용/검증 여부는 PROJECT_STATUS |
| 완료·미구현·미확인·검증 결과 | PROJECT_STATUS의 현재 표/제약을 직접 갱신. 날짜별 전체 보고서 추가 금지 |
| 개별 실행 범위·완료 조건·진행 | 해당 GitHub 이슈에 기준 문서 링크. 본문 전체 복제·미승인 타 작업 전달 금지 |

문서 담당 전체 목록은 [AGENTS 문서 관리 기준](./AGENTS.md#문서-관리-기준)을 따른다. 새 문서는 기존 담당 파일에 담을 수 없을 때만 만든다.

## 실행 흐름과 외부 사용 창구

시세 대기/복구를 바꿀 때는 기존 `shared/async/pool`·`request-cache`, `market/quote-hub`·`quote-batch`·`server/quote`·`server/chart`·`midnight-price`를 수정한다. quote-batch는 전송만 묶고 저장·폴링 수명은 기존 캐시/hub가 소유한다. 검색 우선순위와 취소는 [요청 검사](./tests/request-priority.test.mjs), 종목별 수명/1·2·5초 실패 복구는 [공유 시세](./tests/quote-hub.test.mjs), 묶음 전송은 위 클라이언트/서버 검사, 동일 구간 공유는 [서버 캐시](./tests/market-server-cache.test.mjs), 한국 마감 경계는 [마감 검사](./tests/midnight-closing-auction.test.mjs), 성과 사본 저장 시간 초과는 [저장 검사](./tests/performance-save.test.mjs)가 시작점이다. 별도 시세 저장소나 무제한 병렬 조회를 추가하지 않는다.

```text
app/layout.tsx → AuthProvider → AuthGate → PortfolioProvider → Header/PageFrame/페이지
거래 UI → useTransactionCommands → ledger-store → commands/enrichment → local 또는 server
시장 UI → useLiveQuotes / useStockSearch → stock-api → app/api → market/server → 공급원
관심 UI → useWatchlist → watchlist/store + repository → local 또는 계정별 RPC
홈 개인화 → useWatchedReports → 공개 종목 자료 API → 준비된 KV → 응답 후/정기 수집
성과 UI → usePerformanceHistory → service → repository + request-plan + calculate/Worker
```

- 거래·설정·시장 데이터의 공개 창구는 [usePortfolio](./src/hooks/usePortfolio.tsx)의 useTransactions/useTransactionCommands/usePreferences/usePortfolioMarket다. UI에서 저장소에 직접 쓰거나 별도 거래 배열을 만들지 않는다. 보유 시세는 portfolio·insights 경로에서만 구독한다.
- 시세는 [useLiveQuotes](./src/hooks/useLiveQuotes.ts), 검색은 [useStockSearch](./src/features/market/use-stock-search.ts), 성과는 [usePerformanceHistory](./src/hooks/usePerformanceHistory.ts)를 재사용한다. 오늘 손익의 공개 창구는 usePortfolio의 usePortfolioDailyChange다. 자정 자료는 기존 shared-resource/request-cache로 종목·날짜별 공유하고 현재 시세는 기존 quote-hub를 재사용한다. KST 날짜 구독은 성과/오늘 손익이 함께 사용한다. 별도 개인 저장이나 페이지별 중복 시세 폴링을 추가하지 않는다.
- 관심 저장은 [useWatchlist](./src/hooks/useWatchlist.ts)를 재사용한다. model은 명령 검증, repository는 계정이 고정된 RPC·원본 이관, store는 확정 목록·순차 명령·실패·수명, browser-store는 계정별 공유 구독·복귀 갱신을 소유한다. 별표마다 별도 서버 저장/폴링을 만들지 않는다.
- 홈의 관심 자료는 use-watched-reports의 공통 구독에서 종목별 요청을 공유한다. personalized-changes는 준비된 관심/공개 후보의 선택만 수행하며, watched-report 계열은 공개 종목 묶음만 저장한다. 사용자 ID·관심목록은 공용 KV와 공개 HTML에 넣지 않는다.
- 공용 계산은 `lib`의 명시적 함수로, 기능 간 연결은 공개 훅/명시적 입력·결과로 한다. state→data/model 방향을 지키고 data/model에서 React UI를 import하지 않는다. 기능 내부의 상대 import는 허용한다.
- 거래 순차 저장·revision·동일 요청 ID 재시도·계정 경계는 보존한다. 옛 브랜드 키·Web Lock·SQL migration은 호환/복구 장치이므로 미사용 UI처럼 삭제하지 않는다.

## 파일 역할

| 책임 | 소유 위치·확장 방법 |
| --- | --- |
| 화면 조립 | `app/**/page.tsx`는 배치·연결, `route.ts`는 입력 검증·응답. `portfolio/page.tsx`는 한 overview 카드 안에 PortfolioMetrics·PerformanceAnalytics를 연결하고 아래 PortfolioDetails의 보유종목·투자 성과 두 패널을 연결한다. 보유종목은 HoldingsTable의 showAllocation을 켜 전체 구성 도넛를 표와 함께 표시한다. PortfolioDetails는 선택/키보드/숨김을 소유하고 패널을 유지해 각 내부 선택 상태를 보존한다. InvestmentHistory는 공유 이력의 전체 범위·조회 상태를 PerformanceTable에 연결한다. 기간 선택 상태는 PerformanceAnalytics 내부에 유지하며 현재 요약에 전달하지 않는다. 계산/저장/공급자 변환을 페이지에 넣지 않음 |
| 입력·기간 조작 | TransactionForm은 계정별 재시작과 표시, use-transaction-entry는 입력 상태·검증·기존 시장 조회·저장 수명을 담당한다. 저장 명령/계정 경계는 기존 공개 훅을 재사용한다. PerformanceAnalytics는 조회·비교·차트 연결, Controls의 PerformanceDateControls는 기간 버튼·두 단계 달력·직접 입력·취소 후 초점 복귀만 담당한다. DateField와 date-picker는 기존 단일 날짜 조작을 유지한다. 금액 계산·시장/원장 구독을 입력 표시로 옮기지 않는다. |
| React 구독·수명 | hooks와 feature의 use-*·state. 계정 변경/해제/늦은 응답을 관리하고 필요한 데이터만 구독 |
| 보유종목 구성 표시 | [HoldingsComposition](./src/features/portfolio/ui/HoldingsComposition.tsx)는 도넛 원호·중앙 비중·확인 중인 종목·전체 분모·누락 상태만 표시한다. HoldingsTable은 showAllocation으로 연결 여부와 표 행 hover/focus·계좌/필터 경계를 소유한다. 계산·저장·시세 구독을 구성 화면에 만들지 않고 기존 holding-allocation 결과를 전달한다. 원호는 0~100의 pathLength를 사용하고 실제 0은 길이 0으로 유지한다. 구성 전용 검색·범례 목록·페이지 이동은 만들지 않음 |
| 순수 계산·검증 | lib와 feature의 model. holding-allocation은 전체 보유종목의 평가 가능 여부·금액 합계·비중을 소유하며 표의 필터/표시 개수로 분모를 바꾸지 않는다. 거래 필드는 타입→명령/검증→enrichment→저장 변환/백업→공개 훅→UI 순으로 영향 확인 |
| 저장·외부 요청 | feature data/repository/server. 세션 요청은 auth/session-request, 시장 공급 제한은 market/server/provider, 브라우저 요청은 lib/stock-api의 공통 경계 사용 |
| 순위·뉴스 | ranking-pages는 제목/경로, RankingPage는 순위 전환 링크, MoverTable은 홈 요약/상세 비교 목록. 관심 저장은 WatchStockButton의 compact 표현과 기존 useWatchlist를 재사용한다. mover-ranks는 직전 정상 순위 비교, movers-store는 공유 스냅샷. trending-news는 선정, server/news는 공급 변환, title-translation은 번역 검증/공유 요청, translation-numbers는 정확한 수량·통화 비교, translation-provider는 AI 호출/성공 캐시·만료되는 재시도 표식을 소유한다. prepared-news는 저장 형식·유효기간 검증, news-refresh는 수집·번역·정기 준비, news-response는 첫 HTML/API 읽기와 응답 후 갱신이다. custom-worker는 OpenNext fetch를 유지하고 scheduled를 추가한다 |
| 변화·관심 후속 자료 | market-changes는 순수 신호 계산, change-research는 기사 연결, changes-refresh/response는 공개 후보 준비/읽기다. watched-report-quote/store/refresh/response는 개별 종목 시세·스냅샷 검증·이전 거래일 보존·수요 기반 준비를 분리한다. shared/async/prepared-feed는 202 대기, use-watched-reports는 공유 요청 수명, personalized-changes는 관심/공개 혼합, WatchlistPreview는 기존 홈 관심 영역의 후속 표시를 소유한다. 정기 작업은 custom-worker 한 곳에 연결한다 |
| 캘린더·장 일정 | calendar의 model/navigation/release와 server가 날짜·수치·수집/저장을 분리. agenda는 홈 선정/관찰, UpcomingCalendar는 목록/최근 결과, records는 공식 일정과 official-releases의 확인 결과 결합을 맡으며 월간/상세/API가 같은 자료를 사용. market/schedule이 거래소별 근거와 시간 계산을 소유. [MARKET_CALENDARS](./MARKET_CALENDARS.md)와 [CLOUDFLARE](./CLOUDFLARE.md)의 준비/운영 상태 구분 |
| 성과 계산 | lib/performance의 보유액·기간손익·일별 연결 수익률과 performance/service·request-plan·repository·calculate·Worker. period-summary는 전체 일별 자료와 거래의 월/연도 분할 및 기존 수익률 계산 재사용, PerformanceTable은 표·페이지/월·년 선택을 소유한다. InvestmentHistory는 usePerformanceHistory의 계정/revision/날짜 격리·공유 요청·실패 정책을 재사용하며 새 저장소나 기간별 재조회를 만들지 않는다. use-benchmark-series는 비교 종목별 요청·실패·취소·기간 격리, benchmark-data는 같은 시작일/가격 계열의 참고 수익률, chart-presentation은 UTC 달력 눈금·단위·한 줄 날짜축 높이·실제 plot 폭의 라벨 배치/간격을 소유한다. Charts는 같은 날짜 라벨 배치 함수로 양 끝 글자를 안쪽에 두며 별도 연도 띠를 그리지 않는다. Charts·ComparisonList는 실제 관측점·다중 실선·강조/제거를 소유한다. 보유평가액은 [고정 기준 구현](./tests/reference)과 대조하며 일별 연결 수익률은 독립 산식 예상치로 확인한다. 고정 기준 구현을 새 알고리즘에 맞춰 덮어쓰지 않음 |
| 레거시 검증 전용 UI | [AllocationChart](./src/components/AllocationChart.tsx)는 런타임 페이지에서 제거했지만 파일·기존 스타일·[레거시 파이 fixture](./tests/fixtures/allocation-browser-fixture.tsx)·기존 검사는 보존한다. 이 fixture를 통합 구성 도넛의 화면 검증이나 새 작업 시작점으로 사용하지 않는다. 삭제 전 동적·스타일·검사 참조를 확인한다. |

### 스타일·자산·도구

- [design-tokens.css](./src/styles/design-tokens.css)는 공통 수치 원본, [globals.css](./src/app/globals.css)는 기본 요소/변수 연결이다. 아래 책임표에서 소유 파일을 골라 수정하며 공통 규칙을 전용 파일에 복제하지 않는다. 기존 선언·소비자를 함께 확인하고 파일 말미 덮어쓰기로 해결하지 않는다.

| 변경 대상 | 스타일 소유 파일·읽기 범위 |
| --- | --- |
| 공통 헤더·사이드바·모바일 탐색·본문·모달 | [workspace.css](./src/styles/workspace.css). globals의 기존 import 위치 유지 |
| 기업 아이콘·빈 보유 화면 | [AssetAvatar.module.css](./src/components/AssetAvatar.module.css)와 [AssetAvatar/EmptyPortfolio](./src/components/AssetAvatar.tsx). 전용 module만 수정, 전역 class 추가 금지 |
| 홈 공통 섹션·글자·등락색·순위/뉴스 | [home.module.css](./src/features/home/home.module.css). 홈/탐색/독립 순위의 순위 교차 selector는 공통으로 유지. 뉴스도 현재 홈 소유 |
| 종목 검색 입력·결과 | [stock-discovery.module.css](./src/features/home/stock-discovery.module.css)와 StockDiscovery. 다른 홈 목록의 CSS를 읽거나 수정할 필요 없음 |
| 시장 변화 카드·필터·페이지·최근 흐름 | [market-changes.module.css](./src/features/home/market-changes.module.css)와 MarketChanges. 공통 section/등락색만 home module 사용 |
| 읽을거리 카드·본문 | [reading.module.css](./src/features/home/reading.module.css), ReadingShelf와 read 페이지. 공통 제목/링크 글꼴은 home module 유지; 본문 eyebrow는 공통 글꼴과 전용 문맥 class를 함께 사용 |
| 보유자산·기간 성과·차트·인증 | [portfolio.css](./src/styles/portfolio.css), [charts.css](./src/styles/charts.css), [auth.css](./src/app/auth.css). 보유 표/상세 탭·개별 기능 module은 작업별 시작점 참조 |

스타일 이동은 값뿐 아니라 selector 관계·우선순위·미디어 조건·공통 import 순서를 유지한다. [소유 경계 회귀](./tests/style-ownership.test.mjs)는 전용/공통 class 연결과 미사용 UI 재참조를 확인한다. 실제 PC/390px 배치·생산 CSS 결합 순서는 별도 화면/푸시 검증 대상이다.

- PageHeading은 제목·선택 행동, [CalculationHelp](./src/components/CalculationHelp.tsx)는 사용자가 여는 계산 정의다. 가격/계산 의미·실패 조건은 관련 수치 곁에 유지한다.
- 로고·파생 자산은 [BRAND](./BRAND.md), 기업 이미지 출처는 [sources.json](./public/companies/sources.json). `public`의 모든 파일을 실제 화면 사용 자산으로 간주하지 않는다.
- 푸시 검사 실행기는 [check-push](./tests/check-push.mjs), Git 연결은 [pre-push](./.githooks/pre-push)와 [설치 명령](./tests/install-git-hooks.mjs)이 소유한다. 문서 전용 예외의 정확한 경로 목록은 [deployment-docs-only.json](./scripts/deployment-docs-only.json), 원격 적용 방법은 [문서 전용 변경](./CLOUDFLARE.md#문서-전용-변경)이 소유한다. [동작 회귀](./tests/push-check.test.mjs)는 모의 명령·임시 Git으로 범위 판정·중단/설치 경계를 확인한다. 설치는 검사 실행이나 푸시를 하지 않는다.
- [문서 검사](./tests/check-docs.mjs)와 [문서 회귀](./tests/documentation.test.mjs), [디자인 검사](./tests/check-design.mjs)와 [디자인 회귀](./tests/design-system.test.mjs)는 현재 명령에 연결한다. 기존 디자인 미정리 목록은 늘려 통과시키지 않는다.
- [package.json](./package.json)·lockfile이 명령/버전, [wrangler.jsonc](./wrangler.jsonc)가 Worker 실행 설정 원본이다. Git 자동 배포의 경로 필터는 별도 Cloudflare Builds 설정이며 위 문서 전용 목록과 맞춘다. worker-configuration.d.ts는 직접 편집하지 않고 `npm exec wrangler -- types worker-configuration.d.ts --env-interface WorkerBindings`로 재생성한다. 삭제한 이전 Worker의 배포 설정은 다시 추가하지 않는다.
- work·node_modules·.next·.open-next는 구현 원본이 아니다. 격리 검증은 원본 코드를 복사한 테스트 환경이며 실행 방법은 README를 따른다. 비밀/복구 자료·사용자 기록은 일반 생성물 정리와 분리한다.

## 탐색 비용과 한계

`docs:guide`는 전체 검사를 실행하지 않고 표에서 이름·코드 경로에 맞는 링크만 출력한다. 작업 중 다른 문서가 미완성이어도 안내를 조회할 수 있다. `check:docs`는 링크/앵커, 기능별 명세·디자인·코드·검증 연결, 기능 폴더·페이지/API 누락과 작업/변경 이력 전용 제목을 검사한다. **본문의 과거 기록·중복, 기능 의미, 디자인 품질, 모든 문장과 코드의 일치까지 자동 판정하지 않는다.** 완료 전에 담당 문서의 현재성·단일 소유·영향 있는 사업 조건을 직접 확인한다. 자동 검사가 문서를 대신 작성하거나 제품 방향을 임의 결정하지 않는다.

`node tests/check-import-cycles.mjs`는 정적 TS import/export의 순환을 확인하며 동적 연결·CSS·전체 아키텍처 준수를 보증하지 않는다. components/hooks/lib와 feature가 공존하는 현재 구조를 유지하고, 거래 입력·목록·분석 같은 큰 화면은 실제 책임 충돌이 있을 때 나눈다. 파일 수·줄 수만 줄이는 전면 이동은 하지 않는다. 실제 시간·토큰 절감률은 측정하지 않았다.
