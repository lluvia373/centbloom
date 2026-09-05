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
