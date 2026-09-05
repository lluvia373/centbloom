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

## Supabase 연결

**빌드 시점**에 필요한 공개 변수다. 로컬은 `.env.local`, Git 자동 배포는 Workers Builds의 빌드 변수에 설정한다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

- 브라우저 공개 값이므로 publishable 키만 사용한다. `service_role`·비밀 키 금지. 값 변경 후 재빌드·재배포한다. 미설정 시 로컬 저장 모드다.
- Google 로그인: Supabase Google 제공자를 활성화한다. Auth Site URL은 `https://centifolio.stock-web-demo.workers.dev`, Redirect URLs는 이 공개 주소와 `http://localhost:3000`, `http://127.0.0.1:3000`을 사용한다. 폐기한 배포 주소는 허용하지 않는다.
- Google OAuth 리디렉션 URI는 앱 주소가 아니라 Supabase 대시보드의 `/auth/v1/callback` 주소다.

## 거래 저장 원자성 업데이트 — 운영 미적용

[마이그레이션](./supabase/migrations/20260905194009_atomic_portfolio_ledger.sql)은 기존 거래·설정·스냅샷 테이블이 있는 프로젝트용 증분 변경이다. 새 프로젝트 전체 스키마를 만드는 파일은 아니다. 공개 배포·운영 DB 실행은 별도 승인 후 진행한다. 적용 전 새 클라이언트는 기존 계정 거래를 읽기 전용으로 표시한다.

1. 프로젝트 ID·현재 migration 이력·세 테이블의 컬럼/제약·authenticated 소유자 RLS를 다시 확인한다. 현재 확인한 구조는 [격리 SQL 테스트](./tests/sql-ledger.test.mjs)의 fixture와 대조한다. 다른 마이그레이션이 대기 중이면 함께 적용하지 않는다.
2. 거래·설정·스냅샷과 기존 migration 이력을 별도 백업한다. 쓰기를 잠시 중단하고 같은 날짜/생성시각 거래의 순서, 기존 음수/비유한 환율 및 초과 매도 기록을 점검한다. 기존 데이터의 값은 임의 수정하지 않는다. 초기 동률 순서는 날짜→생성시각→ID로 고정되고 이후 ledger_position으로 유지된다.
3. 독립 staging DB에 기존 스키마/RLS와 이 파일을 적용한다. 테스트 계정 두 개로 거래/백업 교체 성공·실패, 타 계정 ID 접근 차단을 검증한다. 별도 DB 연결 두 개에서 동일 revision의 교체를 동시에 실행해 하나만 성공하고 다른 하나는 40001인지 확인한다. 응답 유실 후 같은 request_id 재전송이 중복 거래를 만들지 않는지도 확인한다. 로컬 PGlite는 단일 연결이므로 이 동시 세션 검사를 대신하지 않는다.
4. 승인 후 대상에 연결한 Supabase CLI에서 아래 dry-run의 대상 파일을 확인하고 적용한다. DB 비밀번호·접속 문자열을 문서나 로그에 남기지 않는다.

~~~sh
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
~~~

5. 테스트 계정에서 read_portfolio_ledger / commit_portfolio_ledger / save_portfolio_performance의 권한·원자성·재시도를 확인한 후 앱을 재빌드·배포한다. 새 기기 읽기, 로그아웃 중 저장, 두 탭/두 기기 충돌, 새 revision의 성과만 저장되는지를 확인한다. 사용자 기록으로 검증하지 않는다.

복구: 우선 앱의 거래 쓰기를 중단하고 정상 버전과 DB 백업을 확보한다. 거래 데이터 자체를 되돌릴 필요가 없으면 [스키마 롤백](./supabase/rollback/atomic_portfolio_ledger.sql)을 관리 연결에서 실행할 수 있다. 이 파일은 거래 행을 삭제하지 않지만 revision·안정 정렬·요청 영수증을 제거한다. **먼저 영수증과 각 브라우저의 미확인 요청을 보존·정리하고 모든 새 쓰기 클라이언트를 중단해야 한다.** 영수증 삭제 후 미확인 요청을 재전송하면 중복 실행 위험이 있다. 롤백 후 자동으로 이전 쓰기 방식을 재개하지 말고 동시성 문제를 해소한 버전을 사용한다. 실제 데이터 복원은 백업 시점 이후 정상 거래와 대조한 별도 절차다. advisory lock 트리거는 auth.uid 없는 직접 거래 DML을 거부하므로 관리 작업은 점검 시간에 수행한다.

## 저장소와 확인 기준

- 실제 `.env.local`·비밀 키는 커밋하지 않는다. [.env.example](./.env.example)은 값 없는 예시, 생성물 제외는 [.gitignore](./.gitignore)를 따른다.
- 배포 후 공개 URL·대상 버전·실제 응답·남은 문제를 PROJECT_STATUS.md에 기록한다. Git 푸시나 로컬 빌드만으로 배포 완료라 하지 않는다.

공식 참고: [Cloudflare Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) · [OpenNext](https://opennext.js.org/cloudflare/get-started) · [Supabase Google 로그인](https://supabase.com/docs/guides/auth/social-login/auth-google)
