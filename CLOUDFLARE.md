# Cloudflare Workers 배포

최종 수정: 2026-09-06

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

- 로그인은 최초 연결 시 수행한다. 로컬 Next.js 개발은 `npm run dev`.
- preview는 빌드 후 로컬 Workers 실행, deploy는 빌드 후 [wrangler.jsonc](./wrangler.jsonc)의 Worker에 배포한다. 업로드 전에 대상 계정·Worker를 확인한다.
- 명령·의존성 기준은 [package.json](./package.json)·[package-lock.json](./package-lock.json). 검증 기록은 [PROJECT_STATUS.md](./PROJECT_STATUS.md#검증-기록).

## 뉴스 제목 자동 번역

- wrangler.jsonc의 NEWS_AI 바인딩을 사용한다. 모델은 [Cloudflare GPT OSS 120B](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/)이며 공개 기사 제목만 전송한다. 개인 거래/계정 정보·기사 본문은 전송하지 않는다. 별도 OpenAI API 키는 사용하지 않는다.
- 로컬 next dev는 OpenNext의 개발 프록시를 초기화한다. Wrangler 로그인에 AI 권한이 필요하고 remote 바인딩이므로 **로컬 번역도 실제 Cloudflare AI 사용량**에 포함된다. 생산 빌드는 이 개발 프록시를 시작하지 않는다. 공급 오류/사용량 한도/바인딩 미설정 시 원문 뉴스는 유지한다.
- 4개 동시 추론, 번역 대기 최대 8초, 모델 출력 최대 600토큰, 성공 결과 7일/1000개까지 인스턴스 메모리 공유, 실패 5분 대기. 대기 기한/소비자 취소로 이미 서버에 전송된 추론까지 중단되지는 않는다. 공유 요청의 한 소비자 해제는 다른 소비자를 취소하지 않는다.
- 캐시는 영구/전 세계 공유 저장소가 아니다. 재시작·다른 Worker 인스턴스에서는 다시 번역될 수 있다. 실제 사용량 확인 후 필요하면 영구 캐시와 수집 작업으로 이전한다. [Workers AI 요금](https://developers.cloudflare.com/workers-ai/platform/pricing/) 기준으로 계정 대시보드 사용량을 확인하며 무제한 무료로 표현하지 않는다.
- 로컬 연결·호출과 공개 배포는 별개다. 이번 작업은 기존 공개 Worker에 반영하지 않았다. 롤백은 API의 번역 호출을 제거해 기존 원문 응답으로 되돌리고 NEWS_AI 바인딩/개발 초기화를 제거한다. 원문 데이터나 운영 DB를 수정하지 않는다.

## AdSense 연결 준비

현재 코드에는 **광고 위치와 개발 전용 미리보기만** 있다. publisher/slot ID·Google 스크립트·ads.txt·실제 송출은 미연결이다. 개발 서버는 광고 요청을 생성하지 않으며 운영 빌드에서 빈 광고 미리보기를 숨긴다.

1. AdSense 계정에서 사용할 공개 도메인의 사이트 승인 상태를 확인하고, PRODUCT_SPEC의 현재 본문 배치 5개 이름으로 디스플레이 광고 단위를 구분한다. 삭제된 home-rail을 다시 만들지 않는다.
2. 발급받은 publisher ID와 각 단위 ID로 features/ads의 같은 AdSlot 경계에 송출을 연결한다. 계정이 제공하는 정확한 ads.txt 항목을 public/ads.txt에 등록한다. 현재는 값을 추정해 파일/환경변수를 만들지 않았다.
3. 좌우 광고는 자동 광고 → 오버레이 형식 → 사이드 레일 → 좌우 설정으로 연결한다. 수동 sticky 광고는 양쪽 동시 노출을 허용하지 않으므로 SideRailPreview의 두 박스에 수동 광고를 넣지 않는다. 로컬 박스는 공식 사이드 레일의 위치 예시이며 실제 노출/크기는 Google이 결정한다. 실제 데스크톱에서 사이드바·본문·닫기 버튼을 가리지 않는지 확인하고 공간이 부족하면 한쪽만 선택하거나 해당 경로를 제외한다. 자동 광고의 개인 자산/거래/노트/설정 경로 제외와 SPA 경로 이동 시 해제도 검증한다. 자동 본문/앵커/전면 광고가 기존 배치 외에 중복 추가되지 않게 설정한다. 개인정보 고지·필요한 동의 설정과 광고의 공개 표시 조건을 실제 배포 대상 기준으로 확인한다.
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
- Google 로그인: Supabase Google 제공자를 활성화한다. Auth Site URL은 `https://centifolio.stock-web-demo.workers.dev`, Redirect URLs는 이 공개 주소와 `http://localhost:3000`, `http://127.0.0.1:3000`을 사용한다. 폐기한 배포 주소는 허용하지 않는다.
- Google OAuth 리디렉션 URI는 앱 주소가 아니라 Supabase 대시보드의 `/auth/v1/callback` 주소다.

## 거래 저장 원자성 업데이트

[마이그레이션](./supabase/migrations/20260905225656_atomic_portfolio_ledger.sql)은 기존 거래·설정·스냅샷 테이블용 증분 변경이다. 운영 적용 버전·검증 상태는 [PROJECT_STATUS](./PROJECT_STATUS.md#환경별-진행-상태)를 따른다. 새 프로젝트 전체 초기 스키마가 아니며 이미 적용된 파일을 다시 실행하지 않는다.

1. 프로젝트 ID·migration 이력·테이블 컬럼/제약·소유자 RLS를 확인한다. 다른 미적용 변경을 함께 실행하지 않는다. 기존 환율·초과 매도·같은 날짜/생성시각 거래의 순서를 점검한다.
2. 이번 변경은 같은 트랜잭션에서 세 테이블의 쓰기를 잠시 잠그고, 기존 값을 centifolio_release_backup 스키마에 복사한 뒤 DDL을 적용한다. 이 스키마는 Data API에 노출하지 않고 public/anon/authenticated/service_role의 접근을 취소한다. 백업 테이블은 RLS를 켜고 사용자 정책을 만들지 않는다. 개인 기록을 PC로 반출하지 않는다. 이 사본은 마이그레이션 복구용이며 DB 전체 손실에 대비한 별도 백업을 대신하지 않는다.
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
