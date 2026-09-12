# Cloudflare Workers 배포

최종 수정: 2026-09-12 · main c13de14 배포·뉴스 KV/정기 수집 설정 확인

Next.js·API를 Workers/OpenNext에서 실행한다. 실제 배포 상태는 [PROJECT_STATUS.md](./PROJECT_STATUS.md#환경별-진행-상태).

## 준비와 실행

Node.js 22 이상·npm·Cloudflare 계정이 필요하다.

```sh
npm ci
npx wrangler login
npm run build:cloudflare
npm run preview:cloudflare
npm run deploy:cloudflare
```

- 로그인은 최초 연결 시 수행한다. 로컬 Next.js 개발은 `npm run dev`. 이 PC의 센트블룸 전용 로그인은 Git 제외 `work/cloudflare-auth`를 `XDG_CONFIG_HOME`으로 지정한다. `wrangler.jsonc`·종료 주소 설정의 account_id는 실제 stock-web-demo 운영 계정으로 고정했다.
- preview는 빌드 후 로컬 Workers 실행, deploy는 빌드 후 [wrangler.jsonc](./wrangler.jsonc)의 Worker에 배포한다. 업로드 전에 대상 계정·Worker를 확인한다.
- 명령·의존성 기준은 [package.json](./package.json)·[package-lock.json](./package-lock.json). 검증 기록은 [PROJECT_STATUS.md](./PROJECT_STATUS.md#검증-기록).

## 센트블룸 주소와 이전 주소 종료

- 공개 주소는 https://centbloom.stock-web-demo.workers.dev 이다. .com은 구매·연결하지 않았다.
- 2026-09-08 사용자 요청으로 이전 centifolio 주소를 종료했다. [종료 설정](./wrangler.legacy.jsonc)의 workers_dev·preview_urls는 모두 false이며, [종료 Worker](./legacy-worker.mjs)는 서비스 바인딩 없이 410 응답만 정의한다. 공개 접속은 Cloudflare에서 404로 차단된다. Git Builds의 deploy:legacy도 같은 종료 설정을 적용하므로 재배포가 이전 주소를 다시 열지 않는다.
- 이전 Worker와 배포 이력은 복구용으로 보관한다. 서비스 바인딩으로 새 앱을 전달하던 동작은 종료했다. 계정 거래와 DB·브라우저 저장 데이터를 삭제하지 않는다. 이전 주소에만 남은 로컬 노트·관심종목은 새 주소로 자동 이전되지 않았다.
- Auth Site URL과 공개 Redirect URL은 센트블룸만 사용한다. 이전 공개 주소를 허용 목록에서 제거했으며 localhost:3000·127.0.0.1:3000 개발 주소는 유지한다.
- Git Builds: centbloom은 npm run lint, 전체 테스트, build:cloudflare를 거쳐 opennextjs-cloudflare deploy --keep-vars를 실행한다. centifolio는 check:docs 후 deploy:legacy로 비공개 종료 상태를 유지한다. 두 연결은 같은 저장소 main을 사용한다. 기존 Supabase 공개 빌드 값·NODE_VERSION=24.19.0을 유지한다.
- 로컬 검사는 [README 검증](./README.md#검증)에 따라 개발 중 실행을 최소화하고 pre-push 훅에 모은다. 배포 CI의 prepare는 로컬 Git 훅 설치를 건너뛴다. 로컬 통과와 배포 환경의 OpenNext 빌드 성공은 구분하며, 원격 Builds 설정은 이번 검사 시점 변경에서 수정하지 않았다.

## 뉴스 제목 자동 번역

- wrangler.jsonc의 NEWS_AI 바인딩을 사용한다. 모델은 [Cloudflare GPT OSS 120B](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/)이며 공개 기사 제목만 전송한다. 개인 거래/계정 정보·기사 본문은 전송하지 않는다. 별도 OpenAI API 키는 사용하지 않는다.
- 로컬 next dev는 OpenNext의 개발 프록시를 초기화한다. Wrangler 로그인에 AI 권한이 필요하고 remote 바인딩이므로 **로컬 번역도 실제 Cloudflare AI 사용량**에 포함된다. 생산 빌드는 이 개발 프록시를 시작하지 않는다. 공급 오류/사용량 한도/바인딩 미설정 시 원문 뉴스는 유지한다.
- 4개 동시 추론, 번역 대기 최대 8초, 모델 출력 최대 600토큰, 성공 결과는 제목별 KV에 최대 7일 보관하고 번역 실행 내부에서 중복 요청을 공유한다. 대기 기한/소비자 취소로 이미 서버에 전송된 추론까지 중단되지는 않는다. 공유 요청의 한 소비자 해제는 다른 소비자를 취소하지 않는다.
- 성공한 제목 번역은 KV로 인스턴스 간 공유한다. 지역별 전파 지연·동시 미수집 제목의 중복 추론 가능성은 남는다. [Workers AI 요금](https://developers.cloudflare.com/workers-ai/platform/pricing/) 기준으로 계정 대시보드 사용량을 확인하며 무제한 무료로 표현하지 않는다.
- 09-07 main `be42761` 배포에 NEWS_AI 바인딩과 번역 호출을 포함했다. 실제 번역 품질·사용량은 별도 확인 대상이며 공급 실패 시 원문을 유지한다. 배포 버전·복구 버전은 PROJECT_STATUS의 환경별 상태를 따른다. 롤백은 이전 정상 Worker 버전으로 복귀하고 정기 수집 트리거도 비활성화한다. 뉴스 KV는 보존한다. 원문 데이터나 운영 DB를 수정하지 않는다.

## AdSense 연결 준비

공개 화면은 광고 위치와 개발 전용 미리보기 상태이며 운영 빌드에서는 숨긴다. `/portfolio`의 예약 영역·조건부 송출 코드는 [AdSense 연결](#adsense-연결)을 따른다. 실제 publisher/slot ID·ads.txt·송출은 미연결이다.

1. AdSense 계정에서 사용할 공개 도메인의 사이트 승인 상태를 확인한다. [D010](./DECISIONS.md#현재-유효한-결정)에 따라 오른쪽 사이드 광고를 사용하고 추가 광고도 도입하되, 추가 페이지·위치·개수·모바일 형식은 아직 미정이다. 현재 본문 하단 3개와 포트폴리오 예약 영역을 확정 배치로 간주하지 않는다. 추가 배치는 결정 후 [광고 명세](./PRODUCT_SPEC.md#광고-배치)를 갱신하고 필요한 단위만 발급한다.
2. 확정된 수동 배치가 있으면 발급받은 publisher ID와 단위 ID로 features/ads의 같은 AdSlot 경계에 송출을 연결한다. 계정이 제공하는 정확한 ads.txt 항목을 public/ads.txt에 등록한다. 현재는 값을 추정해 파일/환경변수를 만들지 않았다.
3. 사이드 광고는 오른쪽만 사용하도록 자동 광고의 사이드 레일 설정을 연결한다. 왼쪽 광고는 활성화하지 않으며 SideRailPreview의 오른쪽 박스에 수동 광고를 넣지 않는다. 로컬 박스는 공식 사이드 레일의 위치 예시이며 실제 노출/크기는 Google이 결정한다. 실제 데스크톱에서 사이드바·본문·닫기 버튼을 가리지 않는지 확인하고 공간이 부족하면 사이드 광고를 숨기거나 해당 경로를 제외한다. 자동 광고의 개인 자산/거래/노트/설정 경로 제외와 SPA 경로 이동 시 해제도 검증한다. 자동 본문/앵커/전면 광고가 기존 배치 외에 중복 추가되지 않게 설정한다. 개인정보 고지·필요한 동의 설정과 광고의 공개 표시 조건을 실제 배포 대상 기준으로 확인한다.
4. 로컬/테스트 트래픽은 계속 미리보기만 사용한다. 실제 슬롯은 공유 스크립트 1회 로드·가시 영역/유효 너비 확인·단위당 1회 초기화·미충전/오류 처리를 검증한 뒤 사용자 배포 지시에 따라 공개한다.
5. 실제 서비스의 단위별 노출·뷰어빌리티·RPM과 콘텐츠 사용/로딩 성능을 비교한다. 배치만으로 수익이 발생했다고 기록하지 않는다.

근거: Google [사이드 레일](https://support.google.com/adsense/answer/16531757), [좌우 설정](https://support.google.com/adsense/answer/9305577), [수동 sticky 조건](https://support.google.com/adsense/answer/10734935), [가시성과 수익](https://support.google.com/adsense/answer/4510652), [광고 배치 정책](https://support.google.com/adsense/answer/1346295?hl=en), [반응형 크기 변경 안내](https://support.google.com/adsense/answer/9183363?hl=en). 2026-09-06 확인. 현재 미리보기 CSS는 실제 광고 코드가 아니며 연결 때 Google 허용 형식을 적용해야 한다.

## Supabase 연결

**빌드 시점**에 필요한 공개 변수다. 로컬은 `.env.local`, Git 자동 배포는 Workers Builds의 빌드 변수에 설정한다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

- 브라우저 공개 값이므로 publishable 키만 사용한다. `service_role`·비밀 키 금지. 값 변경 후 재빌드·재배포한다. 미설정 시 로컬 저장 모드다.
- Google 로그인: Supabase Google 제공자를 활성화한다. Auth Site URL은 `https://centbloom.stock-web-demo.workers.dev`, Redirect URLs는 이 공개 주소, `http://localhost:3000`, `http://127.0.0.1:3000`을 사용한다.
- Google OAuth 리디렉션 URI는 앱 주소가 아니라 Supabase 대시보드의 `/auth/v1/callback` 주소다.

## AdSense 연결

`/portfolio`는 기본적으로 광고 예약 영역을 표시하며 실제 광고 요청은 비활성이다. 아래는 기존 코드의 연결 방법이며 이 위치의 최종 채택은 미정이다. 배치가 확정되면 아래 공개 변수를 **빌드 시점**에 설정한다.

```dotenv
NEXT_PUBLIC_ADSENSE_CLIENT_ID=
NEXT_PUBLIC_ADSENSE_PORTFOLIO_SLOT=
NEXT_PUBLIC_ADSENSE_PORTFOLIO_ENABLED=false
```

1. AdSense에서 사이트 승인과 디스플레이 광고 단위 발급을 완료한 뒤 `ca-pub-…` 게시자 ID와 `data-ad-slot` 값을 넣는다. ads.txt 항목은 계정에서 제시한 값으로 설정/검증한다.
2. [로그인 보호 페이지 광고 안내](https://support.google.com/adsense/answer/161351?hl=ko)에 따라 광고 크롤러 접근을 준비한다. 현재 Google 로그인만으로 이 조건이 해결됐다고 간주하지 않는다. 실제 개인 계정의 로그인 정보/투자 기록을 제공하거나 인증을 우회하지 않고 별도 접근 설계를 검토한다.
3. 개인정보/쿠키 고지와 적용 지역의 동의 설정을 확인한 후 `NEXT_PUBLIC_ADSENSE_PORTFOLIO_ENABLED=true`로 바꾸고 재빌드·배포한다. 개발 모드는 `data-adtest=on`을 사용한다.
4. 공개 사이트에서 실제 송출·모바일 배치·크롤러 오류를 확인한다. 모의 광고 검사는 실제 승인/송출 검증이 아니다. 중단은 활성화 변수를 false로 변경 후 재빌드·배포한다.

## 거래 저장 원자성 업데이트

[마이그레이션](./supabase/migrations/20260905225656_atomic_portfolio_ledger.sql)은 기존 거래·설정·스냅샷 테이블용 증분 변경이다. 운영 적용 버전·검증 상태는 [PROJECT_STATUS](./PROJECT_STATUS.md#환경별-진행-상태)를 따른다. 새 프로젝트 전체 초기 스키마가 아니며 이미 적용된 파일을 다시 실행하지 않는다.

1. 프로젝트 ID·migration 이력·테이블 컬럼/제약·소유자 RLS를 확인한다. 다른 미적용 변경을 함께 실행하지 않는다. 기존 환율·초과 매도·같은 날짜/생성시각 거래의 순서를 점검한다.
2. 이번 변경은 같은 트랜잭션에서 세 테이블의 쓰기를 잠시 잠그고, 기존 값을 centbloom_release_backup 스키마에 복사한 뒤 DDL을 적용한다. 이 스키마는 Data API에 노출하지 않고 public/anon/authenticated/service_role의 접근을 취소한다. 백업 테이블은 RLS를 켜고 사용자 정책을 만들지 않는다. 개인 기록을 PC로 반출하지 않는다. 이 사본은 마이그레이션 복구용이며 DB 전체 손실에 대비한 별도 백업을 대신하지 않는다.
3. 격리 SQL 테스트와 실제 PostgreSQL 두 연결 검사로 원자적 교체·실패·RLS·40001 충돌·응답 유실 재시도·롤백 후 사본 보존을 검증한다. [합성 계정 SQL](./supabase/tests/atomic-ledger-smoke.sql)은 격리 DB용이며 운영에서 자동 실행하지 않는다.
4. 운영 적용은 연결된 Supabase 관리 도구의 apply_migration 또는 CLI에서 대상 SQL을 확인한 뒤 수행한다. 관리 도구가 발급한 migration 버전과 저장소 파일 이름을 일치시킨다. CLI를 사용할 때도 migration list → db push --dry-run으로 확인하고, 과거 원격 이력이 로컬에 없는 이 저장소에서 전체 push를 무조건 실행하지 않는다.
5. 운영에는 원본/사본 비교 결과와 함수 실행 권한을 읽기 전용으로 확인한다. 앱 빌드·배포 후 공개 페이지/API를 검증한다. 실제 로그인 후 쓰기·다중 기기 검증은 별도 결과로 기록하고 격리 테스트로 대체했다고 표시하지 않는다.

복구: 우선 앱의 거래 쓰기를 중단하고 정상 버전과 DB 백업을 확보한다. 거래 데이터 자체를 되돌릴 필요가 없으면 [스키마 롤백](./supabase/rollback/atomic_portfolio_ledger.sql)을 관리 연결에서 실행할 수 있다. 이 파일은 거래 행을 삭제하지 않지만 revision·안정 정렬·요청 영수증을 제거한다. **먼저 영수증과 각 브라우저의 미확인 요청을 보존·정리하고 모든 새 쓰기 클라이언트를 중단해야 한다.** 영수증 삭제 후 미확인 요청을 재전송하면 중복 실행 위험이 있다. 롤백 후 자동으로 이전 쓰기 방식을 재개하지 말고 동시성 문제를 해소한 버전을 사용한다. 실제 데이터 복원은 백업 시점 이후 정상 거래와 대조한 별도 절차다. advisory lock 트리거는 auth.uid 없는 직접 거래 DML을 거부하므로 관리 작업은 점검 시간에 수행한다.

## 저장소와 확인 기준

- 실제 `.env.local`·비밀 키는 커밋하지 않는다. [.env.example](./.env.example)은 값 없는 예시, 생성물 제외는 [.gitignore](./.gitignore)를 따른다.
- 배포 후 공개 URL·대상 버전·실제 응답·남은 문제를 PROJECT_STATUS.md에 기록한다. Git 푸시나 로컬 빌드만으로 배포 완료라 하지 않는다.

공식 참고: [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) · [OpenNext](https://opennext.js.org/cloudflare/get-started) · [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google)

## 경제 캘린더 결과 수집 — 준비 상태

2026-09-06 기준 연결 키·운영 테이블·수집 프로세스는 활성화하지 않았다. 월간 UI와 아래 코드는 준비됐지만 실제치/컨센서스의 실서비스 수신을 검증한 상태가 아니다. 현 화면은 등록 일정과 미연결 안내만 제공한다.

| 후보 | 확인된 적합성 | 남은 확인 |
| --- | --- | --- |
| Trading Economics (우선 검토) | [공식 스키마](https://docs.tradingeconomics.com/economic_calendar/schema/)에 CalendarID, UTC 발표시각, Actual, Forecast(컨센서스), Previous, Revised(이전치 수정 전), Symbol, LastUpdate가 명시돼 있다. [기간별 조회](https://docs.tradingeconomics.com/economic_calendar/country/)와 [스트리밍](https://docs.tradingeconomics.com/economic_calendar/streaming/)을 제공하며 현재 어댑터는 이 계약을 따른다. | API 키·선택 국가/이력 범위·공개 웹 표시/누적 보관 권한·실측 지연·취소/동일 시각 수정 정책·견적 확인 필요. [가격 페이지](https://tradingeconomics.com/api/pricing.aspx)에서 현재 고정 금액을 확인하지 못했으므로 금액은 기재하지 않는다. |
| Financial Modeling Prep | [경제 일정 API](https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar)가 있다. 주가와 여러 데이터 API를 함께 검토할 때 비교 후보. | 공개 문서에서 현 응답 전체·안정적인 발표 ID/수정 이력·컨센서스 범위를 확인하지 못했다. 샘플 응답·상업용 견적을 받은 후 결정한다. 현재 어댑터는 미구현. |
| 발표기관 원문 | BLS·BEA·연준·Census 일정은 현재 25개 등록 항목의 확인 출처다. | 지금 연결한 일정표만으로 컨센서스/결과 수집·장기 이력이 제공되는 것은 아니다. 발표기관별 수집은 별도 구현이 필요하다. |

견적 요청 범위: 미국 우선(한국·일본·홍콩·중국 확장 비용 별도), 실제치·시장 컨센서스·이전치·수정치, 지표별 안정적 ID와 단위/기준 기간, 최소 5년 이력, 공개 웹 표시와 수집 자료 보관, 속보 지연과 요청 제한. 현재 수집안은 5분마다 지난달/이번달/다음달 3회 조회로 하루 약 864회이며 UI 조회는 공급 API 호출을 추가하지 않는다. 이는 비용 확인용 예상 요청 수로 실제 지연·요금 측정값이 아니다.

### 활성화 순서

1. 공급 계약/키를 확보하고 테스트 환경에 [마이그레이션](./supabase/migrations/20260906140000_economic_calendar.sql)을 적용한다. 신규 경제 데이터만 생성하며 사용자 거래 테이블을 변경하지 않는다. 먼저 `node --test tests/sql-economic-calendar.test.mjs`로 로컬 Postgres 호환 검증을 실행한다.
2. 서버 전용 환경에 `TRADING_ECONOMICS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, 충분히 긴 무작위 `CALENDAR_SYNC_SECRET`, `CALENDAR_ARCHIVE_ENABLED=true`를 설정한다. 기존 Supabase URL/publishable key도 필요하다. 비밀 키에 NEXT_PUBLIC 접두사를 붙이지 않는다. 로컬의 .env.local과 배포 비밀 설정은 별개이며 키를 Git에 넣지 않는다.
3. 로컬 서버가 실행 중일 때 `node --env-file=.env.local scripts/sync-economic-calendar.mjs --month=2026-09`로 한 달을 수집한다. 수신→완료 표시→예상/실제/이전치→같은 seriesKey의 과거 결과를 공급 샘플과 대조한다. 과거 월은 해당 옵션으로 순차 보충한다.
4. 자동 수집은 `node --env-file=.env.local scripts/sync-economic-calendar.mjs --watch`를 지속 실행한다. `CALENDAR_SYNC_BASE_URL` 기본값은 localhost:3000. 배포 후에는 별도 상시 프로세스/스케줄러가 필요하며 사용자 브라우저의 열림 여부와 분리한다. 현재 이 프로세스는 실행하지 않았다. 지난달보다 오래된 지표의 추가 수정은 과거 월을 다시 수집해야 한다.
5. 실제 수신/수정/저장 실패를 검증한 다음에만 운영 DB 마이그레이션·환경 설정·수집 프로세스·공개 배포를 승인 범위에 따라 활성화한다. 읽기 GET은 저장소만 조회하고, 쓰기는 별도 비밀 토큰이 필요한 POST /api/calendar/sync만 허용한다. 키 없는 상태에서 401/503을 반환하며 데모 자격 증명을 자동 사용하지 않는다.

원자적 배치 저장, 발표 ID 중복 제거, 공급자 갱신 시각이 오래된 응답 차단, 숫자 0 보존을 적용한다. 최신 값과 수정 원문은 별도 테이블에 보관한다. 동일한 공급자 갱신 시각에 내용만 달라지면 버전 원문은 추가 보관하되 기존 최신 값을 자동 교체하지 않는다. Forecast와 TEForecast를 섞지 않는다. 과거 화면의 예상치는 공급자가 반환해 저장한 컨센서스이며 실제 발표 직전의 수치를 포착했다고 보장하지 않는다.

문제 발생 시 수집 프로세스를 먼저 종료하고 CALENDAR_ARCHIVE_ENABLED를 끈다. [복구 SQL](./supabase/rollback/economic_calendar.sql)은 읽기/수집 권한만 회수하고 이미 쌓인 기록을 삭제하지 않는다. 서비스 재개는 데이터 검증 뒤 권한을 복구해 진행한다. 공급자 취소/철회가 실제치 없는 응답만으로 표현되면 기존 완료 값을 지우지 않으므로 명시적인 취소 상태 제공 여부를 계약 검증에서 확인한다.

## 뉴스 미리 준비

- `wrangler.jsonc`의 `NEWS_CACHE` KV와 `custom-worker.ts`의 5분 Scheduled Handler를 사용한다. 기존 OpenNext fetch 처리는 유지한다. 09-12 사용자 main 배포 승인으로 운영 namespace를 생성하고 ID를 설정에 고정했다. 실제 활성 버전과 수집 검증은 PROJECT_STATUS를 따른다. 로컬은 계속 로컬 저장소를 사용한다.
- 개발 서버가 실행된 상태에서 `npm run news:prepare -- AAPL`로 홈과 지정 종목을 준비한다. `npm run news:prepare -- --watch AAPL`은 브라우저 방문 없이 로컬 3000에 5분마다 준비 요청을 보낸다. 개발 서버가 닫히면 연결 실패 시 종료한다. 운영에서는 이 PC 프로세스가 아니라 Scheduled Handler를 사용한다.
- 첫 수집·번역이 끝나야 빠른 최초 표시가 가능하다. 운영 전 홈과 주요 종목을 준비한 후 확인한다. KV 지역별 갱신 전파·최초 읽기 지연이 있어 0.5초를 저장소 설정만으로 보장하지 않는다. 모은 목록 6시간·성공 제목 7일 보존, 실제 수집 5분/화면 확인 1분을 구분한다. KV 읽기/쓰기·AI 사용량은 운영 활성화 전에 요금과 한도를 확인한다.
- 09-12 사용자 요청 검증에서 Next 독립 실행 빌드·OpenNext 변환과 로컬 Worker 실행을 통과했다. `/__scheduled` 호출 후 실제 KV 준비 시각 증가까지 확인했다. Windows에서는 일반 Next 빌드에 `--skipNextBuild`를 바로 적용하면 standalone 산출물이 없어 실패하므로 OpenNext 전체 빌드 또는 OpenNext와 같은 `NEXT_PRIVATE_STANDALONE=true` 빌드를 사용한다.
- 응답 후 작업은 [Cloudflare 실행 제한](https://developers.cloudflare.com/workers/platform/limits/#duration)에 맞춰 25초, 정기 수집은 홈 90초·종목 2개씩 70초로 제한한다. c13de14 운영 배포·5분 트리거 설정·실제 KV 뉴스 갱신을 확인했다. 정기 실행의 장기 안정성·여러 지역 속도는 미검증이며 로컬/운영 성능과 장애 복구 결과는 [현재 제약](./PROJECT_STATUS.md#현재-제약)을 따른다.
